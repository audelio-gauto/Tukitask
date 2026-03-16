(function($) {
    'use strict';

    $(document).ready(function() {
        // Botón "Reintentar búsqueda de driver" en panel vendedor
        $(document).on('click', '.retry-driver-search', function(e) {
            e.preventDefault();
            var $btn = $(this);
            var orderId = $btn.data('order-id');
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
            $.post(window.tukitaskDelivery?.ajaxUrl || window.ajaxurl, {
                action: 'tukitask_retry_driver_search',
                order_id: orderId,
                security: window.tukitaskDelivery?.vendedorNonce || window.tukitaskVendedor?.nonce || ''
            }).done(function(resp) {
                if(resp.success) {
                    $btn.closest('td').find('.badge').remove();
                    $btn.closest('td').prepend('<span class="badge info"><i class="fas fa-search"></i> Buscando conductor...</span>');
                    $btn.remove();
                    tukiToast(resp.data.message || 'Reintentando búsqueda de conductor', 'success');
                } else {
                    tukiToast(resp.data.message || 'Error al reintentar', 'error');
                    $btn.prop('disabled', false).html('<i class="fas fa-redo"></i> Reintentar búsqueda');
                }
            }).fail(function() {
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-redo"></i> Reintentar búsqueda');
            });
        });
    });
})(jQuery);
/**
 * Delivery Request JavaScript
 * Bottom Sheet UI — Bolt/Uber style
 */
