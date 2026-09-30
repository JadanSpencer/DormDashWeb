// Cloud Functions tests against the emulators (functions + firestore + auth).
// Runs the real compiled functions (../functions/lib) and checks what they
// do to the database. Run from this folder: npm run test:triggers
//
// Covers what the in-memory payment tests and the rules tests can't:
//   • verifyNewOrder: re-pricing, closed store, unavailable item, duplicate
//     tap-bursts, the active-order limit, the rate limit
//   • delivery: the dasher is credited exactly once
//   • onUserWritten: push token moves to one account; deactivation
//     disables sign-in and reactivation restores it
//   • cancelStalePendingOrders: only overdue orders, wrong phone clocks
//   • wave dispatch: who is offered a new order, and when
//
// Nothing here sends a real push: no test user has a push token that
// would be used, and the project is a demo project with no real backend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-dormdash';
// Wave dispatch: waves 3 s apart (OFFER_WAVE_SECONDS in
// functions/.env.demo-dormdash), run by the Cloud Tasks emulator.
const WAVE_MS = 3000;
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
// The scheduled function runs in this process (the emulator doesn't run
// schedules on its own); triggers run in the functions emulator.
const require = createRequire(import.meta.url);
let fns;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await wait(300);
  }
  return null;
}
const get = async (path) => (await db.doc(path).get()).data();

let seq = 0;
const student = async () => {
  const uid = `stu${++seq}_${Date.now()}`;
  await db.doc(`users/${uid}`).set({ uid, role: 'student', name: `Student ${seq}`, isActive: true, createdAt: 1 });
  return uid;
};
const order = (studentId, extra = {}) => ({
  studentId, studentName: 'Tampered Name', storeId: 'store1', storeName: 'Tampered Store',
  items: [{ quantity: 2, menuItem: { id: 'patty', name: 'x', price: 1 } }],
  status: 'pending', totalAmount: 1, deliveryFee: 0, paymentMethod: 'card',
  deliveryAddress: { label: 'Block A 1', latitude: 0, longitude: 0 },
  createdAt: Date.now(), ...extra,
});
const place = async (o) => (await db.collection('orders').add(o)).id;
// Resolves when the server has either published (verifiedAt) or rejected the order.
const settled = (id) => until(async () => {
  const o = await get(`orders/${id}`);
  return o && (o.verifiedAt || o.status === 'cancelled') ? o : null;
});

before(async () => {
  fns = require('../functions/lib/index.js');
  // store1 has no campus food spot and the test orders have no delivery
  // point, so they pay FALLBACK_DELIVERY_FEE_JMD (400): dasher 330, DormDash 70.
  await db.doc('stores/store1').set({ name: 'Ring Road Grill', isOpen: true, deliveryFee: 150 });
  await db.doc('stores/store1/menuItems/patty').set({ name: 'Beef patty', price: 300, isAvailable: true, category: 'Hot' });
  await db.doc('stores/store1/menuItems/soldout').set({ name: 'Oxtail', price: 900, isAvailable: false, category: 'Hot' });
  await db.doc('stores/closed').set({ name: 'Closed Kitchen', isOpen: false, deliveryFee: 100 });
});
after(async () => { await admin.app().delete(); });

// ── verifyNewOrder ─────────────────────────────────────────────────────────
test('new order is re-priced from the menu with the flat delivery fee; tampered fields are replaced', async () => {
  const uid = await student();
  const o = await settled(await place(order(uid)));
  assert.equal(o.status, 'pending');
  assert.equal(o.totalAmount, 2 * 300 + 400);
  assert.equal(o.deliveryFee, 400, 'the fallback fee, not the store doc\'s');
  assert.equal(o.dasherPayoutJmd, 330);
  assert.equal(o.platformFeeJmd, 70);
  assert.equal(o.items[0].menuItem.price, 300);
  assert.equal(o.items[0].menuItem.name, 'Beef patty');
  assert.equal(o.storeName, 'Ring Road Grill');
  assert.equal(o.studentName, 'Student ' + uid.match(/stu(\d+)_/)[1]);
  assert.equal(o.paymentStatus, 'unpaid');
});

