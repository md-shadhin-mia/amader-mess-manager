/* global importScripts, firebase, self, clients */
// Background handler for Firebase Cloud Messaging web push.
// Must live at the site root so it can control the whole origin.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Keep in sync with firebase-applet-config.json (these values are public client identifiers).
firebase.initializeApp({
  projectId: 'amader-mess-manager',
  appId: '1:506668450056:web:7d88f6db1a8f5a7a18acbd',
  storageBucket: 'amader-mess-manager.firebasestorage.app',
  apiKey: 'AIzaSyBMhy9-_zBfiO__Bp6uqhUezx8qIbcoTEQ',
  authDomain: 'amader-mess-manager.firebaseapp.com',
  messagingSenderId: '506668450056',
});

const messaging = firebase.messaging();

// Data-only messages (sent by the Cloudflare Worker) are shown here.
// Notification messages are displayed by the browser automatically.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  if (!data.title) return;
  self.registration.showNotification(data.title, {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'mess-manager',
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
