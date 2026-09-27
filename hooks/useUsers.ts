// hooks/useUsers.ts
// Live listeners for people: a dasher's own stats, and the admin Users
// screen's lists. Screens call these and never query users/*, dashers/* or
// wallets/* directly. Writes live in services/users.ts and services/dasher.ts.

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from '../types';

export type DasherStats = {
  rating: number;
  totalDeliveries: number;
  totalEarnings: number;
  floatJmd: number; // money DormDash gave the dasher to buy orders with
};

/** The signed-in dasher's lifetime stats (server-written only), live. null until loaded. */
export function useDasherStats(uid: string | undefined) {
  const [stats, setStats] = useState<DasherStats | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'dashers', uid), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setStats({
        rating: Number(d.rating) || 0,
        totalDeliveries: Number(d.totalDeliveries) || 0,
        totalEarnings: Number(d.totalEarnings) || 0,
        floatJmd: Number(d.floatJmd) || 0,
      });
    });
  }, [uid]);
  return stats;
}

// ─── Admin (firestore.rules: admins only) ──────────────────────────────────
// These load whole collections. Fine at campus scale; if the user count
// grows into the thousands, page the Users screen instead.

/** Every user, newest first. */
export function useAllUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)));
      setLoading(false);
    });
  }, []);
  return { users, loading };
}

export type WalletSummary = { balanceJmd: number; reservedJmd: number };

/** Every student's token wallet, by uid. */
export function useAllWallets() {
  const [wallets, setWallets] = useState<Record<string, WalletSummary>>({});
  useEffect(() => onSnapshot(collection(db, 'wallets'), snap => {
    const m: Record<string, WalletSummary> = {};
    snap.forEach(d => {
      const w = d.data();
      m[d.id] = { balanceJmd: Number(w.balanceJmd) || 0, reservedJmd: Number(w.reservedJmd) || 0 };
    });
    setWallets(m);
  }, () => {}), []);
  return wallets;
}

/** Every dasher's float, by uid. */
export function useDasherFloats() {
  const [floats, setFloats] = useState<Record<string, number>>({});
  useEffect(() => onSnapshot(collection(db, 'dashers'), snap => {
    const m: Record<string, number> = {};
    snap.forEach(d => { m[d.id] = Number(d.data().floatJmd) || 0; });
    setFloats(m);
  }, () => {}), []);
  return floats;
}