test('orders to a closed store or for an unavailable item are rejected', async () => {
  const uid = await student();
  const closed = await settled(await place(order(uid, { storeId: 'closed' })));
  assert.equal(closed.cancelReason, 'store_closed');
  const uid2 = await student();
  const sold = await settled(await place(order(uid2, { items: [{ quantity: 1, menuItem: { id: 'soldout' } }] })));
  assert.equal(sold.cancelReason, 'item_unavailable');
});

test('a tap-burst of identical orders keeps exactly one', async () => {
  const uid = await student();
  const createdAt = Date.now();
  const ids = await Promise.all([1, 2, 3].map(() => place(order(uid, { createdAt }))));
  const results = await Promise.all(ids.map(settled));
  const kept = results.filter((o) => o.status === 'pending');
  const dupes = results.filter((o) => o.cancelReason === 'duplicate_order');
  assert.equal(kept.length, 1, JSON.stringify(results.map((o) => o.status + ':' + (o.cancelReason || ''))));
  assert.equal(dupes.length, 2);
});

test('a 4th order in progress is refused (MAX_ACTIVE_ORDERS = 3)', async () => {
  const uid = await student();
  for (const qty of [1, 2, 3]) {
    const o = await settled(await place(order(uid, { items: [{ quantity: qty, menuItem: { id: 'patty' } }] })));
    assert.equal(o.status, 'pending');
  }
  const fourth = await settled(await place(order(uid, { items: [{ quantity: 4, menuItem: { id: 'patty' } }] })));
  assert.equal(fourth.cancelReason, 'too_many_active');
});

test('more than 5 orders in 10 minutes is rate limited', async () => {
  const uid = await student();
  for (let i = 1; i <= 5; i++) {
    const id = await place(order(uid, { items: [{ quantity: i, menuItem: { id: 'patty' } }] }));
    const o = await settled(id);
    assert.equal(o.status, 'pending', `order ${i}`);
    await db.doc(`orders/${id}`).update({ status: 'delivered' }); // free the active slot
  }
  const sixth = await settled(await place(order(uid, { items: [{ quantity: 6, menuItem: { id: 'patty' } }] })));
  assert.equal(sixth.cancelReason, 'rate_limited');
});

// ── Delivery credit ────────────────────────────────────────────────────────
test('delivery credits the dasher exactly once and records minutes', async () => {
  const did = `dash_${Date.now()}`;
  await db.doc(`dashers/${did}`).set({ uid: did, isOnline: false, totalDeliveries: 0, totalEarnings: 0 });
  const id = await place({
    studentId: 'nobody', dasherId: did, dasherName: 'D', storeName: 'X', status: 'on_the_way',
    deliveryFee: 400, dasherPayoutJmd: 280, platformFeeJmd: 120, totalAmount: 1000, createdAt: Date.now() - 25 * 60000,
  });
  await wait(1500);
  await db.doc(`orders/${id}`).update({ status: 'delivered', deliveredAt: Date.now() });
  assert.ok(await until(async () => (await get(`orders/${id}`)).dasherCreditedAt), 'credited');
  await db.doc(`orders/${id}`).update({ studentNote: 'a later, unrelated write' });
  await wait(3000);
  const d = await get(`dashers/${did}`);
  assert.equal(d.totalDeliveries, 1);
  assert.equal(d.totalEarnings, 280, 'the dasher\'s 70%, not the whole fee');
  assert.equal((await get(`orders/${id}`)).deliveryMins, 25);
});

// ── onUserWritten ──────────────────────────────────────────────────────────
test('a push token belongs to one account: saving it removes it from the other', async () => {
  const token = `web:shared-${Date.now()}`;
  const a = await student();
  await db.doc(`users/${a}`).update({ pushToken: token });
  const b = await student();
  await wait(1000);
  await db.doc(`users/${b}`).update({ pushToken: token });
  assert.ok(await until(async () => (await get(`users/${a}`)).pushToken === null), 'detached from the old account');
  assert.equal((await get(`users/${b}`)).pushToken, token);
});

test('deactivating an account disables sign-in; reactivating restores it', async () => {
  const uid = await student();
  await admin.auth().createUser({ uid, email: `${uid}@x.com`, password: 'secret123' });
  await db.doc(`users/${uid}`).update({ isActive: false });
  assert.ok(await until(async () => (await admin.auth().getUser(uid)).disabled === true), 'disabled');
  await db.doc(`users/${uid}`).update({ isActive: true });
  assert.ok(await until(async () => (await admin.auth().getUser(uid)).disabled === false), 're-enabled');
});

