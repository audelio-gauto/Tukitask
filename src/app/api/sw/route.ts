import { NextResponse } from 'next/server';

/**
 * Serves /sw.js — a combined service worker that handles:
 *   1. FCM background push notifications (Firebase Messaging)
 *   2. PWA caching strategy (Cache-First for static, Network-First for pages)
 *
 * Served via the rewrite: /sw.js → /api/sw
 * Headers set in next.config.ts: Content-Type + Service-Worker-Allowed: /
 */
export async function GET(): Promise<Response> {
  const cfg = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             ?? '',
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN         ?? '',
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID          ?? '',
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? '',
  };
  const hasFirebase = Boolean(cfg.apiKey && cfg.projectId && cfg.messagingSenderId);

  const sw = `
/* ─────────────────────────────────────────────────────────────────────────
   TukiTask Service Worker  —  v2.0
   Handles: FCM background notifications + PWA offline caching
   ───────────────────────────────────────────────────────────────────────── */

const CACHE_NAME   = 'tuki-cache-v2';
const OFFLINE_URL  = '/offline.html';
const STATIC_EXTS  = /\\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)(\\?.*)?$/;
const STATIC_PATHS = /^\\/_next\\/static\\//;

/* ── Install: precache shell ───────────────────────────────────────────── */
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        '/offline.html',
        '/api/logo',
        '/manifest.json',
      ]);
    })
  );
});

/* ── Activate: prune old caches ────────────────────────────────────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ── Fetch: caching strategy ───────────────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  var req = event.request;
  var url = new URL(req.url);

  // Only handle GET requests from our origin
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Never cache API routes or Firebase SW (let those go to network)
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/firebase-messaging-sw.js') return;

  // Next.js static chunks (_next/static) — cache-first (they are immutable hashed)
  if (STATIC_PATHS.test(url.pathname) || STATIC_EXTS.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Navigation requests — network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(req));
    return;
  }
});

function cacheFirst(req) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetch(req).then(function(res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
      }
      return res;
    }).catch(function() {
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    });
  });
}

function networkFirstNavigate(req) {
  return fetch(req).then(function(res) {
    if (res && res.ok) {
      var clone = res.clone();
      caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
    }
    return res;
  }).catch(function() {
    return caches.match(req).then(function(cached) {
      return cached || caches.match(OFFLINE_URL);
    });
  });
}

/* ── Background Sync: retry failed POSTs when back online ─────────────── */
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending') {
    // Notify the app to retry pending operations
    self.clients.matchAll().then(function(clients) {
      clients.forEach(function(c) { c.postMessage({ type: 'SYNC_PENDING' }); });
    });
  }
});

${hasFirebase ? `
/* ── Firebase Cloud Messaging ─────────────────────────────────────────── */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(cfg)});
var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var notif   = payload.notification || {};
  var title   = notif.title || 'TukiTask';
  var body    = notif.body  || '';
  var icon    = notif.icon  || '/icons/icon-192x192.png';
  var badge   = '/icons/icon-192x192.png';
  var tag     = (payload.data && payload.data.group_key) || title;
  var url     = (payload.data && payload.data.url) || '/';

  self.registration.showNotification(title, {
    body:      body,
    icon:      icon,
    badge:     badge,
    tag:       tag,
    renotify:  true,
    vibrate:   [200, 100, 200],
    data:      { url: url },
    actions: [
      { action: 'open',    title: 'Ver'    },
      { action: 'dismiss', title: 'Cerrar' },
    ],
  });
});
` : `
// Firebase config not set — push disabled (set NEXT_PUBLIC_FIREBASE_* env vars)
`}

/* ── Notification click handler ────────────────────────────────────────── */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.includes(location.origin) && 'focus' in c) {
          c.focus();
          return c.navigate ? c.navigate(targetUrl) : undefined;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
`.trim();

  return new Response(sw, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-store, no-cache',
    },
  });
}
