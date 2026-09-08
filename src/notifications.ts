import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { auth, db } from './firebase';
import { userRef } from './lib/paths';

const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BLF0plxm5MAgzrV66daoBIQSpx0_gA64UxiUwDNpBKlxoVuGQWtVphKu676S3Hwq0-uZo7msMKCFxxM0PAKz9Io';
export const PUSH_WORKER_URL = (
  import.meta.env.VITE_PUSH_WORKER_URL || 'https://mess-push.mshadhinkn.workers.dev'
).replace(/\/$/, '');

export type PushStatus = 'unsupported' | 'not-configured' | 'denied' | 'enabled' | 'disabled';

let messagingPromise: Promise<Messaging | null> | null = null;

async function messagingOrNull(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => (supported ? getMessaging(getApp()) : null))
      .catch(() => null);
  }
  return messagingPromise;
}

export async function getPushStatus(hasToken: boolean): Promise<PushStatus> {
  if (typeof Notification === 'undefined' || !(await messagingOrNull())) return 'unsupported';
  if (!VAPID_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && hasToken ? 'enabled' : 'disabled';
}

/**
 * Asks for notification permission, registers the FCM service worker and
 * stores the resulting token on the signed-in user's profile so the
 * Cloudflare Worker can target this browser.
 */
export async function enablePushNotifications(uid: string): Promise<string> {
  const messaging = await messagingOrNull();
  if (!messaging) throw new Error('unsupported');
  if (!VAPID_KEY) throw new Error('not-configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('no-token');

  await updateDoc(userRef(db, uid), {
    fcm_token: token,
    fcm_token_updated_at: serverTimestamp(),
  });
  return token;
}

export async function listenForForegroundPushes(onPush: (title: string, body: string) => void) {
  const messaging = await messagingOrNull();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title;
    const body = payload.notification?.body || payload.data?.body || '';
    if (title) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: payload.data?.tag || 'mess-manager',
            data: { url: payload.data?.url || '/' },
          });
        }).catch(() => {
          try {
            new Notification(title, { body, icon: '/icon.svg' });
          } catch {
            // ignore
          }
        });
      }
      onPush(title, body);
    }
  });
}

/**
 * Asks the Cloudflare Worker to send a test push to the caller's own
 * registered browser. The worker verifies the Firebase ID token itself.
 */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  if (!PUSH_WORKER_URL) return { ok: false, message: 'not-configured' };
  const user = auth.currentUser;
  if (!user) return { ok: false, message: 'not-signed-in' };

  try {
    const idToken = await user.getIdToken();
    const response = await fetch(`${PUSH_WORKER_URL}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = (await response.json()) as { ok?: boolean; message?: string };
    return { ok: Boolean(data.ok), message: data.message || (data.ok ? 'Sent' : 'Failed') };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function broadcastNoticePush(params: {
  messId: string;
  id?: string;
  title: string;
  content: string;
  priority?: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!PUSH_WORKER_URL) return { ok: false, message: 'Worker URL missing' };
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return { ok: false, message: 'Not signed in' };

  try {
    const res = await fetch(`${PUSH_WORKER_URL}/notice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(params),
    });
    return (await res.json()) as { ok: boolean; message?: string };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
