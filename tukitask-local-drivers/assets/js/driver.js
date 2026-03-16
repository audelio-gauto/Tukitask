(function($){
    'use strict';
    console.log('TukiTask Driver JS Loaded - Version 1.0.0.8');
    // Fallback tukiToast for this IIFE (real one lives in main IIFE below)
    var tukiToast = function(msg) { console.log('[TukiToast]', msg); };
    $(document).on('click', '.tuki-accept-broadcast', function(e){
        e.preventDefault();
        var $btn = $(this);
        var type = $btn.data('type');
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
        if(type === 'woo'){
            var orderId = $btn.data('order-id');
            $.post(tukitaskDriver.ajaxUrl, {
                action: 'tukitask_accept_broadcast_order',
                nonce: tukitaskDriver.nonce,
                order_id: orderId
            }).done(function(resp){
                if(resp.success){
                    tukiToast(resp.data.message || 'Pedido aceptado', 'success');
                    // Remove popup if exists
                    $('#broadcast-order-popup-' + orderId).fadeOut(300, function(){ $(this).remove(); });
                    setTimeout(function(){ location.reload(); }, 800);
                }else{
                    tukiToast(resp.data.message || 'Error', 'error');
                    if(resp.data && resp.data.already_taken){
                        // Order was taken by another driver - remove UI
                        $('#broadcast-order-popup-' + orderId).fadeOut(300, function(){ $(this).remove(); });
                        $btn.closest('.tuki-broadcast-order-card').fadeOut(300, function(){ $(this).remove(); });
                        if (typeof window._tukiKnownBroadcastOrders !== 'undefined') {
                            delete window._tukiKnownBroadcastOrders[orderId];
                        }
                    } else {
                        $btn.prop('disabled', false).html('<i class="fas fa-check"></i> Aceptar');
                    }
                }
            }).fail(function(){
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-check"></i> Aceptar');
            });
        }else if(type === 'bolt'){
            var deliveryId = $btn.data('delivery-id');
            $.post(tukitaskDriver.ajaxUrl, {
                action: 'tukitask_driver_accept_delivery',
                nonce: tukitaskDriver.nonce,
                delivery_id: deliveryId
            }).done(function(resp){
                if(resp.success){
                    tukiToast(resp.data.message || 'Envío aceptado', 'success');
                    setTimeout(function(){ location.reload(); }, 800);
                }else{
                    tukiToast(resp.data.message || 'Error', 'error');
                    if(resp.data && resp.data.already_taken){
                        // Delivery was taken by another driver - remove UI
                        $('#delivery-popup-' + deliveryId).fadeOut(300, function(){ $(this).remove(); });
                        $btn.closest('.tuki-broadcast-card').fadeOut(300, function(){ $(this).remove(); });
                    } else {
                        $btn.prop('disabled', false).html('<i class="fas fa-check"></i> Aceptar Envío');
                    }
                }
            }).fail(function(){
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-check"></i> Aceptar Envío');
            });
        }
    });

    $(document).on('click', '.tuki-reject-broadcast', function(e){
        e.preventDefault();
        var $btn = $(this);
        var type = $btn.data('type');
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
        if(type === 'woo'){
            var orderId = $btn.data('order-id');
            $.post(tukitaskDriver.ajaxUrl, {
                action: 'tukitask_reject_broadcast_order',
                nonce: tukitaskDriver.nonce,
                order_id: orderId
            }).done(function(resp){
                // Remove popup or card smoothly without page reload
                $('#broadcast-order-popup-' + orderId).fadeOut(300, function(){ $(this).remove(); });
                $btn.closest('.tuki-broadcast-order-card').fadeOut(300, function(){ $(this).remove(); });
                if (typeof window._tukiKnownBroadcastOrders !== 'undefined') {
                    delete window._tukiKnownBroadcastOrders[orderId];
                }
            }).fail(function(){
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-times"></i> Rechazar');
            });
        }else if(type === 'bolt'){
            var deliveryId = $btn.data('delivery-id');
            $.post(tukitaskDriver.ajaxUrl, {
                action: 'tukitask_driver_reject_delivery',
                nonce: tukitaskDriver.nonce,
                delivery_id: deliveryId
            }).done(function(resp){
                // Remove popup or card smoothly without page reload
                $('#delivery-popup-' + deliveryId).fadeOut(300, function(){ $(this).remove(); });
                $btn.closest('.tuki-broadcast-card').fadeOut(300, function(){ $(this).remove(); });
                if (typeof window._tukiVisibleDeliveries !== 'undefined') {
                    delete window._tukiVisibleDeliveries[deliveryId];
                }
            }).fail(function(){
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-times"></i>');
            });
        }
    });

    // ===== Delivery pickup/complete action handlers =====
    $(document).on('click', '.tuki-delivery-action', function(e) {
        e.preventDefault();
        var $btn = $(this);
        var action = $btn.data('action');
        var deliveryId = $btn.data('delivery-id');
        var driverId = $btn.data('driver-id');
        var ajaxAction = action === 'pickup'
            ? 'tukitask_driver_pickup_delivery'
            : 'tukitask_driver_complete_delivery';

        console.log('[TukiTask] Delivery action clicked:', action, 'deliveryId:', deliveryId, 'driverId:', driverId);
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Procesando...');

        $.post(tukitaskDriver.ajaxUrl, {
            action: ajaxAction,
            nonce: tukitaskDriver.nonce,
            delivery_id: deliveryId,
            driver_id: driverId
        }).done(function(resp) {
            console.log('[TukiTask] Delivery action response:', resp);
            if (resp.success) {
                alert(resp.data.message || 'Listo');
                location.reload();
            } else {
                alert(resp.data.message || 'Error');
                $btn.prop('disabled', false).html(
                    action === 'pickup'
                        ? '<i class="fas fa-box"></i> Confirmar Recogida'
                        : '<i class="fas fa-check-circle"></i> Confirmar Entrega'
                );
            }
        }).fail(function(xhr, status, error) {
            console.error('[TukiTask] Delivery action AJAX failed:', status, error);
            alert('Error de conexión: ' + error);
            $btn.prop('disabled', false).html(
                action === 'pickup'
                    ? '<i class="fas fa-box"></i> Confirmar Recogida'
                    : '<i class="fas fa-check-circle"></i> Confirmar Entrega'
            );
        });
    });

    // ===== WC Order action handlers (Bolt-style: pickup / deliver / fail) =====
    $(document).on('click', '.tuki-order-action', function(e) {
        e.preventDefault();
        var $btn = $(this);
        var action = $btn.data('action');
        var orderId = $btn.data('order-id');

        var actionMap = {
            'pickup': 'tukitask_order_confirm_pickup',
            'deliver': 'tukitask_order_confirm_delivery',
            'fail': 'tukitask_order_mark_failed'
        };
        var ajaxAction = actionMap[action];
        if (!ajaxAction) return;

        // Confirm for deliver/fail actions
        if (action === 'deliver' && !confirm('¿Confirmar entrega de este pedido?')) return;
        if (action === 'fail' && !confirm('¿Marcar este pedido como fallido?')) return;

        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Procesando...');

        $.post(tukitaskDriver.ajaxUrl, {
            action: ajaxAction,
            nonce: tukitaskDriver.nonce,
            order_id: orderId
        }).done(function(resp) {
            if (resp.success) {
                tukiToast(resp.data.message || 'Listo', 'success');
                // Redirect to appropriate screen
                var redirects = {
                    'pickup': '?screen=out-for-delivery',
                    'deliver': '?screen=delivered',
                    'fail': '?screen=failed'
                };
                setTimeout(function() {
                    location.href = window.location.pathname + (redirects[action] || '');
                }, 800);
            } else {
                tukiToast(resp.data.message || 'Error', 'error');
                $btn.prop('disabled', false);
                if (action === 'pickup') $btn.html('<i class="fas fa-box"></i> Confirmar Recogida');
                else if (action === 'deliver') $btn.html('<i class="fas fa-check-circle"></i> Confirmar Entrega');
                else $btn.html('<i class="fas fa-times"></i>');
            }
        }).fail(function() {
            tukiToast('Error de conexión', 'error');
            $btn.prop('disabled', false);
            if (action === 'pickup') $btn.html('<i class="fas fa-box"></i> Confirmar Recogida');
            else if (action === 'deliver') $btn.html('<i class="fas fa-check-circle"></i> Confirmar Entrega');
            else $btn.html('<i class="fas fa-times"></i>');
        });
    });

})(jQuery);
/**
 * Driver Frontend JavaScript for Tukitask Local Drivers Pro
 */

