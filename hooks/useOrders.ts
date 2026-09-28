// hooks/useOrders.ts
// Every live order listener the app uses. Screens call these hooks and never
// query orders directly. Writes live in services/orders.ts.
//
// Each query here is bounded (one order, a user's in-progress orders, a page
// of history, or a date window), so none of them grows with a user's whole
// history. Indexes they rely on are in firestore.indexes.json.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  getAggregateFromServer, count, sum,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { onResync, resyncLiveData } from '../services/liveSync';
import { serverNow } from '../services/serverClock';
import { MAX_ACTIVE_ORDERS, ACTIVE_STATUSES, IN_DELIVERY_STATUSES } from '../constants';
import { Order } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toOrder = (d: { id: string; data: () => any }) => ({ id: d.id, ...d.data() } as Order);

/** Local midnight `daysAgo` days back: stable all day, so listeners don't churn. */
export function startOfDay(daysAgo = 0): number {
  return new Date().setHours(0, 0, 0, 0) - daysAgo * DAY_MS;
}

// ─── One order ─────────────────────────────────────────────────────────────

export function useOrder(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!orderId) return;
    return onSnapshot(doc(db, 'orders', orderId), snap => {
      if (snap.exists()) setOrder(toOrder(snap));
      setLoading(false);
    });
  }, [orderId]);
  return { order, loading };
}

// ─── Student ───────────────────────────────────────────────────────────────

/** The student's in-progress orders (up to MAX_ACTIVE_ORDERS), oldest first. */
export function useStudentActiveOrders(uid: string | undefined) {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'orders'),
      where('studentId', '==', uid),
      where('status', 'in', ACTIVE_STATUSES)
    );
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(toOrder).sort((a, b) => a.createdAt - b.createdAt));
    });
  }, [uid]);
  return orders;
}

export type OrderTotals = { delivered: number; spent: number; past: number };

/**
 * The newest `visible` finished orders (live), plus totals counted by
 * Firestore (aggregation queries) instead of by loading every order.
 * Totals are recounted whenever an order finishes.
 */
export function useStudentOrderHistory(uid: string | undefined, visible: number) {
  const [pastOrders, setPastOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<OrderTotals | null>(null);

  useEffect(() => {
    if (!uid) return;
    // Newest first over the studentId + createdAt index (no status filter,
    // so no extra index). Up to MAX_ACTIVE_ORDERS of the newest can be in
    // progress, so fetch that many extra, plus one to know if there are
    // older ones.
    const q = query(
      collection(db, 'orders'),
      where('studentId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(visible + MAX_ACTIVE_ORDERS + 1)
    );
    return onSnapshot(q, snap => {
      setPastOrders(snap.docs.map(toOrder)
        .filter(o => o.status === 'delivered' || o.status === 'cancelled'));
      setLoading(false);
    }, err => {
      console.log('Past orders listener failed:', err?.message);
      setLoading(false);
    });
  }, [uid, visible]);

  const newestPast = pastOrders[0] ? `${pastOrders[0].id}:${pastOrders[0].status}` : '';
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const mine = where('studentId', '==', uid);
    Promise.all([
      getAggregateFromServer(query(collection(db, 'orders'), mine, where('status', '==', 'delivered')),
        { n: count(), spent: sum('totalAmount') }),
      getAggregateFromServer(query(collection(db, 'orders'), mine, where('status', 'in', ['delivered', 'cancelled'])),
        { n: count() }),
    ]).then(([delivered, past]) => {
      if (alive) setTotals({ delivered: delivered.data().n, spent: delivered.data().spent ?? 0, past: past.data().n });
    }).catch(e => console.log('Order totals failed:', e?.message));
    return () => { alive = false; };
  }, [uid, newestPast]);

  return { pastOrders, loading, totals };
}

// ─── Dasher ────────────────────────────────────────────────────────────────

/**
 * Open orders the server has verified (verifiedAt set), oldest first.
 * Unverified ones may be about to be rejected (duplicates, rate limits).
 *
 * On phones the live listener can freeze silently (see services/liveSync):
 * a dasher got the new-order notification but the order never appeared.
 * So this list:
 *   • re-subscribes after every live-data resync (push, foreground, online),
 *   • re-subscribes after a listener error,
 *   • with `watchdog` on (dasher online, no active delivery), asks the
 *     server every WATCHDOG_MS how many orders are pending: one read,
 *     outside the live connection. If that disagrees with this list, the
 *     connection is stale and it reconnects.
 * `refresh()` forces a re-subscribe; `dismiss(id)` hides one order at once
 * (e.g. after a failed accept).
 *
 * Wave dispatch: with `uid`, an order shows only once it has been offered to
 * this dasher (see offeredFrom); the list updates itself when the next one
 * comes due. The Firestore rules refuse an accept before then anyway.
 */
const WATCHDOG_MS = 30 * 1000;
// The rules check the server's clock; wait a moment past it so an order
// never shows a few hundred milliseconds before it can be taken.
const OFFER_MARGIN_MS = 1000;

/** When this dasher may take the order (orders from before waves: always). */
export function offeredFrom(o: Order, uid: string | undefined): number {
  if (o.openToAllAt == null) return 0;
  const mine = uid ? o.offerAt?.[uid] : undefined;
  return Math.min(o.openToAllAt, mine ?? Infinity);
}

