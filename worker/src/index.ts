import type { Env } from './env';
import { verifyFirebaseIdToken } from './google-auth';
import {
  runScheduledTick,
  runNoticeBroadcast,
  runTestPush,
  DEFAULT_LUNCH_REMINDER_TIME,
  DEFAULT_DINNER_REMINDER_TIME,
  DEFAULT_BAZAR_REMINDER_TIME,
} from './jobs';

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
  /** Cron entry point. Cloudflare calls this every 5 minutes (crons = ["*\/5 * * * *"]). */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledTick(env)
        .then((summary) =>
          console.log(
            `[cron tick] checked=${summary.messes_checked} dispatched=${summary.runs.length} errors=${summary.errors.length}`,
          ),
        )
        .catch((err: unknown) => console.error('[cron tick] failed', err)),
    );
  },

  /**
   * HTTP entry point.
   *   GET  /            health check & info
   *   POST /test        send a test push to the caller
   *   POST /notice      broadcast a notice push to a mess's members
   *   POST /run/tick    trigger scheduled tick manually
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
          cron: '*/5 * * * *',
          schedule_defaults: {
            lunch_reminder: DEFAULT_LUNCH_REMINDER_TIME,
            dinner_reminder: DEFAULT_DINNER_REMINDER_TIME,
            bazar_reminder: DEFAULT_BAZAR_REMINDER_TIME,
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
        if (!report.ok) {
          return json({ ok: false, error: 'send-failed', message: report.error || 'FCM rejected the message.' }, 502, cors);
        }
        return json({ ok: true, message: 'Test notification sent.' }, 200, cors);
      } catch (err) {
        console.error('Test push failed', err);
        return json({ ok: false, error: 'worker-error', message: String(err instanceof Error ? err.message : err) }, 500, cors);
      }
    }

    if (request.method === 'POST' && url.pathname === '/notice') {
      const auth = request.headers.get('Authorization') || '';
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!idToken) return json({ error: 'missing-id-token' }, 401, cors);

      try {
        await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
      } catch (err) {
        return json({ error: 'invalid-id-token', message: String(err instanceof Error ? err.message : err) }, 401, cors);
      }

      try {
        const body = (await request.json()) as { messId?: string; id?: string; title?: string; content?: string; priority?: string };
        if (!body.messId || !body.title) {
          return json({ error: 'bad-request', message: 'messId and title are required' }, 400, cors);
        }

        const result = await runNoticeBroadcast(env, body.messId, {
          id: body.id,
          title: body.title,
          content: body.content || '',
          priority: body.priority,
        });

        return json({ ok: true, result }, 200, cors);
      } catch (err) {
        console.error('Notice broadcast failed', err);
        return json({ ok: false, error: 'worker-error', message: String(err instanceof Error ? err.message : err) }, 500, cors);
      }
    }

    if (request.method === 'POST' && url.pathname === '/run/tick') {
      if (!env.ADMIN_KEY) return json({ error: 'admin-key-not-configured' }, 503, cors);
      const provided = request.headers.get('X-Admin-Key') || '';
      if (!timingSafeEqual(provided, env.ADMIN_KEY)) return json({ error: 'forbidden' }, 403, cors);

      try {
        const summary = await runScheduledTick(env);
        return json({ ok: true, summary }, 200, cors);
      } catch (err) {
        console.error('Manual tick failed', err);
        return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500, cors);
      }
    }

    return json({ error: 'not-found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;

