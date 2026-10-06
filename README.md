# Daily Sales Book

Daily sales report for 3 branches. Works on phones and computers.

- Sales with payment columns: Cash, Sampath, Amana, Seylan, Commercial, Amex, Web
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

## Update 4: new day, not-today warning, today-only editing

- The app moves to the new day by itself at midnight, or when a phone is unlocked the next morning
  (only if it was showing "today"; if someone was looking at an old date it stays there).
- When the screen shows any date other than today, a warning bar appears with a **Go to today** button.
- **Branch staff can only add or change today's records.** Past days are read-only for them (the forms hide).
  **Admin** can still open and fix any day; the bar shows in yellow as a reminder.
- "Today" is Sri Lanka time (Asia/Colombo) in the database.

Install: run `supabase/update_all.sql` again (it now includes this part; safe to re-run),
then replace `index.html`, `styles.css` and `app.js`.

## Update 5: Amex and Web are separate

Run `supabase/update_all.sql` again (safe to re-run), then replace `app.js` and `styles.css`.
Old entries that were saved under "Amex / Web" stay under **Amex**; admin can edit them if some were web payments.

## Update 6: staff see today only

- Branch staff see **only today's** records of their own branch. No date arrows, no date picker,
  no date-range Excel. Yesterday's opening carry-over still works (the database gives them only the closing number).
- **Admin** can open, change and export any day for any branch.
- Serial & warranty lookup and **all Excel downloads** are **admin only** (update 7). Staff still get the duplicate-IMEI warning when saving.

Install: run `supabase/update_all_v7.sql` (safe to re-run), then replace `app.js`.

## Update 8: works like the daily sheet

The screen and the Excel file now follow the shop's daily sheet:

1. **Header**: branch name, address, day and date (admin sets the address under **Branches**).
2. **New bill**: bill no., customer, then one line per item. **+ Phone** (IMEI required) or **+ Accessory**.
   Each line has its own **sales rep**, **warranty** and its own amounts under Cash / Sampath / Amana / Seylan /
   Commercial / Amex / Web. One bill can mix payment types per line.
3. **Phones** and **Accessories** tables with subtotals, then **Total card transactions** and **Total sales**.
4. **Income**: "Yesterday cash" is filled automatically; add Cash at shop, Liberty cash, other-branch cash, etc.
5. **Expenses**: quick buttons for Transfer - Amana/Seylan/Sampath, Boss, Breakfast & lunch, PickMe, Transport,
   Delivery, Salary. Any expense can have a **breakdown** (e.g. lunch per person); its amount is the sum.
6. **Summary**: Total sales + Other income − Expenses = Net sales − Card transactions = **Cash in hand**.
7. **Cash count**: enter how many of each note/coin (5000 … 1). The total is the counted cash; the difference shows
   Balanced / Short / Excess.

Excel (admin): the day sheet in the same layout and colours; the date-range report adds a **Sales by Rep** sheet.

Install: run `supabase/update_all_v8.sql` (safe to re-run), then replace `index.html`, `styles.css` and `app.js`.

## Update 9: breakdowns, highlight colours, empty new bill

- **Breakdowns for income and expenses.** Click **+ Breakdown line** to split an entry, e.g. Charity 100 = Mosque 50 +
  Temple 50. If an amount is already typed, it becomes the first line. The amount is always the total of the lines.
  To change a breakdown later: **Edit** the entry, change/add lines, × to remove a line, then **Update**.
- **Highlight colours** on every phone/accessory line (e.g. commission items): None, Green, Yellow, Blue, Pink, Orange,
  Purple. Shown on the sales rep cell on screen and in Excel; the date-range **Sales by Rep** sheet adds items and
  amounts per colour for each rep.
- **New bill starts empty**: the cashier chooses **+ Phone** or **+ Accessory**.
- Income quick buttons (Cash at shop, Liberty cash, …) removed. Expense quick buttons stay.

Install: run `supabase/update_all_v9.sql` (safe to re-run), then replace `styles.css` and `app.js`.

## Update 10: add / subtract in amounts, colour after saving

- Income and expense amounts (and each breakdown line) accept working like `140+120` or `100-30+5`.
  Tap **+** or **−** next to the box (handy on phones), type the next amount, and the total shows as `= 260.00`.
  The working is saved and shown in the list; **Edit** loads it again so you can add `+50` later.
- Phones / Accessories tables: **Colour** on any saved line opens the highlight colours; picking one saves
  straight away (no need to edit the bill). Choosing a colour while entering the bill still works too.

Install: run `supabase/update_all_v10.sql` (safe to re-run), then replace `app.js` and `styles.css`.

## Update 11: faster

- A whole day loads in **one** request instead of 7 (database function `get_day`).
- After saving, the day reloads once (not twice).
- The Excel library loads only when admin clicks a Download button.
- `vercel.json` lets phones keep the app files for 5 minutes between visits.
- Keep Supabase in **Mumbai** (closest to Sri Lanka). Vercel's location doesn't matter: it only serves the files.

Install: run `supabase/update_all_v11.sql` (safe to re-run), then upload `index.html`, `app.js` and the new `vercel.json`.

## Update 12: login security

- Login page shows only Email, Password and Sign in.
- **Signs out after 5 minutes without activity** (any tap or key press restarts the 5 minutes; a warning shows
  for the last 30 seconds). Closing the app and coming back more than 5 minutes later also needs a new sign-in.
- **3 wrong passwords**: the page shows "Access denied" and leaves the website. That login is **locked in the
  database** (it can't read or save anything, even with the right password) and that device is blocked for 30 minutes.
- **Unlock**: admin → **Branches** → *Locked logins* → **Unlock**. An admin login unlocks itself after 30 minutes.
  Or in SQL: `delete from public.login_guard where email = 'prime@idealz.lk';`

Install: run `supabase/update_all_v12.sql` (safe to re-run), then replace `index.html`, `styles.css` and `app.js`.

## Update 13: drafts

- The bill form, income form and expense form save themselves as a **draft on the device** while you type.
- After an automatic sign-out (or if the phone dies or the page closes), signing in again with the **same login**
  brings the unsaved bill / entry back, with a yellow note *"Unsaved bill restored … Check it and save."* and a
  **Discard** button.
- The draft is removed when the bill is saved, cancelled or discarded, and after 3 days.
- Drafts belong to one login and one branch: another login on the same phone sees nothing. Signing out clears the
  screen.

Install: replace `index.html`, `styles.css` and `app.js`. No SQL needed.

## Changing payment types later

Payment types are listed at the top of `app.js` (`PAY`) and as columns in the `sales` table. To add one (for example "BOC"):
1. In Supabase SQL Editor run:
   ```sql
   alter table public.sales add column boc numeric(14,2) not null default 0;
   alter table public.other_income drop constraint other_income_method_check;
   alter table public.expenses drop constraint expenses_method_check;
   ```
2. In `app.js` add `{ k: "boc", n: "BOC" }` to `PAY`, then redeploy.
