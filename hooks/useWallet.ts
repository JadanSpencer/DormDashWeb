// hooks/useWallet.ts
// Live token balance for the signed-in student (read-only; only Cloud
// Functions change it). available = balance minus tokens held for orders
// that no dasher has accepted yet.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
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