// ── cancelStalePendingOrders ───────────────────────────────────────────────
test('scheduler cancels only overdue orders, whatever the phone clock said', async () => {
  const now = Date.now();
  const min = 60000;
  const seed = {
    stale:        { status: 'pending', createdAt: now - 40 * min, verifiedAt: now - 40 * min },
    unverified:   { status: 'pending', createdAt: now - 40 * min },
    phoneAhead:   { status: 'pending', createdAt: now + 120 * min, verifiedAt: now - 40 * min },
    phoneBehind:  { status: 'pending', createdAt: now - 40 * min, verifiedAt: now - 5 * min },
    fresh:        { status: 'pending', createdAt: now - 2 * min, verifiedAt: now - 2 * min },
    unpaidLate:   { status: 'accepted', paymentMethod: 'card', paymentStatus: 'awaiting_payment', payDeadline: now - min },
    unpaidInTime: { status: 'accepted', paymentMethod: 'card', paymentStatus: 'awaiting_payment', payDeadline: now + 5 * min },
    paid:         { status: 'accepted', paymentMethod: 'card', paymentStatus: 'paid', payDeadline: now - min },
  };
  const tag = `sched_${now}_`;
  // These orders have no real student or store. Write a placeholder first
  // so the trigger sees each seed as an update, not a new order, and
  // verifyNewOrder doesn't reject them before the scheduler runs.
  await Promise.all(Object.keys(seed).map((k) => db.doc(`orders/${tag}${k}`).set({ status: 'placeholder' })));
  await wait(1500);
  await Promise.all(Object.entries(seed).map(([k, v]) => db.doc(`orders/${tag}${k}`).set({ studentId: 'nobody', storeName: 'X', ...v })));
  await wait(1500);
  await fns.cancelStalePendingOrders.run({});
  const expect = {
    stale: 'no_dasher', unverified: 'no_dasher', phoneAhead: 'no_dasher', phoneBehind: null,
    fresh: null, unpaidLate: 'payment_timeout', unpaidInTime: null, paid: null,
  };
  for (const [k, want] of Object.entries(expect)) {
    const o = await get(`orders/${tag}${k}`);
    assert.equal(o.status === 'cancelled' ? o.cancelReason : null, want, k);
  }
});