(function($) {
    'use strict';

    function tukiSmartInterval(fn, ms) {
        return setInterval(function() {
            if (!document.hidden) fn();
        }, ms);
    }

    // Map instance
    let deliveryMap = null;
    let pickupMarker = null;
    let deliveryMarker = null;
    let routeLayer = null;
    let trackingMap = null;
    let driverMarker = null;
    let trackingInterval = null;

    // Bottom sheet state
    const SHEET_SMALL = 'small';
    const SHEET_MEDIUM = 'medium';
    const SHEET_FULL = 'full';
    let currentSheet = SHEET_SMALL;
    let isDragging = false;
    let dragStartY = 0;
    let sheetStartTranslate = 0;

    $(document).ready(function() {
        initAppMode();
        initDeliveryRequestForm();
        initMyDeliveries();
        initTrackingPage();
    });

    /* ======================================================================
       APP MODE — Fullscreen, hide WP chrome, drawer menu
       ====================================================================== */

    function initAppMode() {
        // Activate app mode if bolt UI form or tracking UI is on the page
        if (!$('#tuki-bolt-ui').length && !$('#tuki-tracking-ui').length) return;

        // Add app-mode class to body to hide WP header/footer
        $('body').addClass('tuki-app-mode');

        // Hamburger menu — delivery form
        $('#tuki-menu-btn').on('click', function() {
            $('#tuki-app-drawer').addClass('open');
        });
        $('#tuki-drawer-overlay').on('click', function() {
            $('#tuki-app-drawer').removeClass('open');
        });

        // Hamburger menu — tracking page
        $('#tuki-tracking-menu-btn').on('click', function() {
            $('#tuki-tracking-drawer').addClass('open');
        });
        $('#tuki-tracking-drawer-overlay').on('click', function() {
            $('#tuki-tracking-drawer').removeClass('open');
        });

        // Close any open drawer with Escape
        $(document).on('keydown', function(e) {
            if (e.key === 'Escape') {
                $('.tuki-app-drawer.open').removeClass('open');
            }
        });
    }

    /* ======================================================================
       BOTTOM SHEET MECHANICS
       ====================================================================== */

    function isDesktop() {
        return window.matchMedia('(min-width: 768px)').matches;
    }

    function initBottomSheet() {
        const $sheet = $('#tuki-bottom-sheet');
        const handle = document.getElementById('tuki-sheet-handle');
        if (!$sheet.length || !handle) return;

        // Allow drag from entire sheet, not just handle
        $sheet[0].addEventListener('touchstart', onDragStart, { passive: false });
        $sheet[0].addEventListener('mousedown', onDragStart);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('mouseup', onDragEnd);

        // On resize, recalculate layout
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (isDesktop()) {
                    // Desktop: remove transforms, show everything
                    $sheet[0].style.transform = '';
                    $sheet.removeClass('tuki-sheet-small tuki-sheet-medium tuki-sheet-full tuki-sheet-dragging');
                } else {
                    // Mobile: restore current state
                    setSheetState(currentSheet);
                }
                if (deliveryMap) deliveryMap.invalidateSize();
            }, 200);
        });
    }

    function getSheetHeight() {
        const $sheet = $('#tuki-bottom-sheet');
        return $sheet[0] ? $sheet[0].offsetHeight : 0;
    }

    function getCurrentTranslateY() {
        const $sheet = $('#tuki-bottom-sheet');
        const st = window.getComputedStyle($sheet[0]);
        const matrix = new DOMMatrix(st.transform);
        return matrix.m42;
    }

    function onDragStart(e) {
        // Disable dragging on desktop
        if (isDesktop()) return;
        // Don't drag when tapping interactive elements
        var tag = (e.target.tagName || '').toLowerCase();
        if (['button','input','textarea','select','a','label'].indexOf(tag) !== -1 || $(e.target).closest('button,a,input,textarea,select,.tuki-btn').length) return;

        isDragging = true;
        dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        sheetStartTranslate = getCurrentTranslateY();
        $('#tuki-bottom-sheet').addClass('tuki-sheet-dragging');
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const delta = y - dragStartY;
        const newY = Math.max(0, sheetStartTranslate + delta);
        $('#tuki-bottom-sheet')[0].style.transform = 'translateY(' + newY + 'px)';
        e.preventDefault();
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;

        const $sheet = $('#tuki-bottom-sheet');
        $sheet.removeClass('tuki-sheet-dragging');
        $sheet[0].style.transform = '';

        const finalY = getCurrentTranslateY();
        const height = getSheetHeight();
        const pct = finalY / height;

        if (pct > 0.7) {
            setSheetState(SHEET_SMALL);
        } else if (pct > 0.35) {
            setSheetState(SHEET_MEDIUM);
        } else {
            setSheetState(SHEET_FULL);
        }
    }

    function setSheetState(state) {
        const $sheet = $('#tuki-bottom-sheet');
        currentSheet = state;

        if (isDesktop()) {
            // Desktop: no transform states, panel always visible
            $sheet.removeClass('tuki-sheet-small tuki-sheet-medium tuki-sheet-full');
            $sheet[0].style.transform = '';
        } else {
            $sheet.removeClass('tuki-sheet-small tuki-sheet-medium tuki-sheet-full');
            $sheet.addClass('tuki-sheet-' + state);
        }

        if (deliveryMap) {
            setTimeout(function() { deliveryMap.invalidateSize(); }, 400);
        }
    }

    /* ======================================================================
       DELIVERY REQUEST FORM INIT
       ====================================================================== */

    function initDeliveryRequestForm() {
        const $form = $('#tuki-delivery-request-form');
        if (!$form.length) return;

        initDeliveryMap();
        initBottomSheet();

        // On desktop, hide sheet state classes (panel always visible)
        if (isDesktop()) {
            $('#tuki-bottom-sheet').removeClass('tuki-sheet-small tuki-sheet-medium tuki-sheet-full');
        }

        // Card selection (vehicle + package)
        $(document).on('click', '.tuki-bolt-card', function() {
            const $card = $(this);
            const $group = $card.closest('.tuki-bolt-cards');
            $group.find('.tuki-bolt-card').removeClass('selected');
            $card.addClass('selected');
            $card.find('input[type="radio"]').prop('checked', true).trigger('change');
        });

        // Dynamic package group switching
        $(document).on('change', 'input[name="vehicle_type"]', function() {
            const vehicle = $(this).val();
            $('.tuki-package-group').each(function() {
                const vehicles = $(this).data('vehicles').split(',');
                if (vehicles.indexOf(vehicle) !== -1) {
                    $(this).show();
                    if (!$(this).find('.tuki-bolt-card.selected').length) {
                        $(this).find('.tuki-bolt-card').first().addClass('selected')
                            .find('input[type="radio"]').prop('checked', true);
                    }
                } else {
                    $(this).hide().find('.tuki-bolt-card').removeClass('selected');
                }
            });
        });

        // Use current location buttons
        $(document).on('click', '.tuki-use-location', function(e) {
            e.preventDefault();
            getCurrentLocation($(this).data('target'));
        });

        // ===== Fullscreen Address Search Overlay =====
        // Open fullscreen search when tapping address fields
        $('#pickup_address, #delivery_address').on('focus', function(e) {
            e.preventDefault();
            $(this).blur();
            var target = $(this).attr('id').replace('_address', '');
            openAddressSearch(target);
        });

        // Calculate price button
        $('#tuki-calculate-btn').on('click', function() {
            calculatePrice();
        });

        // Recalculate on vehicle/package change
        $(document).on('change', 'input[name="package_type"], input[name="vehicle_type"]', function() {
            if ($('#pickup_lat').val() && $('#delivery_lat').val()) {
                calculatePrice();
            }
        });

        // Payment method card selection
        $(document).on('change', 'input[name="payment_method"]', function() {
            $('.tuki-payment-card').removeClass('selected');
            $(this).closest('.tuki-payment-card').addClass('selected');
        });

        // Form submission
        $form.on('submit', function(e) {
            e.preventDefault();
            submitDeliveryRequest();
        });
    }

    /* ======================================================================
       MAP
       ====================================================================== */

    function initDeliveryMap() {
        const mapContainer = document.getElementById('tuki-delivery-map');
        if (!mapContainer || typeof L === 'undefined') return;

        // Center on Asuncion, Paraguay
        const paraguayCenter = [-25.2637, -57.5759];

        deliveryMap = L.map('tuki-delivery-map', {
            zoomControl: false
        }).setView(paraguayCenter, 13);

        L.control.zoom({ position: 'topright' }).addTo(deliveryMap);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM'
        }).addTo(deliveryMap);

        // Paraguay flag marker at center
        const flagIcon = L.divIcon({
            className: 'tuki-py-flag',
            html: '\uD83C\uDDF5\uD83C\uDDFE',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        L.marker(paraguayCenter, { icon: flagIcon, interactive: false }).addTo(deliveryMap);

        // Click on map to set locations
        deliveryMap.on('click', function(e) {
            const pickupLat = $('#pickup_lat').val();
            const deliveryLat = $('#delivery_lat').val();
            if (!pickupLat) {
                setMapMarker('pickup', e.latlng.lat, e.latlng.lng);
                reverseGeocode(e.latlng.lat, e.latlng.lng, 'pickup');
            } else if (!deliveryLat) {
                setMapMarker('delivery', e.latlng.lat, e.latlng.lng);
                reverseGeocode(e.latlng.lat, e.latlng.lng, 'delivery');
            }
        });

        // Try user's current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                deliveryMap.setView([pos.coords.latitude, pos.coords.longitude], 14);
            }, null, { timeout: 5000 });
        }

        // Start polling for nearby drivers
        pollNearbyDrivers();
        nearbyDriversInterval = tukiSmartInterval(pollNearbyDrivers, 20000);
    }

    /* ======================================================================
       NEARBY DRIVERS ON MAP
       ====================================================================== */

    var nearbyDriverMarkers = {};
    var nearbyDriversInterval = null;

    var vehicleEmojis = {
        motorcycle: '🏍️',
        car:        '🚗',
        motocarro:  '🛵',
        truck_3000: '🚛',
        truck_5000: '🚚',
        van:        '🚐',
        bicycle:    '🚲'
    };

    function pollNearbyDrivers() {
        if (!deliveryMap) return;

        var center = deliveryMap.getCenter();

        $.ajax({
            url: tukitaskDelivery.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_get_nearby_drivers',
                security: tukitaskDelivery.nonce,
                lat: center.lat,
                lng: center.lng
            },
            success: function(response) {
                if (!response.success || !response.data.drivers) return;
                renderNearbyDrivers(response.data.drivers);
            }
        });
    }

    function renderNearbyDrivers(drivers) {
        if (!deliveryMap) return;

        // Track which drivers are in this update
        var activeIds = {};

        drivers.forEach(function(driver) {
            activeIds[driver.id] = true;
            var vehicleClass = 'vehicle-' + (driver.vehicle || 'motorcycle');
            var emoji = vehicleEmojis[driver.vehicle] || vehicleEmojis.motorcycle;

            if (nearbyDriverMarkers[driver.id]) {
                // Update existing marker position
                nearbyDriverMarkers[driver.id].setLatLng([driver.lat, driver.lng]);
            } else {
                // Create new marker
                var icon = L.divIcon({
                    className: 'tuki-driver-marker',
                    html: '<div class="tuki-driver-marker-inner ' + vehicleClass + '">' + emoji + '</div>',
                    iconSize: [44, 52],
                    iconAnchor: [22, 48]
                });

                nearbyDriverMarkers[driver.id] = L.marker(
                    [driver.lat, driver.lng],
                    { icon: icon, interactive: false, zIndexOffset: -100 }
                ).addTo(deliveryMap);
            }
        });

        // Remove markers for drivers no longer nearby
        Object.keys(nearbyDriverMarkers).forEach(function(id) {
            if (!activeIds[id]) {
                deliveryMap.removeLayer(nearbyDriverMarkers[id]);
                delete nearbyDriverMarkers[id];
            }
        });
    }

    /* ======================================================================
       GEOLOCATION & GEOCODING
       ====================================================================== */

    function getCurrentLocation(target) {
        if (!navigator.geolocation) {
            alert('Tu navegador no soporta geolocalizacion');
            return;
        }
        const $btn = $('.tuki-use-location[data-target="' + target + '"]');
        $btn.find('i').removeClass('fa-crosshairs').addClass('fa-spinner fa-spin');

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setMapMarker(target, lat, lng);
                reverseGeocode(lat, lng, target);
                $btn.find('i').removeClass('fa-spinner fa-spin').addClass('fa-crosshairs');
            },
            function() {
                alert('No se pudo obtener tu ubicacion');
                $btn.find('i').removeClass('fa-spinner fa-spin').addClass('fa-crosshairs');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    function setMapMarker(type, lat, lng) {
        if (!deliveryMap) return;

        const icon = L.divIcon({
            className: 'tuki-map-marker',
            html: '<div class="marker-icon marker-' + type + '"><i class="fas fa-' + (type === 'pickup' ? 'circle' : 'map-marker-alt') + '"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });

        if (type === 'pickup') {
            if (pickupMarker) {
                pickupMarker.setLatLng([lat, lng]);
            } else {
                pickupMarker = L.marker([lat, lng], { icon: icon, draggable: true }).addTo(deliveryMap);
                pickupMarker.on('dragend', function(e) {
                    var pos = e.target.getLatLng();
                    $('#pickup_lat').val(pos.lat);
                    $('#pickup_lng').val(pos.lng);
                    reverseGeocode(pos.lat, pos.lng, 'pickup');
                    updateRoute();
                });
            }
            $('#pickup_lat').val(lat);
            $('#pickup_lng').val(lng);
        } else {
            if (deliveryMarker) {
                deliveryMarker.setLatLng([lat, lng]);
            } else {
                deliveryMarker = L.marker([lat, lng], { icon: icon, draggable: true }).addTo(deliveryMap);
                deliveryMarker.on('dragend', function(e) {
                    var pos = e.target.getLatLng();
                    $('#delivery_lat').val(pos.lat);
                    $('#delivery_lng').val(pos.lng);
                    reverseGeocode(pos.lat, pos.lng, 'delivery');
                    updateRoute();
                });
            }
            $('#delivery_lat').val(lat);
            $('#delivery_lng').val(lng);
        }

        updateRoute();
        fitMapToBounds();

        // Auto-advance bottom sheet when both set
        if ($('#pickup_lat').val() && $('#delivery_lat').val() && currentSheet === SHEET_SMALL) {
            setSheetState(SHEET_MEDIUM);
        }
    }

    function updateRoute() {
        if (!deliveryMap || !pickupMarker || !deliveryMarker) return;

        var pickupLatLng = pickupMarker.getLatLng();
        var deliveryLatLng = deliveryMarker.getLatLng();

        if (routeLayer) {
            deliveryMap.removeLayer(routeLayer);
        }

        routeLayer = L.polyline([pickupLatLng, deliveryLatLng], {
            color: '#00c853',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(deliveryMap);

        var distance = pickupLatLng.distanceTo(deliveryLatLng) / 1000;
        var estimatedTime = Math.ceil((distance / 30) * 60);

        $('#route-distance').text(distance.toFixed(1));
        $('#route-time').text(estimatedTime);
        $('#tuki-route-info').show();
    }

    function fitMapToBounds() {
        if (!deliveryMap) return;
        var bounds = [];
        if (pickupMarker) bounds.push(pickupMarker.getLatLng());
        if (deliveryMarker) bounds.push(deliveryMarker.getLatLng());

        if (bounds.length === 2) {
            var pad = isDesktop() ? [80, 80] : [60, 60];
            deliveryMap.fitBounds(bounds, { padding: pad });
        } else if (bounds.length === 1) {
            deliveryMap.setView(bounds[0], 15);
        }
    }

    /* ======================================================================
       FULLSCREEN ADDRESS SEARCH
       ====================================================================== */

    var _searchTimeout = null;

    function openAddressSearch(target) {
        var currentVal = $('#' + target + '_address').val() || '';
        var placeholder = target === 'pickup' ? 'Buscar punto de recogida...' : '¿A dónde va el paquete?';
        var titleText = target === 'pickup' ? 'Punto de recogida' : 'Destino del paquete';
        var dotColor = target === 'pickup' ? '#10b981' : '#ef4444';

        var $overlay = $('<div id="tuki-address-search-overlay">' +
            '<div class="tuki-search-header">' +
                '<button type="button" class="tuki-search-back"><i class="fas fa-arrow-left"></i></button>' +
                '<div class="tuki-search-title">' +
                    '<span class="tuki-search-dot" style="background:' + dotColor + ';"></span>' +
                    '<span>' + titleText + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="tuki-search-input-wrap">' +
                '<i class="fas fa-search tuki-search-icon"></i>' +
                '<input type="text" class="tuki-search-input" placeholder="' + placeholder + '" value="' + $('<span>').text(currentVal).html() + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
                '<button type="button" class="tuki-search-clear" style="display:none;"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div class="tuki-search-results">' +
                '<div class="tuki-search-hint"><i class="fas fa-keyboard"></i> Escribe para buscar ubicaciones</div>' +
            '</div>' +
        '</div>');

        $('body').append($overlay);

        // Autofocus the search input
        var $searchInput = $overlay.find('.tuki-search-input');
        setTimeout(function() { $searchInput.focus(); }, 100);

        // Back button closes
        $overlay.find('.tuki-search-back').on('click', function() {
            closeAddressSearch();
        });

        // Clear button
        $overlay.find('.tuki-search-clear').on('click', function() {
            $searchInput.val('').focus();
            $(this).hide();
            $overlay.find('.tuki-search-results').html('<div class="tuki-search-hint"><i class="fas fa-keyboard"></i> Escribe para buscar ubicaciones</div>');
        });

        // Use current location option
        var $locBtn = $('<div class="tuki-search-result-item tuki-search-location">' +
            '<div class="tuki-search-result-icon" style="background:#e0f2fe;"><i class="fas fa-crosshairs" style="color:#0ea5e9;"></i></div>' +
            '<div class="tuki-search-result-text"><strong>Usar mi ubicación actual</strong><span>GPS</span></div>' +
        '</div>');
        $locBtn.on('click', function() {
            closeAddressSearch();
            getCurrentLocation(target);
        });
        $overlay.find('.tuki-search-results').prepend($locBtn);

        // Input handler with debounce
        $searchInput.on('input', function() {
            var val = $(this).val();
            $overlay.find('.tuki-search-clear').toggle(val.length > 0);

            clearTimeout(_searchTimeout);
            if (val.length < 3) {
                $overlay.find('.tuki-search-results').html('');
                $overlay.find('.tuki-search-results').prepend($locBtn);
                $overlay.find('.tuki-search-results').append('<div class="tuki-search-hint"><i class="fas fa-keyboard"></i> Escribe para buscar ubicaciones</div>');
                return;
            }

            // Show loading
            $overlay.find('.tuki-search-results').html('<div class="tuki-search-loading"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>');

            _searchTimeout = setTimeout(function() {
                $.ajax({
                    url: 'https://nominatim.openstreetmap.org/search',
                    data: {
                        q: val + ', Paraguay',
                        format: 'json',
                        limit: 8,
                        addressdetails: 1,
                        countrycodes: 'py'
                    },
                    success: function(results) {
                        var $results = $overlay.find('.tuki-search-results');
                        $results.html('');
                        $results.append($locBtn);

                        if (!results || results.length === 0) {
                            $results.append('<div class="tuki-search-hint"><i class="fas fa-map-marker-alt"></i> No se encontraron resultados</div>');
                            return;
                        }

                        results.forEach(function(item) {
                            var name = item.display_name.replace(/, Paraguay$/i, '');
                            // Split into main name and detail
                            var parts = name.split(', ');
                            var mainName = parts.slice(0, 2).join(', ');
                            var detail = parts.slice(2).join(', ');

                            var $item = $('<div class="tuki-search-result-item">' +
                                '<div class="tuki-search-result-icon"><i class="fas fa-map-marker-alt"></i></div>' +
                                '<div class="tuki-search-result-text">' +
                                    '<strong>' + $('<span>').text(mainName).html() + '</strong>' +
                                    '<span>' + $('<span>').text(detail).html() + '</span>' +
                                '</div>' +
                            '</div>');

                            $item.on('click', function() {
                                var lat = parseFloat(item.lat);
                                var lng = parseFloat(item.lon);
                                $('#' + target + '_address').val(name);
                                setMapMarker(target, lat, lng);
                                closeAddressSearch();
                            });

                            $results.append($item);
                        });
                    },
                    error: function() {
                        $overlay.find('.tuki-search-results').html('<div class="tuki-search-hint"><i class="fas fa-exclamation-circle"></i> Error de conexión. Intenta de nuevo.</div>');
                    }
                });
            }, 400);
        });

        // If there's already text, trigger search
        if (currentVal.length >= 3) {
            $searchInput.trigger('input');
        }
    }

    function closeAddressSearch() {
        clearTimeout(_searchTimeout);
        $('#tuki-address-search-overlay').remove();
    }

    function geocodeAddress(address, target) {
        if (!address || address.length < 5) return;
        $.ajax({
            url: 'https://nominatim.openstreetmap.org/search',
            data: { q: address + ', Paraguay', format: 'json', limit: 1 },
            success: function(results) {
                if (results && results.length > 0) {
                    var lat = parseFloat(results[0].lat);
                    var lng = parseFloat(results[0].lon);
                    setMapMarker(target, lat, lng);
                }
            }
        });
    }

    function reverseGeocode(lat, lng, target) {
        $.ajax({
            url: 'https://nominatim.openstreetmap.org/reverse',
            data: { lat: lat, lon: lng, format: 'json' },
            success: function(result) {
                if (result && result.display_name) {
                    $('#' + target + '_address').val(result.display_name);
                }
            }
        });
    }

    /* ======================================================================
       PRICE CALCULATION
       ====================================================================== */

    function calculatePrice() {
        var pickupLat = $('#pickup_lat').val();
        var pickupLng = $('#pickup_lng').val();
        var deliveryLat = $('#delivery_lat').val();
        var deliveryLng = $('#delivery_lng').val();

        if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) {
            alert('Por favor selecciona ambas ubicaciones en el mapa');
            return;
        }

        var $btn = $('#tuki-calculate-btn');
        var originalText = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> ' + tukitaskDelivery.strings.calculating);

        $.ajax({
            url: tukitaskDelivery.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_calculate_delivery_price',
                security: tukitaskDelivery.nonce,
                pickup_lat: pickupLat,
                pickup_lng: pickupLng,
                delivery_lat: deliveryLat,
                delivery_lng: deliveryLng,
                vehicle_type: $('input[name="vehicle_type"]:checked').val() || 'motorcycle',
                package_type: $('input[name="package_type"]:checked').val() || 'small'
            },
            success: function(response) {
                if (response.success) {
                    displayPrice(response.data);
                    $('#tuki-submit-btn').prop('disabled', false);
                } else {
                    alert(response.data.message || tukitaskDelivery.strings.error);
                }
            },
            error: function() {
                alert(tukitaskDelivery.strings.error);
            },
            complete: function() {
                $btn.prop('disabled', false).html(originalText);
            }
        });
    }

    function displayPrice(data) {
        $('#price-base').text(tukitaskDelivery.currency + data.base.toFixed(2));
        $('#price-distance-km').text(data.distance);
        $('#price-distance').text(tukitaskDelivery.currency + data.distance_price.toFixed(2));

        $('#price-total').text(tukitaskDelivery.currency + data.total.toFixed(2));

        if (currentSheet !== SHEET_FULL) {
            setSheetState(SHEET_FULL);
        }
    }

    /* ======================================================================
       SUBMIT DELIVERY
       ====================================================================== */

    function submitDeliveryRequest() {
        var $form = $('#tuki-delivery-request-form');
        var $btn = $('#tuki-submit-btn');

        var requiredFields = [
            'pickup_address', 'pickup_lat', 'pickup_lng', 'pickup_contact', 'pickup_phone',
            'delivery_address', 'delivery_lat', 'delivery_lng', 'delivery_contact', 'delivery_phone'
        ];

        var isValid = true;
        requiredFields.forEach(function(field) {
            var $field = $('#' + field);
            if (!$field.val()) {
                $field.addClass('error');
                isValid = false;
            } else {
                $field.removeClass('error');
            }
        });

        // Validate payment method
        if (!$('input[name="payment_method"]:checked').val()) {
            isValid = false;
        }

        if (!isValid) {
            alert('Por favor completa todos los campos requeridos');
            setSheetState(SHEET_FULL);
            return;
        }

        var originalText = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> ' + tukitaskDelivery.strings.searching);

        $.ajax({
            url: tukitaskDelivery.ajaxUrl,
            type: 'POST',
            data: $form.serialize() + '&action=tukitask_create_delivery_request&security=' + tukitaskDelivery.nonce,
            success: function(response) {
                if (response.success) {
                    showSuccessModal(response.data);
                } else {
                    alert(response.data.message || tukitaskDelivery.strings.error);
                    $btn.prop('disabled', false).html(originalText);
                }
            },
            error: function() {
                alert(tukitaskDelivery.strings.error);
                $btn.prop('disabled', false).html(originalText);
            }
        });
    }

    function showSuccessModal(data) {
        var $modal = $('#tuki-delivery-modal');
        $('#tuki-tracking-code').text(data.tracking_code);
        $('#tuki-modal-message').text(data.message);
        $('#tuki-view-delivery').attr('href', data.redirect);

        // Hide bottom sheet behind modal
        $('#tuki-bottom-sheet').css('display', 'none');

        $modal.fadeIn(300);
        pollDeliveryStatus(data.delivery_id);
    }

    /* ======================================================================
       POLL DELIVERY STATUS
       ====================================================================== */

    function pollDeliveryStatus(deliveryId) {
        var attempts = 0;
        var maxAttempts = 60;

        var interval = setInterval(function() {
            attempts++;

            $.ajax({
                url: tukitaskDelivery.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_get_delivery_status',
                    delivery_id: deliveryId
                },
                success: function(response) {
                    if (response.success) {
                        if (response.data.status === 'assigned') {
                            clearInterval(interval);
                            $('.tuki-searching-animation').hide();
                            $('.tuki-modal-header h3').html('<i class="fas fa-check-circle" style="color:#fff"></i> \u00A1Conductor Asignado!');
                            var driver = response.data.driver;
                            var driverPhone = driver.phone ? '<a href="tel:' + driver.phone + '" style="color:#00c853;text-decoration:none;"><i class="fas fa-phone"></i> ' + driver.phone + '</a>' : '';
                            var avatarHtml = driver.avatar ? '<img src="' + driver.avatar + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:8px;">' : '<i class="fas fa-user-circle" style="font-size:64px;color:#9ca3af;margin-bottom:8px;"></i>';
                            var ratingHtml = driver.rating_count > 0 ? '<div style="font-size:0.9rem;color:#f59e0b;margin-top:4px;">⭐ ' + driver.rating + ' <small style="color:#9ca3af;">(' + driver.rating_count + ')</small></div>' : '';
                            $('#tuki-modal-message').html(
                                '<div style="text-align:center;padding:10px 0;">' +
                                avatarHtml +
                                '<div style="font-size:18px;font-weight:700;color:#1a1a2e;">' + driver.name + '</div>' +
                                ratingHtml +
                                (driverPhone ? '<div style="margin-top:6px;">' + driverPhone + '</div>' : '') +
                                '<div style="margin-top:12px;padding:8px 16px;background:#e8f5e9;border-radius:8px;color:#2e7d32;font-weight:600;">Se dirige al punto de recogida</div>' +
                                '</div>'
                            );
                            $('#tuki-view-delivery').text('Ver seguimiento').css({ 'background': '#00c853', 'borderColor': '#00c853' });
                        } else if (response.data.status === 'cancelled') {
                            clearInterval(interval);
                            $('.tuki-searching-animation').hide();
                            $('.tuki-modal-header h3').html('<i class="fas fa-times-circle" style="color:#fff"></i> Env\u00EDo Cancelado');
                            $('.tuki-modal-header').css('background', '#e53935');
                            $('#tuki-modal-message').text('El env\u00EDo fue cancelado.');
                        }
                    }
                }
            });

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                $('.tuki-searching-animation').hide();
                $('#tuki-modal-message').html(
                    '<div style="text-align:center;color:#ff6b00;">' +
                    '<i class="fas fa-exclamation-triangle" style="font-size:24px;"></i><br>' +
                    'No se encontr\u00F3 conductor disponible. Puedes intentar de nuevo m\u00E1s tarde.' +
                    '</div>'
                );
            }
        }, 2000);
    }

    /* ======================================================================
       MY DELIVERIES
       ====================================================================== */

    function initMyDeliveries() {
        $(document).on('click', '.tuki-cancel-delivery', function(e) {
            e.preventDefault();

            if (!confirm(tukitaskDelivery.strings.confirm_cancel)) {
                return;
            }

            var $btn = $(this);
            var deliveryId = $btn.data('delivery-id');

            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            $.ajax({
                url: tukitaskDelivery.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_cancel_delivery',
                    security: tukitaskDelivery.nonce,
                    delivery_id: deliveryId
                },
                success: function(response) {
                    if (response.success) {
                        $btn.closest('.tuki-delivery-card').fadeOut(300, function() {
                            $(this).remove();
                        });
                    } else {
                        alert(response.data.message || tukitaskDelivery.strings.error);
                        $btn.prop('disabled', false).html('<i class="fas fa-times"></i> Cancelar');
                    }
                },
                error: function() {
                    alert(tukitaskDelivery.strings.error);
                    $btn.prop('disabled', false).html('<i class="fas fa-times"></i> Cancelar');
                }
            });
        });
    }

    /* ======================================================================
       TRACKING PAGE — Fullscreen map + bottom sheet
       ====================================================================== */

    // Tracking sheet state
    let trackingSheetState = SHEET_SMALL;
    let trackingDragging = false;
    let trackingDragStartY = 0;
    let trackingSheetStartTranslate = 0;

    function initTrackingPage() {
        var $ui = $('#tuki-tracking-ui');
        if (!$ui.length || typeof L === 'undefined') return;

        // Init map for search page (no markers)
        var $mapBg = $('#tuki-tracking-map-bg');
        if ($mapBg.length) {
            var bgMap = L.map('tuki-tracking-map-bg', { zoomControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(bgMap);
            bgMap.setView([-25.2637, -57.5759], 13);
            initTrackingSheetDrag();
            return;
        }

        // Init map for details page
        var $mapContainer = $('#tuki-tracking-map');
        if (!$mapContainer.length) return;

        var pickupLat = parseFloat($mapContainer.data('pickup-lat'));
        var pickupLng = parseFloat($mapContainer.data('pickup-lng'));
        var deliveryLat = parseFloat($mapContainer.data('delivery-lat'));
        var deliveryLng = parseFloat($mapContainer.data('delivery-lng'));
        var driverId = $mapContainer.data('driver-id');

        if (!pickupLat || !deliveryLat) return;

        trackingMap = L.map('tuki-tracking-map', { zoomControl: false });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(trackingMap);

        // Zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(trackingMap);

        var pickupIcon = L.divIcon({
            className: 'tuki-map-marker',
            html: '<div class="marker-icon marker-pickup"><i class="fas fa-circle"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        L.marker([pickupLat, pickupLng], { icon: pickupIcon }).addTo(trackingMap);

        var deliveryIcon = L.divIcon({
            className: 'tuki-map-marker',
            html: '<div class="marker-icon marker-delivery"><i class="fas fa-flag-checkered"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon }).addTo(trackingMap);

        L.polyline([[pickupLat, pickupLng], [deliveryLat, deliveryLng]], {
            color: '#00c853',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(trackingMap);

        trackingMap.fitBounds([[pickupLat, pickupLng], [deliveryLat, deliveryLng]], { padding: [80, 80] });

        if (driverId) {
            trackDriverPosition(driverId);
        }

        // Init bottom sheet drag
        initTrackingSheetDrag();
    }

    function initTrackingSheetDrag() {
        var $sheet = $('#tuki-tracking-sheet');
        if (!$sheet.length) return;

        var sheetEl = $sheet[0];

        function getTrackingSheetTranslate(state) {
            var vh = window.innerHeight;
            switch (state) {
                case SHEET_SMALL:  return vh - 220;
                case SHEET_MEDIUM: return vh * 0.4;
                case SHEET_FULL:   return 0;
                default: return vh - 220;
            }
        }

        function setTrackingSheetState(state) {
            trackingSheetState = state;
            $sheet.css('transform', 'translateY(' + getTrackingSheetTranslate(state) + 'px)');
            $sheet.removeClass('tuki-sheet-small tuki-sheet-medium tuki-sheet-full')
                  .addClass('tuki-sheet-' + state);
            // Toggle scroll
            var $content = $sheet.find('.tuki-tracking-sheet-content');
            $content.css('overflow-y', state === SHEET_FULL ? 'auto' : 'hidden');
        }

        function onTrackingDragStart(startY) {
            trackingDragging = true;
            trackingDragStartY = startY;
            var matrix = new DOMMatrix(getComputedStyle(sheetEl).transform);
            trackingSheetStartTranslate = matrix.m42;
            $sheet.addClass('tuki-sheet-dragging');
        }

        function onTrackingDragMove(currentY) {
            if (!trackingDragging) return;
            var delta = currentY - trackingDragStartY;
            var newY = Math.max(0, trackingSheetStartTranslate + delta);
            sheetEl.style.transform = 'translateY(' + newY + 'px)';
        }

        function onTrackingDragEnd(endY) {
            if (!trackingDragging) return;
            trackingDragging = false;
            $sheet.removeClass('tuki-sheet-dragging');
            var delta = endY - trackingDragStartY;
            var vh = window.innerHeight;
            var threshold = vh * 0.1;

            if (delta < -threshold) {
                // Swipe up
                if (trackingSheetState === SHEET_SMALL) setTrackingSheetState(SHEET_MEDIUM);
                else setTrackingSheetState(SHEET_FULL);
            } else if (delta > threshold) {
                // Swipe down
                if (trackingSheetState === SHEET_FULL) setTrackingSheetState(SHEET_MEDIUM);
                else setTrackingSheetState(SHEET_SMALL);
            } else {
                setTrackingSheetState(trackingSheetState);
            }
        }

        function isInteractiveEl(el) {
            var tag = el.tagName;
            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
            if ($(el).closest('button, a, input, select, textarea, .tuki-btn-call').length) return true;
            return false;
        }

        // Touch events
        $sheet.on('touchstart', function(e) {
            if (isInteractiveEl(e.target)) return;
            onTrackingDragStart(e.originalEvent.touches[0].clientY);
        });
        $sheet.on('touchmove', function(e) {
            if (!trackingDragging) return;
            e.preventDefault();
            onTrackingDragMove(e.originalEvent.touches[0].clientY);
        });
        $sheet.on('touchend', function(e) {
            if (!trackingDragging) return;
            onTrackingDragEnd(e.originalEvent.changedTouches[0].clientY);
        });

        // Mouse events
        $sheet.on('mousedown', function(e) {
            if (isInteractiveEl(e.target)) return;
            e.preventDefault();
            onTrackingDragStart(e.clientY);
        });
        $(document).on('mousemove.trackingsheet', function(e) {
            if (!trackingDragging) return;
            onTrackingDragMove(e.clientY);
        });
        $(document).on('mouseup.trackingsheet', function(e) {
            if (!trackingDragging) return;
            onTrackingDragEnd(e.clientY);
        });

        // Set initial state
        setTrackingSheetState(SHEET_SMALL);
    }

    function trackDriverPosition(driverId) {
        var driverIcon = L.divIcon({
            className: 'tuki-map-marker',
            html: '<div class="marker-icon marker-driver"><i class="fas fa-motorcycle"></i></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        });

        trackingInterval = tukiSmartInterval(function() {
            var deliveryId = $('.tuki-tracking-sheet-content').data('delivery-id');

            $.ajax({
                url: tukitaskDelivery.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_get_delivery_status',
                    delivery_id: deliveryId
                },
                success: function(response) {
                    if (response.success && response.data.driver) {
                        var lat = parseFloat(response.data.driver.lat);
                        var lng = parseFloat(response.data.driver.lng);

                        if (lat && lng) {
                            if (driverMarker) {
                                driverMarker.setLatLng([lat, lng]);
                            } else {
                                driverMarker = L.marker([lat, lng], { icon: driverIcon }).addTo(trackingMap);
                            }
                        }

                        // Update status badge dynamically
                        if (response.data.status) {
                            var $badge = $('.tracking-status-badge');
                            if ($badge.length) {
                                $badge.attr('class', 'tracking-status-badge status-' + response.data.status);
                            }
                        }

                        if (response.data.status === 'delivered' || response.data.status === 'cancelled') {
                            clearInterval(trackingInterval);
                        }
                    }
                }
            });
        }, 10000);
    }

    // Marker & error styles
    $('head').append(
        '<style>' +
        '.tuki-map-marker { background: transparent; border: none; }' +
        '.marker-driver { background: #1976d2; width: 40px; height: 40px; font-size: 18px; animation: driverPulse 2s infinite; }' +
        '@keyframes driverPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(25,118,210,0.4); } 50% { box-shadow: 0 0 0 15px rgba(25,118,210,0); } }' +
        'input.error { border-color: #f44336 !important; background-color: #fff5f5 !important; }' +
        '</style>'
    );

    // ── Driver Rating Stars ──────────────────────────────────
    (function initRating() {
        var selectedRating = 0;
        var $stars = $('#tuki-rating-stars .tuki-star');
        if (!$stars.length) return;

        function highlightStars(upTo) {
            $stars.each(function() {
                var v = parseInt($(this).data('value'), 10);
                $(this).css('color', v <= upTo ? '#f59e0b' : '#d1d5db');
            });
        }

        $stars.on('mouseenter', function() {
            highlightStars(parseInt($(this).data('value'), 10));
        }).on('mouseleave', function() {
            highlightStars(selectedRating);
        }).on('click', function() {
            selectedRating = parseInt($(this).data('value'), 10);
            highlightStars(selectedRating);
        });

        $('#tuki-submit-rating').on('click', function() {
            if (selectedRating < 1) {
                tukiToast('Selecciona una calificación', 'error');
                return;
            }
            var $btn = $(this);
            var deliveryId = $btn.data('delivery-id');
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enviando...');

            $.post(tukitaskDelivery.ajaxUrl, {
                action: 'tukitask_rate_driver',
                security: tukitaskDelivery.nonce,
                delivery_id: deliveryId,
                rating: selectedRating,
                comment: $('#tuki-rating-comment').val()
            }).done(function(resp) {
                if (resp.success) {
                    $('#tuki-rate-driver').replaceWith(
                        '<div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:12px;text-align:center;border:1px solid #bbf7d0;">' +
                        '<span style="font-size:0.9rem;color:#16a34a;">✅ ' + (resp.data.message || '¡Gracias por tu calificación!') + '</span>' +
                        '</div>'
                    );
                    tukiToast(resp.data.message || '¡Gracias!', 'success');
                } else {
                    tukiToast(resp.data.message || 'Error al calificar', 'error');
                    $btn.prop('disabled', false).html('Enviar Calificación');
                }
            }).fail(function() {
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('Enviar Calificación');
            });
        });
    })();

    // ── Inline Rating in Mis Envíos cards ────────────────────
    (function initInlineRating() {
        // Toggle rating form
        $(document).on('click', '.tuki-open-rating', function() {
            var id = $(this).data('delivery-id');
            $(this).hide();
            $('.tuki-inline-rating[data-delivery-id="' + id + '"]').slideDown(200);
        });

        // Star hover/click per card
        $(document).on('mouseenter', '.tuki-inline-star', function() {
            var val = parseInt($(this).data('value'), 10);
            $(this).closest('.tuki-inline-stars').find('.tuki-inline-star').each(function() {
                $(this).css('color', parseInt($(this).data('value'), 10) <= val ? '#f59e0b' : '#d1d5db');
            });
        }).on('mouseleave', '.tuki-inline-star', function() {
            var $container = $(this).closest('.tuki-inline-rating');
            var sel = $container.data('selected-rating') || 0;
            $container.find('.tuki-inline-star').each(function() {
                $(this).css('color', parseInt($(this).data('value'), 10) <= sel ? '#f59e0b' : '#d1d5db');
            });
        }).on('click', '.tuki-inline-star', function() {
            var val = parseInt($(this).data('value'), 10);
            var $container = $(this).closest('.tuki-inline-rating');
            $container.data('selected-rating', val);
            $container.find('.tuki-inline-star').each(function() {
                $(this).css('color', parseInt($(this).data('value'), 10) <= val ? '#f59e0b' : '#d1d5db');
            });
        });

        // Submit
        $(document).on('click', '.tuki-send-rating', function() {
            var $btn = $(this);
            var $container = $btn.closest('.tuki-inline-rating');
            var deliveryId = $btn.data('delivery-id');
            var rating = $container.data('selected-rating') || 0;
            var comment = $container.find('.tuki-inline-comment').val();

            if (rating < 1) {
                tukiToast('Selecciona una calificación', 'error');
                return;
            }
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enviando...');

            $.post(tukitaskDelivery.ajaxUrl, {
                action: 'tukitask_rate_driver',
                security: tukitaskDelivery.nonce,
                delivery_id: deliveryId,
                rating: rating,
                comment: comment
            }).done(function(resp) {
                if (resp.success) {
                    $container.replaceWith(
                        '<span style="font-size:0.8rem;color:#16a34a;margin-top:4px;display:inline-block;">✅ ' + (resp.data.message || '¡Gracias!') + '</span>'
                    );
                    tukiToast(resp.data.message || '¡Gracias!', 'success');
                } else {
                    tukiToast(resp.data.message || 'Error al calificar', 'error');
                    $btn.prop('disabled', false).html('Enviar Calificación');
                }
            }).fail(function() {
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('Enviar Calificación');
            });
        });
    })();

})(jQuery);
