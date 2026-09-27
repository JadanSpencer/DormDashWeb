// functions/src/storeAlerts.ts
// Order alerts for STORES, sent through the free ntfy app (ntfy.sh).
//
// How it works:
//   • Each store gets its own secret "topic" (a random name like
//     dd-Xk3v9QpL2mTz8RwA1bCd). It lives in storeAlerts/{storeId}, which only
//     Cloud Functions can read or write (the Firestore catch-all rule blocks
//     the app), because anyone who knows a topic name can read its alerts.
//   • The store installs ntfy on its phone and subscribes to that topic.
//     No DormDash account, no sign-in, nothing else to set up.
//   • An alert goes out when an order is CONFIRMED (a dasher accepted it and
//     it is paid), and a "cancelled, don't make it" alert if a confirmed
//     order is cancelled later.
//   • Alerts carry the order code, the items and the dasher's first name.
//     Never the student's name, room or phone.
//
// Settings (functions/.env, all optional):
//   NTFY_SERVER=https://ntfy.sh   ← or your own ntfy server
//   NTFY_TOKEN=tk_...             ← access token from a paid ntfy.sh account.
//     Without a paid account, ntfy.sh allows about 250 messages a day per
//     IP address, and Cloud Functions share IP addresses with other Google
//     customers, so free sends can be refused at busy times.

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomBytes } from 'crypto';
import { APP_CHECK } from './appCheck';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const NTFY_SERVER = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
const NTFY_TOKEN = process.env.NTFY_TOKEN || '';
const TOPIC_RE = /^[A-Za-z0-9_-]{16,64}$/;

const alertsRef = (storeId: string) => db.collection('storeAlerts').doc(storeId);

function newTopic(): string {
  return 'dd-' + randomBytes(15).toString('base64url'); // 20 random characters
}

function jmd(value: unknown): string {
  return 'J$' + Math.round(Number(value) || 0).toLocaleString('en-US');
}

export function orderCode(orderId: string): string {
  return orderId.slice(-6).toUpperCase(); // same code the student sees
}

function firstName(name: unknown): string {
  return String(name ?? '').trim().split(/\s+/)[0] || 'A dasher';
}

function itemLines(order: any): string {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  return items
    .map(i => `${Number(i?.quantity) || 1} × ${String(i?.menuItem?.name ?? 'Item')}`)
    .join('\n');
}

function foodTotal(order: any): number {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, i) => sum + (Number(i?.menuItem?.price) || 0) * (Number(i?.quantity) || 0), 0);
}

async function getTopic(storeId: string): Promise<string | null> {
  if (!storeId) return null;
  const topic = (await alertsRef(storeId).get()).get('ntfyTopic');
  return typeof topic === 'string' && TOPIC_RE.test(topic) ? topic : null;
}

type NtfyMessage = { title: string; message: string; priority: 1 | 2 | 3 | 4 | 5; tags?: string[] };

// JSON publishing: store names and item names can have accents or curly
// quotes, which aren't allowed in HTTP headers.
async function postNtfy(topic: string, msg: NtfyMessage): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (NTFY_TOKEN) headers.Authorization = `Bearer ${NTFY_TOKEN}`;
  const body = JSON.stringify({ topic, ...msg });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(NTFY_SERVER, {
        method: 'POST', headers, body, signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      const text = (await res.text()).slice(0, 200);
      // 4xx (bad topic, over the daily limit) won't fix itself on a retry.
      if (res.status < 500 || attempt === 2) throw new Error(`ntfy ${res.status}: ${text}`);
    } catch (e) {
      if (attempt === 2) throw e;
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

/**
 * Tell the store about an order. Never throws: a store alert failing must
 * not stop the customer and dasher alerts. Failures show in the logs as
 * "Store alert failed".
 */
export async function alertStore(
  order: any, orderId: string, kind: 'confirmed' | 'cancelled'
): Promise<void> {
  const started = Date.now();
  try {
    const topic = await getTopic(String(order?.storeId ?? ''));
    if (!topic) {
      logger.info('Store alert skipped: no ntfy topic', { orderId, storeId: order?.storeId });
      return;
    }
    const code = orderCode(orderId);
    const dasher = firstName(order.dasherName);
    const msg: NtfyMessage = kind === 'confirmed'
      ? {
          title: `New order #${code}`,
          message: `${itemLines(order)}\n\nFood total: ${jmd(foodTotal(order))}\n${dasher} (DormDash dasher) is coming to collect it. Order #${code}.`,
          priority: 5,
          tags: ['shopping_bags'],
        }
      : {
          title: `Cancelled: order #${code}`,
          message: `Don't make this order. It was cancelled.\n\n${itemLines(order)}`,
          priority: 4,
          tags: ['x'],
        };
    await postNtfy(topic, msg);
    logger.info('Store alert sent', { orderId, storeId: order.storeId, kind, sendMs: Date.now() - started });
  } catch (e: any) {
    logger.error('Store alert failed', { orderId, storeId: order?.storeId, kind, error: e?.message });
  }
}

async function requireAdmin(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await db.collection('users').doc(uid).get()).data();
  if (!me || me.role !== 'admin' || me.isActive === false) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}

/**
 * Admin only. action:
 *   'get'  → the store's topic (made on first use)
 *   'new'  → replace the topic. The old one stops getting alerts, so use
 *            this if a topic was shared with the wrong person.
 *   'test' → send a test alert to the store's phone
 */
export const storeAlertsAdmin = onCall({ ...APP_CHECK }, async (request) => {
  await requireAdmin(request.auth?.uid);
  const storeId = String(request.data?.storeId ?? '');
  const action = String(request.data?.action ?? 'get');
  if (!storeId || !(await db.collection('stores').doc(storeId).get()).exists) {
    throw new HttpsError('not-found', 'Store not found.');
  }

  let topic = await getTopic(storeId);
  if (!topic || action === 'new') {
    topic = newTopic();
    await alertsRef(storeId).set({ ntfyTopic: topic, updatedAt: Date.now() }, { merge: true });
  }

  if (action === 'test') {
    try {
      await postNtfy(topic, {
        title: 'DormDash test alert',
        message: 'This phone will get DormDash orders for your store here.',
        priority: 5,
        tags: ['white_check_mark'],
      });
    } catch (e: any) {
      logger.error('Store test alert failed', { storeId, error: e?.message });
      throw new HttpsError('unavailable', 'The test alert could not be sent. Try again in a minute.');
    }
  }

  return { topic, server: NTFY_SERVER, link: `${NTFY_SERVER}/${topic}` };
});
