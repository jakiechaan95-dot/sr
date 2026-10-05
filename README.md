# Daily Sales Book

Daily sales report for 3 branches. Works on phones and computers.

- Sales with payment columns: Cash, Sampath, Amana, Seylan, Commercial, Amex / Web
- Other income and other expenses, each marked cash or bank
- End-of-day cash summary: opening + cash sales + cash income − cash expenses − banked = expected cash, then counted cash and short/excess
- "All branches" combined view
- Excel download: one branch for a day, all branches for a day, or any date range

Files:

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website |
| `config.js` | Where you paste your Supabase URL and key |
| `supabase/schema.sql` | Creates the database tables and security rules |

---

## Step 1: Set up Supabase (about 5 minutes)

1. Go to https://supabase.com, sign in, and click **New project**. Pick a name and a database password, and choose the **Singapore** or **Mumbai** region (closest to Sri Lanka).
2. When the project is ready, open **SQL Editor → New query**. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and click **Run**. You should see "Success".
3. Turn off public sign-ups so only your staff can log in:
   **Authentication → Sign In / Providers → Email**. Keep Email enabled, but switch **Allow new users to sign up** OFF. Also switch **Confirm email** OFF if you don't want to confirm each staff email.
4. Create staff logins:
   **Authentication → Users → Add user → Create new user**. Enter an email and password for each person (for example one per branch). Tick **Auto Confirm User**.
5. Copy your keys: **Project Settings → API**. You need the **Project URL** and the **anon public** key.

## Step 2: Add your keys

Open `config.js` and replace the two placeholder values:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

The anon key is meant to be public. Your data is protected because the database only lets signed-in users read or write.
Never put the **service_role** key in this file.

## Step 3: Deploy to Vercel

**Option A: Drag and drop (no GitHub needed)**
1. Install the Vercel CLI: `npm i -g vercel`
2. In this folder run `vercel` and follow the prompts (Framework: **Other**, no build command, output directory `.`).
3. Run `vercel --prod` to publish.

**Option B: GitHub**
1. Create a GitHub repository and upload all files from this folder.
2. On https://vercel.com click **Add New → Project**, import the repository.
3. Framework preset: **Other**. Leave Build Command empty. Click **Deploy**.

Vercel gives you a link like `https://daily-sales-book.vercel.app`. Open it on any phone or computer and sign in.

Tip: on a phone, use the browser's **Add to Home Screen** so it opens like an app.

## Using it

