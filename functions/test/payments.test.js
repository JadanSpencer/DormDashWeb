// In-memory test of functions/lib/payments.js money logic (no network, no emulator).
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const FN = path.join(__dirname, '..'); // run: cd functions && npm run test:payments

// ── Minimal Firestore mock with transactions (reads must precede writes) ──
const store = new Map(); // path -> data
const INC = Symbol('inc');
const DEL = Symbol('del');
let autoId = 0;
function applyWrite(p, data, merge) {
  const cur = merge ? { ...(store.get(p) || {}) } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v[DEL]) delete cur[k];
    else if (v && v[INC] !== undefined) cur[k] = (Number(cur[k]) || 0) + v[INC];
    else cur[k] = v;
  }
  store.set(p, cur);
}
function docRef(col, id) {
  const p = `${col}/${id}`;
  const ref = {
    id, path: p,
    async get() { const d = store.get(p); return { exists: !!d, id, ref, data: () => (d ? { ...d } : undefined), get: k => d?.[k] }; },
    async set(data, opts) { applyWrite(p, data, !!opts?.merge); },
    async update(data) { if (!store.has(p)) throw new Error('no doc ' + p); applyWrite(p, data, true); },
  };
  return ref;
}
const db = {
  collection: (name) => ({
    doc: (id) => docRef(name, id ?? `auto${++autoId}xxxxxxxxxx`),
    async get() { return query(name, []).get(); },
    where: (f, op, v) => query(name, [[f, op, v]]),
  }),
  async runTransaction(fn) {
    const writes = []; let wrote = false;
    const tx = {
      async get(ref) { if (wrote) throw new Error('READ AFTER WRITE in transaction'); return ref.get(); },
      set(ref, data, opts) { wrote = true; writes.push(() => applyWrite(ref.path, data, !!opts?.merge)); },
      update(ref, data) { wrote = true; writes.push(() => { if (!store.has(ref.path)) throw new Error('no doc'); applyWrite(ref.path, data, true); }); },
    };
    const r = await fn(tx);
    writes.forEach(w => w());
    return r;
  },
};
// Queries: == and 'in' filters, limit(); enough for the payment sweep.
function query(name, filters, max = Infinity) {
  return {
    where: (f, op, v) => query(name, [...filters, [f, op, v]], max),
    limit: n => query(name, filters, n),
    async get() {
      const docs = [...store.keys()].filter(p => p.split('/').length === 2 && p.startsWith(name + '/'))
        .map(p => { const id = p.split('/')[1]; const d = store.get(p); return { id, ref: docRef(name, id), get: k => d?.[k], data: () => ({ ...d }) }; })
        .filter(d => filters.every(([f, op, v]) => op === 'in' ? v.includes(d.get(f)) : d.get(f) === v))
        .slice(0, max);
      return { docs, size: docs.length };
    },
  };
}
const firestoreFn = () => db;
firestoreFn.FieldValue = { increment: n => ({ [INC]: n }), delete: () => ({ [DEL]: true }) };
const adminMock = { apps: [], initializeApp() { this.apps.push({}); }, firestore: firestoreFn };
require.cache[require.resolve('firebase-admin', { paths: [FN] })] = { exports: adminMock, loaded: true, id: 'firebase-admin' };
require.cache[require.resolve('firebase-admin/firestore', { paths: [FN] })] = { exports: { FieldValue: firestoreFn.FieldValue }, loaded: true, id: 'firebase-admin/firestore' };

process.env.WIPAY_API_KEY = '123';
process.env.WIPAY_ACCOUNT_NUMBER = '1234567890';
process.env.WIPAY_ENV = 'sandbox';
const P = require(path.join(FN, 'lib/payments.js'));

const get = p => store.get(p);
const seed = (p, d) => store.set(p, { ...d });
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
// Each test starts with no recent payment starts (createPayment's rate limit).
let passed = 0; const t = async (name, fn) => { store.delete('paymentStarts/stu'); await fn(); passed++; console.log('✓', name); };
function fakeRes() { const r = { location: null, redirect(code, url) { r.code = code; r.location = url; } }; return r; }
const qs = u => Object.fromEntries(new URL(u).searchParams);

