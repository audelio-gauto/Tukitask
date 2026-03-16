/**
 * Tukitask Demand Widget JS
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        if (!$('#demand-preview-map').length) return;

        mapboxgl.accessToken = tukitaskDemand.mapboxKey;

        // ABSOLUTE COORDINATE LOCK
        const rawLat = String(tukitaskDemand.defaultLat || '-25.302466').trim().replace(',', '.');
        const rawLng = String(tukitaskDemand.defaultLng || '-57.681781').trim().replace(',', '.');

        const centerLng = isNaN(parseFloat(rawLng)) ? -57.681781 : parseFloat(rawLng);
        const centerLat = isNaN(parseFloat(rawLat)) ? -25.302466 : parseFloat(rawLat);

        var map = new mapboxgl.Map({
            container: 'demand-preview-map',
            style: 'mapbox://styles/mapbox/light-v11',
            center: [centerLng, centerLat],
            zoom: 13
        });
    });

})(jQuery);