1. Pick the date (it opens on today) and the branch tab.
2. **Sales**: type the bill number, put the amount under the payment type, press **Add sale**. If a customer pays part cash and part card, fill both columns on the same bill.
3. **Other income / Other expenses**: description, amount, and whether it was cash or a bank.
4. **End of day cash**: enter the opening float (or press *Use yesterday's count*), cash banked or handed over, then the counted cash. It shows **Balanced**, **Short** or **Excess**.
5. **All branches** tab shows every branch side by side with totals.
6. **Download Excel** at the bottom.
7. **Rename** on the branch bar sets your real branch names.

Changes made on one device appear on the others within a second or two.

## Update 2: invoice items, serials, warranty, carry-forward

**If you already ran `schema.sql` before this update:** open Supabase → SQL Editor → New query,
paste `supabase/migration_002_items_warranty.sql`, and click **Run**. New installs only need `schema.sql`.
Then upload the new `index.html`, `app.js` and `styles.css` to GitHub (Vercel redeploys by itself).

How invoices work now:
- One invoice has many items. Click **+ Add item** for each one.
- Enter a **Serial / IMEI** for phones and laptops; quantity is then locked to 1. Leave it empty for accessories and type the quantity.
- Pick a **Warranty** per item. The expiry date is worked out from the invoice date.
- Under **Payment**, tap a payment name (for example *Sampath*) to put the remaining balance there.
  The invoice saves only when payments equal the invoice total.
- If a serial was already sold before, the app warns you and shows where. Press **Save invoice** again to save anyway.
- **Serial & warranty lookup** finds an item by IMEI, invoice number or customer phone, across all branches,
  and shows whether the warranty is active or expired.

Today and tomorrow:
- When a branch opens a new day, its **opening cash is set automatically** to the previous day's closing cash
  (counted cash, or expected cash if nobody counted).
- If yesterday's count is corrected later, today's page shows the difference; press **Use yesterday's closing** to update.

## Update 3: each branch sees only its own data

1. Supabase → SQL Editor → run `supabase/migration_003_branch_access.sql` once.
2. Open `supabase/link_users.sql`, change the emails to your real logins, and run it.
   The table at the end shows who is linked to which branch.
3. Replace `app.js` on GitHub / in your folder.

| Role | Sees |
|---|---|
| `staff` (e.g. prime@idealz.lk → b1) | Only its own branch: no other tabs, no "All branches", no Rename |
| `admin` | All branches, combined summary, rename branches, all Excel reports |
| Not in the list | Nothing; the login screen says "not linked to a branch yet" |

The database enforces this, not only the screen. Warranty lookup and the duplicate-IMEI warning still
search all branches, so a customer can claim warranty at any branch.

To add a new staff member later: create the user in Authentication → Users, add a line for them in
`link_users.sql`, and run it again. To remove access: `delete from public.staff where email = '...';`

## Changing payment types later

Payment types are listed at the top of `app.js` (`PAY`) and as columns in the `sales` table. To add one (for example "BOC"):
1. In Supabase SQL Editor run:
   ```sql
   alter table public.sales add column boc numeric(14,2) not null default 0;
   alter table public.other_income drop constraint other_income_method_check;
   alter table public.expenses drop constraint expenses_method_check;
   ```
2. In `app.js` add `{ k: "boc", n: "BOC" }` to `PAY`, then redeploy.

Daily sales report for 3 branches. Works on phones and computers.

- Sales with payment columns: Cash, Sampath, Amana, Seylan, Commercial, Amex / Web
- Other income and other expenses, each marked cash or bank
- End-of-day cash summary: opening + cash sales + cash income − cash expenses − banked = expected cash, then counted cash and short/excess
- "All branches" combined view
- Excel download: one branch for a day, all branches for a day, or any date range

Files:

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The website |
| `config.js` | Where you paste your Supabase URL and key |
| `supabase/schema.sql` | Creates the database tables and security rules |

---

## Step 1: Set up Supabase (about 5 minutes)

1. Go to https://supabase.com, sign in, and click **New project**. Pick a name and a database password, and choose the **Singapore** or **Mumbai** region (closest to Sri Lanka).
2. When the project is ready, open **SQL Editor → New query**. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and click **Run**. You should see "Success".
3. Turn off public sign-ups so only your staff can log in:
   **Authentication → Sign In / Providers → Email**. Keep Email enabled, but switch **Allow new users to sign up** OFF. Also switch **Confirm email** OFF if you don't want to confirm each staff email.
4. Create staff logins:
   **Authentication → Users → Add user → Create new user**. Enter an email and password for each person (for example one per branch). Tick **Auto Confirm User**.
5. Copy your keys: **Project Settings → API**. You need the **Project URL** and the **anon public** key.

## Step 2: Add your keys

Open `config.js` and replace the two placeholder values:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

The anon key is meant to be public. Your data is protected because the database only lets signed-in users read or write.
Never put the **service_role** key in this file.

## Step 3: Deploy to Vercel

**Option A: Drag and drop (no GitHub needed)**
1. Install the Vercel CLI: `npm i -g vercel`
2. In this folder run `vercel` and follow the prompts (Framework: **Other**, no build command, output directory `.`).
3. Run `vercel --prod` to publish.

**Option B: GitHub**
1. Create a GitHub repository and upload all files from this folder.
2. On https://vercel.com click **Add New → Project**, import the repository.
3. Framework preset: **Other**. Leave Build Command empty. Click **Deploy**.

Vercel gives you a link like `https://daily-sales-book.vercel.app`. Open it on any phone or computer and sign in.

Tip: on a phone, use the browser's **Add to Home Screen** so it opens like an app.

## Using it

1. Pick the date (it opens on today) and the branch tab.
2. **Sales**: type the bill number, put the amount under the payment type, press **Add sale**. If a customer pays part cash and part card, fill both columns on the same bill.
3. **Other income / Other expenses**: description, amount, and whether it was cash or a bank.
4. **End of day cash**: enter the opening float (or press *Use yesterday's count*), cash banked or handed over, then the counted cash. It shows **Balanced**, **Short** or **Excess**.
5. **All branches** tab shows every branch side by side with totals.
6. **Download Excel** at the bottom.
7. **Rename** on the branch bar sets your real branch names.

Changes made on one device appear on the others within a second or two.

## Update 2: invoice items, serials, warranty, carry-forward

**If you already ran `schema.sql` before this update:** open Supabase → SQL Editor → New query,
paste `supabase/migration_002_items_warranty.sql`, and click **Run**. New installs only need `schema.sql`.
Then upload the new `index.html`, `app.js` and `styles.css` to GitHub (Vercel redeploys by itself).

How invoices work now:
- One invoice has many items. Click **+ Add item** for each one.
- Enter a **Serial / IMEI** for phones and laptops; quantity is then locked to 1. Leave it empty for accessories and type the quantity.
- Pick a **Warranty** per item. The expiry date is worked out from the invoice date.
- Under **Payment**, tap a payment name (for example *Sampath*) to put the remaining balance there.
  The invoice saves only when payments equal the invoice total.
- If a serial was already sold before, the app warns you and shows where. Press **Save invoice** again to save anyway.
- **Serial & warranty lookup** finds an item by IMEI, invoice number or customer phone, across all branches,
  and shows whether the warranty is active or expired.

Today and tomorrow:
- When a branch opens a new day, its **opening cash is set automatically** to the previous day's closing cash
  (counted cash, or expected cash if nobody counted).
- If yesterday's count is corrected later, today's page shows the difference; press **Use yesterday's closing** to update.

## Changing payment types later

Payment types are listed at the top of `app.js` (`PAY`) and as columns in the `sales` table. To add one (for example "BOC"):
1. In Supabase SQL Editor run:
   ```sql
   alter table public.sales add column boc numeric(14,2) not null default 0;
   alter table public.other_income drop constraint other_income_method_check;
   alter table public.expenses drop constraint expenses_method_check;
   ```
2. In `app.js` add `{ k: "boc", n: "BOC" }` to `PAY`, then redeploy.