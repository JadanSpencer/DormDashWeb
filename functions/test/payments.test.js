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

const FYGARO_SECRET = 'test-secret-123';
const FYGARO_KEY_ID = 'key-abc';
process.env.FYGARO_API_SECRET = FYGARO_SECRET;
process.env.FYGARO_KEY_ID = FYGARO_KEY_ID;
process.env.FYGARO_LINK_URL = 'https://buy.fygaro.com/en/button/test';
const P = require(path.join(FN, 'lib/payments.js'));

const get = p => store.get(p);
const seed = (p, d) => store.set(p, { ...d });
// Each test starts with no recent payment starts (createFygaroCheckout's rate limit).
let passed = 0; const t = async (name, fn) => { store.delete('paymentStarts/stu'); await fn(); passed++; console.log('✓', name); };

// Combined fake res: supports both the redirect style (fygaroReturn) and the
// status/send style (fygaroWebhook).
function fakeRes() {
  const r = {
    location: null, statusCode: null, body: null,
    redirect(code, url) { r.statusCode = code; r.location = url; },
    status(code) { r.statusCode = code; return { send: (body) => { r.body = body; } }; },
  };
  return r;
}
const qs = u => Object.fromEntries(new URL(u).searchParams);

// Decodes a Fygaro checkout JWT (header.payload.sig, all base64url) without
// verifying — tests check the payload we built, and separately check the
// signature verifies against the right secret.
function decodeJwt(token) {
  const [h, p, s] = token.split('.');
  const pad = b => b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4);
  return {
    header: JSON.parse(Buffer.from(pad(h), 'base64').toString('utf8')),
    payload: JSON.parse(Buffer.from(pad(p), 'base64').toString('utf8')),
    signatureOk: Buffer.from(pad(s), 'base64').equals(
      crypto.createHmac('sha256', FYGARO_SECRET).update(`${h}.${p}`).digest(),
    ),
  };
}

