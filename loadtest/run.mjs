// loadtest/run.mjs
// DormDash load test. Simulates a lunch rush against the LOCAL Firebase
// emulator: real security rules, real Cloud Functions code, fake users.
// It can never touch the live app (see the safety guard below).
//
// Start it with:   node loadtest/start.mjs
// Bigger run:      STUDENTS=100 DASHERS=15 node loadtest/start.mjs
//
// Settings (environment variables, all optional):
//   STUDENTS  simulated students            (default 30)
//   DASHERS   simulated dashers             (default 8)
//   ORDERS    orders per normal student     (default 2, max 3)
//   RAMP      seconds over which students start ordering (default 30)
//   PACE      dasher speed; 2 = twice as slow (default 1)
//   TIMEOUT   seconds before giving up on unfinished orders (default 360)
//
// What each simulated person does (the same steps the real app takes):
//   Students place orders, wait for a dasher, then pay with tokens.
//   Some students also try the tricky things real people do:
//     • tap "Place order" 3 times fast      → exactly 1 order must survive
//     • place 4 orders at once              → the 4th must be refused
//     • send a fake low price               → the server must correct it
//     • cancel right as a dasher accepts    → one of the two must win, cleanly
//     • double-tap "Pay with tokens"        → charged exactly once
//     • pay with too few tokens, top up, pay again
//   Dashers go online, race each other for the same orders, wait for
//   payment, then go picking up → on the way → delivered.
//
// At the end it checks every order, balance, ledger line, float and dasher
// total, prints PASS/FAIL for each rule, and saves a report in
// loadtest/reports/. Exit code 1 if any rule failed.

import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, setLogLevel, collection, addDoc, doc,
  onSnapshot, query, where, orderBy, runTransaction, updateDoc,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Safety guard: emulator only, demo project only ────────────────────────
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FS_HOST || !AUTH_HOST || !PROJECT.startsWith('demo-')) {
  console.error('\nSTOP: the load test only runs against the local emulator.');
  console.error('Start it with:  node loadtest/start.mjs\n');
  process.exit(2);
}

const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();
setLogLevel('silent');

// ─── Settings ──────────────────────────────────────────────────────────────
const num = (k, d, min, max) => Math.min(max, Math.max(min, Number(process.env[k]) || d));
const CFG = {
  students: num('STUDENTS', 30, 5, 500),
  dashers: num('DASHERS', 8, 2, 100),
  orders: num('ORDERS', 2, 1, 3),
  rampS: num('RAMP', 30, 0, 600),
  pace: num('PACE', 1, 0.1, 10),
  timeoutS: num('TIMEOUT', 360, 30, 3600),
};
const SEED_BALANCE = 20000;     // J$ of tokens each student starts with
const STORE_FLOAT = 500000;     // J$ float on the store that has one
const T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const since = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(6) + 's';
const log = (...a) => console.log(since(), ...a);

// ─── Emulator addresses ────────────────────────────────────────────────────
async function functionsHost() {
  try {
    const hub = process.env.FIREBASE_EMULATOR_HUB;
    if (hub) {
      const info = await (await fetch(`http://${hub}/emulators`)).json();
      if (info.functions) return { host: info.functions.host === '::1' ? '127.0.0.1' : info.functions.host, port: info.functions.port };
    }
  } catch {}
  return { host: '127.0.0.1', port: 5001 };
}
const [fsHost, fsPort] = FS_HOST.split(':');
const FN = await functionsHost();

// ─── Data the run needs ────────────────────────────────────────────────────
const STORES = [
  { id: 'lt_store_float', name: 'Float Store', deliveryFee: 150, float: STORE_FLOAT },
  { id: 'lt_store_a', name: 'Store A', deliveryFee: 200 },
  { id: 'lt_store_b', name: 'Store B', deliveryFee: 100 },
];
const MENU = [
  { id: 'm1', name: 'Beef Patty', price: 350 },
  { id: 'm2', name: 'Coco Bread', price: 150 },
  { id: 'm3', name: 'Jerk Chicken', price: 900 },
  { id: 'm4', name: 'Bag Juice', price: 100 },
  { id: 'm5', name: 'Fries', price: 400 },
];
const PASSWORD = 'loadtest-password-1';