(function ($) {
    'use strict';

    /**
     * Visibility-aware interval: pauses when tab is hidden, resumes when visible.
     * Reduces server load by ~50% from background tabs.
     */
    function tukiSmartInterval(fn, ms) {
        var id = setInterval(function() {
            if (!document.hidden) fn();
        }, ms);
        return id;
    }

    $(document).ready(function () {
        console.log('TukiTask Driver JS Loaded');
        if (typeof initDriverAppMode === 'function') initDriverAppMode();
        if (typeof initDriverPanel === 'function') initDriverPanel();
        if (typeof initStatusControl === 'function') initStatusControl();
        if (typeof initModernUI === 'function') initModernUI();
        if (typeof initGeoTracking === 'function') initGeoTracking();
        if (typeof initMobileStore === 'function') initMobileStore();
        if (typeof initWithdrawalRequest === 'function') initWithdrawalRequest();
        if (typeof initTripBroadcasting === 'function') initTripBroadcasting();
        if (typeof initChatSystem === 'function') initChatSystem();
        if (typeof initPWA === 'function') initPWA();
    });

    /**
     * Fullscreen App Mode (Bolt-style driver panel).
     */
    var driverMap = null;
    var driverMarker = null;

    function initDriverAppMode() {
        var $appUi = $('#tuki-driver-app-ui');
        if (!$appUi.length) return;

        var currentScreen = $appUi.attr('data-screen') || 'dashboard';

        // Activate app mode - hide WP chrome
        $('body').addClass('tuki-driver-app-mode');

        // --- Hamburger + Drawer (always) ---
        $('#tuki-driver-menu-btn').on('click', function() {
            $('#tuki-driver-drawer').addClass('open');
            $('#tuki-driver-overlay').addClass('active');
        });

        $('#tuki-driver-overlay').on('click', function() {
            $('#tuki-driver-drawer').removeClass('open');
            $('#tuki-driver-overlay').removeClass('active');
        });

        // Only init map and bottom sheet on Dashboard screen
        if (currentScreen !== 'dashboard') return;

        // --- Leaflet Map ---
        var lat = (typeof tukitaskDriver !== 'undefined' && tukitaskDriver.driverLat) ? parseFloat(tukitaskDriver.driverLat) : -25.2637;
        var lng = (typeof tukitaskDriver !== 'undefined' && tukitaskDriver.driverLng) ? parseFloat(tukitaskDriver.driverLng) : -57.5759;

        if (typeof L !== 'undefined' && $('#tuki-driver-map').length) {
            driverMap = L.map('tuki-driver-map', {
                center: [lat, lng],
                zoom: 15,
                zoomControl: false,
                attributionControl: false
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19
            }).addTo(driverMap);

            // Driver self marker (green dot)
            var selfIcon = L.divIcon({
                className: 'tuki-driver-self-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            driverMarker = L.marker([lat, lng], { icon: selfIcon }).addTo(driverMap);

            // Update marker when geolocation fires
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition(function(pos) {
                    var newLat = pos.coords.latitude;
                    var newLng = pos.coords.longitude;
                    if (driverMarker) driverMarker.setLatLng([newLat, newLng]);
                    // Don't pan automatically — driver may be looking at another area
                }, null, { enableHighAccuracy: true, maximumAge: 15000 });
            }

            // Fix map size after render
            setTimeout(function() { driverMap.invalidateSize(); }, 300);
        }

        // --- Locate Me ---
        $('#tuki-driver-locate-btn').on('click', function() {
            if (navigator.geolocation && driverMap) {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    var newLat = pos.coords.latitude;
                    var newLng = pos.coords.longitude;
                    driverMap.setView([newLat, newLng], 16, { animate: true });
                    if (driverMarker) driverMarker.setLatLng([newLat, newLng]);
                });
            }
        });

        // --- Bottom Sheet Drag (mobile only) ---
        initDriverSheet();
    }

    function isDesktop() {
        return window.matchMedia('(min-width: 768px)').matches;
    }

    function initDriverSheet() {
        var $sheet = $('#tuki-driver-sheet');
        var $handle = $('#tuki-driver-sheet-handle');
        if (!$sheet.length) return;

        // Start at half state
        setDriverSheetState('half');

        var startY = 0, startTranslate = 0, sheetH = 0, dragging = false;

        function getTranslateY() {
            var st = window.getComputedStyle($sheet[0]);
            var matrix = new DOMMatrix(st.transform);
            return matrix.m42;
        }

        function onStart(e) {
            if (isDesktop()) return;
            // Don't drag when tapping interactive elements
            var tag = (e.target.tagName || '').toLowerCase();
            if (['button','input','textarea','select','a','label'].indexOf(tag) !== -1 || $(e.target).closest('button,a,input,textarea,select,.tuki-btn').length) return;
            dragging = true;
            sheetH = $sheet[0].offsetHeight;
            startY = (e.touches ? e.touches[0].clientY : e.clientY);
            startTranslate = getTranslateY();
            $sheet.css('transition', 'none');
        }

        function onMove(e) {
            if (!dragging) return;
            var currentY = (e.touches ? e.touches[0].clientY : e.clientY);
            var delta = currentY - startY;
            var newTranslate = Math.max(0, startTranslate + delta);
            $sheet.css('transform', 'translateY(' + newTranslate + 'px)');
        }

        function onEnd() {
            if (!dragging) return;
            dragging = false;
            $sheet.css('transition', '');
            var finalTranslate = getTranslateY();
            var viewH = window.innerHeight;

            if (finalTranslate > viewH * 0.6) {
                setDriverSheetState('collapsed');
            } else if (finalTranslate > viewH * 0.3) {
                setDriverSheetState('half');
            } else {
                setDriverSheetState('full');
            }
        }

        // Allow drag from entire sheet, not just handle
        $sheet[0].addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

        $sheet[0].addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);

        // On resize, remove transforms for desktop
        $(window).on('resize', function() {
            if (isDesktop()) {
                $sheet.removeClass('state-collapsed state-half state-full');
                $sheet.css('transform', '');
            } else {
                setDriverSheetState('half');
            }
            if (driverMap) driverMap.invalidateSize();
        });
    }

    function setDriverSheetState(state) {
        if (isDesktop()) return;
        var $sheet = $('#tuki-driver-sheet');
        $sheet.removeClass('state-collapsed state-half state-full');
        $sheet.addClass('state-' + state);
    }

    /**
     * Chat System (Phase 17).
     */
    var activeChatOrder = null;
    var activeRecipient = null;
    var lastMsgId = 0;
    var chatPoll = null;

    function initChatSystem() {
        if ($('#tuki-chat-overlay').length === 0) {
            console.log('TukiTask: Chat overlay not found in DOM');
            return;
        }
        
        console.log('TukiTask: Initializing Chat System');

        // Open chat from order card button
        $(document).on('click', '.tuki-open-chat', function (e) {
            e.preventDefault();
            e.stopPropagation();
            
            const orderId = $(this).data('order-id');
            const recipientId = $(this).data('recipient-id');
            
            // Try to get recipient name from order card
            let recipientName = 'Cliente';
            const $card = $(this).closest('.tuki-order-card-pro, .tuki-order-card');
            if ($card.length) {
                const nameEl = $card.find('.tuki-contact-info div[style*="font-weight: 600"]').first();
                if (nameEl.length) {
                    recipientName = nameEl.text().trim();
                }
            }
            
            console.log('TukiTask: Opening chat for order', orderId, 'recipient', recipientId);
            openChat(orderId, recipientId, recipientName);
        });

        // Close chat
        $('#tuki-close-chat').on('click', function (e) {
            e.preventDefault();
            closeChat();
        });
        
        // Close on overlay click (outside chat window)
        $('#tuki-chat-overlay').on('click', function (e) {
            if (e.target === this) {
                closeChat();
            }
        });

        $('#tuki-send-message').on('click', sendChatMessage);
        $('#tuki-chat-input').on('keypress', function (e) {
            if (e.which === 13 && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
    
    function closeChat() {
        $('#tuki-chat-overlay').removeClass('active');
        clearInterval(chatPoll);
        activeChatOrder = null;
        activeRecipient = null;
    }

    function openChat(orderId, recipientId, recipientName) {
        activeChatOrder = orderId;
        activeRecipient = recipientId;
        lastMsgId = 0;
        $('#chat-recipient-name').text(recipientName || 'Cliente');
        $('#tuki-chat-messages').empty();
        $('#tuki-chat-overlay').addClass('active');

        loadChatMessages();

        // Start polling
        clearInterval(chatPoll);
        chatPoll = tukiSmartInterval(loadChatMessages, 8000);
    }

    function loadChatMessages() {
        if (!activeChatOrder) return;

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'GET',
            data: {
                action: 'tukitask_get_chat_messages',
                order_id: activeChatOrder,
                last_id: lastMsgId
            },
            success: function (response) {
                if (response.success && response.data.length > 0) {
                    renderChatMessages(response.data);
                }
            }
        });
    }

    function renderChatMessages(messages) {
        const currentUserId = tukitaskDriver.userId || tukitaskDriver.driverId; // Use WP user ID for message sender comparison

        messages.forEach(msg => {
            if ($('#msg-' + msg.id).length > 0) return;

            const isSent = parseInt(msg.sender_id) === parseInt(currentUserId);
            const msgHtml = `
                <div id="msg-${msg.id}" class="chat-msg ${isSent ? 'sent' : 'received'}">
                    ${msg.content}
                </div>
            `;
            $('#tuki-chat-messages').append(msgHtml);
            lastMsgId = Math.max(lastMsgId, parseInt(msg.id));
        });

        const msgContainer = document.getElementById('tuki-chat-messages');
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    function sendChatMessage() {
        const content = $('#tuki-chat-input').val().trim();
        if (!content || !activeChatOrder) return;

        $('#tuki-chat-input').val('');

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_send_chat_message',
                nonce: tukitaskDriver.nonce,
                order_id: activeChatOrder,
                recipient_id: activeRecipient,
                content: content
            },
            success: function (response) {
                loadChatMessages();
            }
        });
    }

    /**
     * Trip Request Broadcasting (Bolt Style).
     */
    var activeTripPoll = null;

    function initTripBroadcasting() {
        // Poll for new trip requests every 10 seconds if driver is online
        activeTripPoll = tukiSmartInterval(function () {
            if ($('#tuki-availability-toggle').is(':checked')) {
                checkForNewTrips();
            }
        }, 15000);
    }

    function checkForNewTrips() {
        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_get_active_requests',
                nonce: tukitaskDriver.nonce
            },
            success: function (response) {
                if (response.success && response.data.length > 0) {
                    showTripPopup(response.data[0]);
                }
            }
        });
    }

    function showTripPopup(trip) {
        // Simple avoid double popups or re-showing same trip
        if ($('#trip-popup-' + trip.id).length > 0) return;

        var html = `
            <div id="trip-popup-${trip.id}" class="tuki-trip-popup">
                <div class="trip-popup-content">
                    <h3>${tukitaskDriver.strings.new_trip}</h3>
                    <p><strong>${tukitaskDriver.strings.price}</strong> $${trip.price}</p>
                    <p><strong>${tukitaskDriver.strings.origin}</strong> ${trip.origin_address}</p>
                    <p><strong>${tukitaskDriver.strings.destination}</strong> ${trip.dest_address}</p>
                    <div class="trip-timer" id="timer-${trip.id}">${trip.expires_in}s</div>
                    <div class="trip-actions">
                        <button class="accept-trip-btn" data-id="${trip.id}">${tukitaskDriver.strings.accept_trip}</button>
                        <button class="reject-trip-btn" onclick="jQuery('#trip-popup-${trip.id}').remove()">${tukitaskDriver.strings.ignore}</button>
                    </div>
                </div>
            </div>
        `;

        $('body').append(html);

        // Start countdown
        var timeLeft = trip.expires_in;
        var countdown = setInterval(function () {
            timeLeft--;
            $('#timer-' + trip.id).text(timeLeft + 's');
            if (timeLeft <= 0) {
                clearInterval(countdown);
                $('#trip-popup-' + trip.id).fadeOut(function () { $(this).remove(); });
            }
        }, 1000);

        // Accept Trip Handler
        $('.accept-trip-btn[data-id="' + trip.id + '"]').on('click', function () {
            var $btn = $(this);
            $btn.prop('disabled', true).text(tukitaskDriver.strings.accepting);

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_accept_trip_request',
                    nonce: tukitaskDriver.nonce,
                    request_id: trip.id
                },
                success: function (response) {
                    if (response.success) {
                        alert(response.data.message);
                        location.reload();
                    } else {
                        alert(response.data.message);
                        $('#trip-popup-' + trip.id).remove();
                    }
                },
                error: function () {
                    tukiToast(tukitaskDriver.strings.error, 'error');
                    $btn.prop('disabled', false).text(tukitaskDriver.strings.accept_trip);
                }
            });
        });
    }

    /**
     * Real-time Geo-Tracking for Drivers.
     */
    var lastUpdate = 0;
    var lastCoords = { lat: 0, lng: 0 };

    function initGeoTracking() {
        if (!navigator.geolocation) {
            console.error('Geolocation is not supported by this browser.');
            return;
        }

        console.log('Initializing Geo-Tracking...');

        navigator.geolocation.watchPosition(
            function (position) {
                handleLocationUpdate(position.coords);
            },
            function (error) {
                console.warn('Geolocation error:', error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 30000,
                timeout: 27000
            }
        );
    }

    function handleLocationUpdate(coords) {
        const now = Date.now();
        const lat = coords.latitude;
        const lng = coords.longitude;

        // Check if driver is Online (available)
        const isOnline = $('#tuki-availability-toggle').is(':checked');
        if (!isOnline) return;

        // Throttling: Update every 30 seconds minimum OR if distance moved is significant
        // (Simple distance check for basic throttling)
        const dist = Math.abs(lat - lastCoords.lat) + Math.abs(lng - lastCoords.lng);

        if (now - lastUpdate < 30000 && dist < 0.0001) {
            return;
        }

        console.log('Syncing location: ', lat, lng);
        lastUpdate = now;
        lastCoords = { lat: lat, lng: lng };

        // Skip if driver ID is invalid
        if (!tukitaskDriver.driverId || tukitaskDriver.driverId === '0' || tukitaskDriver.driverId === 0) {
            console.log('TukiTask: No valid driver ID, skipping location sync');
            return;
        }

        $.ajax({
            url: tukitaskDriver.restUrl + '/location',
            type: 'POST',
            beforeSend: function (xhr) {
                xhr.setRequestHeader('X-WP-Nonce', tukitaskDriver.restNonce);
            },
            data: {
                lat: lat,
                lng: lng
            },
            success: function (response) {
                console.log('Location synced successfully');

                // Handle proximity alerts from server response.
                if (response && response.proximity) {
                    handleProximityUpdate(response.proximity);
                }
            },
            error: function (xhr, status, err) {
                // Only log on first error, not every time
                if (!window._tukiLocationErrorLogged) {
                    console.warn('TukiTask: Location sync unavailable (driver may not be registered)');
                    window._tukiLocationErrorLogged = true;
                }
            }
        });
    }

    /**
     * Handle proximity detection response from server.
     * Shows toast and updates badge on order card.
     */
    var lastProximityState = '';

    function handleProximityUpdate(prox) {
        if (!prox || !prox.order_id) return;

        var newState = '';
        if (prox.near_customer) {
            newState = 'near_customer';
        } else if (prox.near_store) {
            newState = 'near_store';
        }

        // Only notify when state changes.
        if (newState && newState !== lastProximityState) {
            if (newState === 'near_store') {
                tukiToast('<i class="fas fa-store"></i> Estás cerca de la tienda — listo para recoger', 'success');
            } else if (newState === 'near_customer') {
                tukiToast('<i class="fas fa-user-check"></i> Estás cerca del cliente — listo para entregar', 'success');
            }
        }
        lastProximityState = newState;

        // Update proximity badge on order card dynamically.
        var $card = $('.tuki-order-card[data-order-id="' + prox.order_id + '"]');
        if ($card.length) {
            $card.find('.tuki-proximity-badge').remove();
            if (newState === 'near_store') {
                $card.find('.tuki-order-header > div:last-child').prepend(
                    '<span class="tuki-proximity-badge tuki-proximity-store"><i class="fas fa-store"></i> Cerca de tienda</span> '
                );
            } else if (newState === 'near_customer') {
                $card.find('.tuki-order-header > div:last-child').prepend(
                    '<span class="tuki-proximity-badge tuki-proximity-customer"><i class="fas fa-user-check"></i> Cerca del cliente</span> '
                );
            }
        }
    }

    /**
     * Modern Alert Replacement (Toasts)
     */
    function tukiToast(message, type = 'success') {
        if ($('.tuki-toast-container').length === 0) {
            $('body').append('<div class="tuki-toast-container"></div>');
        }

        var id = 'toast-' + Date.now();
        var icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        var html = `<div id="${id}" class="tuki-toast ${type}"><i class="fas ${icon}"></i> <span>${message}</span></div>`;

        $('.tuki-toast-container').append(html);

        setTimeout(function () {
            $('#' + id).fadeOut(function () { $(this).remove(); });
        }, 3500);
    }

    /**
     * Initialize Modern UI Interactions.
     */
    function initModernUI() {
        // Sidebar Toggle (legacy support)
        $(document).on('click', '#tuki-menu-toggle', function (e) {
            e.preventDefault();
            $('#tuki-sidebar').addClass('active');
            $('#tuki-overlay').addClass('active');
            $('body').css('overflow', 'hidden');
        });

        $(document).on('click', '#tuki-overlay', function () {
            $('#tuki-sidebar').removeClass('active');
            $('#tuki-overlay').removeClass('active');
            $('body').css('overflow', '');
        });

        // Availability Toggle
        $(document).on('change', '#tuki-availability-toggle', function () {
            var isChecked = $(this).is(':checked');
            var $label = $('#tuki-availability-label');
            var $statusDot = $('.tuki-status-dot-live');

            console.log('Toggle changed: ', isChecked);

            // Optimistic UI update - support both old and new designs
            if (isChecked) {
                $label.removeClass('tuki-status-offline offline').addClass('tuki-status-online online')
                      .text(tukitaskDriver.strings?.available || 'EN LÍNEA');
                $statusDot.removeClass('offline').addClass('online');
            } else {
                $label.removeClass('tuki-status-online online').addClass('tuki-status-offline offline')
                      .text(tukitaskDriver.strings?.unavailable || 'DESCONECTADO');
                $statusDot.removeClass('online').addClass('offline');
            }

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_toggle_availability',
                    nonce: tukitaskDriver.nonce
                },
                success: function (response) {
                    if (response.success) {
                        console.log('Status synced with server:', response.data);
                        tukiToast(response.data?.message || 'Estado actualizado', 'success');
                    } else {
                        tukiToast(tukitaskDriver.strings?.error + ': ' + (response.data?.message || 'Error'), 'error');
                        // Revert on error
                        $('#tuki-availability-toggle').prop('checked', !isChecked);
                        // Revert label
                        if (!isChecked) {
                            $label.removeClass('tuki-status-offline offline').addClass('tuki-status-online online')
                                  .text(tukitaskDriver.strings?.available || 'EN LÍNEA');
                            $statusDot.removeClass('offline').addClass('online');
                        } else {
                            $label.removeClass('tuki-status-online online').addClass('tuki-status-offline offline')
                                  .text(tukitaskDriver.strings?.unavailable || 'DESCONECTADO');
                            $statusDot.removeClass('online').addClass('offline');
                        }
                    }
                },
                error: function () {
                    tukiToast(tukitaskDriver.strings?.error || 'Error de conexión', 'error');
                    // Revert on error
                    $('#tuki-availability-toggle').prop('checked', !isChecked);
                    // Revert label
                    if (!isChecked) {
                        $label.removeClass('tuki-status-offline offline').addClass('tuki-status-online online')
                              .text(tukitaskDriver.strings?.available || 'EN LÍNEA');
                        $statusDot.removeClass('offline').addClass('online');
                    } else {
                        $label.removeClass('tuki-status-online online').addClass('tuki-status-offline offline')
                              .text(tukitaskDriver.strings?.unavailable || 'DESCONECTADO');
                        $statusDot.removeClass('online').addClass('offline');
                    }
                }
            });
        });
        // Profile Save
        $('#tuki-driver-profile-form').on('submit', function (e) {
            e.preventDefault();
            var $btn = $('#save-profile-btn');
            var $originalText = $btn.html();

            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> ' + tukitaskDriver.strings.saving);

            var fd = new FormData(this);
            fd.append('action', 'tukitask_save_driver_profile');
            fd.append('nonce', tukitaskDriver.nonce);

            // Add coordinates if present
            fd.append('driver_lat', $('#driver_lat').val());
            fd.append('driver_lng', $('#driver_lng').val());

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                processData: false,
                contentType: false,
                data: fd,
                success: function (response) {
                    if (response.success) {
                        tukiToast(response.data.message);
                    } else {
                        tukiToast(tukitaskDriver.strings.error + ': ' + response.data.message, 'error');
                    }
                },
                error: function () {
                    tukiToast(tukitaskDriver.strings.error, 'error');
                },
                complete: function () {
                    $btn.prop('disabled', false).html($originalText);
                }
            });
        });

        // Locate Me (HivePress Style)
        $(document).on('click', '#tuki-locate-me', function (e) {
            e.preventDefault();
            var $btn = $(this);
            var $icon = $btn.find('i');

            console.log('Locate Me clicked');

            if (!tukitaskDriver.mapboxKey) {
                tukiToast('Error: Mapbox API Key no configurada.', 'error');
                return;
            }

            $icon.addClass('fa-spin');

            if (!navigator.geolocation) {
                tukiToast('Tu navegador no soporta geolocalización.', 'error');
                $icon.removeClass('fa-spin');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                function (position) {
                    var lat = position.coords.latitude;
                    var lng = position.coords.longitude;

                    console.log('Position detected:', lat, lng);

                    $('#driver_lat').val(lat);
                    $('#driver_lng').val(lng);

                    // Trigger geocoding to fill the address input
                    reverseGeocode(lat, lng, $icon);

                    tukiToast('Coordenadas detectadas. Buscando dirección...');
                },
                function (error) {
                    var msg = 'Error de ubicación: ';
                    switch (error.code) {
                        case error.PERMISSION_DENIED: msg += "Permiso denegado."; break;
                        case error.POSITION_UNAVAILABLE: msg += "Ubicación no disponible."; break;
                        case error.TIMEOUT: msg += "Tiempo de espera agotado."; break;
                        default: msg += error.message;
                    }
                    tukiToast(msg, 'error');
                    $icon.removeClass('fa-spin');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });

        // Mapbox Geocoding for Driver
        if ($('#driver_location_input').length) {
            var timeout = null;
            $('#driver_location_input').on('input', function () {
                var query = $(this).val();
                if (query.length < 5) return;

                if (!tukitaskDriver.mapboxKey) return;

                clearTimeout(timeout);
                timeout = setTimeout(function () {
                    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${window.mapboxgl?.accessToken || tukitaskDriver.mapboxKey}&limit=1&country=PY`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.features && data.features.length > 0) {
                                var [lng, lat] = data.features[0].center;
                                $('#driver_lat').val(lat);
                                $('#driver_lng').val(lng);
                                $('#driver_location_input').css('border-color', '#10B981');
                            }
                        })
                        .catch(err => console.error('Forward geocode error:', err));
                }, 800);
            });
        }

        function reverseGeocode(lat, lng, $spinningIcon) {
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${window.mapboxgl?.accessToken || tukitaskDriver.mapboxKey}&limit=1`)
                .then(r => {
                    if (!r.ok) throw new Error('Network response was not ok');
                    return r.json();
                })
                .then(data => {
                    if (data.features && data.features.length > 0) {
                        $('#driver_location_input').val(data.features[0].place_name);
                        tukiToast('Ubicación actualizada correctamente.', 'success');
                    } else {
                        tukiToast('No se encontró una dirección para estas coordenadas.', 'error');
                    }
                })
                .catch(err => {
                    console.error('Reverse geocode error:', err);
                    tukiToast('Error al conectar con Mapbox.', 'error');
                })
                .finally(() => {
                    if ($spinningIcon) $spinningIcon.removeClass('fa-spin');
                });
        }
    }

    /**
     * Initialize driver panel.
     */
    function initDriverPanel() {
        if ($('#driver-orders-list').length || $('.tuki-dashboard-grid').length) {
            // Refresh orders every 30 seconds for real-time sync
            tukiSmartInterval(loadDriverOrders, 45000);
        }
    }

    /**
     * Load driver orders via AJAX.
     */
    function loadDriverOrders() {
        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_get_driver_orders',
                nonce: tukitaskDriver.nonce
            },
            success: function (response) {
                if (response.success) {
                    renderOrders(response.data.orders);
                } else {
                    $('#driver-orders-list').html('<p>' + response.data.message + '</p>');
                }
            },
            error: function () {
                $('#driver-orders-list').html('<p>Error al cargar pedidos.</p>');
            }
        });
    }

    /**
     * Render orders list.
     */
    function renderOrders(orders) {
        var html = '';

        if (orders.length === 0) {
            html = '<p>No tienes pedidos asignados en este momento.</p>';
        } else {
            orders.forEach(function (order) {
                html += '<div class="order-card">';
                html += '<h4>Pedido #' + order.number + '</h4>';
                html += '<p><strong>Cliente:</strong> ' + order.customer_name + '</p>';
                html += '<p><strong>Dirección:</strong> ' + order.shipping_address + '</p>';
                html += '<p><strong>Total:</strong> $' + order.total + '</p>';
                html += '<p><strong>Estado:</strong> ' + order.status + '</p>';
                html += '<div class="order-actions">';
                html += '<button class="button button-primary accept-order" data-order-id="' + order.id + '">Aceptar</button>';
                html += '<button class="button reject-order" data-order-id="' + order.id + '">Rechazar</button>';
                html += '<button class="button update-delivery-status" data-order-id="' + order.id + '">Actualizar Estado</button>';
                html += '</div>';
                html += '</div>';
            });
        }

        $('#driver-orders-list').html(html);

        // Bind click events
        $(document).on('click', '.accept-order', handleAcceptOrder);
        $(document).on('click', '.reject-order', handleRejectOrder);
        $(document).on('click', '.tuki-accept-order', handleAcceptOrder); // Modern UI
        // $(document).on('click', '.update-delivery-status', handleUpdateDeliveryStatus); // Deprecated in favor of new flow

        // New Validation Events
        $(document).on('click', 'button.tuki-btn-deliver-modal', function(e) {
            e.preventDefault();
            var orderId = $(this).data('id');
            $('#delivery-modal-' + orderId).show();
        });
        $(document).on('click', '.tuki-modal-close', function(e) {
            e.preventDefault();
            var modalId = $(this).data('modal');
            $('#' + modalId).hide();
        });
        $(document).on('click', '.tuki-validate-pickup', handlePickupValidation);
        $(document).on('click', '.tuki-validate-delivery', handleDeliveryValidation);
    }

    /**
     * Handle Pickup Validation
     */
    function handlePickupValidation(e) {
        console.log('Pickup validation triggered for ID:', $(this).data('id'));
        e.preventDefault();
        var $btn = $(this);
        var $modal = $btn.closest('.tuki-modal');

        // Get Order ID from data attribute
        var orderId = $btn.data('id');
        var code = $modal.find('.tuki-vendor-code-input').val().toUpperCase();

        if (!orderId) {
            tukiToast('ID de pedido inválido', 'error');
            return;
        }

        if (!code || code.length !== 6) {
            tukiToast('Por favor ingresa un código de vendedor válido (6 caracteres)', 'error');
            return;
        }

        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> ' + (tukitaskDriver.strings.validating || 'Validando...'));

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_validate_pickup',
                nonce: tukitaskDriver.nonce,
                order_id: orderId,
                code: code
            },
            success: function (response) {
                console.log('AJAX response:', response);
                if (response.success) {
                    tukiToast(response.data.message || 'Operación exitosa');
                    location.href = window.location.pathname + '?screen=out-for-delivery';
                } else {
                    tukiToast(response.data.message || 'Error', 'error');
                    $btn.prop('disabled', false).html('<i class="fas fa-truck"></i> Salir a Entregar');
                }
            },
            error: function (xhr, status, error) {
                console.log('AJAX error:', xhr, status, error);
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-truck"></i> Salir a Entregar');
            }
        });
    }

    /**
     * Handle Delivery Validation & POD
     */
    function handleDeliveryValidation(e) {
        e.preventDefault();
        var $btn = $(this);
        var $modal = $btn.closest('.tuki-modal');

        // Get Order ID from data attribute
        var orderId = $btn.data('id');
        var code = $modal.find('.tuki-delivery-code-input').val().toUpperCase();
        var $fileInput = $modal.find('.tuki-pod-input');

        if (!orderId) {
            tukiToast('ID de pedido inválido', 'error');
            return;
        }

        if (!code || code.length !== 6) {
            tukiToast('Por favor ingresa un código de entrega válido (6 caracteres)', 'error');
            return;
        }

        if ($fileInput[0].files.length === 0) {
            tukiToast('Por favor sube una foto como prueba de entrega', 'error');
            return;
        }

        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

        var fd = new FormData();
        fd.append('action', 'tukitask_validate_delivery');
        fd.append('nonce', tukitaskDriver.nonce);
        fd.append('order_id', orderId);
        fd.append('code', code);
        fd.append('pod_photo', $fileInput[0].files[0]);

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            processData: false,
            contentType: false,
            data: fd,
            success: function (response) {
                if (response.success) {
                    tukiToast(response.data.message);
                    location.href = window.location.pathname + '?screen=delivered';
                } else {
                    tukiToast(response.data.message, 'error');
                    $btn.prop('disabled', false).html('<i class="fas fa-check-double"></i> Entregar');
                }
            },
            error: function () {
                tukiToast('Error de conexión', 'error');
                $btn.prop('disabled', false).html('<i class="fas fa-check-double"></i> Entregar');
            }
        });
    }

    /**
     * Handle accept order.
     */
    function handleAcceptOrder(e) {
        console.log('Accept order triggered for ID:', $(this).data('id'));
        e.preventDefault();
        var orderId = $(this).data('order-id') || $(this).data('id');

        if (!confirm(tukitaskDriver.strings.confirm_accept)) {
            return;
        }

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_accept_order',
                nonce: tukitaskDriver.nonce,
                order_id: orderId
            },
            success: function (response) {
                if (response.success) {
                    tukiToast(response.data.message);
                    location.reload(); // Reload to update UI
                } else {
                    tukiToast(response.data.message, 'error');
                }
            }
        });
    }

    /**
     * Handle reject order.
     */
    function handleRejectOrder(e) {
        e.preventDefault();
        var orderId = $(this).data('order-id');

        if (!confirm(tukitaskDriver.strings.confirm_reject)) {
            return;
        }

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_reject_order',
                nonce: tukitaskDriver.nonce,
                order_id: orderId
            },
            success: function (response) {
                if (response.success) {
                    tukiToast(response.data.message);
                    location.reload(); // Reload to update UI
                } else {
                    tukiToast(response.data.message, 'error');
                }
            }
        });
    }

    /**
     * Handle update delivery status.
     */
    function handleUpdateDeliveryStatus(e) {
        e.preventDefault();
        var orderId = $(this).data('order-id');

        var status = prompt(tukitaskDriver.strings.update_status);
        if (!status) {
            return;
        }

        $.ajax({
            url: tukitaskDriver.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_update_delivery_status',
                nonce: tukitaskDriver.nonce,
                order_id: orderId,
                status: status
            },
            success: function (response) {
                if (response.success) {
                    tukiToast(response.data.message);
                    location.reload(); // Reload to update UI
                } else {
                    tukiToast(response.data.message, 'error');
                }
            }
        });
    }

    /**
     * Initialize status control.
     */
    function initStatusControl() {
        $('#update-driver-status').on('click', function (e) {
            e.preventDefault();

            var driverId = $('#driver-status-select').data('driver-id');
            var status = $('#driver-status-select').val();

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_update_driver_status',
                    nonce: tukitaskDriver.nonce,
                    driver_id: driverId,
                    status: status
                },
                success: function (response) {
                    if (response.success) {
                        tukiToast(response.data.message);
                    } else {
                        tukiToast(response.data.message, 'error');
                    }
                }
            });
        });
    }

    /**
     * PWA and Push Notifications (Phase 20).
     */
    function initPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register(tukitaskDriver.pwaRoot + 'sw.js').then(function (registration) {
                    console.log('ServiceWorker registration successful');
                    // Only request push permission if a VAPID/FCM key is configured
                    if (typeof tukitaskDriver !== 'undefined' && tukitaskDriver.fcmSenderId) {
                        requestPushPermission(registration);
                    } else {
                        console.log('TukiTask: No push key configured, skipping push permission request');
                    }
                }, function (err) {
                    console.log('ServiceWorker registration failed: ', err);
                });
            });
        }
    }

    function requestPushPermission(registration) {
        if (!('Notification' in window)) return;

        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                registerFCMToken(registration);
            }
        });
    }

    function registerFCMToken(registration) {
        // Skip if no valid FCM Sender ID configured
        if (typeof tukitaskDriver === 'undefined' || typeof tukitaskDriver.fcmSenderId !== 'string' || tukitaskDriver.fcmSenderId.length < 10) {
            console.log('TukiTask: FCM Sender ID not configured, skipping push registration');
            return;
        }
        
        try {
            // Note: In a real production with full Firebase JS SDK, we'd use getToken()
            // For this implementation, we use the standard PushManager Subscription as a 'token'
            // Convert VAPID key safely
            var applicationServerKey = null;
            try {
                applicationServerKey = urlBase64ToUint8Array(tukitaskDriver.fcmSenderId);
            } catch (e) {
                console.log('TukiTask: Invalid VAPID key, skipping push registration', e.message);
            }

            if (!applicationServerKey) {
                return;
            }

            registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            }).then(subscription => {
                const token = JSON.stringify(subscription);
                $.ajax({
                    url: tukitaskDriver.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'tukitask_register_fcm_token',
                        security: tukitaskDriver.nonce,
                        token: token
                    }
                });
            }).catch(function(err) {
                console.log('TukiTask: Push subscription failed:', err.message);
            });
        } catch (e) {
            console.log('TukiTask: FCM registration error:', e.message);
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Mobile Store Control.
     */
    function initMobileStore() {
        $(document).on('change', '#tuki-mobile-toggle', function () {
            var isChecked = $(this).is(':checked');
            var driverId = $(this).data('driver-id');
            var $label = $('#tuki-mobile-label');

            $label.text(isChecked ? 'Sincronizando...' : 'Deshabilitando...');

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_toggle_mobile_store',
                    nonce: tukitaskDriver.nonce,
                    driver_id: driverId,
                    activate: isChecked
                },
                success: function (response) {
                    if (response.success) {
                        $label.text(isChecked ? 'Activa y visible' : 'Inactiva');
                        tukiToast(response.data.message);
                    } else {
                        tukiToast(response.data.message, 'error');
                        $('#tuki-mobile-toggle').prop('checked', !isChecked);
                        $label.text(!isChecked ? 'Activa y visible' : 'Inactiva');
                    }
                },
                error: function () {
                    tukiToast('Error al conectar con el servidor', 'error');
                    $('#tuki-mobile-toggle').prop('checked', !isChecked);
                    $label.text(!isChecked ? 'Activa y visible' : 'Inactiva');
                }
            });
        });
    }

    /**
     * Driver Withdrawal Request Handler.
     */
    function initWithdrawalRequest() {
        $(document).on('click', '.tuki-request-driver-withdrawal', function (e) {
            e.preventDefault();
            var $btn = $(this);
            var amount = parseFloat($('#driver-withdraw-amount').val());
            var balance = parseFloat($('#driver-withdraw-amount').attr('max'));
            
            // Validate amount
            if (!amount || amount <= 0) {
                tukiToast('Ingresa un monto válido', 'error');
                return;
            }

            if (amount < 100) {
                tukiToast('El monto mínimo es 100', 'error');
                return;
            }

            if (amount > balance) {
                tukiToast('Saldo insuficiente', 'error');
                return;
            }

            // Disable button
            $btn.prop('disabled', true);
            var originalText = $btn.html();
            $btn.html('<i class="fas fa-spinner fa-spin"></i> Procesando...');

            $.ajax({
                url: tukitaskDriver.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_request_driver_withdrawal',
                    nonce: tukitaskDriver.nonce,
                    amount: amount
                },
                success: function (response) {
                    if (response.success) {
                        tukiToast('✓ Solicitud enviada correctamente', 'success');
                        setTimeout(function() {
                            // Close modal
                            document.getElementById('tuki-driver-withdraw-modal').classList.remove('active');
                            // Reload page to show the new withdrawal request
                            location.reload();
                        }, 1500);
                    } else {
                        tukiToast('❌ ' + (response.data?.message || 'Error en la solicitud'), 'error');
                        $btn.prop('disabled', false).html(originalText);
                    }
                },
                error: function (err) {
                    console.error('Withdrawal error:', err);
                    tukiToast('❌ Error al conectar con el servidor', 'error');
                    $btn.prop('disabled', false).html(originalText);
                }
            });
        });
    }

    /**
     * Professional Order Card - Mapbox Integration
     */
    function initProfessionalOrderCard() {
        if (typeof mapboxgl === 'undefined') {
            console.warn('Mapbox GL not loaded yet');
            return;
        }

        $('.tuki-order-card-pro').each(function() {
            const $card = $(this);
            const pickupLat = $card.data('pickup-lat');
            const pickupLng = $card.data('pickup-lng');
            const deliveryLat = $card.data('delivery-lat');
            const deliveryLng = $card.data('delivery-lng');
            const mapId = 'tuki-map-' + $card.data('id');
            const $mapContainer = $('#' + mapId);

            // Initialize map if coordinates exist
            if (pickupLat && pickupLng && deliveryLat && deliveryLng && $mapContainer.length > 0) {
                initMapboxMap($mapContainer[0], pickupLat, pickupLng, deliveryLat, deliveryLng);
            }
        });
    }

    function initMapboxMap(container, pickupLat, pickupLng, deliveryLat, deliveryLng) {
        try {
            if (!tukitaskDriver.mapboxKey) {
                console.warn('Mapbox API key not configured');
                return;
            }

            mapboxgl.accessToken = tukitaskDriver.mapboxKey;

            const map = new mapboxgl.Map({
                container: container,
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [(parseFloat(pickupLng) + parseFloat(deliveryLng)) / 2, (parseFloat(pickupLat) + parseFloat(deliveryLat)) / 2],
                zoom: 12,
                pitch: 0,
                bearing: 0
            });

            map.on('load', function() {
                // Add pickup marker
                new mapboxgl.Marker({ color: '#f59e0b' })
                    .setLngLat([pickupLng, pickupLat])
                    .setPopup(new mapboxgl.Popup().setText('Punto de Recogida (Tienda)'))
                    .addTo(map);

                // Add delivery marker
                new mapboxgl.Marker({ color: '#10b981' })
                    .setLngLat([deliveryLng, deliveryLat])
                    .setPopup(new mapboxgl.Popup().setText('Punto de Entrega (Cliente)'))
                    .addTo(map);

                // Draw line between points
                map.addSource('route', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': [
                                [pickupLng, pickupLat],
                                [deliveryLng, deliveryLat]
                            ]
                        }
                    }
                });

                map.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#4f46e5',
                        'line-width': 3,
                        'line-opacity': 0.7
                    }
                });

                // Fit bounds to show both points
                const bounds = new mapboxgl.LngLatBounds(
                    [Math.min(pickupLng, deliveryLng), Math.min(pickupLat, deliveryLat)],
                    [Math.max(pickupLng, deliveryLng), Math.max(pickupLat, deliveryLat)]
                );

                map.fitBounds(bounds, { padding: 50 });
            });

        } catch (e) {
            console.error('Mapbox initialization error:', e);
        }
    }

    /**
     * POD Photo Preview
     */
    function initPODPhotoPreview() {
        $(document).on('change', '.tuki-pod-input', function() {
            const file = this.files[0];
            const orderId = $(this).data('id');
            const $preview = $('#tuki-pod-preview-' + orderId);

            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    $preview.html('<img src="' + e.target.result + '" alt="POD Preview">');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    /**
     * Driver action bindings: chat, call, accept order, and file inputs.
     */
    function initDriverActions() {
        // Chat open (delegated)
        $(document).off('click.tukiOpenChat', '.tuki-open-chat').on('click.tukiOpenChat', '.tuki-open-chat', function (e) {
            e.preventDefault();
            const orderId = $(this).data('order-id') || $(this).attr('data-order-id');
            const recipientId = $(this).data('recipient-id') || $(this).attr('data-recipient-id');
            const recipientName = $(this).data('recipient-name') || $(this).closest('.tuki-order-card-pro').find('.tuki-timeline-content .tuki-timeline-label').first().text() || '';
            if (!orderId || !recipientId) {
                tukiToast('Datos de chat incompletos', 'error');
                return;
            }
            if (typeof openChat === 'function') openChat(orderId, recipientId, recipientName);
        });

        // Call links - ensure they open tel: on devices; add click handler for fallback
        $(document).off('click.tukiCall', '.tuki-contact-link[href^="tel:"]').on('click.tukiCall', '.tuki-contact-link[href^="tel:"]', function (e) {
            // let default behavior proceed; but provide feedback on desktop
            const href = $(this).attr('href');
            if (!href) return;
            // On desktop, show a toast that action will attempt to call
            if (!/Mobi|Android/i.test(navigator.userAgent)) {
                tukiToast('Iniciando llamada: ' + href.replace('tel:', ''), 'info');
            }
        });

        // Accept order (supports data-order-id or data-id attributes)
        $(document).off('click.tukiAccept', '.tuki-accept-order').on('click.tukiAccept', '.tuki-accept-order', function (e) {
            e.preventDefault();
            var $btn = $(this);
            var orderId = $btn.data('order-id') || $btn.data('id') || $btn.attr('data-id') || $btn.attr('data-order-id');
            if (!orderId) { tukiToast('Orden inválida', 'error'); return; }
            if (!confirm(tukitaskDriver.strings.confirm_accept || '¿Aceptar pedido?')) return;
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
            $.post(tukitaskDriver.ajaxUrl, { action: 'tukitask_accept_order', nonce: tukitaskDriver.nonce, order_id: orderId })
                .done(function (response) {
                    if (response.success) {
                        tukiToast(response.data.message || 'Pedido aceptado', 'success');
                        setTimeout(function(){ location.reload(); }, 800);
                    } else {
                        tukiToast(response.data.message || 'Error', 'error');
                        $btn.prop('disabled', false).html(tukitaskDriver.strings.accept || 'Aceptar');
                    }
                }).fail(function () {
                    tukiToast('Error de conexión', 'error');
                    $btn.prop('disabled', false).html(tukitaskDriver.strings.accept || 'Aceptar');
                });
        });

        // Re-bind existing validation buttons to ensure delegation
        $(document).off('click.tukiPickup', 'button.tuki-btn-pickup').on('click.tukiPickup', 'button.tuki-btn-pickup', handlePickupValidation);
        console.log('Pickup handler re-attached');
        $(document).off('click.tukiDelivery', '.tuki-validate-delivery').on('click.tukiDelivery', '.tuki-validate-delivery', handleDeliveryValidation);
    }

    /**
     * Push Notifications (Firebase Messaging if senderId present) - registers SW and token
     */
    function initPushNotifications() {
        if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            return;
        }

        // Avoid asking repeatedly
        if (window.__tuki_push_initialized) return;
        window.__tuki_push_initialized = true;

        // Register service worker (sw.js should exist at site root)
        navigator.serviceWorker.register(tukitaskDriver.pwaRoot + 'sw.js').then(function (reg) {
            console.log('Service Worker registered for push', reg);

            // Ask permission
            if (Notification.permission === 'granted') {
                subscribeFCM();
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(function (permission) {
                    if (permission === 'granted') subscribeFCM();
                });
            }
        }).catch(function (err) {
            console.warn('SW registration failed:', err);
        });

        function subscribeFCM() {
            // If FCM sender configured, try to load Firebase and get token
            if (tukitaskDriver.fcmSenderId) {
                // Load Firebase scripts dynamically if not present
                if (typeof firebase === 'undefined') {
                    var s1 = document.createElement('script'); s1.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'; document.head.appendChild(s1);
                    var s2 = document.createElement('script'); s2.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js'; document.head.appendChild(s2);
                    s2.onload = initializeFirebase;
                } else {
                    initializeFirebase();
                }
            } else {
                // Fallback: show notifications permission received but no FCM configured
                console.log('Notifications enabled but FCM senderId not set');
            }
        }

        function initializeFirebase() {
            try {
                if (!window.__tuki_firebase_init) {
                    firebase.initializeApp({ messagingSenderId: tukitaskDriver.fcmSenderId });
                    window.__tuki_firebase_init = true;
                }
                const messaging = firebase.messaging();
                messaging.getToken({ vapidKey: tukitaskDriver.fcmVapid || null }).then(function (currentToken) {
                    if (currentToken) {
                        console.log('FCM token obtained', currentToken);
                        // Send to server via AJAX
                        $.post(tukitaskDriver.ajaxUrl, { action: 'tukitask_register_fcm_token', nonce: tukitaskDriver.nonce, token: currentToken })
                            .done(function (resp) { console.log('FCM token registered:', resp); })
                            .fail(function () { console.warn('Failed to register FCM token'); });
                    } else {
                        console.warn('No registration token available. Request permission to generate one.');
                    }
                }).catch(function (err) { console.error('An error occurred while retrieving token. ', err); });

                // Handle incoming messages when page is in focus
                messaging.onMessage(function(payload) {
                    console.log('Message received. ', payload);
                    if (payload && payload.notification) {
                        new Notification(payload.notification.title, { body: payload.notification.body });
                    }
                });
            } catch (e) {
                console.error('Firebase init error:', e);
            }
        }
    }

    // Initialize on document ready
    $(document).on('ready', function() {
        initProfessionalOrderCard();
        initPODPhotoPreview();
        initDriverActions();
        initPushNotifications();
        initOrderFilters();
    });

    // Initialize on dynamic content loads (AJAX)
    $(document).ajaxComplete(function() {
        initProfessionalOrderCard();
        initPODPhotoPreview();
        initDriverActions();
        initPushNotifications();
        initOrderFilters();
    });

    /**
     * Order Filters: client-side filtering of rendered order cards
     */
    function initOrderFilters() {
        if ($('#driver-orders-list').length === 0) return;

        // Filter function
        function applyFilters() {
            var q = ($('#tuki-filter-search').val() || '').toLowerCase();
            var status = $('#tuki-filter-status').val();

            $('#driver-orders-list').find('.tuki-order-card-pro, .tuki-order-card').each(function() {
                var $card = $(this);
                var text = ($card.text() || '').toLowerCase();
                var matchesQ = q === '' || text.indexOf(q) !== -1;
                var matchesStatus = true;
                if (status) {
                    matchesStatus = ($card.attr('data-status') || '').toLowerCase() === status.toLowerCase() || ($card.data('status') || '') === status;
                }
                if (matchesQ && matchesStatus) $card.show(); else $card.hide();
            });
        }

        $('#tuki-filter-search').off('input.tukiFilter').on('input.tukiFilter', function() { applyFilters(); });
        $('#tuki-filter-status').off('change.tukiFilter').on('change.tukiFilter', function() { applyFilters(); });
        $('#tuki-filter-clear').off('click.tukiFilter').on('click.tukiFilter', function(e){ e.preventDefault(); $('#tuki-filter-search').val(''); $('#tuki-filter-status').val(''); applyFilters(); });
    }

    /**
     * Delivery Broadcasting - Pull-based package delivery polling.
     * Polls server for available deliveries in driver's range.
     * Shows as "solicitud" cards - first driver to accept wins.
     */
    // Helpers for delivery display
    function estTime(km) {
        return Math.max(1, Math.round(parseFloat(km || 0) * 2.5));
    }
    function formatPrice(val) {
        var n = parseFloat(val || 0);
        return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function initDeliveryBroadcasting() {
        var hasDashboard = $('#tuki-availability-toggle').length > 0;
        var hasDeliveriesScreen = $('.tuki-deliveries-screen').length > 0;

        // Poll on dashboard (when available) OR deliveries screen
        if (!hasDashboard && !hasDeliveriesScreen) return;

        function shouldPoll() {
            // On deliveries screen → always poll
            if (hasDeliveriesScreen) return true;
            // On dashboard → poll only if toggle is checked (available)
            return $('#tuki-availability-toggle').is(':checked');
        }

        // Poll for new delivery requests every 8s
        tukiSmartInterval(function() {
            if (shouldPoll()) {
                checkForNewDeliveries();
            }
        }, 10000);

        // Also check immediately on load
        if (shouldPoll()) {
            setTimeout(checkForNewDeliveries, 2000);
        }
    }

    // Pickup / complete delivery action handlers - MOVED TO FIRST IIFE
    // (kept here as no-op comment to preserve code structure)

    // Track which delivery IDs are currently visible to avoid duplicates
    window._tukiVisibleDeliveries = window._tukiVisibleDeliveries || {};

    function checkForNewDeliveries() {
        $.post(tukitaskDriver.ajaxUrl, {
            action: 'tukitask_get_pending_deliveries',
            nonce: tukitaskDriver.nonce
        }).done(function(resp) {
            if (!resp.success) return;

            var activeIds = {};

            // Show each pending delivery
            if (resp.data && resp.data.length > 0) {
                for (var i = 0; i < resp.data.length; i++) {
                    activeIds[resp.data[i].delivery_id] = true;
                    showDeliveryRequest(resp.data[i]);
                }
            }

            // Remove popups/cards for deliveries no longer pending (taken by another driver)
            $.each(window._tukiVisibleDeliveries, function(id) {
                if (!activeIds[id]) {
                    $('#delivery-popup-' + id).fadeOut(300, function() { $(this).remove(); });
                    $('.tuki-broadcast-card[data-delivery-id="' + id + '"]').fadeOut(300, function() { $(this).remove(); });
                    delete window._tukiVisibleDeliveries[id];
                }
            });
        });
    }

    function showDeliveryRequest(delivery) {
        var did = delivery.delivery_id;

        // Already showing this one
        if (window._tukiVisibleDeliveries[did]) return;
        window._tukiVisibleDeliveries[did] = true;

        // On deliveries screen → inject card into the pending list
        if ($('.tuki-deliveries-screen').length > 0) {
            var $pendingList = $('#tuki-pending-deliveries');
            if ($pendingList.length && !$pendingList.find('[data-delivery-id="' + did + '"]').length) {
                $pendingList.find('.tuki-no-pending').remove();
                $pendingList.append(buildDeliveryCard(delivery));
            }
            return;
        }

        // Otherwise → show floating popup notification (responsive)
        var html = '<div id="delivery-popup-' + did + '" class="tuki-delivery-popup-overlay" style="' +
            'position:fixed; top:0; left:0; right:0; bottom:0; z-index:99999; ' +
            'display:flex; align-items:flex-end; justify-content:center; background:rgba(0,0,0,0.6); padding:0;">' +
            '<div class="tuki-delivery-popup-card" style="background:white; border-radius:20px 20px 0 0; padding:1.2rem 1rem 1rem; ' +
            'box-shadow:0 -4px 30px rgba(0,0,0,0.25); width:100%; max-width:480px; max-height:85vh; overflow-y:auto; ' +
            'animation:tukiSlideUp 0.3s ease; -webkit-overflow-scrolling:touch;">' +
            '<div style="width:40px; height:4px; background:#d1d5db; border-radius:2px; margin:0 auto 0.75rem;"></div>' +
            '<div style="text-align:center; margin-bottom:0.5rem;">' +
            '<span style="background:#3b82f6; color:white; padding:4px 14px; border-radius:20px; font-size:0.75rem; font-weight:600;">' +
            '<i class="fas fa-bell"></i> SOLICITUD DE ENVÍO</span></div>' +
            '<h3 style="margin:0.5rem 0 0.75rem; color:#1e293b; text-align:center; font-size:1.1rem;"><i class="fas fa-box" style="color:#3b82f6;"></i> Nuevo envío de paquete</h3>' +
            '<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem; padding:0.75rem; background:#f8fafc; border-radius:10px;">' +
            '<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">' +
            '<i class="fas fa-circle" style="color:#10b981; font-size:0.5rem;"></i>' +
            '<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>' +
            '<i class="fas fa-circle" style="color:#ef4444; font-size:0.5rem;"></i></div>' +
            '<div style="flex:1; font-size:0.88rem;">' +
            '<div style="margin-bottom:0.6rem;"><strong style="color:#1e293b;">' + estTime(delivery.distance_to_pickup) + ' min &bull; ' + delivery.distance_to_pickup + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px; word-break:break-word;">' + delivery.pickup_address + '</div></div>' +
            '<div><strong style="color:#1e293b;">' + estTime(delivery.distance_km || 0) + ' min &bull; ' + (delivery.distance_km || 0) + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px; word-break:break-word;">' + delivery.delivery_address + '</div></div>' +
            '</div></div>' +
            (function() { var pm = delivery.payment_method || 'cash'; var pmLabel = pm === 'transfer' ? '🏦 Transferencia' : '💵 Efectivo'; var pmBg = pm === 'transfer' ? '#eff6ff' : '#f0fdf4'; var pmColor = pm === 'transfer' ? '#1d4ed8' : '#15803d'; return '<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; padding:0.5rem 0.75rem; background:' + pmBg + '; border-radius:8px;"><span style="font-weight:600; color:' + pmColor + '; font-size:0.85rem;">Cobro: ' + pmLabel + '</span></div>'; })() +
            '<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; margin-bottom:0.75rem; padding:0.5rem; gap:0.25rem;">' +
            '<span style="font-size:0.85rem;"><i class="fas fa-box"></i> ' + delivery.package_type + '</span>' +
            (delivery.customer_name ? '<span style="font-size:0.85rem;"><i class="fas fa-user"></i> ' + delivery.customer_name + '</span>' : '') +
            '<strong style="color:#10b981; font-size:1.3rem;">' + formatPrice(delivery.price) + '</strong>' +
            '</div>' +
            '<div style="display:flex; gap:0.5rem;">' +
            '<button class="tuki-accept-broadcast tuki-btn tuki-btn-success" data-type="bolt" data-delivery-id="' + did + '" ' +
            'style="flex:1; padding:14px; font-size:1rem; font-weight:600; border-radius:12px; border:none; background:#10b981; color:white; cursor:pointer;">' +
            '<i class="fas fa-check"></i> Aceptar Envío</button>' +
            '<button class="tuki-reject-broadcast" data-type="bolt" data-delivery-id="' + did + '" ' +
            'style="padding:14px 20px; border-radius:12px; background:#fee2e2; border:none; color:#ef4444; cursor:pointer; font-size:1rem;">' +
            '<i class="fas fa-times"></i></button>' +
            '</div>' +
            '</div></div>';

        // Inject animation CSS once
        if (!document.getElementById('tuki-delivery-popup-css')) {
            $('head').append('<style id="tuki-delivery-popup-css">' +
                '@keyframes tukiSlideUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }' +
                '@keyframes tukiFadeIn { from { opacity:0; } to { opacity:1; } }' +
                '.tuki-delivery-popup-overlay { -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }' +
                '</style>');
        }

        $('body').append(html);

        // Play loud alert sound (no external file needed)
        playDeliveryAlert();
    }

    /**
     * Generate a loud notification alert using Web Audio API.
     * Plays 3 short beeps to grab driver's attention.
     */
    function playDeliveryAlert() {
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            var ctx = new AudioCtx();

            function beep(startTime, freq, duration) {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'square';
                osc.frequency.value = freq;
                gain.gain.value = 1.0; // Full volume
                osc.start(startTime);
                osc.stop(startTime + duration);
            }

            // 6 rounds of 3 beeps: ascending frequency for urgency
            for (var r = 0; r < 6; r++) {
                var t = ctx.currentTime + r * 0.6;
                beep(t, 880, 0.12);        // A5
                beep(t + 0.15, 1100, 0.12); // C#6
                beep(t + 0.3, 1320, 0.15);  // E6
            }
        } catch(e) {}
    }

    function buildDeliveryCard(delivery) {
        var pickupMin = estTime(delivery.distance_to_pickup);
        var deliveryMin = estTime(delivery.distance_km || 0);
        var deliveryKm = delivery.distance_km || 0;

        return '<div class="tuki-broadcast-card" data-delivery-id="' + delivery.delivery_id + '" ' +
            'style="background:white; border-radius:12px; padding:1rem; margin-bottom:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.1); border-left:4px solid #3b82f6; word-break:break-word;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.25rem;">' +
            '<span style="font-weight:600;">#' + (delivery.tracking_code || '') + '</span>' +
            '<strong style="color:#10b981; font-size:1.15rem;">' + formatPrice(delivery.price) + '</strong>' +
            '</div>' +
            '<div style="display:flex; gap:0.6rem; margin-bottom:0.5rem;">' +
            '<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">' +
            '<i class="fas fa-circle" style="color:#10b981; font-size:0.45rem;"></i>' +
            '<div style="width:2px; flex:1; background:#d1d5db; margin:3px 0;"></div>' +
            '<i class="fas fa-circle" style="color:#ef4444; font-size:0.45rem;"></i></div>' +
            '<div style="flex:1; font-size:0.85rem;">' +
            '<div style="margin-bottom:0.5rem;"><strong>' + pickupMin + ' min &bull; ' + delivery.distance_to_pickup + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.8rem;">' + delivery.pickup_address + '</div></div>' +
            '<div><strong>' + deliveryMin + ' min &bull; ' + deliveryKm + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.8rem;">' + delivery.delivery_address + '</div></div>' +
            '</div></div>' +
            (function() { var pm = delivery.payment_method || 'cash'; var pmLabel = pm === 'transfer' ? '🏦 Transferencia' : '💵 Efectivo'; var pmBg = pm === 'transfer' ? '#eff6ff' : '#f0fdf4'; var pmColor = pm === 'transfer' ? '#1d4ed8' : '#15803d'; return '<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; padding:0.4rem 0.6rem; background:' + pmBg + '; border-radius:6px;"><span style="font-weight:600; color:' + pmColor + '; font-size:0.8rem;">Cobro: ' + pmLabel + '</span></div>'; })() +
            '<div style="display:flex; flex-wrap:wrap; justify-content:space-between; font-size:0.8rem; color:#64748b; margin-bottom:0.5rem; gap:0.25rem;">' +
            '<span><i class="fas fa-box"></i> ' + delivery.package_type + '</span>' +
            (delivery.customer_name ? '<span><i class="fas fa-user"></i> ' + delivery.customer_name + '</span>' : '') +
            '</div>' +
            '<div style="display:flex; gap:0.5rem;">' +
            '<button class="tuki-accept-broadcast tuki-btn tuki-btn-success" data-type="bolt" data-delivery-id="' + delivery.delivery_id + '" style="flex:1; padding:12px; border-radius:10px; border:none; background:#10b981; color:white; cursor:pointer; font-weight:600; font-size:0.95rem;">' +
            '<i class="fas fa-check"></i> Aceptar</button>' +
            '<button class="tuki-reject-broadcast" data-type="bolt" data-delivery-id="' + delivery.delivery_id + '" style="background:#fee2e2; border:none; padding:12px 18px; border-radius:10px; cursor:pointer; color:#ef4444; font-size:0.95rem;">' +
            '<i class="fas fa-times"></i></button>' +
            '</div>' +
            '</div>';
    }

    // ===== Order Broadcast System (WC Orders - first to accept wins) =====
    window._tukiKnownBroadcastOrders = window._tukiKnownBroadcastOrders || {};

    function initOrderBroadcasting() {
        var hasAssignedScreen = $('.tuki-assigned-screen').length > 0;
        var hasDashboard = $('#tuki-availability-toggle').length > 0;

        if (!hasAssignedScreen && !hasDashboard) return;

        function shouldPoll() {
            if (hasAssignedScreen) return true;
            return $('#tuki-availability-toggle').is(':checked');
        }

        // Poll every 8s (same as delivery broadcasting)
        tukiSmartInterval(function() {
            if (shouldPoll()) checkForBroadcastOrders();
        }, 10000);

        // Initial check
        if (shouldPoll()) {
            setTimeout(function() {
                // Seed known broadcast orders from page (no sound on load)
                $('.tuki-broadcast-order-card[data-order-id]').each(function() {
                    var oid = $(this).data('order-id');
                    if (oid) window._tukiKnownBroadcastOrders[oid] = true;
                });
                checkForBroadcastOrders();
            }, 3000);
        }
    }

    function checkForBroadcastOrders() {
        $.post(tukitaskDriver.ajaxUrl, {
            action: 'tukitask_get_broadcast_orders',
            nonce: tukitaskDriver.nonce
        }).done(function(resp) {
            if (!resp.success || !resp.data || !resp.data.orders) return;

            var orders = resp.data.orders;
            var activeIds = {};
            var hasNew = false;

            for (var i = 0; i < orders.length; i++) {
                var o = orders[i];
                activeIds[o.order_id] = true;

                if (!window._tukiKnownBroadcastOrders[o.order_id]) {
                    window._tukiKnownBroadcastOrders[o.order_id] = true;
                    hasNew = true;

                    // On assigned screen → inject card into broadcast list
                    if ($('.tuki-assigned-screen').length > 0) {
                        var $list = $('#tuki-broadcast-orders');
                        if ($list.length && !$list.find('[data-order-id="' + o.order_id + '"]').length) {
                            $list.append(buildBroadcastOrderCard(o));
                        }
                    } else {
                        // On dashboard → show popup notification
                        showBroadcastOrderPopup(o);
                    }
                }
            }

            // Remove cards for orders no longer available (taken by another driver)
            $.each(window._tukiKnownBroadcastOrders, function(id) {
                if (!activeIds[id]) {
                    $('#broadcast-order-popup-' + id).fadeOut(300, function() { $(this).remove(); });
                    $('.tuki-broadcast-order-card[data-order-id="' + id + '"]').fadeOut(300, function() { $(this).remove(); });
                    delete window._tukiKnownBroadcastOrders[id];
                }
            });

            if (hasNew) {
                playDeliveryAlert();
            }
        });
    }

    function buildBroadcastOrderCard(o) {
        var pickupMin = Math.max(1, Math.round((o.pickup_distance || 0) * 2.5));
        var deliveryMin = Math.max(1, Math.round((o.delivery_distance || 0) * 2.5));

        return '<div class="tuki-order-card tuki-broadcast-order-card" data-order-id="' + o.order_id + '" ' +
            'style="background:white; border-radius:12px; padding:1rem; margin-bottom:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.1); border-left:4px solid #f59e0b; animation:tukiFadeIn 0.3s ease;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">' +
            '<span style="font-weight:600; font-size:0.95rem;">#' + o.order_number + '</span>' +
            '<strong style="color:#10b981; font-size:1.15rem;">' + formatPrice(o.total) + '</strong>' +
            '</div>' +
            '<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem; padding:0.75rem; background:#f8fafc; border-radius:10px;">' +
            '<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">' +
            '<i class="fas fa-circle" style="color:#10b981; font-size:0.55rem;"></i>' +
            '<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>' +
            '<i class="fas fa-circle" style="color:#ef4444; font-size:0.55rem;"></i></div>' +
            '<div style="flex:1; font-size:0.88rem;">' +
            '<div style="margin-bottom:0.6rem;">' +
            '<strong style="color:#1e293b;">' + pickupMin + ' min &bull; ' + (o.pickup_distance || 0) + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;">' + (o.pickup_address || 'Dirección del vendedor') + '</div>' +
            (o.vendor_name ? '<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-store" style="font-size:0.7rem;"></i> ' + o.vendor_name + '</div>' : '') +
            '</div>' +
            '<div>' +
            '<strong style="color:#1e293b;">' + deliveryMin + ' min &bull; ' + (o.delivery_distance || 0) + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;">' + o.delivery_address + '</div>' +
            '<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-user" style="font-size:0.7rem;"></i> ' + o.customer_name + '</div>' +
            '</div></div></div>' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.82rem; color:#64748b;">' +
            '<span><i class="fas fa-box"></i> ' + o.items_count + ' artículo' + (o.items_count > 1 ? 's' : '') + '</span>' +
            (o.payment_method ? '<span><i class="fas fa-credit-card"></i> ' + o.payment_method + '</span>' : '') +
            '</div>' +
            '<div style="display:flex; gap:0.5rem;">' +
            '<button class="tuki-accept-broadcast tuki-btn tuki-btn-success" data-type="woo" data-order-id="' + o.order_id + '" ' +
            'style="flex:1; padding:12px; border-radius:10px; border:none; background:#10b981; color:white; cursor:pointer; font-weight:600; font-size:0.95rem;">' +
            '<i class="fas fa-check"></i> Aceptar</button>' +
            '<button class="tuki-reject-broadcast" data-type="woo" data-order-id="' + o.order_id + '" ' +
            'style="padding:12px 18px; border-radius:10px; background:#fee2e2; border:none; color:#ef4444; cursor:pointer; font-size:0.95rem;">' +
            '<i class="fas fa-times"></i></button>' +
            '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(o.pickup_address || '') + '&travelmode=driving" ' +
            'target="_blank" rel="noopener" style="padding:12px 16px; border-radius:10px; background:#3b82f6; border:none; color:white; cursor:pointer; font-size:0.95rem; text-decoration:none; display:flex; align-items:center;">' +
            '<i class="fas fa-location-arrow"></i></a>' +
            '</div></div>';
    }

    function showBroadcastOrderPopup(o) {
        var oid = o.order_id;
        if ($('#broadcast-order-popup-' + oid).length) return;

        var pickupMin = Math.max(1, Math.round((o.pickup_distance || 0) * 2.5));
        var deliveryMin = Math.max(1, Math.round((o.delivery_distance || 0) * 2.5));

        var html = '<div id="broadcast-order-popup-' + oid + '" class="tuki-delivery-popup-overlay" style="' +
            'position:fixed; top:0; left:0; right:0; bottom:0; z-index:99999; ' +
            'display:flex; align-items:flex-end; justify-content:center; background:rgba(0,0,0,0.6); padding:0;">' +
            '<div class="tuki-delivery-popup-card" style="background:white; border-radius:20px 20px 0 0; padding:1.2rem 1rem 1rem; ' +
            'box-shadow:0 -4px 30px rgba(0,0,0,0.25); width:100%; max-width:480px; max-height:85vh; overflow-y:auto; ' +
            'animation:tukiSlideUp 0.3s ease; -webkit-overflow-scrolling:touch;">' +
            '<div style="width:40px; height:4px; background:#d1d5db; border-radius:2px; margin:0 auto 0.75rem;"></div>' +
            '<div style="text-align:center; margin-bottom:0.5rem;">' +
            '<span style="background:#f59e0b; color:white; padding:4px 14px; border-radius:20px; font-size:0.75rem; font-weight:600;">' +
            '<i class="fas fa-bell"></i> NUEVO PEDIDO DISPONIBLE</span></div>' +
            '<h3 style="margin:0.5rem 0 0.75rem; color:#1e293b; text-align:center; font-size:1.1rem;">' +
            '<i class="fas fa-clipboard-list" style="color:#f59e0b;"></i> Pedido #' + o.order_number + '</h3>' +
            '<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem; padding:0.75rem; background:#f8fafc; border-radius:10px;">' +
            '<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">' +
            '<i class="fas fa-circle" style="color:#10b981; font-size:0.5rem;"></i>' +
            '<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>' +
            '<i class="fas fa-circle" style="color:#ef4444; font-size:0.5rem;"></i></div>' +
            '<div style="flex:1; font-size:0.88rem;">' +
            '<div style="margin-bottom:0.6rem;">' +
            '<strong style="color:#1e293b;">' + pickupMin + ' min &bull; ' + (o.pickup_distance || 0) + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px; word-break:break-word;">' + (o.pickup_address || '') + '</div>' +
            (o.vendor_name ? '<div style="color:#94a3b8; font-size:0.78rem;"><i class="fas fa-store" style="font-size:0.7rem;"></i> ' + o.vendor_name + '</div>' : '') +
            '</div>' +
            '<div>' +
            '<strong style="color:#1e293b;">' + deliveryMin + ' min &bull; ' + (o.delivery_distance || 0) + ' km</strong>' +
            '<div style="color:#6b7280; font-size:0.82rem; margin-top:1px; word-break:break-word;">' + o.delivery_address + '</div>' +
            '<div style="color:#94a3b8; font-size:0.78rem;"><i class="fas fa-user" style="font-size:0.7rem;"></i> ' + o.customer_name + '</div>' +
            '</div></div></div>' +
            '<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; margin-bottom:0.75rem; padding:0.5rem; gap:0.25rem;">' +
            '<span style="font-size:0.85rem;"><i class="fas fa-box"></i> ' + o.items_count + ' artículo' + (o.items_count > 1 ? 's' : '') + '</span>' +
            (o.payment_method ? '<span style="font-size:0.85rem;"><i class="fas fa-credit-card"></i> ' + o.payment_method + '</span>' : '') +
            '<strong style="color:#10b981; font-size:1.3rem;">' + formatPrice(o.total) + '</strong>' +
            '</div>' +
            '<div style="display:flex; gap:0.5rem;">' +
            '<button class="tuki-accept-broadcast tuki-btn tuki-btn-success" data-type="woo" data-order-id="' + oid + '" ' +
            'style="flex:1; padding:14px; font-size:1rem; font-weight:600; border-radius:12px; border:none; background:#10b981; color:white; cursor:pointer;">' +
            '<i class="fas fa-check"></i> Aceptar Pedido</button>' +
            '<button class="tuki-reject-broadcast" data-type="woo" data-order-id="' + oid + '" ' +
            'style="padding:14px 20px; border-radius:12px; background:#fee2e2; border:none; color:#ef4444; cursor:pointer; font-size:1rem;">' +
            '<i class="fas fa-times"></i></button>' +
            '</div></div></div>';

        // Inject animation CSS once
        if (!document.getElementById('tuki-delivery-popup-css')) {
            $('head').append('<style id="tuki-delivery-popup-css">' +
                '@keyframes tukiSlideUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }' +
                '@keyframes tukiFadeIn { from { opacity:0; } to { opacity:1; } }' +
                '.tuki-delivery-popup-overlay { -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }' +
                '</style>');
        }

        $('body').append(html);
    }

    // Initialize delivery broadcasting alongside other modules
    $(document).ready(function() {
        initDeliveryBroadcasting();
        initOrderBroadcasting();
    });

})(jQuery);

