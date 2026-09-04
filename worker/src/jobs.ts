import type { Env } from './env';
import { getAccessToken, parseServiceAccount } from './google-auth';
import { FirestoreClient, type FirestoreDocument } from './firestore';
import { sendPush, type PushMessage } from './fcm';

export type JobName = 'meal_reminder' | 'bazar_reminder' | 'test';
export type Trigger = 'cron' | 'manual';

export interface MessReport {
  name: string;
  date: string;
  sent: number;
  failed: number;
  skipped: number;
}

export interface JobReport {
  job: JobName;
  trigger: Trigger;
  ran_at: string;
  sent: number;
  failed: number;
  skipped: number;
  per_mess: Record<string, MessReport>;
  errors: string[];
}

interface MessDoc {
  name?: string;
  status?: string;
  timezone?: string;
}

interface MemberDoc {
  uid?: string;
  name?: string;
  status?: string;
}

interface UserDoc {
  name?: string;
  fcm_token?: string;
}

interface Recipient {
  messId: string;
  messName: string;
  uid: string;
  name: string;
  fcmToken: string;
}

const DEFAULT_TZ = 'Asia/Dhaka';

/** Calendar date in a timezone, matching how the app stamps entries. */
export function todayIsoDate(now = new Date(), timeZone = DEFAULT_TZ): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return todayIsoDate(now, DEFAULT_TZ);
  }
}

/** 'projects/p/databases/(default)/documents/messes/abc/members/u1' → 'abc' */
export function messIdFromName(name: string): string | null {
  const parts = name.split('/');
  const index = parts.indexOf('messes');
  return index >= 0 && parts[index + 1] ? parts[index + 1] : null;
}

export async function connect(env: Env): Promise<{ db: FirestoreClient; accessToken: string }> {
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getAccessToken(account);
  return { db: new FirestoreClient(env.FIREBASE_PROJECT_ID, accessToken), accessToken };
}

interface TenantContext {
  /** Active messes with their "today" in their own timezone. */
  messes: Map<string, { name: string; today: string }>;
  /** Active members grouped by mess. */
  membersByMess: Map<string, { uid: string; name: string }[]>;
  /** Push tokens by uid (global account). */
  tokens: Map<string, string>;
  /** Distinct dates across all mess timezones (at most two). */
  dates: string[];
}

