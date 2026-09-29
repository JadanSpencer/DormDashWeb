# DormDash Payments: Setup, Testing and Going Live

## How money moves
Nothing is paid at checkout. When a dasher accepts, the student gets "Pay now" and chooses **tokens** or **card**. They have **10 minutes**. The dasher app says "Don't buy anything yet" until it's paid.

| | What happens |
|---|---|
| Student places order | Nothing charged, nothing held |
| Dasher accepts | Student chooses: **Pay with tokens** (taken from their balance at once) or **Pay by card** (WiPay's page) |
| Paid (either way) | Dasher is notified "Payment received". Food cost comes off the store's float, or the dasher's float if the store has none |
| Not paid in 10 min | Order cancelled automatically. Student not charged |
| Paid order cancelled by support | Refunded as **tokens**. Float restored |
| Card payment lands after the order was already paid with tokens, or cancelled | Added to the student's balance as **tokens** |

Orders placed with tokens on an older app version still work the old way (held at checkout, used on accept).

1 token = J$100. WiPay's card fee is paid by the student (`customer_pay`) and shown on WiPay's page.
WiPay cannot hold a payment and take it later, and has no refund API. That's why card payment happens at acceptance, and refunds are made as tokens. Cash refunds, if ever needed, are done by hand in your WiPay dashboard.

## Security
- Card details are only ever entered on WiPay's page. DormDash never sees them.
- A payment is marked paid **only by the server** (`wipayReturn`), and only after it checks WiPay's signature: md5(transaction_id + original total + API key). The transaction id must also match the one WiPay gave when the payment started, and each payment applies **once**. Replaying or editing the return link does nothing.
- Balances, payments and ledgers can't be written from the app, not even by admins (see `firestore.rules`). Admin changes go through `adminAdjustTokens` / `adminAdjustFloat`, which need a note and are logged in `walletTx` / `floatTx`.
- The WiPay API key is a Firebase **secret**. It is never in the code, the app or chat.

## 1. Test in SANDBOX first (no real money)
`functions/.env` is already set for sandbox (account 1234567890).
```
cd ~/Documents/Jcommerce/dorm-dash-web
firebase functions:secrets:set WIPAY_API_KEY      # type: 123   (the sandbox key)
firebase deploy --only functions                  # say Y if asked to enable Secret Manager
npm run deploy:web
firebase deploy --only firestore:rules
```
Sandbox test cards (any future expiry, any CVV):
- Approve: **4111 1111 1111 1111** (Visa) or **5111 1111 1111 1111** (Mastercard)
- Decline: **4111 1111 1111 3333**

Test these:
1. Buy 5 tokens → confetti "Payment successful" → Profile shows 5 tokens.
2. Admin → Users → student → Adjust tokens +10, note "cash test". The balance updates.
3. Order → dasher accepts → student taps **Pay with tokens** → balance drops → dasher gets "Payment received" and can start.
4. Order → dasher accepts → student taps **Pay by card** → pay with 4111… → confetti → dasher gets "Payment received".
5. Card order: pay with the **decline** card → "didn't go through" → pay again with 4111… → works.
6. Card order: accept, then don't pay → cancelled within about 15 minutes. Student and dasher are both told.
7. Admin → Stores → Start float J$5,000 on a store → after a paid order it drops by the food cost.

Then check the logs: `firebase functions:log -n 300`. You're looking for `Payment verified` and **no** `FAILED verification`.

## 2. Go LIVE (real money)
1. Get your partner's **live WiPay account number** and **API key** (WiPay dashboard → Developers/API). The account must be a verified business account.
2. Edit `functions/.env`: `WIPAY_ACCOUNT_NUMBER=<live number>` and `WIPAY_ENV=live`.
3. `firebase functions:secrets:set WIPAY_API_KEY` and paste the **live** key.
4. `firebase deploy --only functions`.
5. Do one real J$500 token purchase with your own card and confirm it arrives in WiPay.

Never share the live API key in chat, email or screenshots. If it leaks, generate a new one in WiPay and repeat step 3.

## Where to look
- Student balance and history: Firestore `wallets/{uid}` and `walletTx` (filter by `uid`).
- Card payments: `payments` (status `pending` / `paid` / `failed` / `credited`).
- Floats: `storeFloats/{storeId}.floatJmd` (admin-only; older stores had it on the store doc and are moved automatically), `dashers/{uid}.floatJmd`, history in `floatTx`.

## Card payments to check (do this daily)
WiPay tells DormDash a card payment worked **only** by sending the student's browser back to DormDash (its API has no webhook or status lookup). If a student closes the tab or loses signal on WiPay's page, their card can be charged while DormDash still shows the payment as unconfirmed.

Admin → **Board** → **Card payments to check** lists:
- payments still unconfirmed 15 minutes after they started, and
- payments WiPay returned with a different transaction ID than expected (shown in red).

For each one, open your **WiPay dashboard** and find the transaction whose **order ID** matches the one shown in DormDash:
- **WiPay shows it succeeded:** tap **Paid**, paste WiPay's transaction ID, add a note. The student gets their tokens, or their order is paid (if the order was already cancelled, the money becomes tokens). It can never be applied twice.
- **WiPay has no successful payment for it:** tap **Not paid** and add a note. Nothing moves.

Every resolution records which admin did it and the note (`payments/{id}.resolvedBy`, `resolvedNote`).

Also automatic: if WiPay's return arrived but applying it failed, the server retries every 5 minutes (`retryVerifiedPayments`), so those never need an admin.

## Cash on delivery (launch stopgap)
While card payments are waiting on a payment provider, students can choose **Cash on delivery** at checkout. Switch it off with `CASH_ENABLED = false` in `functions/src/shared.ts` (then deploy functions and web); orders already placed carry on.

| | What happens |
|---|---|
| Student places a cash order | Up to J$3,000 (`CASH_MAX_ORDER_JMD`), one cash order at a time; the server refuses others (`cash_over_limit`, `too_many_cash`) |
| Dasher accepts | No pay window. The food cost comes off the **store's float** (top it up daily: Admin → Stores → float), the store gets its order alert, and the student is told to have the cash ready. The student can't cancel it from here (the store is cooking) |
| Delivered | The dasher confirms "Cash collected". The order is marked paid; the dasher keeps their J$280 share and **owes DormDash the rest** (food + J$120), shown on the admin dashboard |
| Settling | Admin → Board → **Cash to collect from dashers** → Received, with the amount and a note (e.g. "Lynk ref 12345"). Can't record more than they owe |

Records: `dashers/{uid}.cashOwedJmd` (running total), `cashTx` (every collection and hand-over, admin-only), `floatTx` (store float used).

**Daily routine:** top up each store's float in the morning; collect cash from dashers and record it at the end of the day. A no-show: cancel the order as admin (the food cost stays spent from the float) and pause the student's account if needed.

