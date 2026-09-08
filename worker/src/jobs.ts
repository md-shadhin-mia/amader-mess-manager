import type { Env } from './env';
import { getAccessToken, parseServiceAccount } from './google-auth';
import { FirestoreClient } from './firestore';
import { sendPush, type PushMessage } from './fcm';

export type JobName = 'lunch_reminder' | 'dinner_reminder' | 'bazar_reminder' | 'test' | 'notice_broadcast';
export type Trigger = 'cron' | 'manual';

export interface MessDoc {
  name?: string;
  status?: string;
  timezone?: string;
  lunch_reminder_time?: string;
  lunch_reminder_enabled?: boolean;
  dinner_reminder_time?: string;
  dinner_reminder_enabled?: boolean;
  bazar_reminder_time?: string;
  bazar_reminder_enabled?: boolean;
}

export interface MemberDoc {
  uid?: string;
  name?: string;
  status?: string;
  role?: string;
}

export interface UserDoc {
  name?: string;
  fcm_token?: string;
}

export interface Recipient {
  messId: string;
  messName: string;
  uid: string;
  name: string;
  fcmToken: string;
}

export const DEFAULT_TZ = 'Asia/Dhaka';
export const DEFAULT_LUNCH_REMINDER_TIME = '08:30';
export const DEFAULT_DINNER_REMINDER_TIME = '14:45';
export const DEFAULT_BAZAR_REMINDER_TIME = '08:00';

/** Calendar date in a timezone, matching how the app stamps entries (YYYY-MM-DD). */
export function todayIsoDate(now = new Date(), timeZone = DEFAULT_TZ): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return todayIsoDate(now, DEFAULT_TZ);
  }
}

/** Local date and time details in a timezone. */
export function timeInZone(now = new Date(), timeZone = DEFAULT_TZ): { date: string; time: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    let hourStr = get('hour');
    if (hourStr === '24') hourStr = '00';
    const h = parseInt(hourStr, 10);
    const m = parseInt(get('minute'), 10);
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const minutes = h * 60 + m;
    return { date, time, minutes };
  } catch {
    return timeInZone(now, DEFAULT_TZ);
  }
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hStr, mStr] = (timeStr || '').trim().split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Checks if current local minutes falls in the window [target, target + windowMinutes).
 * Default window is 6 minutes to safely catch a 5-minute cron with minor scheduling drift.
 */
