# Mess Manager push notification worker

A Cloudflare Worker that sends scheduled web push notifications to mess
members through Firebase Cloud Messaging (FCM). It runs on Cloudflare cron
triggers, talks to Firestore over REST, and needs no server of its own.

## What it sends

| Job              | Default schedule (UTC) | Dhaka time | Who gets it                                              |
| ---------------- | ---------------------- | ---------- | -------------------------------------------------------- |
| `meal_reminder`  | `0 14 * * *`           | 20:00      | Everyone with push enabled who has not logged today's meal |
| `bazar_reminder` | `0 2 * * *`            | 08:00      | The user(s) assigned in `bazar_schedule` for today         |
| `test`           | on demand              |            | The signed-in user who pressed "Send test notification"    |

The worker is multi-tenant: one run covers every active mess. It loads the
active messes (each with its own timezone), all active members via a
collection-group query, today's meals and bazar schedule via collection-group
queries, and push tokens from the global `users` collection. Suspended messes
are skipped. Every run writes one document to `notification_logs` with totals
and a `per_mess` breakdown. Tokens that FCM reports as unregistered are
cleared from the user's account automatically.

Collection-group queries need the single-field overrides in
`firestore.indexes.json` at the repo root. Deploy them together with the
rules from your machine: `npx firebase-tools deploy --only firestore`.

## One-time setup

1. **Firebase web push key.** Firebase Console → Project settings → Cloud
   Messaging → Web configuration → *Generate key pair*. Put the public key in
   the app's `.env` as `VITE_FIREBASE_VAPID_KEY`.
2. **Service account.** Firebase Console → Project settings → Service accounts
   → *Generate new private key*. Keep the JSON; it is the worker's
   `FIREBASE_SERVICE_ACCOUNT` secret.
3. **Deploy the Firestore rules** from the repo root so users may save their
   push token and managers may read the logs:
   ```sh
   firebase deploy --only firestore:rules
   ```
4. **Install and deploy the worker:**
   ```sh
   cd worker
   npm install            # or bun install
   npx wrangler login
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # paste the JSON on one line
   npx wrangler secret put ADMIN_KEY                  # any long random string
   npx wrangler deploy
   ```
   Adjust `APP_URL` and `ALLOWED_ORIGIN` in `wrangler.toml` if the site is not
   on the default Firebase Hosting domain.
5. **Point the app at the worker.** Set `VITE_PUSH_WORKER_URL` to the deployed
   URL (printed by `wrangler deploy`) and rebuild the app.

## Testing the schedule

### Locally, without waiting for the cron

```sh
cd worker
cp .dev.vars.example .dev.vars     # then fill in the real values
npm run dev                        # wrangler dev --test-scheduled
```

`--test-scheduled` exposes a `/__scheduled` endpoint that fires the
`scheduled()` handler as if Cloudflare had triggered it:

```sh
# Run the meal reminder job now (cron must match wrangler.toml, URL-encoded)
curl "http://localhost:8787/__scheduled?cron=0+14+*+*+*"

# Run the bazar reminder job now
curl "http://localhost:8787/__scheduled?cron=0+2+*+*+*"
```

Watch the terminal for `[meal_reminder] sent=… failed=… skipped=…`.

### In production, on demand

The deployed worker accepts a manual run with the admin key, and returns the
same report the cron run logs:

```sh
curl -X POST "https://mess-push.<account>.workers.dev/run/meal_reminder" \
  -H "X-Admin-Key: $ADMIN_KEY"
```

### End to end from the browser

1. Open the app, go to *Push Notifications*, press **Enable notifications**
   and accept the browser prompt. Your FCM token is saved to your user profile.
2. Press **Send test notification**. The app sends your Firebase ID token to
   `POST /test`; the worker verifies it, looks up your token and sends one
   push. You should see it within a few seconds, even with the tab closed.
3. Check Cloudflare → Workers → mess-push → Logs, or `npx wrangler tail`, to
   see each run. Check the `notification_logs` collection in Firestore for
   the persisted summary.

### Confirming the cron is registered

`npx wrangler deploy` prints the schedules it registered. They are also
visible under Workers → mess-push → Settings → Triggers, along with the
history of past cron runs.

## Changing the schedule

Edit both the `[triggers] crons` list and the matching `MEAL_REMINDER_CRON` /
`BAZAR_REMINDER_CRON` vars in `wrangler.toml`, then redeploy. Cloudflare runs
crons in UTC; Dhaka is UTC+6, so 20:00 Dhaka is `0 14 * * *`.

## Endpoints

| Method | Path                    | Auth                             | Purpose                              |
| ------ | ----------------------- | -------------------------------- | ------------------------------------ |
| GET    | `/`                     | none                             | Health check and configured schedule |
| POST   | `/test`                 | `Authorization: Bearer <ID token>` | Push to the caller's own browser   |
| POST   | `/run/meal_reminder`    | `X-Admin-Key`                    | Run the job immediately              |
| POST   | `/run/bazar_reminder`   | `X-Admin-Key`                    | Run the job immediately              |
