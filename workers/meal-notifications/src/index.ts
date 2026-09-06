interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface NotificationSettings {
  enabled: boolean;
  morningTime: string;
  afternoonTime: string;
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreValue {
  booleanValue?: boolean;
  stringValue?: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  morningTime: '08:30',
  afternoonTime: '15:00',
};

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore';
const encoder = new TextEncoder();

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = `${base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status}`);

  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Google OAuth did not return an access token');
  return body.access_token;
}

function getBangladeshDateTime(scheduledTime: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(scheduledTime));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function fieldString(document: FirestoreDocument, field: string): string | undefined {
  return document.fields?.[field]?.stringValue;
}

function fieldBoolean(document: FirestoreDocument, field: string): boolean | undefined {
  return document.fields?.[field]?.booleanValue;
}

async function getSettings(env: Env, accessToken: string): Promise<NotificationSettings> {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/notifications`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return DEFAULT_SETTINGS;
  if (!response.ok) throw new Error(`Could not read notification settings: ${response.status}`);

  const document = await response.json() as FirestoreDocument;
  return {
    enabled: fieldBoolean(document, 'enabled') ?? DEFAULT_SETTINGS.enabled,
    morningTime: fieldString(document, 'morningTime') ?? DEFAULT_SETTINGS.morningTime,
    afternoonTime: fieldString(document, 'afternoonTime') ?? DEFAULT_SETTINGS.afternoonTime,
  };
}

async function acquireRunLock(env: Env, accessToken: string, id: string, scheduledAt: string): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/notification_runs?documentId=${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        scheduledAt: { stringValue: scheduledAt },
      },
    }),
  });
  if (response.status === 409) return false;
  if (!response.ok) throw new Error(`Could not create notification lock: ${response.status}`);
  return true;
}

async function getDeviceTokens(env: Env, accessToken: string): Promise<string[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'devices', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'notificationsEnabled' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
        limit: 40,
      },
    }),
  });
  if (!response.ok) throw new Error(`Could not read device tokens: ${response.status}`);

  const rows = await response.json() as Array<{ document?: FirestoreDocument }>;
  return rows
    .map((row) => row.document && fieldString(row.document, 'token'))
    .filter((token): token is string => Boolean(token));
}

async function sendNotification(env: Env, accessToken: string, token: string): Promise<void> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: 'আজকের মিলের আপডেট',
          body: 'হ্যালো! আজকের মিল আপডেট করবেন? আপনার জন্য সকালের ১টি ও রাতের ১টি মিল চালু রাখা আছে। পরিবর্তন করতে ট্যাপ করুন।',
        },
        webpush: {
          fcm_options: { link: `${env.APP_URL}/member/entry` },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`FCM send failed: ${response.status}`);
}

async function runScheduledNotifications(env: Env, scheduledTime: number): Promise<void> {
  const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const { date, time } = getBangladeshDateTime(scheduledTime);
  const settings = await getSettings(env, accessToken);
  if (!settings.enabled || (time !== settings.morningTime && time !== settings.afternoonTime)) return;

  const runId = `${date}_${time.replace(':', '-')}`;
  if (!await acquireRunLock(env, accessToken, runId, `${date}T${time}:00+06:00`)) return;

  const tokens = await getDeviceTokens(env, accessToken);
  const results = await Promise.allSettled(tokens.map((token) => sendNotification(env, accessToken, token)));
  const sent = results.filter((result) => result.status === 'fulfilled').length;
  console.log(JSON.stringify({ event: 'meal_reminder_sent', runId, recipients: tokens.length, sent }));
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledNotifications(env, controller.scheduledTime).catch((error: unknown) => {
      console.error(JSON.stringify({ event: 'meal_reminder_failed', error: String(error) }));
    }));
  },
} satisfies ExportedHandler<Env>;
