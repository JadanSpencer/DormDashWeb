// hooks/useWakeLock.web.ts
// Keeps the phone screen on while a dasher is online in the PWA.
//
// Why: browsers pause timers when the screen locks or the app is
// backgrounded, which freezes the map pin and the live order listener in
// (dasher)/dash.tsx during a delivery. The Screen Wake Lock API (Chrome/Android, Safari 16.4+) prevents the lock.
// The browser drops the lock whenever the tab is hidden, so it is
// re-requested each time DormDash becomes visible again.

import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!active || !nav?.wakeLock) return;

    let sentinel: any = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock.request('screen');
      } catch {
        // Denied (e.g. low battery mode) — nothing else to do.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release?.().catch?.(() => {});
    };
  }, [active]);
}
