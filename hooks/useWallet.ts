// hooks/useWallet.ts
// Live token balance for the signed-in student (read-only; only Cloud
// Functions change it). available = balance minus tokens held for orders
// that no dasher has accepted yet.

import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

export type Wallet = { balanceJmd: number; reservedJmd: number; availableJmd: number; loaded: boolean };

export function useWallet(uid?: string | null): Wallet {
  const [w, setW] = useState<Wallet>({ balanceJmd: 0, reservedJmd: 0, availableJmd: 0, loaded: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'wallets', uid), snap => {
      const d = snap.data() ?? {};
      const balanceJmd = Number(d.balanceJmd) || 0;
      const reservedJmd = Number(d.reservedJmd) || 0;
      setW({ balanceJmd, reservedJmd, availableJmd: Math.max(0, balanceJmd - reservedJmd), loaded: true });
    }, () => setW(prev => ({ ...prev, loaded: true })));
  }, [uid]);
  return w;
}

export type WalletTx = { id: string; type: string; amountJmd: number; createdAt?: number; [k: string]: any };

/**
 * The student's latest token activity (newest first, up to `max`), live.
 * order_charge lines are hidden: they're 0-token bookkeeping after a hold.
 * Single where clause, so no composite index; sorted here.
 */
export function useWalletHistory(uid: string | null | undefined, max = 8): WalletTx[] {
  const [tx, setTx] = useState<WalletTx[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'walletTx'), where('uid', '==', uid)), snap => {
      setTx(snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletTx))
        .filter(r => r.type !== 'order_charge')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, max));
    }, () => {});
  }, [uid, max]);
  return tx;
}

/**
 * One card payment (payments/{id}), live: the WiPay result page watches it
 * until the server has applied the payment. `loaded` is true once known.
 */
export function usePayment<T = Record<string, any>>(paymentId: string | undefined) {
  const [pay, setPay] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!paymentId) { setLoaded(true); return; }
    return onSnapshot(doc(db, 'payments', paymentId), snap => {
      setPay(snap.exists() ? (snap.data() as T) : null);
      setLoaded(true);
    }, () => setLoaded(true));
  }, [paymentId]);
  return { pay, loaded };
}

export type PaymentToCheck = {
  id: string; uid: string; purpose: 'order' | 'tokens'; amountJmd: number; tokens?: number;
  orderId?: string | null; status: 'pending' | 'review'; createdAt: number; reviewReason?: string;
  returnTransactionId?: string;
};

const UNCONFIRMED_AFTER_MS = 15 * 60 * 1000;

/**
 * Admin: card payments WiPay never confirmed to us. 'review' ones (valid
 * signature, changed transaction id) and 'pending' ones older than 15
 * minutes (the student probably left WiPay's page without coming back).
 * Newest first. See adminResolvePayment.
 */
export function usePaymentsToCheck() {
  const [rows, setRows] = useState<PaymentToCheck[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000); // pending ones become due over time
    return () => clearInterval(t);
  }, []);
  useEffect(() => onSnapshot(
    query(collection(db, 'payments'), where('status', 'in', ['pending', 'review']), orderBy('createdAt', 'desc'), limit(50)),
    snap => setRows(snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentToCheck))),
    () => {},
  ), []);
  return rows.filter(r => r.status === 'review' || now - r.createdAt > UNCONFIRMED_AFTER_MS);
}

