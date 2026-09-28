// Unit tests for the group picker (functions/lib/grouping.js): distances
// between stores and which open orders make a group. No Firestore.
// Run: cd functions && npm run test:grouping
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distanceM, storeDistanceM, pickGroup, groupSpanM, groupKey } = require('../lib/grouping.js');

// UWI Mona area. ~111 m per 0.001° of latitude.
const stores = new Map([
  ['grill', { id: 'grill', latitude: 18.0061, longitude: -76.7466 }],
  ['patty', { id: 'patty', latitude: 18.0063, longitude: -76.7466 }],  // ~22 m from grill
  ['juice', { id: 'juice', latitude: 18.0100, longitude: -76.7466 }],  // ~430 m from grill
  ['far',   { id: 'far',   latitude: 18.0200, longitude: -76.7466 }],  // ~1.5 km
  ['nomap', { id: 'nomap' }],
  ['zero',  { id: 'zero', latitude: 0, longitude: 0 }],
]);
const o = (id, storeId, since) => ({ id, storeId, since });
const ids = (g) => g && g.map(x => x.id);

test('distances: haversine, same store is 0, stores without a position only match themselves', () => {
  const m = distanceM(stores.get('grill'), stores.get('juice'));
  assert.ok(m > 420 && m < 440, `~430 m, got ${m}`);
  assert.equal(storeDistanceM(stores, 'nomap', 'nomap'), 0);
  assert.equal(storeDistanceM(stores, 'nomap', 'grill'), Infinity);
  assert.equal(storeDistanceM(stores, 'zero', 'grill'), Infinity, '0,0 means never set');
});

test('one store only (0 m): three orders at the same store make a group of three', () => {
  const g = pickGroup([o('a', 'grill', 1), o('b', 'patty', 2), o('c', 'grill', 3), o('d', 'grill', 4)], stores, 3, 0);
  assert.deepEqual(ids(g), ['a', 'c', 'd']);
  assert.equal(pickGroup([o('a', 'grill', 1), o('b', 'patty', 2), o('c', 'grill', 3)], stores, 3, 0), null);
});

test('within a distance: nearby stores group, far ones do not', () => {
  const orders = [o('a', 'grill', 1), o('b', 'far', 2), o('c', 'juice', 3), o('d', 'patty', 4)];
  assert.deepEqual(ids(pickGroup(orders, stores, 3, 500)), ['a', 'd', 'c'], 'nearest first');
  assert.deepEqual(ids(pickGroup(orders, stores, 2, 250)), ['a', 'd']);
  assert.equal(pickGroup([o('a', 'grill', 1), o('b', 'far', 2)], stores, 2, 1000), null, '1.5 km apart');
});

test('every pair must be within the distance, not just each one to the first', () => {
  // juice is ~430 m north of grill; south is ~430 m south: each within
  // 500 m of grill but ~860 m from each other.
  const s = new Map(stores);
  s.set('south', { id: 'south', latitude: 18.0022, longitude: -76.7466 });
  const g = pickGroup([o('a', 'grill', 1), o('b', 'juice', 2), o('c', 'south', 3)], s, 3, 500);
  assert.equal(g, null);
});

test('oldest orders are served first; stores without a position still group with themselves', () => {
  const g = pickGroup([o('new', 'grill', 9), o('old', 'grill', 1), o('mid', 'grill', 5)], stores, 2, 0);
  assert.deepEqual(ids(g), ['old', 'mid']);
  assert.deepEqual(ids(pickGroup([o('x', 'nomap', 1), o('y', 'nomap', 2), o('z', 'grill', 3)], stores, 2, 1000)), ['x', 'y']);
});

test('span and key', () => {
  assert.equal(groupSpanM(stores, ['grill', 'grill']), 0);
  assert.ok(groupSpanM(stores, ['grill', 'patty', 'juice']) > 400);
  assert.equal(groupKey(['c', 'a', 'b']), groupKey(['b', 'c', 'a']));
});
