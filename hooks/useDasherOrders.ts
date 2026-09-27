// hooks/useDasherOrders.ts
// A dasher's orders accepted since `sinceMs`, kept live. Used by the Today
// strip on /dash and the 30-day history on /account.
//
// Bounded by acceptedAt (index: orders dasherId + acceptedAt in
// firestore.indexes.json), so it reads a day or a month of orders instead of
// the dasher's whole history. If that index is still building (right after a
// deploy), it falls back to the old unbounded query and filters here, so the
// screens keep working either way.

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Order } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight `daysAgo` days back: stable all day, so listeners don't churn. */
export function startOfDay(daysAgo = 0): number {
  return new Date().setHours(0, 0, 0, 0) - daysAgo * DAY_MS;
}

const acceptedTime = (o: Order) => o.acceptedAt ?? o.createdAt;

export function useDasherOrders(uid: string | undefined, sinceMs: number) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const toOrders = (docs: { id: string; data: () => any }[]) => docs
      .map(d => ({ id: d.id, ...d.data() } as Order))
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
