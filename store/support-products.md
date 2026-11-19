# Support payments (Google Play in-app products)

The "Support Etzba" screen (Settings → תמיכה באצבע) sells one-time in-app products, kept as permanent
(non-consumable): the app acknowledges each payment and never consumes it. So Google Play keeps it on the
person's account, and the perks come back after a reinstall or on a new phone with the same account, with no
server or account of ours. Each amount can be given once; an amount already given shows "נתת, תודה!".
As a thank-you they unlock looks only (themes, app icons, the ring on the dial, widget styles, early access).
Nothing about pay or rights is ever locked. In Play Console there is nothing to set for this: an in-app product
is permanent when the app doesn't consume it.

## Set up once in Play Console

1. Play Console → Settings → Payments profile: set up a merchant account (needed to sell anything).
2. The app must be uploaded at least once (any testing track) with the billing library inside
   (it is, when `"support": true` in features.json).
3. Monetize → Products → In-app products → Create product, for each ID below:
   - Product ID: exactly as listed (can't be changed later)
   - Name / description: e.g. "תמיכה באצבע ₪20" / "תשלום חד־פעמי לתמיכה בפיתוח. לא פותח שום דבר."
   - Price: the amount in ILS (Play converts for other countries)
   - Activate it.

| Product ID   | Price | Where it shows |
|--------------|-------|----------------|
| support_10   | ₪10   | main (קפה) |
| support_20   | ₪20   | main (ארוחה קלה) |
| support_50   | ₪50   | main (תמיכה גדולה) |
| support_5    | ₪5    | סכום אחר |
| support_15   | ₪15   | סכום אחר |
| support_30   | ₪30   | סכום אחר |
| support_75   | ₪75   | סכום אחר |
| support_100  | ₪100  | סכום אחר |
| support_200  | ₪200  | סכום אחר |

Products that don't exist in Play Console are hidden in the app (the main three are shown greyed out).

## Testing

Play Console → Settings → License testing: add your Google account. Purchases from that account
on a build installed from a testing track are test purchases and aren't charged.

## Data safety form

Under "Financial info → Purchase history": collected by Google Play, not by the app. The app itself
stores only that you supported (a yes/no flag on the phone).
