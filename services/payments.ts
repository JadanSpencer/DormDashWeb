// services/payments.ts
// App side of payments. The app never moves money itself: it asks Cloud
// Functions (functions/src/payments.ts) to start a WiPay card payment or to
// adjust balances, and reads balances from Firestore.

import { AppState, Platform, Linking } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// 1 token = J$100 and the token packs: one copy, shared with the server.
import { TOKEN_JMD, TOKEN_PACKS } from '../constants';
export { TOKEN_JMD, TOKEN_PACKS };

export const jmdToTokens = (jmd: number) => (Number(jmd) || 0) / TOKEN_JMD;

/** "4.5 tokens", "1 token", "12 tokens" (max 2 decimals). */
export function formatTokens(jmd: number): string {
  const t = Math.round(jmdToTokens(jmd) * 100) / 100;
  const text = t.toLocaleString('en-JM', { maximumFractionDigits: 2 });
  return `${text} ${t === 1 ? 'token' : 'tokens'}`;
}

function errorText(e: any, fallback: string) {
  // Callable errors carry the server's message, written for students.
  return typeof e?.message === 'string' && e.message && !/internal/i.test(e.message) ? e.message : fallback;
}

// Leaves for WiPay's secure card page. Refuses anything that isn't an
// https link: navigating to a missing URL would just reload the app, which
// looks exactly like a button that did nothing.
async function openCheckout(url: unknown) {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
    throw new Error('The card payment page did not open. Try again.');
  }
  if (Platform.OS === 'web') window.location.href = url;
  else await Linking.openURL(url);
}

const CHECKOUT_FALLBACK_MS = 15 * 1000;

/**
 * Call after payOrderByCard / buyTokens succeed, with the function that
 * re-enables the screen's payment buttons.
 *
 * Phones keep the page in memory while the student is on WiPay and restore
 * it exactly as it was (spinner showing, buttons disabled) when they come
 * back, so every payment button stayed dead until a full reload. This
 * re-enables them when the page is restored or the app comes back to the
 * foreground, and after CHECKOUT_FALLBACK_MS in case the page never opened.
 * Returns a cleanup function.
 */
export function whenBackFromCheckout(reset: () => void): () => void {
  let done = false;
  const fire = () => { if (!done) { done = true; cleanup(); reset(); } };
  const timer = setTimeout(fire, CHECKOUT_FALLBACK_MS);
  const appState = AppState.addEventListener('change', s => { if (s === 'active') fire(); });
  const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) fire(); };
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  if (web) window.addEventListener('pageshow', onPageShow);
  function cleanup() {
    clearTimeout(timer);
    appState.remove();
    if (web) window.removeEventListener('pageshow', onPageShow);
  }
  return () => { done = true; cleanup(); };
}

/** Pay for an accepted card order. Leaves the app for WiPay's page. */
export async function payOrderByCard(orderId: string): Promise<void> {
  try {
    const res: any = await httpsCallable(functions, 'createPayment')({ purpose: 'order', orderId });
    await openCheckout(res.data.url);
  } catch (e: any) {
    throw new Error(errorText(e, 'The payment could not be started. Try again.'));
  }
}

/** Pay for an accepted order from the student's token balance. */
export async function payOrderWithTokens(orderId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'payOrderWithTokens')({ orderId });
  } catch (e: any) {
    console.warn('payOrderWithTokens failed:', e?.code, e?.message);
    throw new Error(errorText(e, 'Paying with tokens didn\'t work just now. Nothing was taken from your tokens. Try again, or pay by card.'));
  }
}

/** Buy a pack of tokens by card. Leaves the app for WiPay's page. */
export async function buyTokens(tokens: number): Promise<void> {
  try {
    const res: any = await httpsCallable(functions, 'createPayment')({ purpose: 'tokens', tokens });
    await openCheckout(res.data.url);
  } catch (e: any) {
    throw new Error(errorText(e, 'The payment could not be started. Try again.'));
  }
}

/**
 * Admin: resolve a card payment WiPay never confirmed (the student didn't
 * come back from WiPay's page). Check WiPay's dashboard first: our payment
 * reference is WiPay's order_id. paid=true needs the WiPay transaction ID.
 */
export async function adminResolvePayment(paymentId: string, paid: boolean, transactionId: string, note: string) {
  try {
    const res: any = await httpsCallable(functions, 'adminResolvePayment')({ paymentId, paid, transactionId, note });
    return res.data as { status: string };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not update the payment. Try again.'));
  }
}

/** Admin: add (positive) or remove (negative) tokens for a student. */
export async function adminAdjustTokens(uid: string, tokens: number, note: string) {
  try {
    const res: any = await httpsCallable(functions, 'adminAdjustTokens')({ uid, tokens, note });
    return res.data as { balanceJmd: number };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not change the token balance.'));
  }
}

/** Admin: top up (positive) or reduce (negative) a store or dasher float, in J$. */
export async function adminAdjustFloat(kind: 'store' | 'dasher', id: string, amountJmd: number, note: string) {
  try {
    const res: any = await httpsCallable(functions, 'adminAdjustFloat')({ kind, id, amountJmd, note });
    return res.data as { floatJmd: number };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not change the float.'));
  }
}

/**
 * Admin: the store's ntfy topic for order alerts.
 * action 'get' (made on first use), 'new' (replace it), 'test' (send a test alert).
 */
export async function adminStoreAlerts(storeId: string, action: 'get' | 'new' | 'test') {
  try {
    const res: any = await httpsCallable(functions, 'storeAlertsAdmin')({ storeId, action });
    return res.data as { topic: string; server: string; link: string };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not load store alerts. Try again.'));
  }
}

/** Admin: a dasher handed over cash from cash-on-delivery orders (J$). */
export async function adminSettleCash(dasherId: string, amountJmd: number, note: string) {
  try {
    const res: any = await httpsCallable(functions, 'adminSettleCash')({ dasherId, amountJmd, note });
    return res.data as { cashOwedJmd: number };
  } catch (e: any) {
    throw new Error(errorText(e, 'Could not record the cash. Try again.'));
  }
}