export function isDue(curMinutes: number, targetTimeStr: string, windowMinutes = 6): boolean {
  const targetMinutes = parseTimeToMinutes(targetTimeStr);
  const diff = curMinutes - targetMinutes;
  return diff >= 0 && diff < windowMinutes;
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

interface DispatchResult {
  sent: number;
  failed: number;
  errors: string[];
}

async function dispatchPush(
  env: Env,
  db: FirestoreClient,
  accessToken: string,
  recipients: Recipient[],
  message: (recipient: Recipient) => PushMessage,
): Promise<DispatchResult> {
  const link = (path: string) => new URL(path, env.APP_URL).toString();
  const clearedTokens = new Set<string>();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  await Promise.all(
    recipients.map(async (recipient) => {
      const payload = message(recipient);
      const result = await sendPush(accessToken, env.FIREBASE_PROJECT_ID, recipient.fcmToken, {
        ...payload,
        url: link(payload.url),
      });

      if (result.ok) {
        sent += 1;
        return;
      }

      failed += 1;
      errors.push(`${recipient.messId}/${recipient.uid}: ${result.error}`);

      if (result.unregistered && !clearedTokens.has(recipient.uid)) {
        clearedTokens.add(recipient.uid);
        // Clear stale/expired token
        await db.update(`users/${recipient.uid}`, { fcm_token: null }).catch((err: unknown) => {
          errors.push(`${recipient.uid}: could not clear stale token (${String(err)})`);
        });
      }
    }),
  );

  return { sent, failed, errors };
}

export interface TickSummary {
  ran_at: string;
  messes_checked: number;
  runs: {
    messId: string;
    messName: string;
    job: JobName;
    sent: number;
    failed: number;
    skipped: number;
  }[];
  errors: string[];
}

/**
 * 5-minute cron tick.
 * Evaluates all active messes in their respective timezones,
 * checks if lunch, dinner, or bazar reminder is due,
 * ensures idempotency per day, and dispatches FCM pushes.
 */
export async function runScheduledTick(env: Env): Promise<TickSummary> {
  const summary: TickSummary = {
    ran_at: new Date().toISOString(),
    messes_checked: 0,
    runs: [],
    errors: [],
  };

  const { db, accessToken } = await connect(env);
  const now = new Date();

  // Load all active messes, members, and user push tokens
  const [messDocs, memberDocs, userDocs] = await Promise.all([
    db.query<MessDoc>('messes', { field: 'status', op: 'EQUAL', value: 'active' }),
    db.query<MemberDoc>('members', { field: 'status', op: 'EQUAL', value: 'active' }, { allDescendants: true, limit: 5000 }),
    db.query<UserDoc>('users', { field: 'fcm_token', op: 'GREATER_THAN', value: '' }, { limit: 5000 }),
  ]);

  summary.messes_checked = messDocs.length;

  const tokens = new Map<string, string>();
  for (const user of userDocs) {
    if (user.data.fcm_token) tokens.set(user.id, user.data.fcm_token);
  }

  const membersByMess = new Map<string, { uid: string; name: string }[]>();
  for (const member of memberDocs) {
    const messId = messIdFromName(member.name);
    if (!messId) continue;
    const list = membersByMess.get(messId) || [];
    list.push({ uid: member.data.uid || member.id, name: member.data.name || 'Member' });
    membersByMess.set(messId, list);
  }

  for (const mess of messDocs) {
    const messId = mess.id;
    const messName = mess.data.name || messId;
    const tz = mess.data.timezone || env.TIMEZONE || DEFAULT_TZ;
    const { date, time, minutes } = timeInZone(now, tz);

    const members = membersByMess.get(messId) || [];

    // 1. Check Lunch Reminder
    const lunchEnabled = mess.data.lunch_reminder_enabled !== false;
    const lunchTime = mess.data.lunch_reminder_time || DEFAULT_LUNCH_REMINDER_TIME;
    if (lunchEnabled && isDue(minutes, lunchTime)) {
      await processMealReminder(env, db, accessToken, messId, messName, 'lunch_reminder', 'lunch', date, members, tokens, summary);
    }

    // 2. Check Dinner Reminder
    const dinnerEnabled = mess.data.dinner_reminder_enabled !== false;
    const dinnerTime = mess.data.dinner_reminder_time || DEFAULT_DINNER_REMINDER_TIME;
    if (dinnerEnabled && isDue(minutes, dinnerTime)) {
      await processMealReminder(env, db, accessToken, messId, messName, 'dinner_reminder', 'dinner', date, members, tokens, summary);
    }

    // 3. Check Bazar Reminder
    const bazarEnabled = mess.data.bazar_reminder_enabled !== false;
    const bazarTime = mess.data.bazar_reminder_time || DEFAULT_BAZAR_REMINDER_TIME;
    if (bazarEnabled && isDue(minutes, bazarTime)) {
      await processBazarReminder(env, db, accessToken, messId, messName, date, members, tokens, summary);
    }
  }

  return summary;
}

async function processMealReminder(
  env: Env,
  db: FirestoreClient,
  accessToken: string,
  messId: string,
  messName: string,
  jobName: 'lunch_reminder' | 'dinner_reminder',
  mealKey: 'lunch' | 'dinner',
  date: string,
  members: { uid: string; name: string }[],
  tokens: Map<string, string>,
  summary: TickSummary,
) {
  const runId = `${jobName}_${date}`;
  const runPath = `messes/${messId}/notification_runs/${runId}`;

  // Idempotency check: has this run already occurred today?
  const existing = await db.get(runPath).catch(() => null);
  if (existing) return;

  // Mark in-flight immediately to prevent concurrent triggers
  await db.create(`messes/${messId}/notification_runs`, {
    job: jobName,
    date,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }, runId).catch((err) => {
    summary.errors.push(`${messId}/${runId} lock failed: ${String(err)}`);
  });

  try {
    // Check daily_meals for this mess today
    const mealDocs = await db.query<{ date?: string; user_id?: string; meals?: Record<string, number> }>(
      `daily_meals`,
      { field: 'date', op: 'EQUAL', value: date },
      { allDescendants: true, limit: 1000 },
    ).catch(() => []);

    // Find users who already entered this meal
    const alreadyLoggedUsers = new Set<string>();
    for (const meal of mealDocs) {
      const docMessId = messIdFromName(meal.name);
      if (docMessId !== messId) continue;
      const uid = meal.data.user_id;
      if (!uid) continue;

      // If user's meal map has this meal key explicitly defined
      const mealMap = meal.data.meals;
      if (mealMap && mealMap[mealKey] !== undefined && mealMap[mealKey] !== null) {
        alreadyLoggedUsers.add(uid);
      }
    }

    const recipients: Recipient[] = [];
    let skipped = 0;

    for (const member of members) {
      const token = tokens.get(member.uid);
      if (!token) {
        skipped += 1;
        continue;
      }
      if (alreadyLoggedUsers.has(member.uid)) {
        skipped += 1;
        continue;
      }
      recipients.push({ messId, messName, uid: member.uid, name: member.name, fcmToken: token });
    }

    const isLunch = mealKey === 'lunch';
    const title = isLunch ? `দুপুরের মিল এন্ট্রি দিন ☀️ · ${messName}` : `রাতের মিল এন্ট্রি দিন 🌙 · ${messName}`;
    const mealNameBn = isLunch ? 'দুপুরের' : 'রাতের';

    const result = await dispatchPush(env, db, accessToken, recipients, (r) => ({
      title,
      body: `${r.name}, আজকের ${mealNameBn} মিল কাউন্ট এখনো কনফার্ম করেননি। এখনই এন্ট্রি দিন।`,
      url: '/member/entry',
      tag: `${mealKey}-${messId}-${date}`,
    }));

    // Update notification run doc
    await db.update(runPath, {
      status: 'completed',
      sent: result.sent,
      failed: result.failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).catch(() => {});

    // Log globally
    await db.create('notification_logs', {
      job: jobName,
      mess_id: messId,
      mess_name: messName,
      date,
      sent: result.sent,
      failed: result.failed,
      skipped,
      ran_at: new Date().toISOString(),
    }).catch(() => {});

    summary.runs.push({
      messId,
      messName,
      job: jobName,
      sent: result.sent,
      failed: result.failed,
      skipped,
    });
    if (result.errors.length) summary.errors.push(...result.errors);
  } catch (err) {
    summary.errors.push(`${messId}/${runId} execution error: ${String(err)}`);
  }
}

async function processBazarReminder(
  env: Env,
  db: FirestoreClient,
  accessToken: string,
  messId: string,
  messName: string,
  date: string,
  members: { uid: string; name: string }[],
  tokens: Map<string, string>,
  summary: TickSummary,
) {
  const runId = `bazar_reminder_${date}`;
  const runPath = `messes/${messId}/notification_runs/${runId}`;

  const existing = await db.get(runPath).catch(() => null);
  if (existing) return;

  await db.create(`messes/${messId}/notification_runs`, {
    job: 'bazar_reminder',
    date,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }, runId).catch((err) => {
    summary.errors.push(`${messId}/${runId} lock failed: ${String(err)}`);
  });

  try {
    const scheduleDocs = await db.query<{ date?: string; assigned_user_id?: string }>(
      `bazar_schedule`,
      { field: 'date', op: 'EQUAL', value: date },
      { allDescendants: true, limit: 500 },
    ).catch(() => []);

    const recipients: Recipient[] = [];
    let skipped = 0;

    for (const doc of scheduleDocs) {
      const docMessId = messIdFromName(doc.name);
      if (docMessId !== messId) continue;
      const uid = doc.data.assigned_user_id;
      if (!uid) continue;

      const member = members.find((m) => m.uid === uid);
      const token = tokens.get(uid);
      if (!member || !token) {
        skipped += 1;
        continue;
      }
      recipients.push({ messId, messName, uid, name: member.name, fcmToken: token });
    }

    const result = await dispatchPush(env, db, accessToken, recipients, (r) => ({
      title: `আজ আপনার বাজারের দিন 🛒 · ${messName}`,
      body: `${r.name}, আজকের বাজারের দায়িত্ব আপনার। বাজার খরচ এন্ট্রি দিতে ভুলবেন না।`,
      url: '/member/entry',
      tag: `bazar-${messId}-${date}`,
    }));

    await db.update(runPath, {
      status: 'completed',
      sent: result.sent,
      failed: result.failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).catch(() => {});

    await db.create('notification_logs', {
      job: 'bazar_reminder',
      mess_id: messId,
      mess_name: messName,
      date,
      sent: result.sent,
      failed: result.failed,
      skipped,
      ran_at: new Date().toISOString(),
    }).catch(() => {});

    summary.runs.push({
      messId,
      messName,
      job: 'bazar_reminder',
      sent: result.sent,
      failed: result.failed,
      skipped,
    });
    if (result.errors.length) summary.errors.push(...result.errors);
  } catch (err) {
    summary.errors.push(`${messId}/${runId} execution error: ${String(err)}`);
  }
}

/** Broadcasts a notice notification to all members of a specific mess. */
export async function runNoticeBroadcast(
  env: Env,
  messId: string,
  notice: { id?: string; title: string; content: string; priority?: string },
): Promise<{ ok: boolean; sent: number; failed: number; errors: string[] }> {
  const { db, accessToken } = await connect(env);

  const messDoc = await db.get<MessDoc>(`messes/${messId}`);
  if (!messDoc) return { ok: false, sent: 0, failed: 0, errors: ['Mess not found'] };

  const messName = messDoc.data.name || messId;

  // Load members of this mess
  const memberDocs = await db.query<MemberDoc>(`messes/${messId}/members`, {
    field: 'status',
    op: 'EQUAL',
    value: 'active',
  });

  const uids = memberDocs.map((m) => m.data.uid || m.id);
  if (uids.length === 0) return { ok: true, sent: 0, failed: 0, errors: [] };

  // Load tokens for these users
  const userDocs = await db.query<UserDoc>('users', { field: 'fcm_token', op: 'GREATER_THAN', value: '' }, { limit: 5000 });
  const tokenMap = new Map<string, string>();
  for (const u of userDocs) if (u.data.fcm_token) tokenMap.set(u.id, u.data.fcm_token);

  const recipients: Recipient[] = [];
  for (const m of memberDocs) {
    const uid = m.data.uid || m.id;
    const token = tokenMap.get(uid);
    if (!token) continue;
    recipients.push({
      messId,
      messName,
      uid,
      name: m.data.name || 'Member',
      fcmToken: token,
    });
  }

  const priorityLabel = notice.priority === 'urgent' ? '🚨 [জরুরি]' : notice.priority === 'important' ? '⚠️ [গুরুত্বপূর্ণ]' : '📢';
  const cleanSnippet = (notice.content || '').replace(/\s+/g, ' ').trim().slice(0, 100);

  const result = await dispatchPush(env, db, accessToken, recipients, (r) => ({
    title: `${priorityLabel} ${notice.title} · ${r.messName}`,
    body: cleanSnippet || notice.title,
    url: '/',
    tag: `notice-${messId}-${notice.id || Date.now()}`,
  }));

  return { ok: true, sent: result.sent, failed: result.failed, errors: result.errors };
}

/** One push to a single user's registered browser, used by in-app test button. */
export async function runTestPush(env: Env, uid: string): Promise<{ ok: boolean; reason?: string; error?: string }> {
  const { db, accessToken } = await connect(env);

  const user = await db.get<UserDoc>(`users/${uid}`);
  if (!user?.data.fcm_token) {
    return { ok: false, reason: 'no-token' };
  }

  const recipient: Recipient = {
    messId: 'test',
    messName: 'আমাদের মেস',
    uid,
    name: user.data.name || 'Member',
    fcmToken: user.data.fcm_token,
  };

  const result = await dispatchPush(env, db, accessToken, [recipient], () => ({
    title: 'টেস্ট নোটিফিকেশন ✅',
    body: `${recipient.name}, পুশ নোটিফিকেশন ঠিকমতো কাজ করছে।`,
    url: '/',
    tag: 'test',
  }));

  return { ok: result.sent > 0, error: result.errors[0] };
}
