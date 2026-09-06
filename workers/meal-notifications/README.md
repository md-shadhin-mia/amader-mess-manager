# Meal notification Worker

Cloudflare Cron runs this Worker every minute. It reads `settings/notifications` from Firestore in the `Asia/Dhaka` timezone and sends a Firebase Cloud Messaging (FCM) web push notification only when the configured morning or afternoon time matches. It creates an idempotency record in `notification_runs` so a reminder is not sent twice.

## Required setup

1. In Firebase Console, enable Cloud Messaging for the web app and create a **Web Push certificate**. Put its public VAPID key in the frontend `.env` file:

   ```sh
   VITE_FIREBASE_VAPID_KEY=...
   ```

2. Create a dedicated Google service account with permission to send FCM messages and read/write Firestore. Download its JSON key. Do **not** commit or paste this key into source code.

3. Store that JSON in Cloudflare as a Worker secret:

   ```sh
   cd workers/meal-notifications
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
   ```

4. Deploy the Worker:

   ```sh
   npm run deploy
   ```

## Default schedule

- Morning: `08:30`
- Afternoon: `15:00`
- Timezone: `Asia/Dhaka`

Managers can change these values in the app's **Reminder Settings** section. The Worker matches those values while running its every-minute UTC cron trigger.

## Local checks

```sh
npm install
npm run types
npm run check
npx wrangler deploy --dry-run
```