// ── Repair sweep: finishing what a failed trigger left half-done ──────────
// Each broken state is built the way a failed trigger leaves it: write a
// document the trigger handles harmlessly, then change it in a way the
// trigger ignores. The sweep (in cancelStalePendingOrders) must finish it,
// exactly once, and leave healthy documents alone.
test('repair sweep finishes half-done work and leaves healthy work alone', async () => {
  const { FieldValue } = await import('firebase-admin/firestore');
  const now = Date.now();
  const tag = `rep_${now}_`;
  const O = (id) => db.doc(`orders/${tag}${id}`);

  // 1. New order never checked (no verifiedAt), so no dasher could see it.
  const stu = await student();
  await O('unverified').set({ status: 'placeholder' });
  await wait(1200);
  await O('unverified').set(order(stu, { createdAt: now }));

  // 2. Cancelled, but the held tokens were never released.
  await db.doc(`wallets/${stu}`).set({ balanceJmd: 1000, reservedJmd: 500 });
  await O('unsettled').set({ studentId: stu, storeName: 'X', status: 'cancelled', paymentMethod: 'tokens', paymentStatus: 'released', totalAmount: 500, deliveryFee: 100 });
  await wait(1200);
  await O('unsettled').update({ paymentStatus: 'reserved' });

  // 3. Accepted card order whose pay window never opened.
  await O('unpaid').set({ studentId: stu, storeName: 'X', dasherId: 'nobodyDasher', dasherName: 'D', status: 'accepted', paymentMethod: 'card', paymentStatus: 'paid', totalAmount: 700, deliveryFee: 100 });
  await wait(1200);
  await O('unpaid').update({ paymentStatus: 'unpaid' });

  // 4. Delivered, dasher never credited.
  const dR = `${tag}dR`;
  await db.doc(`dashers/${dR}`).set({ uid: dR, isOnline: false, totalDeliveries: 0, totalEarnings: 0 });
  await O('uncredited').set({ studentId: stu, storeName: 'X', dasherId: dR, status: 'delivered', deliveryFee: 300, totalAmount: 900, createdAt: now - 20 * 60000, deliveredAt: now, dasherCreditedAt: 1 });
  await wait(1500);
  await O('uncredited').update({ dasherCreditedAt: FieldValue.delete() });

  // 5. Dasher still marked busy with a finished order, and (control) a
  //    dasher genuinely mid-delivery who must stay busy.
  const dB = `${tag}dB`, dK = `${tag}dK`;
  await O('finished').set({ studentId: stu, storeName: 'X', dasherId: dB, status: 'delivered', deliveryFee: 0, totalAmount: 0, deliveredAt: now, createdAt: now });
  await O('live').set({ studentId: stu, storeName: 'X', dasherId: dK, status: 'on_the_way', totalAmount: 0 });
  await wait(1500);
  await db.doc(`dashers/${dB}`).set({ uid: dB, isOnline: true, activeOrderId: `${tag}finished` }, { merge: true });
  await db.doc(`dashers/${dK}`).set({ uid: dK, isOnline: true, activeOrderId: `${tag}live` }, { merge: true });
  await wait(1200);

  // Broken as intended before the sweep?
  assert.equal((await O('unverified').get()).get('verifiedAt'), undefined);
  assert.equal((await O('unsettled').get()).get('paymentStatus'), 'reserved');
  assert.equal((await O('unpaid').get()).get('paymentStatus'), 'unpaid');
  assert.equal((await O('uncredited').get()).get('dasherCreditedAt'), undefined);

  process.env.REPAIR_MIN_AGE_MS = '0'; // everything above counts as "quiet"
  try {
    await fns.cancelStalePendingOrders.run({});

    const unverified = (await O('unverified').get()).data();
    assert.equal(unverified.status, 'pending', 'published, not cancelled');
    assert.ok(unverified.verifiedAt, 'checked by the server');
    assert.equal(unverified.totalAmount, 2 * 300 + 400, 're-priced from the menu');

    assert.equal((await O('unsettled').get()).get('paymentStatus'), 'released');
    assert.equal((await get(`wallets/${stu}`)).reservedJmd, 0, 'held tokens released');

    const unpaid = (await O('unpaid').get()).data();
    assert.equal(unpaid.paymentStatus, 'awaiting_payment');
    assert.ok(unpaid.payDeadline > Date.now(), 'student gets a full pay window');

    await wait(1500); // the credit's own write re-triggers; let it settle
    const credited = await get(`dashers/${dR}`);
    // An order from before per-order splits (no dasherPayoutJmd): today's split of its J$300 fee.
    assert.equal(credited.totalDeliveries, 1); assert.equal(credited.totalEarnings, 250);
    assert.ok((await O('uncredited').get()).get('dasherCreditedAt'));

    assert.equal((await get(`dashers/${dB}`)).activeOrderId, null, 'freed');
    assert.equal((await get(`dashers/${dK}`)).activeOrderId, `${tag}live`, 'mid-delivery dasher untouched');

    // A second sweep changes nothing.
    await fns.cancelStalePendingOrders.run({});
    await wait(1500);
    const again = await get(`dashers/${dR}`);
    assert.equal(again.totalDeliveries, 1); assert.equal(again.totalEarnings, 250);
    assert.equal((await get(`wallets/${stu}`)).reservedJmd, 0);
  } finally {
    delete process.env.REPAIR_MIN_AGE_MS;
  }
});

// ── Online dasher count (publicStats/app) ─────────────────────────────────
test('the online count follows dashers, and the scheduler repairs a wrong one', async () => {
  const uid = `count_${Date.now()}`;
  const truth = async () => (await db.collection('dashers').where('isOnline', '==', true).count().get()).data().count;
  const shown = async () => (await get('publicStats/app'))?.onlineDashers;
  await db.doc(`dashers/${uid}`).set({ uid, isOnline: false, totalDeliveries: 0, totalEarnings: 0 });
  await db.doc(`dashers/${uid}`).update({ isOnline: true, lastSeenAt: Date.now() });
  assert.ok(await until(async () => (await shown()) === (await truth())), 'counted on switch-on');
  // A lost write (e.g. a burst at shift change) is caught up within 5 minutes.
  await db.doc('publicStats/app').set({ onlineDashers: 999 }, { merge: true });
  await fns.cancelStalePendingOrders.run({});
  assert.equal(await shown(), await truth());
  await db.doc(`dashers/${uid}`).update({ isOnline: false });
});

