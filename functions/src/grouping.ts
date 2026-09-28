// functions/src/grouping.ts
// The pure part of group orders: distances between stores and which open
// orders make a group. No Firestore here, so it is unit-tested directly
// (functions/test/grouping.test.js). groups.ts does the reads and writes.

export type StorePoint = { id: string; latitude?: number; longitude?: number };

/** An open order as the matcher sees it. */
export type Candidate = { id: string; storeId: string; since: number };

const R = 6371000; // Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

function hasCoords(s: StorePoint | undefined): s is Required<StorePoint> {
  return !!s && Number.isFinite(s.latitude) && Number.isFinite(s.longitude) &&
    !(s.latitude === 0 && s.longitude === 0); // 0,0 = never set
}

/** Straight-line distance in metres (haversine). */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Metres between two stores. The same store is 0. A store without a map
 * position can only be grouped with itself (Infinity to any other).
 */
export function storeDistanceM(stores: Map<string, StorePoint>, a: string, b: string): number {
  if (a === b) return 0;
  const sa = stores.get(a);
  const sb = stores.get(b);
  if (!hasCoords(sa) || !hasCoords(sb)) return Infinity;
  return distanceM(sa, sb);
}

/** The largest distance between any two stores in the group (0 = one store). */
export function groupSpanM(stores: Map<string, StorePoint>, storeIds: string[]): number {
  let span = 0;
  for (let i = 0; i < storeIds.length; i++) {
    for (let j = i + 1; j < storeIds.length; j++) {
      span = Math.max(span, storeDistanceM(stores, storeIds[i], storeIds[j]));
    }
  }
  return span;
}

/**
 * Picks `size` orders whose stores are all within `maxM` of each other, or
 * null if the open orders don't make a group.
 *
 * Oldest orders are served first: each order, oldest first, is tried as the
 * anchor. The rest are tried nearest store first (same store = 0 m, so
 * same-store orders always come first), then oldest, and an order joins
 * only if its store is within `maxM` of every store already in the group.
 * The first anchor that fills a group wins.
 */
export function pickGroup(
  candidates: Candidate[], stores: Map<string, StorePoint>, size: number, maxM: number,
): Candidate[] | null {
  if (size < 2 || candidates.length < size) return null;
  const byAge = [...candidates].sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : 1));
  for (const anchor of byAge) {
    const rest = byAge
      .filter(c => c.id !== anchor.id)
      .map(c => ({ c, d: storeDistanceM(stores, anchor.storeId, c.storeId) }))
      .filter(x => x.d <= maxM)
      .sort((x, y) => x.d - y.d || x.c.since - y.c.since);
    const chosen = [anchor];
    for (const { c } of rest) {
      if (chosen.every(o => storeDistanceM(stores, o.storeId, c.storeId) <= maxM)) chosen.push(c);
      if (chosen.length === size) return chosen;
    }
  }
  return null;
}

/** Same orders = same key, whatever the order they were picked in. */
export const groupKey = (orderIds: string[]) => [...orderIds].sort().join(',');
