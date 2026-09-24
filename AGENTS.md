# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Web / PWA build

DormDash also ships as a PWA while app-store accounts are pending.
Read PWA_HANDOFF.md before touching maps, notifications, alerts, the service
worker, or anything under public/. Key rule: never import react-native-maps
directly — use components/MapView. Verify with `npm run build:web`.

# Design + security guardrails (see PWA_HANDOFF.md §3b)
- New routes must have URLs unique across (student)/(dasher)/(admin).
- Use theme tokens; no orbs, gradient text, left stripes, all-caps eyebrows,
  glow shadows, emoji in headings, or pure #FFFFFF surfaces.
- New external hosts must be added to the CSP in firebase.json and vercel.json.
- Order prices are enforced server-side in functions/src/index.ts; never trust
  client-sent prices.
- Update app/legal/privacy.tsx whenever data collection changes.
- Design QA: `npm run preview:web` with ?as=student|dasher|admin|none.
