// services/liveSync.ts
// Keeps Firestore's live connection healthy on phones.
//
// Why: every live list in the app (a dasher's open orders, a student's order
// status) rides one Firestore connection. On phones, and especially in the
// installed web app, that connection can die silently when the phone sleeps,
// switches network or backgrounds the app. Firestore doesn't report an
// error; the lists just stop updating. Dashers saw new-order notifications
// arrive but the order never appeared until they toggled online (that write
// happened to wake the connection).
//
// Fix: resyncLiveData() tears the connection down and rebuilds it
// (disableNetwork + enableNetwork), which re-opens every listener with fresh
// server data. It runs when:
//   • a push notification arrives or is tapped (the server just changed
//     something this user cares about),
//   • the app comes back to the foreground, or the device comes back online,
//   • a screen's own watchdog notices its list disagrees with the server.
// Hooks that need more than a reconnect subscribe with onResync().
//
// Safety: an order transaction (accepting an order) fails if the network
// goes away mid-flight, so order writes are wrapped in trackWrite() and a
// reconnect waits for them. Reconnects are single-flight and at most one
// every few seconds, so a burst of triggers causes one reconnect.

import { AppState, Platform } from 'react-native';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from './firebase';

const MIN_GAP_MS = 5000;        // at most one reconnect per 5 s
const WRITE_WAIT_MS = 8000;     // how long a reconnect waits for order writes

type ResyncListener = (reason: string) => void;
const listeners = new Set<ResyncListener>();
let inFlightWrites = 0;
let running: Promise<void> | null = null;
let lastReconnectAt = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Run an order write so a reconnect never cuts it off mid-flight. */
export async function trackWrite<T>(work: () => Promise<T>): Promise<T> {
  inFlightWrites++;
  try {
    return await work();
  } finally {
    inFlightWrites--;
  }
}

/** Called after every resync (reconnected or not). Returns an unsubscribe. */
export function onResync(fn: ResyncListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Reconnect Firestore and tell listeners to refresh. Safe to call often. */
export function resyncLiveData(reason: string): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (Date.now() - lastReconnectAt >= MIN_GAP_MS) {
      const started = Date.now();
      while (inFlightWrites > 0 && Date.now() - started < WRITE_WAIT_MS) await sleep(200);
      if (inFlightWrites === 0) {
        try {
          await disableNetwork(db);
        } catch { /* already offline: enabling below is what matters */ }
        try {
          await enableNetwork(db);
        } catch (e: any) {
          console.log('Firestore reconnect failed:', e?.message);
        }
        lastReconnectAt = Date.now();
      }
    }
    listeners.forEach(fn => {
      try { fn(reason); } catch { /* one bad listener can't block the rest */ }
    });
  })().finally(() => { running = null; });
  return running;
}

let installed = false;

/**
 * Wires the automatic triggers once, at app start (app/_layout.tsx):
 * foreground, back online, and (web) service-worker push messages.
 */
export function installLiveSync(): void {
  if (installed) return;
  installed = true;

  let lastState = AppState.currentState;
  AppState.addEventListener('change', state => {
    if (state === 'active' && lastState !== 'active') resyncLiveData('foreground');
    lastState = state;
  });

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => { resyncLiveData('online'); });
    // public/sw.js posts every push to open pages ('dd-sync'), including on
    // iPhone/Safari where the push is shown as a system notification.
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    sw?.addEventListener('message', (event: MessageEvent) => {
      const type = event.data?.type;
      if (type === 'dd-sync' || type === 'dd-push' || type === 'dd-push-click') resyncLiveData('push');
    });
  }
}
