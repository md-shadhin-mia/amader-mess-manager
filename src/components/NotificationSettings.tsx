import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  PUSH_WORKER_URL,
  enablePushNotifications,
  getPushStatus,
  listenForForegroundPushes,
  sendTestPush,
  type PushStatus,
} from '../notifications';

/**
 * Lets a signed-in user turn on browser push notifications and fire a test
 * push through the Cloudflare Worker to confirm the whole chain works.
 */
export default function NotificationSettings() {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = Boolean(userProfile?.fcm_token);

  useEffect(() => {
    let cancelled = false;
    void getPushStatus(hasToken).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => { cancelled = true; };
  }, [hasToken]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void listenForForegroundPushes((title, body) => {
      setMessage(`${t('pushReceived')}: ${title}${body ? ` — ${body}` : ''}`);
    }).then((stop) => { unsubscribe = stop; });
    return () => unsubscribe?.();
  }, [t]);

  if (!userProfile) return null;

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await enablePushNotifications(userProfile.uid);
      setStatus('enabled');
      setMessage(t('pushEnabled'));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      console.error('Could not enable push notifications:', err);
      if (code === 'denied') setStatus('denied');
      setMessage(code === 'denied' ? t('pushDenied') : t('pushEnableFailed'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPush();
      setMessage(result.ok ? t('pushTestSent') : `${t('pushTestFailed')} (${result.message})`);
    } catch (err) {
      console.error('Could not send the test push:', err);
      setMessage(t('pushTestFailed'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel: Record<PushStatus | 'loading', string> = {
    loading: t('loading'),
    unsupported: t('pushUnsupported'),
    'not-configured': t('pushNotConfigured'),
    denied: t('pushDenied'),
    enabled: t('pushStatusOn'),
    disabled: t('pushStatusOff'),
  };

  const canEnable = status === 'disabled' || status === 'enabled';
  const canTest = status === 'enabled' && Boolean(PUSH_WORKER_URL);

  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-lg font-medium text-gray-900 mb-1">{t('pushNotifications')}</h2>
      <p className="text-sm text-gray-500 mb-4">{t('pushDescription')}</p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            status === 'enabled' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {statusLabel[status]}
        </span>

        {canEnable && (
          <button
            onClick={enable}
            disabled={busy}
            className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'enabled' ? t('pushRefresh') : t('pushEnable')}
          </button>
        )}

        {canTest && (
          <button
            onClick={test}
            disabled={busy}
            className="text-sm font-medium bg-white text-blue-700 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {t('pushSendTest')}
          </button>
        )}
      </div>

      {status === 'enabled' && !PUSH_WORKER_URL && (
        <p className="text-xs text-gray-400 mt-3">{t('pushWorkerMissing')}</p>
      )}

      {message && <p className="text-sm text-gray-700 mt-3">{message}</p>}
    </section>
  );
}
