export interface Env {
  FIREBASE_PROJECT_ID: string;
  APP_URL: string;
  ALLOWED_ORIGIN?: string;
  /** IANA timezone used to decide "today" for reminders. Defaults to Asia/Dhaka. */
  TIMEZONE?: string;
  MEAL_REMINDER_CRON?: string;
  BAZAR_REMINDER_CRON?: string;
  /** Secret: full service-account JSON with FCM + Firestore access. */
  FIREBASE_SERVICE_ACCOUNT: string;
  /** Secret: shared key for manually running a job over HTTP. */
  ADMIN_KEY?: string;
}
