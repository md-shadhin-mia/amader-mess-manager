import type { Env } from './env';
import { getAccessToken, parseServiceAccount } from './google-auth';
import { FirestoreClient } from './firestore';
import { sendPush, type PushMessage } from './fcm';

export type JobName = 'meal_reminder' | 'bazar_reminder' | 'test';
export type Trigger = 'cron' | 'manual';

export interface JobReport {
  job: JobName;
  trigger: Trigger;
  ran_at: string;
  date: string;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface UserDoc {
  name?: string;
  role?: string;
  fcm_token?: string;
}

interface Recipient {
  uid: string;
  name: string;
  fcmToken: string;
}

/**
 * The app stamps entries with the member's local calendar date, so the worker
 * must resolve "today" in the mess's timezone (Asia/Dhaka by default), not UTC.
 */
export function todayIsoDate(now = new Date(), timeZone = 'Asia/Dhaka'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function connect(env: Env): Promise<{ db: FirestoreClient; accessToken: string }> {
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getAccessToken(account);
  return { db: new FirestoreClient(env.FIREBASE_PROJECT_ID, accessToken), accessToken };
}

function toRecipient(doc: { id: string; data: UserDoc }): Recipient | null {
  if (!doc.data.fcm_token) return null;
  return { uid: doc.id, name: doc.data.name || 'Member', fcmToken: doc.data.fcm_token };
}

async function dispatch(
  env: Env,
  db: FirestoreClient,
  accessToken: string,
  recipients: Recipient[],
  message: (recipient: Recipient) => PushMessage,
  report: JobReport,
): Promise<JobReport> {
  const link = (path: string) => new URL(path, env.APP_URL).toString();

  await Promise.all(
    recipients.map(async (recipient) => {
      const payload = message(recipient);
      const result = await sendPush(accessToken, env.FIREBASE_PROJECT_ID, recipient.fcmToken, {
        ...payload,
        url: link(payload.url),
      });
      if (result.ok) {
        report.sent += 1;
        return;
      }
      report.failed += 1;
      report.errors.push(`${recipient.uid}: ${result.error}`);
      if (result.unregistered) {
        // Browser unsubscribed or token expired: drop it so we stop retrying.
        await db.update(`users/${recipient.uid}`, { fcm_token: null }).catch((err: unknown) => {
          report.errors.push(`${recipient.uid}: could not clear stale token (${String(err)})`);
        });
      }
    }),
  );

  await db
    .create('notification_logs', {
      job: report.job,
      trigger: report.trigger,
      ran_at: new Date(report.ran_at),
      date: report.date,
      sent: report.sent,
      failed: report.failed,
      skipped: report.skipped,
      errors: report.errors.slice(0, 20),
    })
    .catch((err: unknown) => {
      console.error('Could not write notification log', err);
    });

  return report;
}

function newReport(job: JobName, trigger: Trigger, env: Env): JobReport {
  return { job, trigger, ran_at: new Date().toISOString(), date: todayIsoDate(new Date(), env.TIMEZONE || 'Asia/Dhaka'), sent: 0, failed: 0, skipped: 0, errors: [] };
}

/** Evening reminder to everyone with a push token who has not logged a meal today. */
export async function runMealReminder(env: Env, trigger: Trigger): Promise<JobReport> {
  const report = newReport('meal_reminder', trigger, env);
  const { db, accessToken } = await connect(env);

  const [users, mealsToday] = await Promise.all([
    db.query<UserDoc>('users'),
    db.query<{ user_id?: string }>('daily_meals', { field: 'date', op: 'EQUAL', value: report.date }),
  ]);
  const loggedToday = new Set(mealsToday.map((meal) => meal.data.user_id).filter(Boolean));

  const recipients: Recipient[] = [];
  for (const user of users) {
    const recipient = toRecipient(user);
    if (!recipient) continue;
    if (loggedToday.has(recipient.uid)) {
      report.skipped += 1;
      continue;
    }
    recipients.push(recipient);
  }

  return dispatch(env, db, accessToken, recipients, (recipient) => ({
    title: 'আজকের মিল এন্ট্রি দিন 🍛',
    body: `${recipient.name}, আজকের মিল এখনো যুক্ত হয়নি। এখনই এন্ট্রি দিন।`,
    url: '/member/entry',
    tag: `meal-${report.date}`,
  }), report);
}

/** Morning reminder to whoever is assigned to today's bazar. */
export async function runBazarReminder(env: Env, trigger: Trigger): Promise<JobReport> {
  const report = newReport('bazar_reminder', trigger, env);
  const { db, accessToken } = await connect(env);

  const schedule = await db.query<{ assigned_user_id?: string }>('bazar_schedule', {
    field: 'date',
    op: 'EQUAL',
    value: report.date,
  });
  const assigned = new Set(schedule.map((entry) => entry.data.assigned_user_id).filter(Boolean));
  if (assigned.size === 0) return dispatch(env, db, accessToken, [], () => ({ title: '', body: '', url: '/', tag: '' }), report);

  const recipients: Recipient[] = [];
  for (const uid of assigned) {
    const user = await db.get<UserDoc>(`users/${uid}`);
    const recipient = user ? toRecipient(user) : null;
    if (recipient) recipients.push(recipient);
    else report.skipped += 1;
  }

  return dispatch(env, db, accessToken, recipients, (recipient) => ({
    title: 'আজ আপনার বাজারের দিন 🛒',
    body: `${recipient.name}, আজকের বাজারের দায়িত্ব আপনার। খরচ এন্ট্রি দিতে ভুলবেন না।`,
    url: '/member/entry',
    tag: `bazar-${report.date}`,
  }), report);
}

/** One push to a single user's registered browser, used by the in-app "Send test notification" button. */
export async function runTestPush(env: Env, uid: string): Promise<JobReport & { reason?: string }> {
  const report = newReport('test', 'manual', env);
  const { db, accessToken } = await connect(env);

  const user = await db.get<UserDoc>(`users/${uid}`);
  const recipient = user ? toRecipient(user) : null;
  if (!recipient) {
    report.skipped = 1;
    return { ...report, reason: 'no-token' };
  }

  return dispatch(env, db, accessToken, [recipient], () => ({
    title: 'টেস্ট নোটিফিকেশন ✅',
    body: `${recipient.name}, পুশ নোটিফিকেশন ঠিকমতো কাজ করছে। (${new Date().toISOString().slice(11, 16)} UTC)`,
    url: '/',
    tag: 'test',
  }), report);
}
