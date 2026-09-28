// functions/src/groups.ts
// Group orders for dashers: take several open orders at once.
//
// How it works:
//   1. A dasher saves a group search (setGroupSearch): how many orders
//      (GROUP_SIZES), which stores (none = any), and how far apart the
//      stores may be (GROUP_DISTANCES_M; 0 = one store only). It lives in
//      groupSearches/{uid}, which only that dasher can read.
//   2. matchGroups runs whenever the open orders change for dashers: a new
//      order is published, the next offer wave opens, a dasher comes online
//      or finishes a delivery, a search is saved, and every 5 minutes. For
//      each online, free dasher with a search, it looks at the open orders
//      that dasher may take right now (the same wave rules as a single
//      accept) and picks a group (grouping.ts: oldest orders first, stores
//      all within the distance).
//   3. A group found is numbered (Group #12), written to orderGroups/{id}
//      for that dasher only, held for GROUP_OFFER_MS, and announced with a
//      "Group found" push. One live group per dasher at a time, and the
//      same set of orders isn't offered again within GROUP_REOFFER_MS.
//   4. acceptOrderGroup takes every order in one transaction, or none. The
//      orders are not reserved while a group is on offer: if anyone took one
//      of them first, the group is "no longer available" and a new search
//      runs at once.
//
// Each order then runs exactly as a single order: the student pays for it,
// the dasher moves it through its steps and is credited on delivery. The
// dasher's busy flag lists all of them (dashers/{uid}.activeOrderIds; see
// setDasherBusy in index.ts), so no new orders are offered until every one
// of them is finished.

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { APP_CHECK } from './appCheck';
import { sendPushes, jmd } from './push';
import { Candidate, StorePoint, pickGroup, groupKey, groupSpanM } from './grouping';
import {
  GROUP_SIZES, GROUP_DISTANCES_M, GROUP_OFFER_MS, GROUP_REOFFER_MS, GROUP_MAX_STORES, orderPayoutJmd,
} from './shared';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const searchRef = (uid: string) => db.collection('groupSearches').doc(uid);
const groupsCol = () => db.collection('orderGroups');
const counterRef = () => db.collection('meta').doc('orderGroups');
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type OrderData = admin.firestore.DocumentData;

/** Same test as the Firestore accept rule: may this dasher take this open order now? */
export function mayTake(o: OrderData | undefined, uid: string, now: number): boolean {
  if (!o || o.status !== 'pending' || !o.verifiedAt || o.dasherId) return false;
  if (o.studentId === uid) return false;
  const openAt = Number(o.openToAllAt ?? 0);
  const mine = o.offerAt?.[uid];
  return now >= openAt || (typeof mine === 'number' && now >= mine);
}

async function requireDasher(uid: string | undefined): Promise<OrderData> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await db.collection('users').doc(uid).get()).data();
  if (!me || me.role !== 'dasher' || me.isActive === false) {
    throw new HttpsError('permission-denied', 'Only dasher accounts can take groups.');
  }
  return me;
}

// ─── Matching ──────────────────────────────────────────────────────────────

/**
 * Looks for groups for every dasher with an active search (or only these
 * dashers). Returns how many groups were offered. Never throws for one
 * dasher's failure; callers treat it as best effort.
 */
