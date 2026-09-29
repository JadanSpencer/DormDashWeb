# DormDash pricing: proximity delivery fees

Written 29 Sep 2026. Code: `functions/src/shared.ts` (fee and split), `functions/src/campus.ts` (places), `functions/src/campusDistances.ts` (walking distances, generated).

## How a fee is worked out
1. The student picks where to deliver from a list, not by typing: **Halls**, **Faculties** or **Other places**, then the place. Room and block go in the note to the dasher.
2. Each store is linked to its **food spot** on campus (Admin → Stores → edit → "Food spot on campus").
3. The fee is set by the **walking distance** from the food spot to the place. Distances are measured along OpenStreetMap footpaths, not in a straight line (routes are about 1.4× the straight line on campus).

| Walking distance | Fee | Dasher earns | DormDash keeps |
|---|---|---|---|
| up to 400 m (about 5 min) | **J$300** | J$250 | J$50 |
| 401–600 m | J$350 | J$290 | J$60 |
| 601–800 m | J$400 | J$330 | J$70 |
| 801–1,000 m | J$450 | J$370 | J$80 |
| 1,001–1,200 m | J$500 | J$410 | J$90 |
| 1,201–1,400 m | J$550 | J$450 | J$100 |
| 1,401–1,600 m | J$600 | J$490 | J$110 |

- **Fee rule:** J$300 up to 400 m, then +J$50 for every 200 m (or part of it) after that. Capped at J$800 as a safety net; nothing on campus comes close.
- **Split rule:** DormDash keeps J$50 of the minimum fee plus 20% of every dollar above J$300, rounded to J$5. The dasher gets the rest. That gives exactly your two anchors: J$50 at J$300, and J$90 at J$500 (between your J$75 and J$100).
- **Examples:**
  - The Spot → George Alleyne: 240 m, **J$300**.
  - Social Welfare → George Alleyne: 672 m, **J$400**.
  - The Spot → Taylor: 838 m, J$450.
  - Preston Cafe → UHWI: 1.4 km, J$600.
  - Preston Cafe → ABC Hall: 1.9 km, J$700 (the longest trip).
- **Across all 860 food-spot-to-place pairs:**
  - Fees run from J$300 to J$700. The average fee is **J$411**, close to the old flat J$400, so students pay about the same on average and less when close.
  - DormDash keeps **J$72** on average.
  - The dasher earns J$339 on average.
- **The server prices every order itself** (`verifyNewOrder`). The fee shown at checkout comes from the same shared code, so the two always agree, and the app's numbers are never trusted. Each order stores its fee, its split, the distance and how the fee was worked out (`feeBasis`).

## Places and pins
- **What's listed:** 43 delivery places (11 halls, 7 faculties, 25 other places) and 20 food spots, in `functions/src/campus.ts`.
- **Where the pins come from:** your store directory (29 Sep 2026; Google Maps pins, which can be 10–40 m off), your own pins (ABC Hall, Leslie Robinson Hall, Faculty of Social Sciences), and OpenStreetMap for the faculties and landmarks the directory doesn't cover yet.
- **Checking pins:** **CAMPUS_PINS.md** lists every pin with a Google Maps link. Regenerate it with `node scripts/campus-pins.mjs`.
- **Still an estimate:** Faculty of Sport (placed at the Mona Bowl track).
- **Your pin vs the directory:** your pin for Leslie Robinson Hall is about 40 m from the directory's ("by the tennis courts"). I kept yours; say if the directory's is better.
- **Check one conflict:** the directory's Burger King pin sits almost on KFC, but UWI's 2021 list puts it near the Faculty of Law. Confirm on campus.
- **Removed:** WJC Hall (not UWI Mona), Little Caesars (likely closed) and Boardwalk Café (replaced by Julie Mango Express).
- **Not added yet** (unconfirmed in your directory): ABC Hall Cafeteria, Mona Bowl, and the hall commissaries (Unique Buyers, Mae's Commissary, Panther's Grocery, R & R Minimart).
- **Link your stores:** Admin → Stores → edit → "Food spot on campus". A store that isn't linked pays the J$400 fallback.

