import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { auth, db } from './firebase';
import { userRef } from './lib/paths';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
export const PUSH_WORKER_URL = (import.meta.env.VITE_PUSH_WORKER_URL || '').replace(/\/$/, '');

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

/** Shows pushes that arrive while the app tab is in the foreground. */
export async function listenForForegroundPushes(onPush: (title: string, body: string) => void) {
  const messaging = await messagingOrNull();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title;
    const body = payload.notification?.body || payload.data?.body || '';
    if (title) onPush(title, body);
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

  const idToken = await user.getIdToken();
  const response = await fetch(`${PUSH_WORKER_URL}/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, message: body.message || body.error || response.statusText };
}