export async function matchGroups(opts: { dasherIds?: string[] } = {}): Promise<number> {
  let searches = (await db.collection('groupSearches').where('active', '==', true).get()).docs;
  if (opts.dasherIds) searches = searches.filter(s => opts.dasherIds!.includes(s.id));
  if (!searches.length) return 0;

  const uids = searches.map(s => s.id);
  const [pendingSnap, dasherDocs, userDocs] = await Promise.all([
    db.collection('orders').where('status', '==', 'pending')
      .select('studentId', 'storeId', 'storeName', 'status', 'verifiedAt', 'openToAllAt', 'offerAt',
        'dasherId', 'deliveryFee', 'dasherPayoutJmd', 'deliveryAddress')
      .get(),
    db.getAll(...uids.map(u => db.collection('dashers').doc(u)), { fieldMask: ['isOnline', 'activeOrderId'] }),
    db.getAll(...uids.map(u => db.collection('users').doc(u)), { fieldMask: ['isActive', 'role', 'pushToken'] }),
  ]);
  const pending = pendingSnap.docs.filter(d => d.get('verifiedAt'));
  if (pending.length < Math.min(...GROUP_SIZES)) return 0;

  const storeIds = [...new Set(pending.map(d => String(d.get('storeId') ?? '')).filter(id => ID_RE.test(id)))];
  const storeDocs = storeIds.length
    ? await db.getAll(...storeIds.map(id => db.collection('stores').doc(id)), { fieldMask: ['location'] })
    : [];
  const stores = new Map<string, StorePoint>(storeDocs.map(s => [s.id, {
    id: s.id,
    latitude: Number(s.get('location.latitude')),
    longitude: Number(s.get('location.longitude')),
  }]));

  const dasherById = new Map(dasherDocs.map(d => [d.id, d.data()]));
  const userById = new Map(userDocs.map(d => [d.id, d.data()]));
  let offered = 0;

  for (const s of searches) {
    const uid = s.id;
    try {
      const dasher = dasherById.get(uid);
      const user = userById.get(uid);
      if (!dasher?.isOnline || dasher.activeOrderId) continue;         // offline or mid-delivery
      if (!user || user.isActive === false || user.role !== 'dasher') continue;

      const search = s.data();
      const filter: string[] = Array.isArray(search.storeIds) ? search.storeIds : [];
      const size = Number(search.size);
      const maxM = Number(search.maxStoreDistanceM);
      if (!GROUP_SIZES.includes(size) || !GROUP_DISTANCES_M.includes(maxM)) continue;

      const now = Date.now();
      const eligible = pending.filter(d =>
        mayTake(d.data(), uid, now) && (!filter.length || filter.includes(d.get('storeId'))));
      const candidates: Candidate[] = eligible.map(d => ({
        id: d.id, storeId: String(d.get('storeId')), since: Number(d.get('verifiedAt')) || 0,
      }));
      const picked = pickGroup(candidates, stores, size, maxM);
      if (!picked) continue;

      const byId = new Map(eligible.map(d => [d.id, d]));
      const eligibleIds = new Set(eligible.map(d => d.id));
      const orderIds = picked.map(c => c.id);
      const key = groupKey(orderIds);

      const created = await db.runTransaction(async tx => {
        const cur = (await tx.get(searchRef(uid))).data();
        if (!cur?.active) return null;
        const oldRef = cur.offeredGroupId ? groupsCol().doc(String(cur.offeredGroupId)) : null;
        const old = oldRef ? (await tx.get(oldRef)).data() : undefined;
        const counter = (await tx.get(counterRef())).data();

        // A live offer stands while all of its orders are still takeable.
        if (old?.status === 'offered' && Number(old.expiresAt) > now &&
            (old.orderIds ?? []).every((id: string) => eligibleIds.has(id))) return null;
        // Don't nag with the same set of orders.
        if (cur.lastGroupKey === key && now - Number(cur.lastOfferedAt || 0) < GROUP_REOFFER_MS) return null;

        if (oldRef && old?.status === 'offered') {
          tx.update(oldRef, { status: 'expired', endedReason: Number(old.expiresAt) > now ? 'changed' : 'timeout', endedAt: now });
        }
        const groupNo = (Number(counter?.nextNo) || 0) + 1;
        const ref = groupsCol().doc();
        const stops = picked.map(c => {
          const o = byId.get(c.id)!;
          return {
            orderId: c.id,
            storeId: c.storeId,
            storeName: String(o.get('storeName') ?? ''),
            dropOff: String(o.get('deliveryAddress.label') ?? ''),
            payoutJmd: orderPayoutJmd({ dasherPayoutJmd: o.get('dasherPayoutJmd'), deliveryFee: o.get('deliveryFee') }),
          };
        });
        const group = {
          groupNo, dasherId: uid, orderIds, size: orderIds.length, stops,
          storeIds: [...new Set(stops.map(x => x.storeId))],
          storeNames: [...new Set(stops.map(x => x.storeName))],
          payoutJmd: stops.reduce((sum, x) => sum + x.payoutJmd, 0),
          spanM: Math.round(groupSpanM(stores, stops.map(x => x.storeId))),
          maxStoreDistanceM: maxM,
          status: 'offered', createdAt: now, expiresAt: now + GROUP_OFFER_MS,
        };
        tx.set(ref, group);
        tx.set(counterRef(), { nextNo: groupNo }, { merge: true });
        tx.update(searchRef(uid), { offeredGroupId: ref.id, lastGroupKey: key, lastOfferedAt: now });
        return { id: ref.id, ...group };
      });
      if (!created) continue;
      offered++;

      logger.info(`Group #${created.groupNo} offered to ${uid}`, {
        groupId: created.id, orderIds, spanM: created.spanM, maxM,
      });
      if (user.pushToken) {
        const where = created.storeNames.length === 1
          ? created.storeNames[0]
          : `${created.storeNames.length} stores within ${created.spanM} m`;
        await sendPushes([{
          token: String(user.pushToken),
          title: `Group #${created.groupNo} found`,
          body: `${created.size} orders from ${where}, ${jmd(created.payoutJmd)} total payout. Grab it fast: if someone takes one of them first, the group is gone.`,
          data: { screen: '/(dasher)/dash', groupId: created.id },
          ttlSeconds: Math.round(GROUP_OFFER_MS / 1000),
        }], 'group_found');
      }
    } catch (e: any) {
      logger.error('Group matching failed for a dasher', { uid, message: e?.message });
    }
  }
  return offered;
}