export function usePendingOrders({ watchdog = false, uid }: { watchdog?: boolean; uid?: string } = {}) {
  const [all, setAll] = useState<Order[]>([]);
  const [now, setNow] = useState(() => serverNow());
  const [loading, setLoading] = useState(true);
  const [listenKey, setListenKey] = useState(0);
  // How many pending orders the listener sees (verified or not): the same
  // set the watchdog counts on the server.
  const seenPending = useRef<number | null>(null);
  const refresh = useCallback(() => setListenKey(k => k + 1), []);
  const dismiss = useCallback((orderId: string) => {
    setAll(list => list.filter(o => o.id !== orderId));
  }, []);

  useEffect(() => onResync(refresh), [refresh]);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    let retry: ReturnType<typeof setTimeout> | undefined;
    // The offline cache (services/firebase.ts) answers first from the
    // phone; for open orders that could show ones already taken, so wait
    // for the server's answer (metadata changes deliver it).
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache) return;
      seenPending.current = snap.size;
      setAll(snap.docs.map(toOrder).filter(o => !!o.verifiedAt));
      setNow(serverNow());
      setLoading(false);
    }, err => {
      console.log('Pending orders listener failed, retrying:', err?.message);
      retry = setTimeout(refresh, 3000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [listenKey, refresh]);

  useEffect(() => {
    if (!watchdog) return;
    const check = async () => {
      if (AppState.currentState !== 'active' || seenPending.current === null) return;
      try {
        const agg = await getAggregateFromServer(
          query(collection(db, 'orders'), where('status', '==', 'pending')), { n: count() });
        if (agg.data().n !== seenPending.current) {
          console.log('Order list out of date, reconnecting', { server: agg.data().n, shown: seenPending.current });
          resyncLiveData('watchdog');
        }
      } catch { /* offline: the 'online' trigger will reconnect */ }
    };
    const timer = setInterval(check, WATCHDOG_MS);
    return () => clearInterval(timer);
  }, [watchdog]);

  // Orders offered to this dasher by now; wake up when the next one is.
  const orders = useMemo(
    () => all.filter(o => offeredFrom(o, uid) + OFFER_MARGIN_MS <= now), [all, uid, now]);
  useEffect(() => {
    const next = Math.min(...all.map(o => offeredFrom(o, uid) + OFFER_MARGIN_MS).filter(t => t > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(serverNow()), Math.max(0, next - serverNow()) + 50);
    return () => clearTimeout(timer);
  }, [all, uid, now]);

  return { orders, loading, refresh, dismiss };
}

/**
 * The orders this dasher is delivering right now, oldest accept first.
 * Usually one; a group (hooks/useGroups.ts) is several at once.
 */
export function useActiveDeliveries(uid: string | undefined) {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'orders'),
      where('dasherId', '==', uid),
      where('status', 'in', IN_DELIVERY_STATUSES)
    );
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(toOrder)
        .sort((a, b) => (a.acceptedAt ?? a.createdAt) - (b.acceptedAt ?? b.createdAt) || (a.id < b.id ? -1 : 1)));
    });
  }, [uid]);
  return orders;
}

const acceptedTime = (o: Order) => o.acceptedAt ?? o.createdAt;

/**
 * A dasher's orders accepted since `sinceMs`, newest first. Used by the
 * Today strip on /dash and the 30-day history on /account.
 *
 * Bounded by acceptedAt (index: dasherId + acceptedAt). If that index is
 * still building (right after a deploy), falls back to the unbounded query
 * and filters here, so the screens keep working either way.
 */
export function useDasherOrders(uid: string | undefined, sinceMs: number) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const toOrders = (docs: { id: string; data: () => any }[]) => docs
      .map(toOrder)
      .filter(o => acceptedTime(o) >= sinceMs)
      .sort((a, b) => acceptedTime(b) - acceptedTime(a));

    let unsubFallback: (() => void) | undefined;
    const unsub = onSnapshot(
      query(collection(db, 'orders'),
        where('dasherId', '==', uid),
        where('acceptedAt', '>=', sinceMs),
        orderBy('acceptedAt', 'desc')),
      snap => { setOrders(toOrders(snap.docs)); setLoading(false); },
      err => {
        if (err?.code !== 'failed-precondition') {
          console.log('Dasher orders listener failed:', err?.message);
          setLoading(false);
          return;
        }
        // Index still building: the old full-history query, filtered here.
        unsubFallback = onSnapshot(
          query(collection(db, 'orders'), where('dasherId', '==', uid)),
          snap => { setOrders(toOrders(snap.docs)); setLoading(false); },
          () => setLoading(false),
        );
      },
    );
    return () => { unsub(); unsubFallback?.(); };
  }, [uid, sinceMs]);

  return { orders, loading };
}

// ─── Public ────────────────────────────────────────────────────────────────

/**
 * How many dashers are online. dashers/* is private, so the server keeps a
 * public count (onDasherOnlineChanged). null = unknown (missing or failed).
 */
export function useOnlineDasherCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => onSnapshot(doc(db, 'publicStats', 'app'), snap => {
    const v = snap.data()?.onlineDashers;
    setN(typeof v === 'number' ? v : null);
  }, () => setN(null)), []);
  return n;
}
