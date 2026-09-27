// functions/src/appCheck.ts
// App Check on every callable the app uses. It proves a request comes from
// the real DormDash web app, not a script using someone's login.
//
// Rolled out in two stages (PWA_HANDOFF.md "App Check"):
//   1. Monitor (default): the app sends App Check tokens and Firebase
//      records whether each is valid ("verifications":{"app":"VALID"} in
//      the function logs; App Check metrics in the console). Nothing is
//      blocked.
//   2. Enforce: once the console shows ~100% verified requests, set
//      APP_CHECK_ENFORCE=true in functions/.env and redeploy functions.
//      Callables then reject requests without a valid token.
// wipayReturn is not a callable (WiPay redirects the browser to it), so it
// is protected by its payment signature instead.
export const APP_CHECK = { enforceAppCheck: process.env.APP_CHECK_ENFORCE === 'true' };
