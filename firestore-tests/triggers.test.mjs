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
//
// Nothing here sends a real push: no test user has a push token that
// would be used, and the project is a demo project with no real backend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-dormdash';
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
  await db.doc('stores/store1').set({ name: 'Ring Road Grill', isOpen: true, deliveryFee: 150 });
  await db.doc('stores/store1/menuItems/patty').set({ name: 'Beef patty', price: 300, isAvailable: true, category: 'Hot' });
  await db.doc('stores/store1/menuItems/soldout').set({ name: 'Oxtail', price: 900, isAvailable: false, category: 'Hot' });
  await db.doc('stores/closed').set({ name: 'Closed Kitchen', isOpen: false, deliveryFee: 100 });
});
after(async () => { await admin.app().delete(); });

// ── verifyNewOrder ─────────────────────────────────────────────────────────
test('new order is re-priced from the menu; tampered fields are replaced', async () => {
  const uid = await student();
  const o = await settled(await place(order(uid)));
  assert.equal(o.status, 'pending');
  assert.equal(o.totalAmount, 2 * 300 + 150);
  assert.equal(o.deliveryFee, 150);
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
    deliveryFee: 250, totalAmount: 1000, createdAt: Date.now() - 25 * 60000,
  });
  await wait(1500);
  await db.doc(`orders/${id}`).update({ status: 'delivered', deliveredAt: Date.now() });
  assert.ok(await until(async () => (await get(`orders/${id}`)).dasherCreditedAt), 'credited');
  await db.doc(`orders/${id}`).update({ studentNote: 'a later, unrelated write' });
  await wait(3000);
  const d = await get(`dashers/${did}`);
  assert.equal(d.totalDeliveries, 1);
  assert.equal(d.totalEarnings, 250);
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