// Everything the run observes, for the report.
const orders = new Map();      // orderId -> record
const lat = { verify: [], acceptTx: [], toPayPrompt: [], payCall: [], paidToStart: [], endToEnd: [] };
const counts = {
  acceptOk: 0, acceptTaken: 0, acceptCancelled: 0, acceptGone: 0, acceptError: 0,
  payOk: 0, payRefused: 0, payError: 0, earlyStartBlocked: 0, earlyStartAllowed: 0,
  cancelWon: 0, cancelLost: 0,
};
const acceptWinners = new Map(); // orderId -> [dasher uids that got 'ok']
const topUps = new Map();        // student uid -> J$ added by the harness
const errors = [];
let WARMUP_ID = null;
const stats = arr => {
  if (!arr.length) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const p = q => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p50: p(0.5), p95: p(0.95), max: s[s.length - 1] };
};

// ─── Setup ─────────────────────────────────────────────────────────────────
async function seed() {
  const batch = adb.batch();
  for (const s of STORES) {
    batch.set(adb.doc(`stores/${s.id}`), {
      name: s.name, description: 'Load test store', deliveryFee: s.deliveryFee, rating: 5, isOpen: true,
      ...(s.float ? { floatJmd: s.float } : {}),
    });
    for (const m of MENU) {
      batch.set(adb.doc(`stores/${s.id}/menuItems/${m.id}`), {
        ...m, storeId: s.id, description: '', category: 'Food', isAvailable: true,
      });
    }
  }
  await batch.commit();
}