// ── Wave dispatch (publishNewOrder + offerNextWave) ────────────────────────
test('wave dispatch: least recently offered first, then the next few, then everyone', async () => {
  // Start from a known set of online dashers.
  const online = await db.collection('dashers').where('isOnline', '==', true).get();
  await Promise.all(online.docs.map(d => d.ref.update({ isOnline: false })));
  const t0 = Date.now(), W = WAVE_MS;
  const tag = `wave_${t0}_`;
  // Seven free dashers, 0 offered an order longest ago; one busy one.
  const ids = [0, 1, 2, 3, 4, 5, 6].map(i => `${tag}${i}`);
  const busy = `${tag}busy`;
  for (const [i, uid] of [...ids, busy].entries()) {
    await db.doc(`users/${uid}`).set({ uid, role: 'dasher', name: uid, isActive: true, createdAt: 1 });
    await db.doc(`dashers/${uid}`).set({
      uid, isOnline: true, totalDeliveries: 0, totalEarnings: 0, lastSeenAt: t0,
      lastOfferedAt: uid === busy ? 0 : t0 - (10 - i) * 60000,
      ...(uid === busy ? { activeOrderId: 'elsewhere' } : {}),
    });
  }
  const offeredAt = async uid => (await get(`dashers/${uid}`)).lastOfferedAt ?? 0;
  const whenOffered = async uid => until(async () => { const t = await offeredAt(uid); return t >= t0 ? t : null; }, 30000);
  try {
    const id = await place(order(await student()));
    const o = await settled(id);
    assert.equal(o.status, 'pending');
    // 7 free dashers: 3, then 3 more, then the order is open to everyone.
    const start = o.openToAllAt - 2 * W;
    const [wave0, wave1, last] = [ids.slice(0, 3), ids.slice(3, 6), ids[6]];
    assert.deepEqual(Object.keys(o.offerAt).sort(), [...wave0, ...wave1].sort());
    wave0.forEach(u => assert.equal(o.offerAt[u], start));
    wave1.forEach(u => assert.equal(o.offerAt[u], start + W));
    assert.ok(Math.abs(start - o.verifiedAt) < 5000);

    // Each wave is alerted no earlier than its time (the queue runs them).
    for (const u of wave0) assert.ok(await whenOffered(u), 'first wave alerted');
    for (const u of wave1) assert.ok((await whenOffered(u)) >= start + W - 2000, 'second wave, on time');
    assert.ok((await whenOffered(last)) >= start + 2 * W - 2000, 'the last wave reaches everyone not alerted yet');
    assert.equal(await offeredAt(busy), 0, 'never a dasher mid-delivery');

    // Once taken, later waves do nothing.
    const before = await Promise.all(ids.map(offeredAt));
    const id2 = await place(order(await student()));
    const o2 = await settled(id2);
    await db.doc(`orders/${id2}`).update({ status: 'accepted', dasherId: ids[0], dasherName: 'D', acceptedAt: Date.now() });
    const firstWave2 = Object.keys(o2.offerAt).filter(u => o2.offerAt[u] === o2.openToAllAt - 2 * W);
    await wait(o2.openToAllAt - Date.now() + 4000);
    const after = await Promise.all(ids.map(offeredAt));
    ids.forEach((u, i) => {
      if (!firstWave2.includes(u)) assert.equal(after[i], before[i], `${u} not alerted after the order was taken`);
    });
  } finally {
    await Promise.all([...ids, busy].map(u => db.doc(`dashers/${u}`).update({ isOnline: false })));
  }
});

