// services/serverClock.ts
// Some phones and laptops have the wrong date or time set. Every timestamp
// the app writes or compares ("26 hr ago" on an order placed a minute ago)
// was using that device's clock. This measures how far off the device is,
// once per app start, from the Date header the DormDash web server sends,
// and serverNow() returns the corrected time.
//
// Web: HEAD request to our own origin (allowed by the CSP, skipped by
// sw.js because it isn't a GET). Native: no correction (phones on the
// network time are right in practice).

import { Platform } from 'react-native';

let offsetMs = 0;
let started = false;

export function syncServerClock(): void {
  if (started || Platform.OS !== 'web' || typeof fetch === 'undefined') return;
  started = true;
  const sentAt = Date.now();
  fetch('/', { method: 'HEAD', cache: 'no-store' })
    .then(res => {
      const header = res.headers.get('date');
      if (!header) return;
      const server = Date.parse(header);
      if (Number.isNaN(server)) return;
      const receivedAt = Date.now();
      // Assume the server stamped the reply halfway through the round trip.
      offsetMs = server - (sentAt + receivedAt) / 2;
    })
    .catch(() => { /* keep the device clock */ });
}

/** Current time, corrected for a wrong device clock. Use instead of Date.now(). */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
