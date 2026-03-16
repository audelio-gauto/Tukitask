/**
 * Customer Location Detection for Tukitask Local Drivers Pro
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        initCustomerLocation();
    });

    function initCustomerLocation() {
        // Check if we already have location in a cookie/session (optional optimization)
        // For now, we ask once per session if not set.

        if (!navigator.geolocation) {
            console.log('Geolocation not supported');
            return;
        }

        // Ask for location permission
        navigator.geolocation.getCurrentPosition(
            function (position) {
                saveLocation(position.coords.latitude, position.coords.longitude);
            },
            function (error) {
                console.warn('Customer denied location access:', error.message);
            },
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 3600000 // 1 hour
            }
        );
    }

    function saveLocation(lat, lng) {
        console.log('Detected customer location:', lat, lng);

        $.ajax({
            url: tukitaskLocation.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_set_customer_location',
                security: tukitaskLocation.nonce,
                lat: lat,
                lng: lng
            },
            success: function (response) {
                if (response.success) {
                    // console.log('Location synced with server');
                    // Optional: trigger a UI update or page refresh if it's the first time
                }
            }
        });
    }

})(jQuery);