**To add or move a place:** edit `campus.ts`, then run `cd functions && npm run build && cd .. && node scripts/campus-distances.mjs && node scripts/campus-pins.mjs`, build again and commit. This re-measures every walking route, prints the fee table and refreshes the pin list.

## Do the costs get covered? (estimates; confirm the ones marked *)
DormDash's income is its share of each delivery fee: **J$50–110 per order, about J$65–70 on average.**

**Monthly fixed costs**

| Cost | Per month |
|---|---|
| Two always-warm Cloud Functions (order trigger, pay with tokens) | US$20–40 ≈ J$3,100–6,300 |
| Other Firebase usage at launch (database, functions, hosting, tasks, scheduler) | up to US$10 ≈ J$1,600 |
| ntfy paid plan (optional, for store alerts above the free limit) | US$5–10 ≈ J$800–1,600 |
| Apple Developer (only once there's an iPhone app) | US$99/year ≈ J$1,300 |
| **Planning figure** | **≈ J$9,000** |

Exchange rate used: about J$157 to US$1.

**Per-order costs:** about J$0–1 for cloud usage, *if the student pays the card fee*. This is the one rule that decides whether DormDash makes or loses money:
- A card payment through Fygaro/NCB costs **US$0.25 (≈J$39) plus the bank's rate on the whole payment** (commonly 2.5–3.5% in Jamaica*; ask NCB for yours). On a J$1,500 order that's roughly **J$80, more than DormDash's J$50–70 share.** Absorbing card fees means **losing money on most orders**, even with token packs (a J$2,000 pack costs about J$99 to process, around J$66 per order it pays for).
- **So the student must pay the card fee.** WiPay already works this way (`fee_structure: customer_pay`, shown on WiPay's page), and the code uses it. If you move to Fygaro, confirm the fee can be passed to the customer; if not, DormDash needs a "card fee" line at payment (a small code change, not built yet).
- Paying with tokens costs DormDash nothing per order, as long as the token pack's own card fee is paid by the student.

**Break-even:** J$9,000 ÷ J$65 ≈ **139 orders a month, about 5 a day.**

| Orders a day | DormDash keeps a month | After fixed costs | Dashers earn a month |
|---|---|---|---|
| 5 | ≈ J$9,800 | ≈ break-even | ≈ J$49,000 |
| 10 | ≈ J$19,500 | ≈ **+J$10,500** | ≈ J$98,000 |
| 25 | ≈ J$48,800 | ≈ **+J$39,800** | ≈ J$245,000 |
| 50 | ≈ J$97,500 | ≈ **+J$87,000** (cloud costs rise a little) | ≈ J$489,000 |

**Is it fair to dashers?** A short delivery (up to 400 m) takes about 15–20 minutes, including the wait at the store and the walk back, for J$250. A 1 km delivery takes about 35 minutes for J$370–410. That's roughly J$700–750 an hour while busy, about 1.8× Jamaica's minimum wage (J$400/hour*). Time spent waiting between orders isn't paid.

**Things this doesn't cover:**
- **Refunds** are made as tokens, so no cash leaves DormDash.
- **Cash on delivery** (parked on the `payment-reconfiguration` branch) adds no-show risk from store floats and isn't in these numbers.
- **Tax:** GCT only applies once DormDash is registered (turnover above the threshold*), and income tax applies to profit. Check both with an accountant.

## Changing the numbers
All in `functions/src/shared.ts`:
- **Fee:** `MIN_DELIVERY_FEE_JMD` (300), `FEE_BASE_DISTANCE_M` (400), `FEE_STEP_M` (200), `FEE_STEP_JMD` (50).
- **Split:** `PLATFORM_TAKE_BASE_JMD` (50), `PLATFORM_TAKE_RATE` (0.2).
- **Other:** `FALLBACK_DELIVERY_FEE_JMD` (400) for places without a position.

After a change, deploy **functions and web together** and update the Terms' date in `constants/legal.ts`. The Terms quote their fee examples straight from these rules.
