import type { Env } from './env';
import { verifyFirebaseIdToken } from './google-auth';
import { runBazarReminder, runMealReminder, runTestPush, type JobName, type JobReport, type Trigger } from './jobs';

type ScheduledJob = Exclude<JobName, 'test'>;

const JOB_RUNNERS: Record<ScheduledJob, (env: Env, trigger: Trigger) => Promise<JobReport>> = {
  meal_reminder: runMealReminder,
  bazar_reminder: runBazarReminder,
};

function jobForCron(env: Env, cron: string): ScheduledJob | null {
  if (cron === (env.MEAL_REMINDER_CRON || '0 14 * * *')) return 'meal_reminder';
  if (cron === (env.BAZAR_REMINDER_CRON || '0 2 * * *')) return 'bazar_reminder';
  return null;
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = allowed === '*' || allowed.split(',').map((o) => o.trim()).includes(origin) ? origin || '*' : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  /** Cron entry point. Cloudflare calls this for every expression in wrangler.toml [triggers]. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const job = jobForCron(env, event.cron);
    if (!job) {
      console.warn(`No job mapped to cron "${event.cron}"; check MEAL_REMINDER_CRON / BAZAR_REMINDER_CRON`);
      return;
    }
    ctx.waitUntil(
      JOB_RUNNERS[job](env, 'cron')
        .then((report) => console.log(`[${job}] sent=${report.sent} failed=${report.failed} skipped=${report.skipped}`))
        .catch((err: unknown) => console.error(`[${job}] failed`, err)),
    );
  },

  /**
   * HTTP entry point.
   *   GET  /            health check
   *   POST /test        send a test push to the caller (Authorization: Bearer <Firebase ID token>)
   *   POST /run/<job>   run meal_reminder or bazar_reminder now (X-Admin-Key: <ADMIN_KEY>)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json(
        {
          ok: true,
          service: 'mess-push',
          project: env.FIREBASE_PROJECT_ID,
          jobs: {
            meal_reminder: env.MEAL_REMINDER_CRON || '0 14 * * *',
            bazar_reminder: env.BAZAR_REMINDER_CRON || '0 2 * * *',
          },
          configured: Boolean(env.FIREBASE_SERVICE_ACCOUNT),
        },
        200,
        cors,
      );
    }

    if (request.method === 'POST' && url.pathname === '/test') {
      const auth = request.headers.get('Authorization') || '';
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!idToken) return json({ error: 'missing-id-token' }, 401, cors);

      let uid: string;
      try {
        ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
      } catch (err) {
        return json({ error: 'invalid-id-token', message: String(err instanceof Error ? err.message : err) }, 401, cors);
      }

      try {
        const report = await runTestPush(env, uid);
        if (report.reason === 'no-token') {
          return json({ ok: false, error: 'no-token', message: 'Enable notifications in the app first.' }, 409, cors);
        }
        if (report.sent === 0) {
          return json({ ok: false, error: 'send-failed', message: report.errors[0] || 'FCM rejected the message.' }, 502, cors);
        }
        return json({ ok: true, message: 'Test notification sent.', report }, 200, cors);
      } catch (err) {
        console.error('Test push failed', err);
        return json({ ok: false, error: 'worker-error', message: String(err instanceof Error ? err.message : err) }, 500, cors);
      }
    }

    const runMatch = request.method === 'POST' && url.pathname.match(/^\/run\/(meal_reminder|bazar_reminder)$/);
    if (runMatch) {
      if (!env.ADMIN_KEY) return json({ error: 'admin-key-not-configured' }, 503, cors);
      const provided = request.headers.get('X-Admin-Key') || '';
      if (!timingSafeEqual(provided, env.ADMIN_KEY)) return json({ error: 'forbidden' }, 403, cors);

      const job = runMatch[1] as ScheduledJob;
      try {
        const report = await JOB_RUNNERS[job](env, 'manual');
        return json({ ok: true, report }, 200, cors);
      } catch (err) {
        console.error(`[${job}] manual run failed`, err);
        return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500, cors);
      }
    }

    return json({ error: 'not-found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