/** Scheduler: marks group offers that ran out of time. */
export async function expireOldGroups(now = Date.now()): Promise<number> {
  const snap = await groupsCol().where('status', '==', 'offered').get();
  const old = snap.docs.filter(d => Number(d.get('expiresAt')) < now);
  for (let i = 0; i < old.length; i += 400) {
    const batch = db.batch();
    old.slice(i, i + 400).forEach(d => batch.update(d.ref, { status: 'expired', endedReason: 'timeout', endedAt: now }));
    await batch.commit();
  }
  return old.length;
}

// ─── Callables ─────────────────────────────────────────────────────────────

/**
 * Save (active: true) or stop (active: false) this dasher's group search.
 * Saving looks for a group straight away. Returns { found }.
 */
export const setGroupSearch = onCall({ ...APP_CHECK }, async (request) => {
  const uid = request.auth?.uid;
  await requireDasher(uid);
  const d = request.data ?? {};
  const now = Date.now();

  if (d.active === false) {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(searchRef(uid!))).data();
      const oldRef = cur?.offeredGroupId ? groupsCol().doc(String(cur.offeredGroupId)) : null;
      const old = oldRef ? (await tx.get(oldRef)).data() : undefined;
      if (oldRef && old?.status === 'offered') tx.update(oldRef, { status: 'expired', endedReason: 'stopped', endedAt: now });
      tx.set(searchRef(uid!), { dasherId: uid, active: false, offeredGroupId: null, updatedAt: now }, { merge: true });
    });
    return { ok: true, found: false };
  }

  const size = Number(d.size);
  const maxStoreDistanceM = Number(d.maxStoreDistanceM);
  const storeIds = Array.isArray(d.storeIds)
    ? [...new Set(d.storeIds.map((x: unknown) => String(x)))] as string[]
    : [];
  if (!GROUP_SIZES.includes(size)) throw new HttpsError('invalid-argument', `Choose a group of ${GROUP_SIZES.join(' or ')} orders.`);
  if (!GROUP_DISTANCES_M.includes(maxStoreDistanceM)) throw new HttpsError('invalid-argument', 'Choose how far apart the stores may be.');
  if (storeIds.length > GROUP_MAX_STORES || !storeIds.every(id => ID_RE.test(id))) {
    throw new HttpsError('invalid-argument', `Pick up to ${GROUP_MAX_STORES} stores, or any store.`);
  }

  await searchRef(uid!).set({
    dasherId: uid, active: true, size, maxStoreDistanceM, storeIds,
    updatedAt: now, lastGroupKey: null, lastOfferedAt: 0,
  }, { merge: true });
  const found = await matchGroups({ dasherIds: [uid!] }).catch((e: any) => {
    logger.error('Group matching after saving a search failed', { uid, message: e?.message });
    return 0;
  });
  return { ok: true, found: found > 0 };
});