async function makeUser(role, i) {
  const email = `${role}${i}@loadtest.dormdash`;
  const name = `${role === 'student' ? 'Student' : 'Dasher'} ${i}`;
  const u = await admin.auth().createUser({ email, password: PASSWORD, displayName: name });
  await adb.doc(`users/${u.uid}`).set({
    uid: u.uid, email, name, role, phone: '8760000000', university: 'UWI Mona',
    createdAt: Date.now(), isActive: true, termsAcceptedAt: Date.now(), termsVersion: 'loadtest',
  });
  if (role === 'dasher') {
    await adb.doc(`dashers/${u.uid}`).set({
      uid: u.uid, isOnline: true, rating: 5, totalDeliveries: 0, totalEarnings: 0, vehicleType: 'walking',
    });
  }
  // A signed-in "phone" for this person: its own app, auth and database.
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `${role}${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, FN.host, FN.port);
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  return { uid: u.uid, name, db, fns, i };
}

async function inBatches(n, size, fn) {
  const out = [];
  for (let s = 0; s < n; s += size) {
    out.push(...await Promise.all(Array.from({ length: Math.min(size, n - s) }, (_, k) => fn(s + k))));
  }
  return out;
}

// ─── Student ───────────────────────────────────────────────────────────────
function cartFor(variant) {
  // Different variants give different item mixes, so they are not duplicates.
  const a = MENU[variant % MENU.length];
  const b = MENU[(variant + 2) % MENU.length];
  return [
    { menuItem: { id: a.id, storeId: '', name: a.name, description: '', price: a.price, category: 'Food', isAvailable: true }, quantity: 1 + (variant % 2) },
    { menuItem: { id: b.id, storeId: '', name: b.name, description: '', price: b.price, category: 'Food', isAvailable: true }, quantity: 1 },
  ];
}

async function placeOrder(st, store, variant, { tamper = false, kind = 'normal', group = null } = {}) {
  const items = cartFor(variant).map(l => ({ ...l, menuItem: { ...l.menuItem, storeId: store.id } }));
  const subtotal = items.reduce((s, l) => s + l.menuItem.price * l.quantity, 0);
  const createdAt = Date.now();
  const ref = await addDoc(collection(st.db, 'orders'), {
    studentId: st.uid, studentName: st.name, storeId: store.id, storeName: store.name, items,
    status: 'pending', totalAmount: tamper ? 1 : subtotal + store.deliveryFee, deliveryFee: store.deliveryFee,
    deliveryAddress: { latitude: 18.0, longitude: -76.75, label: `Block ${st.i}`, hasGpsFix: false },
    createdAt, paymentMethod: 'card',
  });
  const rec = { id: ref.id, student: st.uid, store: store.id, kind, group, createdAt, expectedTotal: subtotal + store.deliveryFee, t: {} };
  orders.set(ref.id, rec);
  return rec;
}

// Follow one order from the student's side until it's finished.
function followOrder(st, rec, behaviour) {
  return new Promise(resolve => {
    let paying = false;
    let cancelTried = false;
    const unsub = onSnapshot(doc(st.db, 'orders', rec.id), async snap => {
      const o = snap.data();
      if (!o) return;
      const now = Date.now();
      if (o.verifiedAt && !rec.t.verified) { rec.t.verified = now; lat.verify.push(now - rec.createdAt); }
      if (o.dasherId && !rec.t.accepted) rec.t.accepted = now;

      if (behaviour.cancelEarly && !cancelTried && o.status === 'pending' && o.verifiedAt) {
        cancelTried = true;
        updateDoc(doc(st.db, 'orders', rec.id), { status: 'cancelled', cancelledAt: Date.now() })
          .then(() => { counts.cancelWon++; rec.studentCancelled = true; })
          .catch(() => { counts.cancelLost++; }); // a dasher got there first: fine
      }

      if (o.paymentStatus === 'awaiting_payment' && !paying) {
        paying = true;
        rec.t.payPrompt = now;
        if (rec.t.accepted) lat.toPayPrompt.push(now - rec.t.accepted);
        await sleep(rand(300, 2500)); // student reads the notification
        await pay(st, rec, behaviour);
      }
      if (o.paymentStatus === 'paid' && !rec.t.paid) rec.t.paid = now;
      if (o.status === 'delivered' || o.status === 'cancelled') {
        rec.t.done = now;
        rec.final = o.status;
        rec.cancelReason = o.cancelReason ?? null;
        if (o.status === 'delivered') lat.endToEnd.push(now - rec.createdAt);
        unsub();
        resolve();
      }
    }, err => { errors.push(`student listener ${rec.id}: ${err.message}`); unsub(); resolve(); });
  });
}

async function pay(st, rec, behaviour) {
  const call = httpsCallable(st.fns, 'payOrderWithTokens');
  const once = async () => {
    const t = Date.now();
    try {
      await call({ orderId: rec.id });
      lat.payCall.push(Date.now() - t);
      counts.payOk++;
      return 'ok';
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/already paid|enough tokens|once a dasher/i.test(msg)) { counts.payRefused++; return msg; }
      counts.payError++;
      errors.push(`pay ${rec.id}: ${msg}`);
      return 'error';
    }
  };
  if (behaviour.doubleTapPay) {
    await Promise.all([once(), once()]);
    return;
  }
  const r = await once();
  if (typeof r === 'string' && /enough tokens/i.test(r)) {
    // Top up (like an admin adding cash tokens), then pay again.
    const add = 10000;
    await adb.doc(`wallets/${st.uid}`).set({ balanceJmd: admin.firestore.FieldValue.increment(add) }, { merge: true });
    topUps.set(st.uid, (topUps.get(st.uid) || 0) + add);
    rec.neededTopUp = true;
    await once();
  }
}

async function runStudent(st, role) {
  await sleep(rand(0, CFG.rampS * 1000));
  const follows = [];
  const follow = (rec, b = {}) => follows.push(followOrder(st, rec, { ...role, ...b }));
  try {
    if (role.burst) {
      // Three taps on "Place order" in a row.
      const store = STORES[st.i % STORES.length];
      const recs = await Promise.all([0, 1, 2].map(() => placeOrder(st, store, st.i, { kind: 'burst', group: st.uid })));
      recs.forEach(r => follow(r));
    } else if (role.limit) {
      // Four different orders at once: the 4th must be refused.
      const recs = await Promise.all([0, 1, 2, 3].map(k =>
        placeOrder(st, STORES[k % STORES.length], st.i + k * 7, { kind: 'limit', group: st.uid })));
      recs.forEach(r => follow(r));
    } else {
      for (let k = 0; k < CFG.orders; k++) {
        const rec = await placeOrder(st, STORES[(st.i + k) % STORES.length], st.i * 3 + k, { tamper: role.tamper && k === 0 });
        follow(rec, { cancelEarly: role.cancelEarly && k === 0 });
        if (k < CFG.orders - 1) await sleep(rand(1000, 8000));
      }
    }
  } catch (e) {
    errors.push(`student ${st.i} could not order: ${e.message}`);
  }
  await Promise.all(follows);
}

// ─── Dasher ────────────────────────────────────────────────────────────────
function runDasher(d, stopAt) {
  return new Promise(resolve => {
    let pending = [];
    let busy = false;
    const unsub = onSnapshot(
      query(collection(d.db, 'orders'), where('status', '==', 'pending'), orderBy('createdAt', 'asc')),
      snap => { pending = snap.docs.filter(x => !!x.data().verifiedAt).map(x => x.id); },
      err => errors.push(`dasher ${d.i} list: ${err.message}`),
    );

    const NEXT = { accepted: 'picking_up', picking_up: 'on_the_way', on_the_way: 'delivered' };
    const deliver = orderId => new Promise(done => {
      let started = false;
      let finished = false;
      const finish = () => { if (!finished) { finished = true; stop(); done(); } };
      const stop = onSnapshot(doc(d.db, 'orders', orderId), async snap => {
        const o = snap.data();
        if (!o || o.status === 'cancelled' || o.status === 'delivered') { finish(); return; }
        if (o.paymentStatus === 'paid' && !started) {
          started = true;
          const rec = orders.get(orderId);
          if (rec?.t.paid) lat.paidToStart.push(Date.now() - rec.t.paid);
          try {
            const ref = doc(d.db, 'orders', orderId);
            let status = o.status;
            while (NEXT[status]) {
              await sleep(rand(500, 2000) * CFG.pace);
              const next = NEXT[status];
              await updateDoc(ref, next === 'delivered' ? { status: next, deliveredAt: Date.now() } : { status: next });
              status = next;
            }
          } catch (e) {
            errors.push(`dasher ${d.i} delivering ${orderId}: ${e.message}`);
            finish();
          }
        }
      }, err => { errors.push(`dasher ${d.i} order ${orderId}: ${err.message}`); finish(); });
    });

    const tick = async () => {
      if (Date.now() > stopAt.value) { unsub(); resolve(); return; }
      if (!busy && pending.length) {
        busy = true;
        // Pick one of the oldest few, so dashers collide like they do at rush hour.
        const orderId = pending[Math.floor(Math.random() * Math.min(3, pending.length))];
        const ref = doc(d.db, 'orders', orderId);
        const t = Date.now();
        let outcome;
        try {
          outcome = await runTransaction(d.db, async tx => {
            const snap = await tx.get(ref);
            const cur = snap.data();
            if (!snap.exists() || !cur) return 'gone';
            if (cur.status === 'cancelled') return 'cancelled';
            if (cur.status !== 'pending' || cur.dasherId) return 'taken';
            tx.update(ref, { dasherId: d.uid, dasherName: d.name, status: 'accepted', acceptedAt: Date.now() });
            return 'ok';
          });
        } catch (e) {
          outcome = 'error';
          // A rejected write here usually means the order changed under us.
          if (!/permission|precondition|aborted/i.test(e.message)) errors.push(`dasher ${d.i} accept: ${e.message}`);
        }
        lat.acceptTx.push(Date.now() - t);
        if (outcome === 'ok') {
          counts.acceptOk++;
          acceptWinners.set(orderId, [...(acceptWinners.get(orderId) || []), d.uid]);
          // Try to start before paying is done: the rules must block it.
          try {
            await updateDoc(ref, { status: 'picking_up' });
            counts.earlyStartAllowed++; // only legal if it was already paid
            const rec = orders.get(orderId); if (rec) rec.earlyStart = true;
          } catch { counts.earlyStartBlocked++; }
          await deliver(orderId);
        } else if (outcome === 'taken') counts.acceptTaken++;
        else if (outcome === 'cancelled') counts.acceptCancelled++;
        else if (outcome === 'gone') counts.acceptGone++;
        else counts.acceptError++;
        busy = false;
      }
      setTimeout(tick, rand(150, 600));
    };
    tick();
  });
}

// ─── Checks ────────────────────────────────────────────────────────────────
async function verify(students, dashers) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  const all = (await adb.collection('orders').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.id !== WARMUP_ID);
  const byId = new Map(all.map(o => [o.id, o]));
  const foodCost = o => Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.deliveryFee) || 0));
  const paid = all.filter(o => o.paymentStatus === 'paid');

  const stuck = all.filter(o => !['delivered', 'cancelled'].includes(o.status));
  check('Every order finished (delivered or cancelled)', stuck.length === 0,
    stuck.length ? `${stuck.length} stuck, e.g. ${stuck.slice(0, 3).map(o => `${o.id}:${o.status}/${o.paymentStatus}`).join(', ')}` : '');

  const unverified = all.filter(o => !o.verifiedAt && !o.cancelReason && !(orders.get(o.id)?.studentCancelled));
  check('Server checked every order it did not reject', unverified.length === 0, unverified.length ? `${unverified.length} never checked` : '');

  const doubles = [...acceptWinners].filter(([, w]) => w.length > 1);
  const wrongOwner = [...acceptWinners].filter(([id, w]) => byId.get(id)?.dasherId !== w[0]);
  check('No order was accepted by two dashers', doubles.length === 0 && wrongOwner.length === 0,
    doubles.length || wrongOwner.length ? `${doubles.length} double, ${wrongOwner.length} wrong owner` : '');

  const deliveredUnpaid = all.filter(o => o.status === 'delivered' && o.paymentStatus !== 'paid');
  check('Every delivered order was paid', deliveredUnpaid.length === 0, deliveredUnpaid.map(o => o.id).join(', '));

  const earlyUnpaid = [...orders.values()].filter(r => r.earlyStart && !(byId.get(r.id)?.paidAt));
  check('No dasher started an unpaid order', earlyUnpaid.length === 0,
    `${counts.earlyStartBlocked} early starts blocked by the rules`);

  const wrongTotal = all.filter(o => o.verifiedAt && orders.get(o.id) && o.totalAmount !== orders.get(o.id).expectedTotal);
  check('Server fixed every price (including faked ones)', wrongTotal.length === 0, wrongTotal.map(o => o.id).join(', '));

  // Tap bursts: exactly one of the three survives.
  const groups = new Map();
  for (const r of orders.values()) if (r.kind === 'burst') groups.set(r.group, [...(groups.get(r.group) || []), byId.get(r.id)]);
  const badBursts = [...groups.values()].filter(g => g.filter(o => o.cancelReason !== 'duplicate_order').length !== 1);
  check('Triple-tap made exactly one order', badBursts.length === 0, `${groups.size} bursts, ${badBursts.length} wrong`);

  // 4 at once: exactly one refused as too many.
  const lim = new Map();
  for (const r of orders.values()) if (r.kind === 'limit') lim.set(r.group, [...(lim.get(r.group) || []), byId.get(r.id)]);
  const badLim = [...lim.values()].filter(g => g.filter(o => o.cancelReason === 'too_many_active').length !== 1);
  check('4th order at once was refused (max 3 active)', badLim.length === 0, `${lim.size} tested, ${badLim.length} wrong`);

  // Student balances and ledger.
  let walletBad = [], ledgerBad = [], heldBad = [];
  const tx = (await adb.collection('walletTx').get()).docs.map(d => d.data());
  for (const st of students) {
    const w = (await adb.doc(`wallets/${st.uid}`).get()).data() ?? {};
    const start = st.seedBalance + (topUps.get(st.uid) || 0);
    const spent = paid.filter(o => o.studentId === st.uid && o.paymentMethod === 'tokens').reduce((s, o) => s + o.totalAmount, 0);
    const refunded = all.filter(o => o.studentId === st.uid && o.paymentStatus === 'refunded_tokens').reduce((s, o) => s + o.totalAmount, 0);
    const expected = start - spent + refunded;
    if ((Number(w.balanceJmd) || 0) !== expected) walletBad.push(`${st.name}: has ${w.balanceJmd}, expected ${expected}`);
    const ledger = tx.filter(t => t.uid === st.uid).reduce((s, t) => s + (Number(t.amountJmd) || 0), 0);
    const reserveNet = tx.filter(t => t.uid === st.uid && (t.type === 'order_reserve' || t.type === 'order_release')).reduce((s, t) => s + t.amountJmd, 0);
    if (ledger - reserveNet !== expected - start) ledgerBad.push(`${st.name}: ledger ${ledger - reserveNet}, balance change ${expected - start}`);
    if ((Number(w.reservedJmd) || 0) !== 0) heldBad.push(st.name);
  }
  check('Every token balance is exactly right (no double charges)', walletBad.length === 0, walletBad.slice(0, 5).join('; '));
  check('Token ledger matches every balance', ledgerBad.length === 0, ledgerBad.slice(0, 5).join('; '));
  check('No tokens left held', heldBad.length === 0, heldBad.slice(0, 5).join(', '));

  // Floats.
  const floatStore = STORES.find(s => s.float);
  const fs = (await adb.doc(`stores/${floatStore.id}`).get()).data();
  const expectStore = floatStore.float - paid.filter(o => o.storeId === floatStore.id).reduce((s, o) => s + foodCost(o), 0);
  check('Store float went down by exactly the food cost', fs.floatJmd === expectStore, `has ${fs.floatJmd}, expected ${expectStore}`);
  const dasherFloatBad = [];
  const statBad = [];
  for (const d of dashers) {
    const dd = (await adb.doc(`dashers/${d.uid}`).get()).data() ?? {};
    const expectFloat = -paid.filter(o => o.dasherId === d.uid && o.storeId !== floatStore.id).reduce((s, o) => s + foodCost(o), 0);
    if ((Number(dd.floatJmd) || 0) !== expectFloat) dasherFloatBad.push(`${d.name}: ${dd.floatJmd ?? 0} vs ${expectFloat}`);
    const mine = all.filter(o => o.dasherId === d.uid && o.status === 'delivered');
    const earn = mine.reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0);
    if (dd.totalDeliveries !== mine.length || dd.totalEarnings !== earn) {
      statBad.push(`${d.name}: ${dd.totalDeliveries}/${dd.totalEarnings} vs ${mine.length}/${earn}`);
    }
  }
  check('Dasher floats went down by exactly the food cost', dasherFloatBad.length === 0, dasherFloatBad.slice(0, 5).join('; '));
  check('Dasher delivery counts and earnings are exact', statBad.length === 0, statBad.slice(0, 5).join('; '));

  const ftx = (await adb.collection('floatTx').get()).docs;
  const missingFtx = paid.filter(o => foodCost(o) > 0 && !ftx.some(f => f.id === `${o.id}_use`));
  check('Every paid order has a float ledger line', missingFtx.length === 0, `${missingFtx.length} missing`);

  check('No unexpected errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  return { results, all };
}

// ─── Run ───────────────────────────────────────────────────────────────────
console.log('\nDormDash load test (local emulator, nothing live is touched)');
console.log(`Students ${CFG.students} · Dashers ${CFG.dashers} · ${CFG.orders} orders each · ramp ${CFG.rampS}s · pace ${CFG.pace} · timeout ${CFG.timeoutS}s\n`);

await seed();
log('Creating accounts…');
const students = await inBatches(CFG.students, 10, i => makeUser('student', i));
const dashers = await inBatches(CFG.dashers, 10, i => makeUser('dasher', i));

// Give the special roles to a few students.
const pick = (k) => students[k % students.length];
const roles = new Map(students.map(s => [s.uid, {}]));
roles.get(pick(0).uid).burst = true;
roles.get(pick(1).uid).limit = true;
roles.get(pick(2).uid).tamper = true;
roles.get(pick(3).uid).cancelEarly = true;
roles.get(pick(4).uid).doubleTapPay = true;
for (let k = 5; k < students.length; k += 10) roles.get(students[k].uid).doubleTapPay = true;
for (let k = 7; k < students.length; k += 10) roles.get(students[k].uid).cancelEarly = true;
const poor = students.length > 8 ? students[8] : null; // starts with too few tokens

const wb = adb.batch();
for (const s of students) {
  s.seedBalance = s === poor ? 100 : SEED_BALANCE;
  wb.set(adb.doc(`wallets/${s.uid}`), { balanceJmd: s.seedBalance, reservedJmd: 0, updatedAt: Date.now() });
}
await wb.commit();

// Warm up the functions so the first real order isn't timing a cold start.
log('Warming up the server functions…');
{
  const w = await placeOrder(students[0], STORES[1], 999, { kind: 'warmup' });
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    const o = (await adb.doc(`orders/${w.id}`).get()).data();
    if (o?.verifiedAt || o?.status === 'cancelled') break;
    await sleep(300);
  }
  await adb.doc(`orders/${w.id}`).update({ status: 'cancelled', cancelReason: 'admin', cancelledAt: Date.now() });
  orders.delete(w.id);
  lat.verify.length = 0;
  WARMUP_ID = w.id;
  await sleep(1500);
}

log(`Rush starts: ${students.length} students, ${dashers.length} dashers`);
const stopAt = { value: Date.now() + CFG.timeoutS * 1000 };
const dasherRuns = dashers.map(d => runDasher(d, stopAt));
// Stop early if nothing has moved for a minute: something is stuck, and the
// checks below will say what.
let lastSig = '', sameFor = 0, stalled = null;
const stallP = new Promise(r => { stalled = r; });
const progress = setInterval(() => {
  const v = [...orders.values()];
  const del = v.filter(r => r.final === 'delivered').length;
  const can = v.filter(r => r.final === 'cancelled').length;
  log(`orders ${v.length} · delivered ${del} · cancelled ${can} · accepts ${counts.acceptOk} (lost races ${counts.acceptTaken})`);
  const sig = `${v.length}/${del}/${can}/${counts.acceptOk}/${counts.payOk}/${counts.payError}`;
  sameFor = sig === lastSig ? sameFor + 1 : 0;
  lastSig = sig;
  if (sameFor >= 6) stalled('stalled');
}, 10000);

const studentRuns = students.map(s => runStudent(s, roles.get(s.uid)));
const finished = await Promise.race([
  Promise.all(studentRuns).then(() => 'done'),
  sleep(CFG.timeoutS * 1000).then(() => 'timeout'),
  stallP,
]);
stopAt.value = 0;
clearInterval(progress);
if (finished === 'stalled') log('Nothing moved for 60s; stopping early and checking what finished.');
if (finished === 'timeout') log('Timeout reached; checking what finished.');
await Promise.race([Promise.all(dasherRuns), sleep(3000)]);
// Let the last server triggers land (dasher totals are added after delivery).
{
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const delivered = (await adb.collection('orders').where('status', '==', 'delivered').get()).size;
    let counted = 0;
    for (const d of dashers) counted += Number((await adb.doc(`dashers/${d.uid}`).get()).data()?.totalDeliveries) || 0;
    if (counted >= delivered) break;
    await sleep(1000);
  }
  await sleep(1000);
}

log('Checking every order, balance and float…');
const { results, all } = await verify(students, dashers);

// ─── Report ────────────────────────────────────────────────────────────────
const ms = s => s.n ? `p50 ${s.p50}ms · p95 ${s.p95}ms · max ${s.max}ms (n=${s.n})` : 'no data';
const L = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, stats(v)]));
console.log('\n──────── Speed (emulator on this Mac; real Firebase is usually faster) ────────');
console.log('Server checks new order     ', ms(L.verify));
console.log('Dasher accept (transaction) ', ms(L.acceptTx));
console.log('Accept → "Pay now" shown    ', ms(L.toPayPrompt));
console.log('Pay with tokens (call)      ', ms(L.payCall));
console.log('Paid → dasher can start     ', ms(L.paidToStart));
console.log('Order placed → delivered    ', ms(L.endToEnd));
console.log('\n──────── Activity ────────');
console.log(`Orders ${all.length} · delivered ${all.filter(o => o.status === 'delivered').length} · cancelled ${all.filter(o => o.status === 'cancelled').length}`);
const reasons = {};
all.filter(o => o.cancelReason).forEach(o => { reasons[o.cancelReason] = (reasons[o.cancelReason] || 0) + 1; });
const studentCancels = all.filter(o => o.status === 'cancelled' && !o.cancelReason).length;
console.log('Cancel reasons:', JSON.stringify({ ...reasons, ...(studentCancels ? { by_student: studentCancels } : {}) }));
console.log(`Accepts won ${counts.acceptOk} · lost the race ${counts.acceptTaken} · order cancelled ${counts.acceptCancelled} · errors ${counts.acceptError}`);
console.log(`Payments ok ${counts.payOk} · refused (double tap / not enough) ${counts.payRefused} · errors ${counts.payError}`);
console.log(`Early starts blocked ${counts.earlyStartBlocked} · student cancels won ${counts.cancelWon} / lost to a dasher ${counts.cancelLost}`);

console.log('\n──────── Checks ────────');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL CHECKS PASSED'} in ${((Date.now() - T0) / 1000).toFixed(0)}s\n`);

const dir = join(HERE, 'reports');
mkdirSync(dir, { recursive: true });
const file = join(dir, `loadtest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ config: CFG, latency: L, counts, checks: results, errors: errors.slice(0, 200) }, null, 2));
console.log(`Report saved: loadtest/reports/${file.split('/').pop()}\n`);
process.exit(failed ? 1 : 0);