test('wave dispatch: with 3 or fewer free dashers, everyone gets it at once', async () => {
  const online = await db.collection('dashers').where('isOnline', '==', true).get();
  await Promise.all(online.docs.map(d => d.ref.update({ isOnline: false })));
  const t0 = Date.now();
  const ids = [0, 1].map(i => `few_${t0}_${i}`);
  for (const uid of ids) {
    await db.doc(`users/${uid}`).set({ uid, role: 'dasher', name: uid, isActive: true, createdAt: 1 });
    await db.doc(`dashers/${uid}`).set({ uid, isOnline: true, totalDeliveries: 0, totalEarnings: 0, lastSeenAt: t0 });
  }
  try {
    const o = await settled(await place(order(await student())));
    assert.deepEqual(o.offerAt, {});
    assert.ok(o.openToAllAt <= o.verifiedAt + 5000 && o.openToAllAt >= t0);
    assert.ok(await until(async () => {
      const d = await Promise.all(ids.map(u => get(`dashers/${u}`)));
      return d.every(x => x.lastOfferedAt >= t0);
    }), 'both alerted');
  } finally {
    await Promise.all(ids.map(u => db.doc(`dashers/${u}`).update({ isOnline: false })));
  }
});

// ── Idle dashers (retireIdleDashers, in the 5-minute scheduler) ──────────
test('idle online dashers are nudged, then switched off; busy or active ones are not', async () => {
  const now = Date.now(), min = 60000, hr = 60 * min;
  const tag = `idle_${now}_`;
  const seed = {
    idle3h:       { lastSeenAt: now - 3 * hr },
    nudgedLong:   { lastSeenAt: now - 3 * hr, idleNudgedAt: now - 31 * min },
    nudgedRecent: { lastSeenAt: now - 3 * hr, idleNudgedAt: now - 10 * min },
    cameBack:     { lastSeenAt: now - 10 * min, idleNudgedAt: now - 3 * hr },
    busy:         { lastSeenAt: now - 5 * hr, idleNudgedAt: now - 1 * hr, activeOrderId: 'someOrder' },
    fresh:        { lastSeenAt: now - 5 * min },
  };
  for (const [k, v] of Object.entries(seed)) {
    await db.doc(`dashers/${tag}${k}`).set({ uid: `${tag}${k}`, isOnline: true, totalDeliveries: 0, totalEarnings: 0, ...v });
  }
  await wait(1200);
  await fns.cancelStalePendingOrders.run({});
  const d = async k => (await db.doc(`dashers/${tag}${k}`).get()).data();

  const idle = await d('idle3h');
  assert.equal(idle.isOnline, true, 'first a nudge, not a switch-off');
  assert.ok(idle.idleNudgedAt >= now, 'nudged');

  const gone = await d('nudgedLong');
  assert.equal(gone.isOnline, false); assert.equal(gone.offlineReason, 'idle');

  assert.equal((await d('nudgedRecent')).isOnline, true, 'still in the grace period');
  const back = await d('cameBack');
  assert.equal(back.isOnline, true); assert.equal(back.idleNudgedAt, now - 3 * hr, 'not re-nudged');
  assert.equal((await d('busy')).isOnline, true, 'never mid-delivery');
  const fresh = await d('fresh');
  assert.equal(fresh.isOnline, true); assert.equal(fresh.idleNudgedAt, undefined);
});

// ── Backdated createdAt ────────────────────────────────────────────────────
test('a backdated createdAt cannot skip the active-order limit (server create time decides)', async () => {
  const uid = await student();
  for (const qty of [1, 2, 3]) {
    const o = await settled(await place(order(uid, { items: [{ quantity: qty, menuItem: { id: 'patty' } }] })));
    assert.equal(o.status, 'pending');
  }
  const fourth = await settled(await place(order(uid, { createdAt: 0, items: [{ quantity: 4, menuItem: { id: 'patty' } }] })));
  assert.equal(fourth.cancelReason, 'too_many_active');
});

// ── Group orders (functions/src/groups.ts) ─────────────────────────────────
// Each test uses its own stores (with map positions) and a store filter, so
// open orders left by other tests can't join its groups.
async function groupStore(id, latitude) {
  await db.doc(`stores/${id}`).set({ name: `Store ${id}`, isOpen: true, deliveryFee: 250, location: { latitude, longitude: -76.7466, address: 'x' } });
  await db.doc(`stores/${id}/menuItems/patty`).set({ name: 'Beef patty', price: 300, isAvailable: true, category: 'Hot' });
}
async function onlineDasher(uid) {
  await db.doc(`users/${uid}`).set({ uid, role: 'dasher', name: `Dasher ${uid}`, isActive: true, createdAt: 1 });
  await db.doc(`dashers/${uid}`).set({ uid, isOnline: true, totalDeliveries: 0, totalEarnings: 0, lastSeenAt: Date.now() });
}
const call = (fn, uid, data) => fns[fn].run({ auth: { uid, token: {} }, data, rawRequest: {} });

