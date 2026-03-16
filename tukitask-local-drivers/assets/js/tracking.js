/**
 * Customer Order Tracking JS
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        var $cont = $('.tukitask-tracking-pro');
        if (!$cont.length) return;

        mapboxgl.accessToken = tukitaskTracking.mapboxKey;

        // ABSOLUTE COORDINATE LOCK
        const rawLat = String(tukitaskTracking.defaultLat || '-25.302466').trim().replace(',', '.');
        const rawLng = String(tukitaskTracking.defaultLng || '-57.681781').trim().replace(',', '.');

        const centerLng = isNaN(parseFloat(rawLng)) ? -57.681781 : parseFloat(rawLng);
        const centerLat = isNaN(parseFloat(rawLat)) ? -25.302466 : parseFloat(rawLat);

        var map = new mapboxgl.Map({
            container: 'tukitask-tracking-map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [centerLng, centerLat],
            zoom: 13
        });

        var driverMarker = null;
        var driverMarkerEl = null;
        var lastDriverUpdate = 0;
        var STALE_TIMEOUT = 60000; // 60 seconds without update = stale

        function updateTracking() {
            $.ajax({
                url: tukitaskTracking.restUrl + '/' + $cont.data('order-id') + '/tracking',
                type: 'GET',
                data: { order_key: $cont.data('order-key') },
                success: function (data) {
                    if (data.driver && data.driver.lat) {
                        lastDriverUpdate = Date.now();
                        if (!driverMarker) {
                            driverMarkerEl = document.createElement('div');
                            driverMarkerEl.className = 'tukitask-driver-marker';
                            driverMarkerEl.style.cssText = 'width:20px;height:20px;background:#4f46e5;border:3px solid #fff;border-radius:50%;transition:opacity .3s;';
                            driverMarker = new mapboxgl.Marker(driverMarkerEl)
                                .setLngLat([data.driver.lng, data.driver.lat])
                                .addTo(map);
                        } else {
                            driverMarker.setLngLat([data.driver.lng, data.driver.lat]);
                            // Restore normal appearance
                            driverMarkerEl.style.opacity = '1';
                            driverMarkerEl.style.borderStyle = 'solid';
                        }
                    }
                }
            });
        }

        // Detect stale driver location
        setInterval(function () {
            if (driverMarkerEl && lastDriverUpdate && (Date.now() - lastDriverUpdate) > STALE_TIMEOUT) {
                driverMarkerEl.style.opacity = '0.4';
                driverMarkerEl.style.borderStyle = 'dashed';
            }
        }, 5000);

        updateTracking();
        setInterval(function() { if (!document.hidden) updateTracking(); }, 15000);
    });

})(jQuery);