async function loadTenants(db: FirestoreClient, env: Env): Promise<TenantContext> {
  const now = new Date();
  const [messDocs, memberDocs, userDocs] = await Promise.all([
    db.query<MessDoc>('messes', { field: 'status', op: 'EQUAL', value: 'active' }),
    db.query<MemberDoc>('members', { field: 'status', op: 'EQUAL', value: 'active' }, { allDescendants: true, limit: 5000 }),
    db.query<UserDoc>('users', { field: 'fcm_token', op: 'GREATER_THAN', value: '' }, { limit: 5000 }),
  ]);

  const messes = new Map<string, { name: string; today: string }>();
  for (const m of messDocs) {
    messes.set(m.id, { name: m.data.name || m.id, today: todayIsoDate(now, m.data.timezone || env.TIMEZONE || DEFAULT_TZ) });
  }

  const membersByMess = new Map<string, { uid: string; name: string }[]>();
  for (const member of memberDocs) {
    const messId = messIdFromName(member.name);
    if (!messId || !messes.has(messId)) continue;
    const list = membersByMess.get(messId) || [];
    list.push({ uid: member.data.uid || member.id, name: member.data.name || 'Member' });
    membersByMess.set(messId, list);
  }

  const tokens = new Map<string, string>();
  for (const user of userDocs) if (user.data.fcm_token) tokens.set(user.id, user.data.fcm_token);

  const dates = [...new Set([...messes.values()].map((m) => m.today))];
  return { messes, membersByMess, tokens, dates };
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
  const clearedTokens = new Set<string>();

  await Promise.all(
    recipients.map(async (recipient) => {
      const payload = message(recipient);
      const result = await sendPush(accessToken, env.FIREBASE_PROJECT_ID, recipient.fcmToken, { ...payload, url: link(payload.url) });
      const per = report.per_mess[recipient.messId];
      if (result.ok) {
        report.sent += 1;
        if (per) per.sent += 1;
        return;
      }
      report.failed += 1;
      if (per) per.failed += 1;
      report.errors.push(`${recipient.messId}/${recipient.uid}: ${result.error}`);
      if (result.unregistered && !clearedTokens.has(recipient.uid)) {
        clearedTokens.add(recipient.uid);
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
      sent: report.sent,
      failed: report.failed,
      skipped: report.skipped,
      per_mess: report.per_mess,
      errors: report.errors.slice(0, 20),
    })
    .catch((err: unknown) => console.error('Could not write notification log', err));

  return report;
}

function newReport(job: JobName, trigger: Trigger): JobReport {
  return { job, trigger, ran_at: new Date().toISOString(), sent: 0, failed: 0, skipped: 0, per_mess: {}, errors: [] };
}

function initPerMess(report: JobReport, ctx: TenantContext) {
  for (const [messId, mess] of ctx.messes) report.per_mess[messId] = { name: mess.name, date: mess.today, sent: 0, failed: 0, skipped: 0 };
}

/** Evening reminder to every member with a push token who has not logged a meal today, in every active mess. */
export async function runMealReminder(env: Env, trigger: Trigger): Promise<JobReport> {
  const report = newReport('meal_reminder', trigger);
  const { db, accessToken } = await connect(env);
  const ctx = await loadTenants(db, env);
  initPerMess(report, ctx);

  const mealDocs = ctx.dates.length
    ? await db.query<{ user_id?: string; date?: string }>('daily_meals', { field: 'date', op: 'IN', value: ctx.dates }, { allDescendants: true, limit: 5000 })
    : [];
  const logged = new Set<string>();
  for (const meal of mealDocs) {
    const messId = messIdFromName(meal.name);
    const mess = messId ? ctx.messes.get(messId) : null;
    if (messId && mess && meal.data.user_id && meal.data.date === mess.today) logged.add(`${messId}:${meal.data.user_id}`);
  }

  const recipients: Recipient[] = [];
  for (const [messId, mess] of ctx.messes) {
    for (const member of ctx.membersByMess.get(messId) || []) {
      const token = ctx.tokens.get(member.uid);
      if (!token) continue;
      if (logged.has(`${messId}:${member.uid}`)) {
        report.skipped += 1;
        report.per_mess[messId].skipped += 1;
        continue;
      }
      recipients.push({ messId, messName: mess.name, uid: member.uid, name: member.name, fcmToken: token });
    }
  }

  return dispatch(env, db, accessToken, recipients, (r) => ({
    title: `আজকের মিল এন্ট্রি দিন 🍛 · ${r.messName}`,
    body: `${r.name}, আজকের মিল এখনো যুক্ত হয়নি। এখনই এন্ট্রি দিন।`,
    url: '/member/entry',
    tag: `meal-${r.messId}-${ctx.messes.get(r.messId)?.today ?? ''}`,
  }), report);
}

/** Morning reminder to whoever is assigned to today's bazar, in every active mess. */
export async function runBazarReminder(env: Env, trigger: Trigger): Promise<JobReport> {
  const report = newReport('bazar_reminder', trigger);
  const { db, accessToken } = await connect(env);
  const ctx = await loadTenants(db, env);
  initPerMess(report, ctx);

  const schedule = ctx.dates.length
    ? await db.query<{ assigned_user_id?: string; date?: string }>('bazar_schedule', { field: 'date', op: 'IN', value: ctx.dates }, { allDescendants: true, limit: 5000 })
    : [];

  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  for (const entry of schedule) {
    const messId = messIdFromName(entry.name);
    const mess = messId ? ctx.messes.get(messId) : null;
    const uid = entry.data.assigned_user_id;
    if (!messId || !mess || !uid || entry.data.date !== mess.today || seen.has(`${messId}:${uid}`)) continue;
    seen.add(`${messId}:${uid}`);
    const member = (ctx.membersByMess.get(messId) || []).find((m) => m.uid === uid);
    const token = ctx.tokens.get(uid);
    if (!member || !token) {
      report.skipped += 1;
      report.per_mess[messId].skipped += 1;
      continue;
    }
    recipients.push({ messId, messName: mess.name, uid, name: member.name, fcmToken: token });
  }

  return dispatch(env, db, accessToken, recipients, (r) => ({
    title: `আজ আপনার বাজারের দিন 🛒 · ${r.messName}`,
    body: `${r.name}, আজকের বাজারের দায়িত্ব আপনার। খরচ এন্ট্রি দিতে ভুলবেন না।`,
    url: '/member/entry',
    tag: `bazar-${r.messId}-${ctx.messes.get(r.messId)?.today ?? ''}`,
  }), report);
}

/** One push to a single user's registered browser, used by the in-app "Send test notification" button. */
export async function runTestPush(env: Env, uid: string): Promise<JobReport & { reason?: string }> {
  const report = newReport('test', 'manual');
  const { db, accessToken } = await connect(env);

  const user = await db.get<UserDoc>(`users/${uid}`);
  if (!user?.data.fcm_token) {
    report.skipped = 1;
    return { ...report, reason: 'no-token' };
  }
  report.per_mess.test = { name: 'test', date: todayIsoDate(), sent: 0, failed: 0, skipped: 0 };
  const recipient: Recipient = { messId: 'test', messName: '', uid, name: user.data.name || 'Member', fcmToken: user.data.fcm_token };

  return dispatch(env, db, accessToken, [recipient], () => ({
    title: 'টেস্ট নোটিফিকেশন ✅',
    body: `${recipient.name}, পুশ নোটিফিকেশন ঠিকমতো কাজ করছে। (${new Date().toISOString().slice(11, 16)} UTC)`,
    url: '/',
    tag: 'test',
  }), report);
}