test('group orders: a search finds nearby stores\' orders, numbers the group, and accepting takes them all', async () => {
  const t = `grp_${Date.now()}`;
  await groupStore(`${t}_a`, 18.0061);
  await groupStore(`${t}_b`, 18.0080);   // ~210 m from a
  await groupStore(`${t}_far`, 18.0300); // ~2.6 km
  const dasher = `${t}_d`;
  await onlineDasher(dasher);
  try {
    const saved = await call('setGroupSearch', dasher, {
      active: true, size: 3, maxStoreDistanceM: 250, storeIds: [`${t}_a`, `${t}_b`, `${t}_far`],
    });
    assert.equal(saved.found, false, 'no orders yet');
    const place3 = async (storeId) => settled(await place(order(await student(), { storeId })));
    await place3(`${t}_a`);
    await place3(`${t}_far`);
    await place3(`${t}_a`);
    await wait(1500);
    assert.ok(!(await get(`groupSearches/${dasher}`)).offeredGroupId, 'two nearby orders are not a group of three');
    await place3(`${t}_b`);
    // publishNewOrder runs the matcher: a group of the three nearby orders.
    const groupId = await until(async () => (await get(`groupSearches/${dasher}`))?.offeredGroupId);
    assert.ok(groupId, 'group offered');
    const g = await get(`orderGroups/${groupId}`);
    assert.equal(g.status, 'offered');
    assert.equal(g.size, 3);
    assert.ok(g.groupNo >= 1);
    assert.ok(g.spanM > 150 && g.spanM <= 250, `span ${g.spanM}`);
    assert.deepEqual([...g.storeIds].sort(), [`${t}_a`, `${t}_b`].sort());
    assert.equal(g.payoutJmd, 3 * 330, 'the dasher\'s share of each (fallback) fee');

    const res = await call('acceptOrderGroup', dasher, { groupId });
    assert.equal(res.outcome, 'ok');
    for (const id of g.orderIds) {
      const o = await get(`orders/${id}`);
      assert.equal(o.status, 'accepted');
      assert.equal(o.dasherId, dasher);
      assert.equal(o.groupId, groupId);
    }
    // Each order's accepted trigger keeps the whole group (no undo).
    await wait(3000);
    for (const id of g.orderIds) assert.equal((await get(`orders/${id}`)).status, 'accepted');
    const d = await get(`dashers/${dasher}`);
    assert.deepEqual([...d.activeOrderIds].sort(), [...g.orderIds].sort());
    assert.equal((await get(`orderGroups/${groupId}`)).status, 'accepted');
    // Delivering one keeps the dasher busy with the rest.
    await db.doc(`orders/${g.orderIds[0]}`).update({ status: 'cancelled', cancelReason: 'admin', cancelledAt: Date.now() });
    assert.ok(await until(async () => (await get(`dashers/${dasher}`)).activeOrderIds.length === 2), 'one freed');
    assert.ok((await get(`dashers/${dasher}`)).activeOrderId, 'still busy');
  } finally {
    await db.doc(`dashers/${dasher}`).update({ isOnline: false });
    await call('setGroupSearch', dasher, { active: false });
  }
});

test('group orders: if someone takes one order first, the group is no longer available', async () => {
  const t = `grp2_${Date.now()}`;
  await groupStore(`${t}_a`, 18.0061);
  const dasher = `${t}_d`;
  await onlineDasher(dasher);
  try {
    await call('setGroupSearch', dasher, { active: true, size: 2, maxStoreDistanceM: 0, storeIds: [`${t}_a`] });
    for (let i = 0; i < 2; i++) await settled(await place(order(await student(), { storeId: `${t}_a` })));
    const groupId = await until(async () => (await get(`groupSearches/${dasher}`))?.offeredGroupId);
    assert.ok(groupId, 'group offered');
    const g = await get(`orderGroups/${groupId}`);
    // Another dasher grabs one of the orders on its own.
    await db.doc(`orders/${g.orderIds[1]}`).update({ status: 'accepted', dasherId: `${t}_other`, dasherName: 'O', acceptedAt: Date.now() });
    const res = await call('acceptOrderGroup', dasher, { groupId });
    assert.equal(res.ok, false);
    assert.equal(res.outcome, 'gone');
    assert.equal((await get(`orderGroups/${groupId}`)).status, 'expired');
    assert.equal((await get(`orders/${g.orderIds[0]}`)).status, 'pending', 'the other order was not taken');
  } finally {
    await db.doc(`dashers/${dasher}`).update({ isOnline: false });
    await call('setGroupSearch', dasher, { active: false });
  }
});

