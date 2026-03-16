/**
 * Admin Business Intelligence JavaScript.
 */
(function ($) {
    'use strict';

    var driverMarkers = {};
    var map;

    $(document).ready(function () {
        initTukiBIMap();
        // initGrowthChart(); // Can be added back later if needed
    });

    function initTukiBIMap() {
        if (!$('#tukitask-heatmap').length) return;

        $('#tukitask-heatmap').css({
            'min-height': '500px',
            'background': '#0f172a',
            'position': 'relative',
            'border-radius': '12px'
        });

        if (!tukitaskBI.mapboxKey) {
            $('#tukitask-heatmap').html('<div style="padding:20px; text-align:center; color:#ef4444;">Mapbox API Key Mising</div>');
            return;
        }

        try {
            mapboxgl.accessToken = tukitaskBI.mapboxKey;

            // ABSOLUTE COORDINATE LOCK
            const rawLat = String(tukitaskBI.defaultLat || '-25.302466').trim().replace(',', '.');
            const rawLng = String(tukitaskBI.defaultLng || '-57.681781').trim().replace(',', '.');

            const centerLng = isNaN(parseFloat(rawLng)) ? -57.681781 : parseFloat(rawLng);
            const centerLat = isNaN(parseFloat(rawLat)) ? -25.302466 : parseFloat(rawLat);

            console.log('TukiBI: MANDATORY CENTER ->', centerLng, centerLat);

            map = new mapboxgl.Map({
                container: 'tukitask-heatmap',
                style: 'mapbox://styles/mapbox/dark-v11',
                center: [centerLng, centerLat],
                zoom: 13,
                pitch: 45
            });

            map.addControl(new mapboxgl.NavigationControl(), 'top-right');

            map.on('load', function () {
                // Orders Heatmap
                $.ajax({
                    url: tukitaskBI.restUrl,
                    type: 'GET',
                    beforeSend: (xhr) => xhr.setRequestHeader('X-WP-Nonce', tukitaskBI.nonce),
                    success: function (data) {
                        if (!data.features || data.features.length === 0) return;
                        map.addSource('orders', { type: 'geojson', data: data });
                        map.addLayer({
                            id: 'orders-heat',
                            type: 'heatmap',
                            source: 'orders',
                            paint: {
                                'heatmap-weight': 1,
                                'heatmap-intensity': 3,
                                'heatmap-color': [
                                    'interpolate', ['linear'], ['heatmap-density'],
                                    0, 'rgba(0,0,0,0)',
                                    0.2, '#1e3a8a',
                                    0.4, '#3b82f6',
                                    0.6, '#f59e0b',
                                    0.8, '#ef4444',
                                    1, '#7f1d1d'
                                ],
                                'heatmap-radius': 30,
                                'heatmap-opacity': 0.7
                            }
                        });
                    }
                });

                // Drivers
                function refreshDrivers() {
                    $.ajax({
                        url: tukitaskBI.driversRestUrl,
                        type: 'GET',
                        beforeSend: (xhr) => xhr.setRequestHeader('X-WP-Nonce', tukitaskBI.nonce),
                        success: function (drivers) {
                            drivers.forEach(driver => {
                                if (!driver.lat || !driver.lng) return;
                                const elId = 'bi-' + driver.id;
                                const color = (driver.status === 'available') ? '#10b981' : '#f59e0b';
                                if (driverMarkers[elId]) {
                                    driverMarkers[elId].setLngLat([driver.lng, driver.lat]);
                                } else {
                                    const el = document.createElement('div');
                                    el.innerHTML = `<div style="width:12px; height:12px; border-radius:50%; background:${color}; border:2px solid #fff; box-shadow:0 0 10px ${color};"></div>`;
                                    driverMarkers[elId] = new mapboxgl.Marker(el)
                                        .setLngLat([driver.lng, driver.lat])
                                        .addTo(map);
                                }
                            });
                        }
                    });
                }
                refreshDrivers();
                setInterval(function() { if (!document.hidden) refreshDrivers(); }, 20000);
            });
        } catch (e) { console.error('Map Load Error', e); }
    }

    function initGrowthChart() {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                datasets: [{
                    label: 'GMV ($)',
                    data: [1200, 1900, 3000, 2800, 3500, 4200],
                    backgroundColor: '#4f46e5',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

})(jQuery);
