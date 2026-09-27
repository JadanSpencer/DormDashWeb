// hooks/useOrders.ts
// Every live order listener the app uses. Screens call these hooks and never
// query orders directly. Writes live in services/orders.ts.
//
// Each query here is bounded (one order, a user's in-progress orders, a page
// of history, or a date window), so none of them grows with a user's whole
// history. Indexes they rely on are in firestore.indexes.json.

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  getAggregateFromServer, count, sum,
} from 'firebase/firestore';
import { db } from '../services/firebase';
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
 * A listener that errors, or that the phone froze while DormDash was in the
 * background, used to stop updating silently: cancelled orders stayed on
 * screen and accepting them failed. So it re-subscribes after an error and
 * whenever the web app comes back on screen. `refresh()` forces the same;
 * `dismiss(id)` hides one order right away (e.g. after a failed accept).
 */
export function usePendingOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenKey, setListenKey] = useState(0);
  const refresh = useCallback(() => setListenKey(k => k + 1), []);
  const dismiss = useCallback((orderId: string) => {
    setOrders(list => list.filter(o => o.id !== orderId));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(toOrder).filter(o => !!o.verifiedAt));
      setLoading(false);
    }, err => {
      console.log('Pending orders listener failed, retrying:', err?.message);
      retry = setTimeout(refresh, 3000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [listenKey, refresh]);

  return { orders, loading, refresh, dismiss };
}

/** The order this dasher is delivering right now, if any. */
export function useActiveDelivery(uid: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'orders'),
      where('dasherId', '==', uid),
      where('status', 'in', IN_DELIVERY_STATUSES)
    );
    return onSnapshot(q, snap => {
      setOrder(snap.empty ? null : toOrder(snap.docs[0]));
    });
  }, [uid]);
  return order;
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
