# Leave-now notifications — setup

## What's here
- `supabase_migration.sql` — two new tables: `notifications`, `push_subscriptions`
- `app/api/notifications/` — CRUD for notification rules
- `app/api/push/subscribe`, `app/api/push/unsubscribe` — store/remove a device's push subscription
- `app/api/cron/check-notifications` — the endpoint that fires the "leave now" push; see §6 for how to actually call it on the Hobby plan
- `lib/lta.js` — LTA fetch logic, now shared by `/api/arrivals` and the cron job
- `lib/push.js` — server-side `web-push` wrapper
- `lib/pushClient.js` — browser helper: registers the service worker, subscribes
- `public/sw.js`, `public/manifest.json` — makes the site an installable PWA
- `app/layout.js`, `app/page.js`, `app/globals.css` — updated: manifest link, "Leave-now notifications" section, push opt-in UI
- `app/api/arrivals/route.js` — unchanged behaviour, refactored to use `lib/lta.js`

Copy these into your existing project (same folder layout), keeping your current
`app/api/watches/*`, `lib/supabaseServer.js`, etc. as they are. There's no
`vercel.json` in this drop — see §6 for why.

## 1. Why iOS needs this much plumbing
Safari on iPhone only allows web push for a site that has been **added to the
Home Screen** and opened from there (standalone mode), on iOS 16.4+. A normal
Safari tab can never subscribe, no matter what permission is granted. That's
why the app now needs a manifest, a service worker, and an explicit "Enable
push notifications" step done from the installed icon.

## 2. Database
Run `supabase_migration.sql` in the Supabase SQL editor.

## 3. VAPID keys (for Web Push)
```
npx web-push generate-vapid-keys
```
Add to your environment:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=<any random string, e.g. `openssl rand -hex 20`>
```
`CRON_SECRET` protects `/api/cron/check-notifications` from being triggered by
strangers — whoever calls it must pass it as `Authorization: Bearer <secret>`
or `?secret=<secret>`.

## 4. Icons
Add real PNGs at `public/icon-192.png` and `public/icon-512.png` (square,
192×192 and 512×512). They're used as the Home Screen icon, the Apple
touch icon, and the notification icon/badge.

## 5. Install the new dependency
`package.json` now includes `web-push`. Run:
```
npm install
```

## 6. Triggering the check every minute — on the free Hobby plan
As of 2026, Vercel's **Hobby** plan only allows cron jobs that run **once a
day**, with timing accurate to within the hour — a `vercel.json` cron
expression asking for anything more frequent (even hourly) now fails at
*deploy time*. That's not workable for a "leave now in X minutes" alert, so
this drop deliberately ships without a `vercel.json` cron block.

Instead, use a free external scheduler to hit the route once a minute:

1. Sign up at **[cron-job.org](https://cron-job.org)** (free tier supports
   1-minute intervals).
2. Create a job that does a GET request every minute to:
   ```
   https://YOUR-DOMAIN/api/cron/check-notifications
   ```
   with header `Authorization: Bearer YOUR_CRON_SECRET`
   (or append `?secret=YOUR_CRON_SECRET` to the URL instead of a header).
3. That's it — no Vercel config needed. The route itself already checks the
   secret and does all the "is anything due right now" logic.

Alternatives if you'd rather not use a third-party pinger:
- **GitHub Actions** `schedule:` trigger in this repo — free, but realistic
  minimum interval is closer to 5 minutes and GitHub doesn't guarantee exact
  timing either.
- **Upgrade to Vercel Pro** ($20/mo) — then add back a `vercel.json` with
  ```json
  { "crons": [{ "path": "/api/cron/check-notifications", "schedule": "* * * * *" }] }
  ```
  and Vercel's own cron handles it natively.

## 7. How the "leave now" logic works
Each notification stores: days of week, a start time, a stop, a service, and
your walking time. Starting at the scheduled time, the cron job checks that
service's live arrival every minute for up to `monitor_minutes` (45 min by
default, stored in the DB, not yet exposed in the UI). The moment
`(minutes until the bus) - (your walk) - (3 min fixed buffer) <= 0`, it sends:

> Leave now to catch the 61 in 8 mins.

It only fires once per notification per day (`last_fired_on`), and stops
checking after the monitoring window ends even if it never fired (e.g. the
service stopped running).

## 8. Using it
1. Add at least one bus stop on the main screen (as before) so its live
   services get cached.
2. On an iPhone: Share → **Add to Home Screen** → open the app from that
   icon.
3. Tap **Enable push notifications** and allow the permission prompt.
4. Under **Leave-now notifications**, tap **+ Add notification**, name it,
   pick the day(s), a start time, the stop, the specific bus service, and
   your walking time.

## Notes / limitations
- There's no per-user login in this app, so every subscribed device gets
  every notification — fine for a personal or household setup, not for
  multiple unrelated users.
- Android Chrome and desktop Chrome/Edge/Firefox support push without any
  "add to home screen" step — the same "Enable push notifications" button
  works there directly.
- An external pinger only works while your Vercel deployment is publicly
  reachable — fine for a normal production deployment, just keep in mind if
  you're testing against `localhost`.
