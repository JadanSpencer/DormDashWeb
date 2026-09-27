// hooks/useStores.ts
// Every store and menu listener the app uses. Screens call these hooks and
// never query stores directly. Writes live in services/stores.ts.

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { appCache, CACHE_KEYS, CACHE_TTL } from '../services/cache';
import { MenuItem, Store } from '../types';

/**
 * All stores by name, live. `refresh()` re-opens the listener and
 * `refreshedAt` changes when fresh data arrives, so pull-to-refresh can stop
 * its spinner (the list is live anyway; this is for the gesture).
 */
export function useStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [listenKey, setListenKey] = useState(0);
  const refresh = useCallback(() => setListenKey(k => k + 1), []);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() } as Store)));
      setLoading(false);
      setRefreshedAt(Date.now());
    }, () => {
      setLoading(false);
      setRefreshedAt(Date.now());
    });
  }, [listenKey]);

  return { stores, loading, refresh, refreshedAt };
}

/**
 * One store, read once. With `cached`, a copy from the last few minutes is
 * reused (student store page: instant back-and-forth navigation).
 */
export function useStore(storeId: string | undefined, opts: { cached?: boolean } = {}) {
  const [store, setStore] = useState<Store | null>(null);
  const cached = !!opts.cached;
  useEffect(() => {
    if (!storeId) return;
    if (cached) {
      const hit = appCache.get<Store>(CACHE_KEYS.STORE(storeId));
      if (hit) { setStore(hit); return; }
    }
    let alive = true;
    getDoc(doc(db, 'stores', storeId)).then(snap => {
      if (!alive || !snap.exists()) return;
      const data = { id: snap.id, ...snap.data() } as Store;
      setStore(data);
      if (cached) appCache.set(CACHE_KEYS.STORE(storeId), data, CACHE_TTL.STORES);
    });
    return () => { alive = false; };
  }, [storeId, cached]);
  return store;
}

/** A store's menu by category, live. `availableOnly` hides switched-off items (students). */
export function useMenu(storeId: string | undefined, opts: { availableOnly?: boolean } = {}) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const availableOnly = !!opts.availableOnly;
  useEffect(() => {
    if (!storeId) return;
    const q = query(collection(db, 'stores', storeId, 'menuItems'), orderBy('category', 'asc'));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
      setItems(availableOnly ? all.filter(i => i.isAvailable) : all);
      setLoading(false);
    });
  }, [storeId, availableOnly]);
  return { items, loading };
}

/**
 * Admin only: each store's float by store id (storeFloats/{storeId}, which
 * students can't read). Stores missing here have no float of their own.
 */
export function useStoreFloats() {
  const [floats, setFloats] = useState<Record<string, number>>({});
  useEffect(() => onSnapshot(collection(db, 'storeFloats'), snap => {
    const m: Record<string, number> = {};
    snap.forEach(d => { m[d.id] = Number(d.data().floatJmd) || 0; });
    setFloats(m);
  }), []);
  return floats;
}
