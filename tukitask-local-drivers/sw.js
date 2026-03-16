/**
 * TukiDrivers PWA Service Worker
 */

const CACHE_NAME = 'tukidrivers-v1';
const ASSETS = [
    '/',
    '/wp-admin/admin-ajax.php'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', event => {
    // Basic stale-while-revalidate for assets, network-first for AJAX
    if (event.request.url.includes('admin-ajax.php')) {
        return; // Don't cache dynamic requests
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});


// Firebase Messaging background handler (compatibilidad v9+)
self.addEventListener('push', function(event) {
    if (!event.data) return;
    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        payload = { title: 'TukiTask', body: 'Nuevo mensaje', url: '/' };
    }

    // Normalizar campos para FCM y Push API
    const notification = payload.notification || {};
    const title = payload.title || notification.title || 'TukiTask';
    const body = payload.body || notification.body || '';
    const icon = payload.icon || notification.icon || '/wp-content/plugins/tukitask-local-drivers/assets/img/icon-192.png';
    const badge = payload.badge || '/wp-content/plugins/tukitask-local-drivers/assets/img/icon-192.png';
    const vibrate = payload.vibrate || [200, 100, 200];
    const url = payload.url || notification.click_action || (payload.data && payload.data.url) || '/';

    const options = {
        body: body,
        icon: icon,
        badge: badge,
        vibrate: vibrate,
        data: Object.assign({}, payload.data || {}, { url: url }),
        actions: (payload.data && payload.data.actions) ? payload.data.actions : [ { action: 'open', title: 'Ver Pedido' } ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        (async function() {
            const data = event.notification && event.notification.data ? event.notification.data : {};
            const url = data.url || '/';

            // If action is accept/reject, call admin-ajax to respond
            if ( event.action === 'accept' || event.action === 'reject' ) {
                const ride_id = data.ride_id || data.rideId || null;
                if ( ride_id ) {
                    try {
                        // POST to admin-ajax with credentials (cookies) so server knows driver session
                        await fetch('/wp-admin/admin-ajax.php?action=tuki_driver_respond_ride&ride_id=' + encodeURIComponent(ride_id) + '&response=' + (event.action === 'accept' ? 'accept' : 'reject'), { method: 'POST', credentials: 'include' });
                        // Optionally open dashboard or show a small confirm window
                        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
                        if ( allClients.length > 0 ) {
                            allClients[0].focus();
                            allClients[0].postMessage({ tuki_action: 'ride_responded', ride_id: ride_id, response: event.action });
                        } else {
                            clients.openWindow(url);
                        }
                        return;
                    } catch (e) {
                        // ignore
                    }
                }
            }

            // Default: open the URL
            const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of allClients) {
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })()
    );
});

// Support for Firebase messaging v10+ compatibility: handle background messages forwarded by firebase
self.addEventListener('pushsubscriptionchange', function(event) {
    console.log('Push subscription change', event);
});
