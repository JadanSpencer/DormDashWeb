// Unit tests for proximity pricing (functions/lib/shared.js + campus.js):
// the fee curve, the split, and quotes for real campus pairs. No Firestore.
// Run: cd functions && npm run test:pricing
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliveryFeeForDistance, splitDeliveryFee, orderPayoutJmd, MIN_DELIVERY_FEE_JMD, FALLBACK_DELIVERY_FEE_JMD } = require('../lib/shared.js');
const { quoteDelivery, DROP_POINTS, PICKUP_POINTS } = require('../lib/campus.js');
const { WALK_M } = require('../lib/campusDistances.js');

test('fee curve: J$300 up to 400 m, then +J$50 per 200 m, capped', () => {
  assert.equal(deliveryFeeForDistance(0), 300);
  assert.equal(deliveryFeeForDistance(400), 300);
  assert.equal(deliveryFeeForDistance(401), 350);
  assert.equal(deliveryFeeForDistance(600), 350);
  assert.equal(deliveryFeeForDistance(601), 400);
  assert.equal(deliveryFeeForDistance(1577), 600);
  assert.equal(deliveryFeeForDistance(50000), 800, 'safety cap');
  assert.equal(deliveryFeeForDistance(-5), 300);
});

test('split: DormDash J$50 at the minimum fee, 20% of every dollar above; dasher gets the rest', () => {
  const rows = [[300, 250, 50], [350, 290, 60], [400, 330, 70], [450, 370, 80], [500, 410, 90], [550, 450, 100], [600, 490, 110]];
  for (const [fee, dasher, dd] of rows) {
    const s = splitDeliveryFee(fee);
    assert.deepEqual([s.dasherPayoutJmd, s.platformFeeJmd], [dasher, dd], `fee ${fee}`);
    assert.equal(s.dasherPayoutJmd + s.platformFeeJmd, fee, 'nothing lost to rounding');
  }
  assert.equal(orderPayoutJmd({ dasherPayoutJmd: 123, deliveryFee: 999 }), 123, 'the order\'s own split wins');
  assert.equal(orderPayoutJmd({ deliveryFee: 300 }), 250, 'older orders: today\'s split of their fee');
});

test('real pairs: the owner\'s example and the extremes', () => {
  const spotGeorge = quoteDelivery('spot', 'george-alleyne');
  const welfareGeorge = quoteDelivery('social-welfare', 'george-alleyne');
  assert.equal(spotGeorge.basis, 'route');
  assert.equal(spotGeorge.feeJmd, MIN_DELIVERY_FEE_JMD, 'Spot → George Alleyne is next door');
  assert.ok(welfareGeorge.feeJmd > spotGeorge.feeJmd, 'Social Welfare → George Alleyne costs more');
  assert.equal(quoteDelivery('preston-cafeteria', 'abc').feeJmd, 700, 'across campus');
});

test('distances count the walk to the nearest path, and map detours are capped', () => {
  const { MAX_WALK_DETOUR } = require('../lib/shared.js');
  const rad = d => (d * Math.PI) / 180;
  const straight = (a, b) => 2 * 6371000 * Math.asin(Math.sqrt(Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2));
  const placed = l => l.filter(x => x.latitude !== null);
  for (const from of placed(PICKUP_POINTS)) for (const to of placed(DROP_POINTS)) {
    const m = WALK_M[from.id][to.id], s = straight(from, to);
    assert.ok(m >= s - 1, `${from.id} → ${to.id}: never shorter than the straight line`);
    assert.ok(m <= Math.max(s * MAX_WALK_DETOUR, s) + 1, `${from.id} → ${to.id}: at most ${MAX_WALK_DETOUR}× the straight line`);
  }
  // Preston Cafe → Rex Nettleford: the map routes the long way round (~950 m); priced as ~530 m.
  assert.equal(quoteDelivery('preston-cafeteria', 'rex-nettleford').feeJmd, 350);
});

test('every placed pair is measured, and places without a position use the fallback fee', () => {
  const placed = l => l.filter(x => x.latitude !== null);
  for (const from of placed(PICKUP_POINTS)) for (const to of placed(DROP_POINTS)) {
    assert.equal(typeof WALK_M[from.id]?.[to.id], 'number', `${from.id} → ${to.id}`);
  }
  const q = quoteDelivery('spot', 'wjc');
  assert.equal(q.basis, 'fallback');
  assert.equal(q.feeJmd, FALLBACK_DELIVERY_FEE_JMD);
  assert.equal(quoteDelivery(undefined, 'taylor').basis, 'fallback', 'store not linked to a food spot');
  assert.equal(quoteDelivery('spot', 'not-a-place').basis, 'fallback');
});
