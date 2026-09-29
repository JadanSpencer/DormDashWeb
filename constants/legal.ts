// constants/legal.ts
// One place for the facts the Privacy Policy and Terms depend on.
// CHECK THESE BEFORE LAUNCH. Changing a value here updates both documents.
// The token value, delivery fee and pay window come from the shared business rules
// (functions/src/shared.ts): if you change those, bump termsUpdated too.
import { TOKEN_JMD, PAY_WINDOW_MIN, CASH_ENABLED, CASH_MAX_ORDER_JMD, formatJMD } from './index';

export const LEGAL = {
  operator: 'Jcommerce & Tech',           // who runs DormDash
  appName: 'DormDash',
  country: 'Jamaica',
  // Shown publicly in both documents as the contact for privacy requests,
  // account deletion and disputes. Replace with a dedicated support address.
  contactEmail: 'sp3nc3rjadan29@gmail.com',
  privacyUpdated: '29 September 2026',
  termsUpdated: '29 September 2026',
  minimumAge: 18,
  // How fast personal data is removed after an account is deleted.
  deletionDays: 30,
  // How students pay. Payments: functions/src/payments.ts.
  paymentMethod: `You pay only after a dasher accepts your order. You then choose to pay with your DormDash tokens or by card, and have ${PAY_WINDOW_MIN} minutes to pay, or the order is cancelled. Card payments are made on the secure payment page of our payment provider, WiPay.` +
    (CASH_ENABLED
      ? ` While we offer it, you can instead choose cash on delivery for orders up to ${formatJMD(CASH_MAX_ORDER_JMD)}, one at a time: pay your dasher the full amount in cash when the food arrives. The store starts making a cash order as soon as a dasher accepts it, so it can't be cancelled after that. If you don't pay for a cash order, we may pause your account.`
      : ''),
  tokenValueJmd: TOKEN_JMD,
};
