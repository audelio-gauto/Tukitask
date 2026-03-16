/**
 * Admin Tower of Control JS.
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        initTowerSimulator();
    });

    var simMarkers = { start: null, end: null };
    var map;

    function initTowerSimulator() {
        if (!$('#tower-simulator-map').length) return;

        mapboxgl.accessToken = tukiTower.mapboxKey;

        map = new mapboxgl.Map({
            container: 'tower-simulator-map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [parseFloat(tukiTower.defaultLng), parseFloat(tukiTower.defaultLat)],
            zoom: 12
        });

        map.on('click', function (e) {
            if (!simMarkers.start) {
                simMarkers.start = new mapboxgl.Marker({ color: '#10b981', draggable: true })
                    .setLngLat(e.lngLat)
                    .addTo(map);
                simMarkers.start.on('dragend', calculateSimPrice);
            } else if (!simMarkers.end) {
                simMarkers.end = new mapboxgl.Marker({ color: '#ef4444', draggable: true })
                    .setLngLat(e.lngLat)
                    .addTo(map);
                simMarkers.end.on('dragend', calculateSimPrice);
                calculateSimPrice();
            } else {
                // Reset
                simMarkers.start.remove();
                simMarkers.end.remove();
                simMarkers.start = null;
                simMarkers.end = null;
                $('#simulator-results').fadeOut();
                if (map.getSource('route')) map.removeLayer('route').removeSource('route');
            }
        });
    }

    function calculateSimPrice() {
        if (!simMarkers.start || !simMarkers.end) return;

        const start = simMarkers.start.getLngLat();
        const end = simMarkers.end.getLngLat();

        // 1. Calculate Haversine Distance (as backend does)
        const R = 6371; // km
        const dLat = (end.lat - start.lat) * Math.PI / 180;
        const dLon = (end.lng - start.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        // 2. Apply Pricing Logic
        const base = parseFloat(tukiTower.basePrice);
        const perKm = parseFloat(tukiTower.pricePerKm);
        const cost = base + (distance * perKm);

        // 3. Update UI
        $('#sim-dist').text(distance.toFixed(2) + ' km');
        $('#sim-cost').text('$' + cost.toFixed(2));
        $('#simulator-results').fadeIn();

        // 4. Draw simple line
        if (map.getSource('route')) {
            map.getSource('route').setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
            });
        } else {
            map.addSource('route', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
                }
            });
            map.addLayer({
                id: 'route',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#4f46e5', 'line-width': 4, 'line-dasharray': [2, 1] }
            });
        }
    }

})(jQuery);