// Builds a signed Fygaro-Signature header + the matching raw body, exactly
// the shape fygaroWebhook (functions/src/payments.ts) verifies.
function fygaroWebhookRequest(bodyObj, { secret = FYGARO_SECRET, tsOffsetS = 0 } = {}) {
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const t = Math.floor(Date.now() / 1000) + tsOffsetS;
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  return { headers: { 'fygaro-signature': `t=${t},v1=${sig}` }, rawBody, body: bodyObj };
}

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

  // ── Fygaro: starting a checkout (no network call — the JWT IS the request) ──
  await t('createFygaroCheckout: only after a dasher accepts; not for others\' orders', async () => {
    order('c1', { paymentMethod: 'card', paymentStatus: 'unpaid' });
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } }), /once a runner accepts/);
    seed('users/stu2', { role: 'student', isActive: true });
    seed('orders/c1', { ...get('orders/c1'), status: 'accepted', paymentStatus: 'awaiting_payment', storeId: 'nf' });
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'stu2' }, data: { purpose: 'order', orderId: 'c1' } }), /not found/);
  });

  let pid;
  await t('createFygaroCheckout: builds a correctly signed link for the exact total', async () => {
    const r = await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } });
    pid = r.paymentId;
    assert.ok(r.url.startsWith('https://buy.fygaro.com/en/button/test?jwt='));
    const jwt = new URL(r.url).searchParams.get('jwt');
    const { header, payload, signatureOk } = decodeJwt(jwt);
    assert.equal(header.alg, 'HS256'); assert.equal(header.kid, FYGARO_KEY_ID);
    assert.equal(payload.amount, '1200.00'); assert.equal(payload.currency, 'JMD');
    assert.equal(payload.custom_reference, pid);
    assert.ok(signatureOk, 'checkout JWT must verify against our own secret');
    assert.equal(get(`payments/${pid}`).totalSent, '1200.00'); assert.equal(get(`payments/${pid}`).gateway, 'fygaro');
  });

  await t('forged webhook signature is rejected and changes nothing', async () => {
    const res = fakeRes();
    const req = fygaroWebhookRequest(
      { transactionId: 'FX-TX1', customReference: pid, amount: '1200.00' },
      { secret: 'WRONG-SECRET' },
    );
    await P.fygaroWebhook(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(get(`payments/${pid}`).status, 'pending'); assert.equal(get('orders/c1').paymentStatus, 'awaiting_payment');
  });

  await t('stale webhook signature (older than 5 minutes) is rejected', async () => {
    const res = fakeRes();
    const req = fygaroWebhookRequest(
      { transactionId: 'FX-TX1', customReference: pid, amount: '1200.00' },
      { tsOffsetS: -301 },
    );
    await P.fygaroWebhook(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(get(`payments/${pid}`).status, 'pending');
  });

  await t('genuine webhook success: order paid, dasher float used (store has none); replay does nothing', async () => {
    const body = { transactionId: 'FX-TX1', customReference: pid, amount: '1200.00', card: { last4: '1111' } };
    let res = fakeRes(); await P.fygaroWebhook(fygaroWebhookRequest(body), res);
    assert.equal(res.statusCode, 200);
    assert.equal(get('orders/c1').paymentStatus, 'paid'); assert.equal(get(`payments/${pid}`).status, 'paid'); assert.equal(get(`payments/${pid}`).card, '1111');
    assert.equal(get('dashers/dash').floatJmd, 5000 - 1000);
    // The order itself keeps the transaction id, for settleCancelledOrder's refund attempt later.
    assert.equal(get('orders/c1').transactionId, 'FX-TX1');
    res = fakeRes(); await P.fygaroWebhook(fygaroWebhookRequest(body), res);
    assert.equal(get('dashers/dash').floatJmd, 4000); assert.equal(res.statusCode, 200);
  });

  await t('fygaroReturn (navigation only) reflects whatever the webhook already decided', async () => {
    const res = fakeRes();
    await P.fygaroReturn({ query: { custom_reference: pid, reference: 'FX-TX1' } }, res);
    assert.equal(qs(res.location).status, 'success'); assert.equal(qs(res.location).order, 'c1');
  });

  await t('cannot start a second checkout for a paid order', async () => {
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c1' } }), /already paid/);
  });

  await t('payment that lands after the order was cancelled becomes tokens', async () => {
    order('c2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', totalAmount: 700 });
    const r = await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'c2' } });
    seed('orders/c2', { ...get('orders/c2'), status: 'cancelled', cancelReason: 'payment_timeout' });
    const before = get('wallets/stu').balanceJmd;
    const res = fakeRes();
    await P.fygaroWebhook(fygaroWebhookRequest({ transactionId: 'FX-TX2', customReference: r.paymentId, amount: '700.00' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(get(`payments/${r.paymentId}`).status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, before + 700);
    assert.equal(get('orders/c2').paymentStatus, 'awaiting_payment');
    const retRes = fakeRes();
    await P.fygaroReturn({ query: { custom_reference: r.paymentId } }, retRes);
    assert.equal(qs(retRes.location).status, 'success'); // 'credited' counts as ok for navigation
  });

  await t('buy 10 tokens: only listed packs; balance +J$1000 once', async () => {
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens: 7 } }), /packs/);
    const r = await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens: 10 } });
    const before = get('wallets/stu').balanceJmd;
    const body = { transactionId: 'FX-TX3', customReference: r.paymentId, amount: '1000.00' };
    await P.fygaroWebhook(fygaroWebhookRequest(body), fakeRes());
    await P.fygaroWebhook(fygaroWebhookRequest(body), fakeRes());
    assert.equal(get('wallets/stu').balanceJmd, before + 1000);
  });

  await t('dashers and admins cannot pay; webhook with no matching payment is a 200 no-op', async () => {
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'dash' }, data: { purpose: 'tokens', tokens: 5 } }), /student/);
    const res = fakeRes();
    await P.fygaroWebhook(fygaroWebhookRequest({ transactionId: 'FX-X', customReference: '../x', amount: '1.00' }), res);
    assert.equal(res.statusCode, 200); // signed but unrecognised — nothing to retry, so 200
  });
  await t('fygaroReturn with a garbage reference redirects to error', async () => {
    const res = fakeRes();
    await P.fygaroReturn({ query: { custom_reference: '../x' } }, res);
    assert.equal(qs(res.location).status, 'error');
  });

  // ── Choose tokens after a dasher accepts ──
  await t('pay with tokens: refused before accept, for others, when short, or after the deadline', async () => {
    order('k1', { paymentMethod: 'card', paymentStatus: 'unpaid', totalAmount: 1500 });
    await assert.rejects(P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k1' } }), /once a runner accepts/);
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
    await assert.rejects(P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'k1' } }), /already paid/);
  });

  await t('card checkout started, then paid with tokens: the card money comes back as tokens', async () => {
    order('k2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 900 });
    const r = await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'k2' } });
    await P.payOrderWithTokens.run({ auth: { uid: 'stu' }, data: { orderId: 'k2' } });
    const mid = get('wallets/stu').balanceJmd;
    const res = fakeRes();
    await P.fygaroWebhook(fygaroWebhookRequest({ transactionId: 'FX-TX9', customReference: r.paymentId, amount: '900.00' }), res);
    assert.equal(get(`payments/${r.paymentId}`).status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, mid + 900);
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

  await t('createFygaroCheckout: at most 5 starts per student per 10 minutes', async () => {
    const start = uid => P.createFygaroCheckout.run({ auth: { uid }, data: { purpose: 'tokens', tokens: 5 } });
    const before = [...store.keys()].filter(k => k.startsWith('payments/')).length;
    for (let i = 0; i < 5; i++) await start('stu');
    await assert.rejects(start('stu'), /Too many payment attempts\. Try again in 10 minutes/);
    assert.equal([...store.keys()].filter(k => k.startsWith('payments/')).length, before + 5, 'no payment record for the refused one');
    // Starts older than the window no longer count.
    seed('paymentStarts/stu', { times: get('paymentStarts/stu').times.map(x => x - 11 * 60000) });
    await start('stu');
    store.delete('paymentStarts/stu');
  });

  // ── Webhook deliveries that must never be lost ──
  const startTokensCheckout = async (tokens) =>
    (await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'tokens', tokens } })).paymentId;

  await t('webhook verified but applying fails: saved as verified, retry sweep applies it exactly once', async () => {
    const p1 = await startTokensCheckout(5);
    const before = get('wallets/stu').balanceJmd;
    // Recording the webhook is transaction 1; make transaction 2 (applying it) fail.
    const origRun = db.runTransaction; let calls = 0;
    db.runTransaction = async fn => { calls++; if (calls === 2) throw new Error('SIMULATED apply failure'); return origRun.call(db, fn); };
    const res = fakeRes();
    const req = fygaroWebhookRequest({ transactionId: 'FX-R1', customReference: p1, amount: '500.00', card: { last4: '1111' } });
    await P.fygaroWebhook(req, res);
    db.runTransaction = origRun;
    assert.equal(res.statusCode, 200); // webhook always 200s once the signature is good — Fygaro shouldn't redeliver
    assert.equal(get(`payments/${p1}`).status, 'verified', 'saved before applying');
    assert.equal(get('wallets/stu').balanceJmd, before, 'not credited yet');
    assert.equal(await P.retryVerifiedPayments(), 1);
    assert.equal(await P.retryVerifiedPayments(), 0, 'second sweep does nothing');
    assert.equal(get(`payments/${p1}`).status, 'paid');
    assert.equal(get('wallets/stu').balanceJmd, before + 500);
    // Fygaro redelivers the same webhook (it does this until it sees 200 from a
    // fresh request, or just as a retry policy): nothing more happens.
    const again = fakeRes(); await P.fygaroWebhook(fygaroWebhookRequest({ transactionId: 'FX-R1', customReference: p1, amount: '500.00' }), again);
    assert.equal(get('wallets/stu').balanceJmd, before + 500);
  });

  await t('admin resolves a payment whose webhook never arrived: paid order payment, or marks not paid', async () => {
    // Order still waiting for payment: resolving pays the order.
    order('lost1', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 800 });
    const p3 = (await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'lost1' } })).paymentId;
    assert.equal(get(`payments/${p3}`).status, 'pending');
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'stu' }, data: { paymentId: p3, paid: true, transactionId: 'FX-L1', note: 'x' } }), /Admins only/);
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p3, paid: true, transactionId: 'FX-L1', note: '' } }), /note/);
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p3, paid: true, note: 'checked' } }), /transaction ID/);
    const r = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p3, paid: true, transactionId: 'FX-L1', note: 'Fygaro dashboard shows success' } });
    assert.equal(r.status, 'paid'); assert.equal(get('orders/lost1').paymentStatus, 'paid');
    assert.equal(get(`payments/${p3}`).resolvedBy, 'boss');
    await assert.rejects(P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p3, paid: true, transactionId: 'FX-L1', note: 'again' } }), /already paid/);

    // Order already cancelled for non-payment: the money becomes tokens.
    order('lost2', { paymentMethod: 'card', status: 'accepted', paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000, totalAmount: 900 });
    const p4 = (await P.createFygaroCheckout.run({ auth: { uid: 'stu' }, data: { purpose: 'order', orderId: 'lost2' } })).paymentId;
    seed('orders/lost2', { ...get('orders/lost2'), status: 'cancelled', cancelReason: 'payment_timeout' });
    const bal = get('wallets/stu').balanceJmd;
    const r2 = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p4, paid: true, transactionId: 'FX-L2', note: 'Paid after deadline' } });
    assert.equal(r2.status, 'credited'); assert.equal(get('wallets/stu').balanceJmd, bal + 900);

    // Not paid: marked failed, nothing moves.
    const p5 = await startTokensCheckout(5);
    const bal2 = get('wallets/stu').balanceJmd;
    const r3 = await P.adminResolvePayment.run({ auth: { uid: 'boss' }, data: { paymentId: p5, paid: false, note: 'Not in Fygaro dashboard' } });
    assert.equal(r3.status, 'failed'); assert.equal(get(`payments/${p5}`).status, 'failed'); assert.equal(get('wallets/stu').balanceJmd, bal2);
  });

  // ── Fygaro refunds: the "accommodate both cases" fallback ──────────────────
  // settleCancelledOrder tries a real refund through Fygaro first; only
  // credits tokens (the old WiPay-only behaviour) if that call fails, for
  // ANY reason — refunds not enabled on the account, a network error,
  // anything. Both outcomes must be covered, since which one actually
  // happens in production depends on Fygaro's account settings, not on
  // this code.
  const cardOrder = (id, extra) => seed(`orders/${id}`, {
    studentId: 'stu', storeId: 'sf', dasherId: 'dash', totalAmount: 1000, deliveryFee: 200,
    paymentMethod: 'card', paymentStatus: 'paid', transactionId: 'FX-REFUND-ME', status: 'cancelled', ...extra,
  });

  await t('settleCancelledOrder: Fygaro refund succeeds -> refunded_card, NO tokens credited, float restored', async () => {
    global.fetch = async (url, opts) => {
      assert.equal(url, 'https://api.fygaro.com/api/v1/external/payment/refund/');
      const { token } = JSON.parse(opts.body);
      const { payload, signatureOk } = decodeJwt(token);
      assert.ok(signatureOk); assert.equal(payload.transactionId, 'FX-REFUND-ME'); assert.equal(payload.amount, '1000.00');
      return { ok: true, text: async () => '' };
    };
    cardOrder('ref1');
    const bal = get('wallets/stu').balanceJmd ?? 0;
    const fl = get('storeFloats/sf').floatJmd;
    await P.settleCancelledOrder(db.collection('orders').doc('ref1'));
    assert.equal(get('orders/ref1').paymentStatus, 'refunded_card');
    assert.equal(get('wallets/stu').balanceJmd ?? 0, bal, 'no tokens credited — the card itself was refunded');
    assert.equal(get('storeFloats/sf').floatJmd, fl + 800);
    // Idempotent: calling it again changes nothing further.
    await P.settleCancelledOrder(db.collection('orders').doc('ref1'));
    assert.equal(get('storeFloats/sf').floatJmd, fl + 800);
  });

  await t('settleCancelledOrder: Fygaro refund FAILS -> falls back to tokens, flagged for an admin', async () => {
    global.fetch = async () => ({ ok: false, status: 403, text: async () => 'refunds not enabled on this account' });
    cardOrder('ref2', { transactionId: 'FX-REFUND-FAIL' });
    const bal = get('wallets/stu').balanceJmd ?? 0;
    const fl = get('storeFloats/sf').floatJmd;
    await P.settleCancelledOrder(db.collection('orders').doc('ref2'));
    assert.equal(get('orders/ref2').paymentStatus, 'refunded_tokens');
    assert.equal(get('wallets/stu').balanceJmd, bal + 1000, 'the fallback: tokens credited for the full amount');
    assert.equal(get('storeFloats/sf').floatJmd, fl + 800);
    assert.equal(get('orders/ref2').refundAttemptFailed, true);
    assert.ok(get('orders/ref2').refundAttemptReason.includes('403'));
    assert.ok(/deduct the tokens first/.test(get('orders/ref2').refundAttemptNote), 'must warn against double-paying');
  });

  await t('settleCancelledOrder: network error talking to Fygaro also falls back to tokens', async () => {
    global.fetch = async () => { throw new Error('ECONNRESET'); };
    cardOrder('ref3', { transactionId: 'FX-REFUND-NET' });
    const bal = get('wallets/stu').balanceJmd ?? 0;
    await P.settleCancelledOrder(db.collection('orders').doc('ref3'));
    assert.equal(get('orders/ref3').paymentStatus, 'refunded_tokens');
    assert.equal(get('wallets/stu').balanceJmd, bal + 1000);
    assert.equal(get('orders/ref3').refundAttemptReason, 'network_error');
  });

  console.log(`\nAll ${passed} payment tests passed.`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
