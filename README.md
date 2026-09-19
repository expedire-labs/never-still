# The Departure Board

Live Singapore bus arrivals, built on Next.js, backed by Supabase, deployable to Vercel.

Single-user, no login — this is meant for one person's own watch list.

## How it fits together

- **Frontend** (`app/page.js`) — the UI, polls your own API every 30s.
- **`/api/arrivals`** — a serverless function that calls LTA DataMall using a
  secret `LTA_ACCOUNT_KEY` environment variable. Your key never reaches the
  browser, and the browser never talks to LTA directly.
- **`/api/watches`** — reads and writes your watch list (stop code, optional
  service number, optional label) to a `watches` table in Supabase, using the
  Supabase **service role** key server-side.

## 1. Get an LTA DataMall account key

Free registration at
[datamall.lta.gov.sg](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html).
You'll get an `AccountKey` by email.

## 2. Set up the Supabase table

In your existing Supabase project: **SQL Editor → New query**, paste the
contents of `supabase/schema.sql`, and run it. That creates a single
`watches` table.

Then grab two values from **Project Settings → API**:
- **Project URL**
- **`service_role` secret** (not the `anon` public key — this one has full
  access and must stay server-side only, which is exactly how the API routes
  use it)

## 3. Run it locally

```bash
npm install
cp .env.local.example .env.local
# fill in LTA_ACCOUNT_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
npm run dev
```

Visit `http://localhost:3000`.

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.env.local` is gitignored, so your keys won't be committed.

## 5. Deploy on Vercel

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repo.
2. Framework preset: Next.js (auto-detected).
3. Before the first deploy (or right after, then redeploy), add the same
   three environment variables from `.env.local` under
   **Settings → Environment Variables**:
   - `LTA_ACCOUNT_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Your board is live at `<project>.vercel.app`.

## Notes

- Arrival times aren't cached — every 30-second refresh calls LTA live for
  each stop you're watching.
- To add a second service at a stop you're already watching, just submit the
  add-stop form again with the same stop code and a different service number.
  "Remove stop" clears every service watched at that stop.
