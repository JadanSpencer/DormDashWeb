// hooks/usePriceUnit.ts
// Students can flip every price between J$ and DormDash tokens (one or the
// other, never both). The choice is shared by every screen and remembered
// on this device.

import { useEffect, useState } from 'react';
import { formatJMD } from '../constants';
import { formatTokens } from '../services/payments';

export type PriceUnit = 'jmd' | 'tokens';
const KEY = 'dd_price_unit';

let current: PriceUnit = (() => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'tokens') return 'tokens';
  } catch {}
  return 'jmd';
})();
const listeners = new Set<(u: PriceUnit) => void>();

export function setPriceUnit(u: PriceUnit) {
  current = u;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, u); } catch {}
  listeners.forEach(fn => fn(u));
}

export function usePriceUnit() {
  const [unit, setUnit] = useState<PriceUnit>(current);
  useEffect(() => {
    listeners.add(setUnit);
    return () => { listeners.delete(setUnit); };
  }, []);
  return {
    unit,
    setUnit: setPriceUnit,
    toggle: () => setPriceUnit(unit === 'jmd' ? 'tokens' : 'jmd'),
    /** Format a J$ amount in the chosen unit. */
    fmt: (jmd: number) => (unit === 'tokens' ? formatTokens(jmd) : formatJMD(jmd)),
  };
}
