// firebase-messaging-sw.js
// Service Worker for FCM background push notifications.
// Must be at /public/firebase-messaging-sw.js (served from root).
// Config is injected at runtime via query params or hardcoded here.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Firebase config — values are replaced by the client when registering the SW
// via navigator.serviceWorker.register('/firebase-messaging-sw.js?...')
// OR hardcode them here for simplicity (they are public NEXT_PUBLIC_ values)
const firebaseConfig = {
  apiKey:            self.__FIREBASE_API_KEY__            || '',
  authDomain:        self.__FIREBASE_AUTH_DOMAIN__        || '',
  projectId:         self.__FIREBASE_PROJECT_ID__         || '',
  storageBucket:     self.__FIREBASE_STORAGE_BUCKET__     || '',
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || '',
  appId:             self.__FIREBASE_APP_ID__             || '',
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Background message handler — shows notification when app is in background/closed
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const notifTitle = title || 'TukiDrivers';
  const notifOptions = {
    body: body || '',
    icon: icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: payload.data || {},
    tag: payload.data?.group_key || notifTitle, // dedup by group_key
    renotify: true,
  };
  self.registration.showNotification(notifTitle, notifOptions);
});

// Click handler — focus/open app when user taps notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