export type GroupAcceptOutcome = 'ok' | 'gone' | 'expired' | 'busy';

/**
 * Take every order in the group, in one transaction, or none of them.
 * Returns { ok, outcome }. 'gone' = someone took (or the student cancelled)
 * one of its orders; 'expired' = the offer ran out; 'busy' = finish your
 * current delivery first.
 */
export const acceptOrderGroup = onCall({
  ...APP_CHECK, cpu: 1, memory: '512MiB', concurrency: 40, maxInstances: 20,
}, async (request) => {
  const uid = request.auth?.uid;
  const me = await requireDasher(uid);
  const groupId = String(request.data?.groupId ?? '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(groupId)) throw new HttpsError('invalid-argument', 'Group not found.');
  const gRef = groupsCol().doc(groupId);

  const outcome = await db.runTransaction<GroupAcceptOutcome>(async tx => {
    const g = (await tx.get(gRef)).data();
    if (!g || g.dasherId !== uid) throw new HttpsError('not-found', 'Group not found.');
    if (g.status === 'accepted') return 'ok'; // a double tap
    if (g.status !== 'offered') return 'gone';
    const ids: string[] = Array.isArray(g.orderIds) ? g.orderIds : [];
    const refs = ids.map(id => db.collection('orders').doc(id));
    const [dasherSnap, ...orderSnaps] = await tx.getAll(db.collection('dashers').doc(uid!), ...refs);
    const now = Date.now();

    if (now > Number(g.expiresAt)) {
      tx.update(gRef, { status: 'expired', endedReason: 'timeout', endedAt: now });
      tx.set(searchRef(uid!), { offeredGroupId: null }, { merge: true });
      return 'expired';
    }
    if (dasherSnap.get('activeOrderId')) return 'busy';
    if (!ids.length || !orderSnaps.every(s => mayTake(s.data(), uid!, now))) {
      tx.update(gRef, { status: 'expired', endedReason: 'taken', endedAt: now });
      tx.set(searchRef(uid!), { offeredGroupId: null }, { merge: true });
      return 'gone';
    }

    const dasherName = String(me.name ?? 'Dasher').slice(0, 100);
    refs.forEach(ref => tx.update(ref, {
      status: 'accepted', dasherId: uid, dasherName, acceptedAt: now, groupId, groupNo: g.groupNo,
    }));
    tx.update(gRef, { status: 'accepted', acceptedAt: now });
    // Busy with all of them at once (setDasherBusy clears each on finish).
    tx.set(db.collection('dashers').doc(uid!), { activeOrderId: ids[0], activeOrderIds: ids }, { merge: true });
    tx.set(searchRef(uid!), { offeredGroupId: null }, { merge: true });
    return 'ok';
  });

  if (outcome === 'ok') {
    logger.info(`Group accepted by ${uid}`, { groupId });
  } else if (outcome !== 'busy') {
    // Look again straight away: the other orders may still make a group.
    await matchGroups({ dasherIds: [uid!] }).catch(() => 0);
  }
  return { ok: outcome === 'ok', outcome };
});