test('a dasher already delivering who accepts a second order has it undone', async () => {
  const t = `busy_${Date.now()}`;
  const dasher = `${t}_d`;
  await onlineDasher(dasher);
  await db.doc(`dashers/${dasher}`).update({ isOnline: false });
  const first = await place({ ...order(await student()), status: 'accepted', dasherId: dasher, dasherName: 'D', verifiedAt: Date.now() });
  assert.ok(await until(async () => (await get(`dashers/${dasher}`)).activeOrderId === first), 'busy with the first');
  const second = (await settled(await place(order(await student()))));
  const secondId = (await db.collection('orders').where('studentId', '==', second.studentId).get()).docs[0].id;
  // Two accepts at once (the rule can't see the first yet): the server undoes the second.
  await db.doc(`orders/${secondId}`).update({ status: 'accepted', dasherId: dasher, dasherName: 'D', acceptedAt: Date.now() });
  assert.ok(await until(async () => (await get(`orders/${secondId}`)).status === 'pending'), 'second accept undone');
  assert.equal((await get(`orders/${secondId}`)).dasherId, undefined);
  assert.deepEqual((await get(`dashers/${dasher}`)).activeOrderIds, [first]);
});

test('an account with tokens left cannot be deleted', async () => {
  const uid = await student();
  await db.doc(`wallets/${uid}`).set({ balanceJmd: 500, reservedJmd: 0 });
  await assert.rejects(call('deleteMyAccount', uid, {}), /tokens/);
  assert.ok(await get(`users/${uid}`), 'account kept');
});

// ── Proximity pricing ──────────────────────────────────────────────────────
test('delivery fee by walking distance: from the store\'s food spot to the chosen campus point', async () => {
  const t = `prox_${Date.now()}`;
  await db.doc(`stores/${t}`).set({ name: 'The Spot', isOpen: true, deliveryFee: 300, pickupPointId: 'spot' });
  await db.doc(`stores/${t}/menuItems/patty`).set({ name: 'Beef patty', price: 300, isAvailable: true, category: 'Hot' });
  const to = (pointId, extra = {}) => ({ pointId, label: 'Tampered label', latitude: 1, longitude: 1, hasGpsFix: false, ...extra });

  // Spot → George Alleyne (271 m): the minimum fee.
  const near = await settled(await place(order(await student(), { storeId: t, deliveryAddress: to('george-alleyne'), deliveryFee: 1, totalAmount: 1 })));
  assert.equal(near.deliveryFee, 300);
  assert.equal(near.totalAmount, 2 * 300 + 300);
  assert.equal(near.dasherPayoutJmd, 250);
  assert.equal(near.platformFeeJmd, 50);
  assert.equal(near.deliveryDistanceM, 271);
  assert.equal(near.feeBasis, 'route');
  assert.equal(near.deliveryAddress.label, 'George Alleyne Hall', 'name and position from the campus list, not the phone');
  assert.equal(near.deliveryAddress.hasGpsFix, true);

  // Spot → Taylor Hall (882 m): three steps above the minimum.
  const far = await settled(await place(order(await student(), { storeId: t, deliveryAddress: to('taylor') })));
  assert.equal(far.deliveryFee, 450);
  assert.equal(far.dasherPayoutJmd, 370);
  assert.equal(far.platformFeeJmd, 80);

  // A hall with no map position yet: the fallback fee.
  const unknown = await settled(await place(order(await student(), { storeId: t, deliveryAddress: to('wjc') })));
  assert.equal(unknown.deliveryFee, 400);
  assert.equal(unknown.feeBasis, 'fallback');
});

