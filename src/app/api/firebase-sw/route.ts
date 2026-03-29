import { NextResponse } from 'next/server';

/**
 * Serves public/firebase-messaging-sw.js with actual Firebase config values
 * injected from NEXT_PUBLIC_* environment variables.
 *
 * Reached via the rewrite: /firebase-messaging-sw.js → /api/firebase-sw
 * Service-Worker-Allowed: / header (set in next.config.ts) allows full-scope control.
 */
export async function GET(): Promise<Response> {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? '',
  };

  // Only serve non-empty config to avoid initializing Firebase with no credentials
  const hasConfig = Boolean(config.apiKey && config.projectId && config.messagingSenderId);

  const sw = `
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

${hasConfig ? `
firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = (payload.notification && payload.notification.title) || 'TukiDrivers';
  var body  = (payload.notification && payload.notification.body)  || '';
  var icon  = (payload.notification && payload.notification.icon)  || '/icons/icon-192x192.png';
  var tag   = (payload.data && payload.data.group_key) || title;
  self.registration.showNotification(title, {
    body: body,
    icon: icon,
    badge: '/icons/icon-192x192.png',
    data: payload.data || {},
    tag: tag,
    renotify: true,
  });
});
` : `
// Firebase config not available — push notifications disabled.
console.warn('[firebase-sw] Missing Firebase config. Set NEXT_PUBLIC_FIREBASE_* env vars.');
`}

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
`.trim();

  return new NextResponse(sw, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    },
  });
}
