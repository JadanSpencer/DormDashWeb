// functions/src/push.ts
// Sending push notifications (moved out of index.ts unchanged, so the order
// triggers and group dispatch in groups.ts share one copy).
//
// Two kinds of token live in users/{uid}.pushToken:
//   • "ExponentPushToken[...]"  → native app → Expo push service
//   • "web:<fcm token>"         → PWA        → Firebase Cloud Messaging
// The PWA writes the "web:" prefix (services/notifications.web.ts). Callers
// don't need to know which kind they have.

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const WEB_TOKEN_PREFIX = 'web:';

// SPEED: pushes go out in batches. Before, every phone was its own request
// (1,000 online dashers = 1,000 requests for one new order). Now web pushes
// go 500 per request and native (Expo) pushes 100 per request, so a new
// order reaches every dasher in one or two round trips.
export type Push = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  ttlSeconds?: number; // how long FCM keeps trying if the phone is offline
};

// Browser unsubscribed or token expired: detach it so we stop trying.
async function removeDeadWebToken(storedToken: string): Promise<void> {
  const stale = await db.collection('users').where('pushToken', '==', storedToken).get();
  // pushTokenDead tells the app "this exact token is dead, make a new
  // one" — otherwise the browser keeps re-saving its cached dead copy.
  await Promise.all(stale.docs.map(d => d.ref.update({
    pushToken: null,
    pushTokenDead: storedToken,
    pushTokenUpdatedAt: Date.now(),
  })));
  // Say whose alerts just stopped, so the logs are readable. The app puts
  // a fresh token back next time that person opens DormDash.
  stale.docs.forEach(d => logger.warn('Dead web push token removed', {
    uid: d.id,
    role: d.data()?.role ?? 'unknown',
    token: storedToken.slice(WEB_TOKEN_PREFIX.length, WEB_TOKEN_PREFIX.length + 16),
  }));
}

async function sendWebPushes(pushes: Push[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < pushes.length; i += 500) {
    const chunk = pushes.slice(i, i + 500);
    try {
      // Data-only message: public/sw.js builds the notification itself, so
      // it can show the in-app banner instead when DormDash is open.
      const res = await admin.messaging().sendEach(chunk.map(p => ({
        token: p.token.slice(WEB_TOKEN_PREFIX.length),
        data: { ...(p.data ?? {}), title: p.title, body: p.body },
        webpush: { headers: { Urgency: 'high', TTL: String(p.ttlSeconds ?? 3600) } },
      })));
      const dead: string[] = [];
      res.responses.forEach((r, k) => {
        if (r.success) return;
        failed++;
        const code = r.error?.code ?? '';
        logger.error('Web push failed', { code, message: r.error?.message });
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') dead.push(chunk[k].token);
      });
      await Promise.all(dead.map(removeDeadWebToken));
    } catch (err: any) {
      failed += chunk.length;
      logger.error('Web push batch failed', { code: err?.code, message: err?.message });
    }
  }
  return failed;
}

async function sendExpoPushes(pushes: Push[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < pushes.length; i += 100) {
    const chunk = pushes.slice(i, i + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk.map(p => ({
          to: p.token, sound: 'default', title: p.title, body: p.body,
          data: p.data ?? {}, channelId: 'default', priority: 'high',
          ttl: p.ttlSeconds ?? 3600,
        }))),
      });
      const result: any = await response.json();
      if (result.errors) {
        failed += chunk.length;
        logger.error('Expo push API error', { errors: result.errors });
        continue;
      }
      (Array.isArray(result.data) ? result.data : []).forEach((r: any, k: number) => {
        if (r?.status !== 'error') return;
        failed++;
        logger.error('Push notification failed', {
          token: chunk[k].token.slice(0, 24), error: r.message, errorType: r.details?.error,
        });
      });
    } catch (err: any) {
      failed += chunk.length;
      logger.error('Expo push batch failed', { message: err?.message });
    }
  }
  return failed;
}

/** Sends every push at once (web and native in parallel) and logs how long it took. */
export async function sendPushes(pushes: Push[], label: string): Promise<void> {
  const list = pushes.filter(p => !!p.token);
  if (!list.length) return;
  const started = Date.now();
  const web = list.filter(p => p.token.startsWith(WEB_TOKEN_PREFIX));
  const expo = list.filter(p => !p.token.startsWith(WEB_TOKEN_PREFIX));
  const [webFailed, expoFailed] = await Promise.all([sendWebPushes(web), sendExpoPushes(expo)]);
  logger.info('Push sent', {
    label, sent: list.length - webFailed - expoFailed,
    failed: webFailed + expoFailed, sendMs: Date.now() - started,
  });
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  label = 'push'
): Promise<void> {
  await sendPushes([{ token, title, body, data }], label);
}

// ─── Token lookup for one user ─────────────────────────────────────────────
export async function getUserToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;
  const data = userDoc.data();
  if (data?.isActive === false) return null;   // deactivated accounts get nothing
  return data?.pushToken ?? null;
}

// ─── Currency ──────────────────────────────────────────────────────────────
export function jmd(value: unknown): string {
  const n = Math.round(Number(value) || 0);
  return `J$${n.toLocaleString('en-US')}`;
}