(async () => {
  seed('users/stu', { role: 'student', isActive: true, name: 'Stu', email: 's@x.com' });
  seed('users/boss', { role: 'admin', isActive: true });
  seed('users/dash', { role: 'dasher', isActive: true });
  seed('stores/sf', { name: 'Float Store', floatJmd: 10000 });
  seed('stores/nf', { name: 'No Float Store' });
  seed('dashers/dash', { floatJmd: 5000 });
  const order = (id, extra) => seed(`orders/${id}`, { studentId: 'stu', storeId: 'sf', dasherId: 'dash', totalAmount: 1200, deliveryFee: 200, status: 'pending', ...extra });

  await t('reserve fails with no tokens, writes nothing', async () => {
    order('o1', { paymentMethod: 'tokens' });
    const r = await P.reserveTokensAndVerify(db.collection('orders').doc('o1'), 'stu', 1200, { verifiedAt: 1 });
    assert.equal(r, 'insufficient'); assert.equal(get('wallets/stu'), undefined); assert.equal(get('orders/o1').paymentStatus, undefined);
  });

  await t('admin adds 20 tokens; non-admin refused', async () => {
    await assert.rejects(P.adminAdjustTokens.run({ auth: { uid: 'stu' }, data: { uid: 'stu', tokens: 20, note: 'x' } }), /Admins only/);
    const r = await P.adminAdjustTokens.run({ auth: { uid: 'boss' }, data: { uid: 'stu', tokens: 20, note: 'cash' } });
    assert.equal(r.balanceJmd, 2000);
  });

  await t('reserve ok: 12 tokens held, order verified atomically', async () => {
    const r = await P.reserveTokensAndVerify(db.collection('orders').doc('o1'), 'stu', 1200, { verifiedAt: 1 });
    assert.equal(r, 'ok'); assert.deepEqual([get('wallets/stu').balanceJmd, get('wallets/stu').reservedJmd], [2000, 1200]);
    assert.equal(get('orders/o1').paymentStatus, 'reserved'); assert.equal(get('orders/o1').verifiedAt, 1);
  });

  await t('cannot reserve more than available (8 left, need 12)', async () => {
    order('o2', { paymentMethod: 'tokens' });
    assert.equal(await P.reserveTokensAndVerify(db.collection('orders').doc('o2'), 'stu', 1200, {}), 'insufficient');
  });

  await t('reserve on an order no longer pending does nothing', async () => {
    order('o3', { paymentMethod: 'tokens', status: 'cancelled' });
    assert.equal(await P.reserveTokensAndVerify(db.collection('orders').doc('o3'), 'stu', 100, {}), 'gone');
    assert.equal(get('wallets/stu').reservedJmd, 1200);
  });

  await t('admin cannot remove tokens that are held', async () => {
    await assert.rejects(P.adminAdjustTokens.run({ auth: { uid: 'boss' }, data: { uid: 'stu', tokens: -10, note: 'x' } }), /held/);
  });

  await t('dasher accepts: tokens charged once, store float pays food cost', async () => {
    seed('orders/o1', { ...get('orders/o1'), status: 'accepted' });
    assert.equal(await P.chargeTokensOnAccept(db.collection('orders').doc('o1')), true);
    assert.equal(await P.chargeTokensOnAccept(db.collection('orders').doc('o1')), false);
    assert.deepEqual([get('wallets/stu').balanceJmd, get('wallets/stu').reservedJmd], [800, 0]);
    assert.equal(get('orders/o1').paymentStatus, 'paid');
    assert.equal(get('storeFloats/sf').floatJmd, 10000 - 1000);
    assert.equal('floatJmd' in get('stores/sf'), false, 'old public float field removed');
  });

  await t('support cancels a paid tokens order: refunded as tokens once, float restored', async () => {
    seed('orders/o1', { ...get('orders/o1'), status: 'cancelled' });
    await P.settleCancelledOrder(db.collection('orders').doc('o1'));
    await P.settleCancelledOrder(db.collection('orders').doc('o1'));
    assert.equal(get('wallets/stu').balanceJmd, 2000); assert.equal(get('orders/o1').paymentStatus, 'refunded_tokens');
    assert.equal(get('storeFloats/sf').floatJmd, 10000);
  });

  await t('cancel before accept releases held tokens once', async () => {
    order('o4', { paymentMethod: 'tokens' });
    await P.reserveTokensAndVerify(db.collection('orders').doc('o4'), 'stu', 500, {});
    seed('orders/o4', { ...get('orders/o4'), status: 'cancelled' });
    await P.settleCancelledOrder(db.collection('orders').doc('o4'));
    await P.settleCancelledOrder(db.collection('orders').doc('o4'));
    assert.deepEqual([get('wallets/stu').balanceJmd, get('wallets/stu').reservedJmd], [2000, 0]);
    assert.equal(get('orders/o4').paymentStatus, 'released');
  });

  // ── WiPay ──
  global.fetch = async (url, opts) => ({ json: async () => ({ url: 'https://wipay/pay/abc', transaction_id: 'SB-TX1' }) });

  await t('createPayment: only after a dasher accepts; not for others\' orders', async () => {
    order('c1', { paymentMethod: 'card', paymentStatus: 'unpaid' });
    await assert.rejects(P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } }), /once a dasher accepts/);
    seed('users/stu2', { role: 'student', isActive: true });
    seed('orders/c1', { ...get('orders/c1'), status: 'accepted', paymentStatus: 'awaiting_payment', storeId: 'nf' });
    await assert.rejects(P.createPayment.run({ auth: { uid: 'stu2' }, data: { purpose: 'order', orderId: 'c1' } }), /not found/);
  });

  let pid;
  await t('createPayment: sends exact total, stores WiPay transaction id', async () => {
    let sent;
    global.fetch = async (url, opts) => { sent = Object.fromEntries(new URLSearchParams(opts.body)); return { json: async () => ({ url: 'https://wipay/pay/abc', transaction_id: 'SB-TX1' }) }; };
    const r = await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } });
    pid = r.paymentId;
    assert.equal(sent.total, '1200.00'); assert.equal(sent.fee_structure, 'customer_pay'); assert.equal(sent.order_id, pid);
    assert.equal(sent.response_url, 'https://dormdash-71035.web.app/api/wipay-return');
    assert.equal(get(`payments/${pid}`).wipayTransactionId, 'SB-TX1');
  });

  await t('forged return (wrong hash) is rejected and changes nothing', async () => {
    const res = fakeRes();
    await P.wipayReturn({ query: { order_id: pid, status: 'success', transaction_id: 'SB-TX1', total: '1250.40', hash: md5('SB-TX1' + '1200.00' + 'WRONGKEY') } }, res);
    assert.equal(qs(res.location).status, 'error'); assert.equal(get(`payments/${pid}`).status, 'pending'); assert.equal(get('orders/c1').paymentStatus, 'awaiting_payment');
  });

  await t('declined card marks payment failed, order still payable', async () => {
    const res = fakeRes();
    await P.wipayReturn({ query: { order_id: pid, status: 'failed', message: 'declined' } }, res);
    assert.equal(qs(res.location).status, 'failed'); assert.equal(get(`payments/${pid}`).status, 'failed'); assert.equal(get('orders/c1').paymentStatus, 'awaiting_payment');
  });

  await t('genuine success: order paid, dasher float used (store has none); replay does nothing', async () => {
    const q = { order_id: pid, status: 'success', transaction_id: 'SB-TX1', total: '1261.00', card: 'XXXXXXXXXXXX1111', hash: md5('SB-TX1' + '1200.00' + '123') };
    let res = fakeRes(); await P.wipayReturn({ query: q }, res);
    assert.equal(qs(res.location).status, 'success');
    assert.equal(get('orders/c1').paymentStatus, 'paid'); assert.equal(get(`payments/${pid}`).status, 'paid'); assert.equal(get(`payments/${pid}`).card, '1111');
    assert.equal(get('dashers/dash').floatJmd, 5000 - 1000);
    res = fakeRes(); await P.wipayReturn({ query: q }, res);
    assert.equal(get('dashers/dash').floatJmd, 4000); assert.equal(qs(res.location).status, 'success');
  });

  await t('cannot start a second payment for a paid order', async () => {
    await assert.rejects(P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } }), /already paid/);
  });

  await t('payment that lands after the order was cancelled becomes tokens', async () => {
    order('c2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', totalAmount: 700 });
    global.fetch = async () => ({ json: async () => ({ url: 'u', transaction_id: 'SB-TX2' }) });
    const r = await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c2' } });
    seed('orders/c2', { ...get('orders/c2'), status: 'cancelled', cancelReason: 'payment_timeout' });
    const before = get('wallets/stu').balanceJmd;
    const res = fakeRes();
    await P.wipayReturn({ query: { order_id: r.paymentId, status: 'success', transaction_id: 'SB-TX2', hash: md5('SB-TX2' + '700.00' + '123') } }, res);
    assert.equal(qs(res.location).status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, before + 700);
    assert.equal(get('orders/c2').paymentStatus, 'awaiting_payment');
  });

  await t('buy 10 tokens: only listed packs; balance +J$1000 once', async () => {
    await assert.rejects(P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens: 7 } }), /packs/);
    global.fetch = async () => ({ json: async () => ({ url: 'u', transaction_id: 'SB-TX3' }) });
    const r = await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens: 10 } });
    const before = get('wallets/stu').balanceJmd;
    const q = { order_id: r.paymentId, status: 'success', transaction_id: 'SB-TX3', hash: md5('SB-TX3' + '1000.00' + '123') };
    await P.wipayReturn({ query: q }, fakeRes()); await P.wipayReturn({ query: q }, fakeRes());
    assert.equal(get('wallets/stu').balanceJmd, before + 1000);
  });

  await t('dashers and admins cannot pay; garbage payment ids rejected', async () => {
    await assert.rejects(P.createPayment.run({ auth: { uid: 'dash' }, data: { purpose: 'tokens', tokens: 5 } }), /student/);
    const res = fakeRes(); await P.wipayReturn({ query: { order_id: '../x', status: 'success' } }, res);
    assert.equal(qs(res.location).status, 'error');
  });

  // ── Choose tokens after a dasher accepts ──
  await t('pay with tokens: refused before accept, for others, when short, or after the deadline', async () => {
    order('k1', { paymentMethod: 'card', paymentStatus: 'unpaid', totalAmount: 1500 });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k1' } }), /once a dasher accepts/);
    seed('orders/k1', { ...get('orders/k1'), status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000 });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu2' }, data: { orderId: 'k1' } }), /not found/);
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'dash' }, data: { orderId: 'k1' } }), /student/);
    const w = get('wallets/stu');
    seed('wallets/stu', { ...w, balanceJmd: 1400, reservedJmd: 0 });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k1' } }), /enough tokens/);
    assert.equal(get('wallets/stu').balanceJmd, 1400); assert.equal(get('orders/k1').paymentStatus, 'awaiting_payment');
    order('k0', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() - 1, totalAmount: 100 });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k0' } }), /10 minutes/);
    assert.equal(get('orders/k0').paymentStatus, 'awaiting_payment');
  });

  await t('pay with tokens: charged exactly once, float used, card afterwards refused', async () => {
    seed('wallets/stu', { ...get('wallets/stu'), balanceJmd: 5000, reservedJmd: 300 });
    const floatBefore = get('storeFloats/sf').floatJmd;
    await P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k1' } });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k1' } }), /already paid/);
    assert.deepEqual([get('wallets/stu').balanceJmd, get('wallets/stu').reservedJmd], [3500, 300]);
    assert.equal(get('orders/k1').paymentStatus, 'paid'); assert.equal(get('orders/k1').paymentMethod, 'tokens');
    assert.equal(get('walletTx/k1_pay_tokens').amountJmd, -1500); assert.equal(get('walletTx/k1_pay_tokens').type, 'order_payment');
    assert.equal(get('storeFloats/sf').floatJmd, floatBefore - 1300);
    await assert.rejects(P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'k1' } }), /already paid/);
  });

  await t('card payment started, then paid with tokens: the card money comes back as tokens', async () => {
    order('k2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 900 });
    global.fetch = async () => ({ json: async () => ({ url: 'u', transaction_id: 'SB-TX9' }) });
    const r = await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'k2' } });
    await P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k2' } });
    const mid = get('wallets/stu').balanceJmd;
    const res = fakeRes();
    await P.wipayReturn({ query: { order_id: r.paymentId, status: 'success', transaction_id: 'SB-TX9', hash: md5('SB-TX9' + '900.00' + '123') } }, res);
    assert.equal(qs(res.location).status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, mid + 900);
    assert.equal(get('orders/k2').paymentStatus, 'paid');
  });

  await t('support cancels an order paid with tokens after accept: refunded once, float restored', async () => {
    const bal = get('wallets/stu').balanceJmd; const fl = get('storeFloats/sf').floatJmd;
    seed('orders/k1', { ...get('orders/k1'), status: 'cancelled' });
    await P.settleCancelledOrder(db.collection('orders').doc('k1'));
    await P.settleCancelledOrder(db.collection('orders').doc('k1'));
    assert.equal(get('wallets/stu').balanceJmd, bal + 1500); assert.equal(get('storeFloats/sf').floatJmd, fl + 1300);
  });

  await t('float adjust by admin only, logged', async () => {
    await assert.rejects(P.adminAdjustFloat.run({ auth: { uid: 'dash' }, data: { kind: 'dasher', id: 'dash', amountJmd: 99999 } }), /Admins only/);
    const r = await P.adminAdjustFloat.run({ auth: { uid: 'boss' }, data: { kind: 'store', id: 'nf', amountJmd: 3000, note: 'start' } });
    assert.equal(r.floatJmd, 3000);
    assert.equal(get('storeFloats/nf').floatJmd, 3000); assert.equal('floatJmd' in get('stores/nf'), false);
  });

  await t('admin adjusts a store float still on the old public field: moved and added', async () => {
    seed('stores/old', { name: 'Old', floatJmd: 2000 });
    const r = await P.adminAdjustFloat.run({ auth: { uid: 'boss' }, data: { kind: 'store', id: 'old', amountJmd: 500, note: 'x' } });
    assert.equal(r.floatJmd, 2500); assert.equal(get('storeFloats/old').floatJmd, 2500);
    assert.equal('floatJmd' in get('stores/old'), false);
  });

  await t('migration sweep moves every old store float once; storeFloats wins if both exist', async () => {
    seed('stores/m1', { name: 'M1', floatJmd: 700 });
    seed('stores/m2', { name: 'M2', floatJmd: 999 }); seed('storeFloats/m2', { floatJmd: 50 });
    assert.equal(await P.migrateLegacyStoreFloats(), 2);
    assert.equal(get('storeFloats/m1').floatJmd, 700); assert.equal(get('storeFloats/m2').floatJmd, 50);
    assert.equal('floatJmd' in get('stores/m1'), false); assert.equal('floatJmd' in get('stores/m2'), false);
    assert.equal(await P.migrateLegacyStoreFloats(), 0);
  });

  await t('createPayment: at most 5 starts per student per 10 minutes', async () => {
    global.fetch = async () => ({ json: async () => ({ url: 'https://wipay/pay/rl', transaction_id: 'SB-RL' }) });
    const start = uid => P.createPayment.run({ auth: { uid }, data: { purpose: 'tokens', tokens: 5 } });
    const before = [...store.keys()].filter(k => k.startsWith('payments/')).length;
    for (let i = 0; i < 5; i++) await start('stu');
    await assert.rejects(start('stu'), /Too many payment attempts\. Try again in 10 minutes/);
    assert.equal([...store.keys()].filter(k => k.startsWith('payments/')).length, before + 5, 'no payment record for the refused one');
    // Starts older than the window no longer count.
    seed('paymentStarts/stu', { times: get('paymentStarts/stu').times.map(x => x - 11 * 60000) });
    await start('stu');
    store.delete('paymentStarts/stu');
  });

  // ── Returns that must never be lost (WiPay has no webhook or status API) ──
  const startTokensPayment = async (tokens, wipayTx) => {
    global.fetch = async () => ({ json: async () => ({ url: 'https://wipay/pay/x', transaction_id: wipayTx }) });
    return (await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens } })).paymentId;
  };
  const successReturn = (paymentId, tx, total) => ({ query: {
    order_id: paymentId, status: 'success', transaction_id: tx, total, card: 'XXXXXXXXXXXX1111',
    hash: md5(tx + total + '123'),
  } });

  await t('return verified but applying fails: saved as verified, retry sweep applies it exactly once', async () => {
    const p1 = await startTokensPayment(5, 'SB-R1');
    const before = get('wallets/stu').balanceJmd;
    // Recording the return is transaction 1; make transaction 2 (applying it) fail.
    const origRun = db.runTransaction; let calls = 0;
    db.runTransaction = async fn => { calls++; if (calls === 2) throw new Error('SIMULATED apply failure'); return origRun.call(db, fn); };
    const res = fakeRes();
    await P.wipayReturn(successReturn(p1, 'SB-R1', '500.00'), res);
    db.runTransaction = origRun;
    assert.equal(qs(res.location).status, 'processing');
    assert.equal(get(`payments/${p1}`).status, 'verified', 'saved before applying');
    assert.equal(get('wallets/stu').balanceJmd, before, 'not credited yet');
    assert.equal(await P.retryVerifiedPayments(), 1);
    assert.equal(await P.retryVerifiedPayments(), 0, 'second sweep does nothing');
    assert.equal(get(`payments/${p1}`).status, 'paid');
    assert.equal(get('wallets/stu').balanceJmd, before + 500);
    // The student's browser replays the same return: nothing more happens.
    const again = fakeRes(); await P.wipayReturn(successReturn(p1, 'SB-R1', '500.00'), again);
    assert.equal(get('wallets/stu').balanceJmd, before + 500);
  });

  await t('changed transaction id with a valid signature is held for review, not applied', async () => {
    const p2 = await startTokensPayment(10, 'SB-R2');
    const before = get('wallets/stu').balanceJmd;
    const res = fakeRes();
    await P.wipayReturn(successReturn(p2, 'SB-R2-RETRY', '1000.00'), res);
    assert.equal(qs(res.location).status, 'processing');
    assert.equal(get(`payments/${p2}`).status, 'review');
    assert.equal(get('wallets/stu').balanceJmd, before, 'no money moved');
    assert.equal(await P.retryVerifiedPayments(), 0, 'the sweep never applies review items');
    // A later declined redirect can't downgrade it.
    await P.wipayReturn({ query: { order_id: p2, status: 'failed' } }, fakeRes());
    assert.equal(get(`payments/${p2}`).status, 'review');
    // Admin checks the WiPay dashboard and confirms it.
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'stu' }, data: { paymentId: p2, paid: true, transactionId: 'SB-R2-RETRY', note: 'x' } }), /Admins only/);
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p2, paid: true, transactionId: 'SB-R2-RETRY', note: '' } }), /note/);
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p2, paid: true, note: 'checked' } }), /transaction ID/);
    const r = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p2, paid: true, transactionId: 'SB-R2-RETRY', note: 'Seen in WiPay dashboard' } });
    assert.equal(r.status, 'paid');
    assert.equal(get('wallets/stu').balanceJmd, before + 1000);
    assert.equal(get(`payments/${p2}`).resolvedBy, 'boss');
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p2, paid: true, transactionId: 'SB-R2-RETRY', note: 'again' } }), /already paid/);
    assert.equal(get('wallets/stu').balanceJmd, before + 1000, 'never twice');
  });

  await t('student never came back from WiPay: admin resolves paid order payment, or marks not paid', async () => {
    // Order still waiting for payment: resolving pays the order.
    order('lost1', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 800 });
    global.fetch = async () => ({ json: async () => ({ url: 'https://wipay/pay/y', transaction_id: 'SB-L1' }) });
    const p3 = (await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'lost1' } })).paymentId;
    assert.equal(get(`payments/${p3}`).status, 'pending');
    const r = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p3, paid: true, transactionId: 'SB-L1', note: 'WiPay shows success' } });
    assert.equal(r.status, 'paid'); assert.equal(get('orders/lost1').paymentStatus, 'paid');
    // Order already cancelled for non-payment: the money becomes tokens.
    order('lost2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 900 });
    global.fetch = async () => ({ json: async () => ({ url: 'https://wipay/pay/z', transaction_id: 'SB-L2' }) });
    const p4 = (await P.createPayment.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'lost2' } })).paymentId;
    seed('orders/lost2', { ...get('orders/lost2'), status: 'cancelled', cancelReason: 'payment_timeout' });
    const bal = get('wallets/stu').balanceJmd;
    const r2 = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p4, paid: true, transactionId: 'SB-L2', note: 'Paid after deadline' } });
    assert.equal(r2.status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, bal + 900);
    // Not paid: marked failed, nothing moves.
    const p5 = await startTokensPayment(5, 'SB-L3');
    const bal2 = get('wallets/stu').balanceJmd;
    const r3 = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p5, paid: false, note: 'Not in WiPay dashboard' } });
    assert.equal(r3.status, 'failed'); assert.equal(get(`payments/${p5}`).status, 'failed'); assert.equal(get('wallets/stu').balanceJmd, bal2);
  });

  console.log(`\nAll ${passed} payment tests passed.`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
