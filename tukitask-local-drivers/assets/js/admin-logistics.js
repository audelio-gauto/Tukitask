/**
 * Admin Logistics Pro JS
 */
(function ($) {
    'use strict';

    var driverMarkers = {};
    var orderMarkers = {};
    var map;

    $(document).ready(function () {
        if (!$('#tukitask-admin-map').length) return;

        mapboxgl.accessToken = tukitaskLogistica.mapboxKey;

        // ABSOLUTE COORDINATE LOCK
        const rawLat = String(tukitaskLogistica.defaultLat || '-25.302466').trim().replace(',', '.');
        const rawLng = String(tukitaskLogistica.defaultLng || '-57.681781').trim().replace(',', '.');

        const centerLng = isNaN(parseFloat(rawLng)) ? -57.681781 : parseFloat(rawLng);
        const centerLat = isNaN(parseFloat(rawLat)) ? -25.302466 : parseFloat(rawLat);

        console.log('Logistics: MANDATORY CENTER ->', centerLng, centerLat);

        map = new mapboxgl.Map({
            container: 'tukitask-admin-map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [centerLng, centerLat],
            zoom: 13
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        function updateFleet() {
            // Drivers
            $.ajax({
                url: tukitaskLogistica.restUrl,
                type: 'GET',
                beforeSend: (xhr) => xhr.setRequestHeader('X-WP-Nonce', tukitaskLogistica.nonce),
                success: function (drivers) {
                    $('#count-drivers').text(drivers.length);
                    drivers.forEach(driver => {
                        if (!driver.lat || !driver.lng) return;
                        const elId = 'd-' + driver.id;
                        if (driverMarkers[elId]) {
                            driverMarkers[elId].setLngLat([driver.lng, driver.lat]);
                        } else {
                            const el = document.createElement('div');
                            el.className = 'driver-marker';
                            if (driver.avatar) el.style.backgroundImage = `url('${driver.avatar}')`;
                            const color = driver.status === 'available' ? '#10b981' : '#f59e0b';
                            el.style.borderColor = color;
                            driverMarkers[elId] = new mapboxgl.Marker(el)
                                .setLngLat([driver.lng, driver.lat])
                                .addTo(map);
                        }
                    });
                }
            });

            // Orders
            $.ajax({
                url: tukitaskLogistica.restUrl.replace('/drivers', '/orders/active'),
                type: 'GET',
                beforeSend: (xhr) => xhr.setRequestHeader('X-WP-Nonce', tukitaskLogistica.nonce),
                success: function (orders) {
                    $('#count-orders').text(orders.length);
                    orders.forEach(order => {
                        if (!order.lat || !order.lng) return;
                        const elId = 'o-' + order.id;
                        if (!orderMarkers[elId]) {
                            const el = document.createElement('div');
                            el.className = 'order-marker';
                            el.innerHTML = '<i class="dashicons dashicons-cart"></i>';
                            orderMarkers[elId] = new mapboxgl.Marker(el)
                                .setLngLat([order.lng, order.lat])
                                .addTo(map);
                        }
                    });
                }
            });
        }

        updateFleet();
        setInterval(function() { if (!document.hidden) updateFleet(); }, 20000);
    });

})(jQuery);
