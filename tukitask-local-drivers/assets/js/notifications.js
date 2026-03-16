/**
 * TukiTask Proximity Notifications System
 * Handles notification subscriptions, display, and push notifications
 */
(function($) {
    'use strict';
    
    var pollInterval = null;
    var lastCheck = Date.now();
    
    // Initialize on document ready
    $(document).ready(function() {
        initNotifications();
        requestPushPermission();
        startPolling();
    });
    
    /**
     * Initialize notifications
     */
    function initNotifications() {
        // Update badge
        updateBadge(tukiNotifications.unreadCount);
        
        // Bind global functions
        window.tukiLoadNotifications = loadNotifications;
        window.tukiMarkAllRead = markAllRead;
        window.tukiToggleNotifySubscription = toggleSubscription;
    }
    
    /**
     * Load notifications into panel
     */
    function loadNotifications() {
        var $list = $('#tukiNotifList');
        
        $.ajax({
            url: tukiNotifications.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_get_notifications',
                nonce: tukiNotifications.nonce
            },
            success: function(response) {
                if (response.success) {
                    renderNotifications(response.data.notifications);
                    updateBadge(response.data.unread_count);
                }
            }
        });
    }
    
    /**
     * Render notifications list
     */
    function renderNotifications(notifications) {
        var $list = $('#tukiNotifList');
        
        if (!notifications || notifications.length === 0) {
            $list.html(
                '<div class="tuki-notif-empty">' +
                    '<div class="icon">🔔</div>' +
                    '<p>' + 'No tienes notificaciones' + '</p>' +
                '</div>'
            );
            return;
        }
        
        var html = '';
        notifications.forEach(function(notif) {
            var iconClass = notif.type.replace('_nearby', '');
            var distanceHtml = notif.distance_m ? 
                '<span class="tuki-notif-distance">📍 ' + formatDistance(notif.distance_m) + '</span>' : '';
            
            html += '<div class="tuki-notif-item ' + (notif.read ? '' : 'unread') + '" ' +
                        'data-id="' + notif.id + '" ' +
                        'onclick="tukiOpenNotification(\'' + notif.id + '\', \'' + (notif.link || '') + '\')">' +
                    '<div class="tuki-notif-icon ' + iconClass + '">' + notif.icon + '</div>' +
                    '<div class="tuki-notif-content">' +
                        '<div class="tuki-notif-title">' + escapeHtml(notif.title) + '</div>' +
                        '<div class="tuki-notif-message">' + escapeHtml(notif.message) + '</div>' +
                        '<div class="tuki-notif-meta">' +
                            '<span class="tuki-notif-time">' + timeAgo(notif.created_at) + '</span>' +
                            distanceHtml +
                        '</div>' +
                    '</div>' +
                '</div>';
        });
        
        $list.html(html);
    }
    
    /**
     * Open notification
     */
    window.tukiOpenNotification = function(notifId, link) {
        // Mark as read
        $.post(tukiNotifications.ajaxUrl, {
            action: 'tukitask_mark_notification_read',
            nonce: tukiNotifications.nonce,
            notification_id: notifId
        }, function(response) {
            if (response.success) {
                updateBadge(response.data.unread_count);
                $('.tuki-notif-item[data-id="' + notifId + '"]').removeClass('unread');
            }
        });
        
        // Navigate if link
        if (link) {
            window.location.href = link;
        }
    };
    
    /**
     * Mark all as read
     */
    function markAllRead() {
        $.post(tukiNotifications.ajaxUrl, {
            action: 'tukitask_mark_notification_read',
            nonce: tukiNotifications.nonce,
            mark_all: 'true'
        }, function(response) {
            if (response.success) {
                updateBadge(0);
                $('.tuki-notif-item').removeClass('unread');
            }
        });
    }
    
    /**
     * Toggle notification subscription
     */
    function toggleSubscription(btn) {
        var $btn = $(btn);
        var type = $btn.data('type');
        var targetId = $btn.data('target-id');
        var isSubscribed = $btn.hasClass('subscribed');
        
        // Get location for subscription
        if (!isSubscribed && navigator.geolocation) {
            $btn.prop('disabled', true);
            
            navigator.geolocation.getCurrentPosition(function(pos) {
                saveSubscription(type, targetId, pos.coords.latitude, pos.coords.longitude, $btn);
            }, function() {
                // Fallback without location
                saveSubscription(type, targetId, 0, 0, $btn);
            }, { enableHighAccuracy: true, timeout: 5000 });
        } else {
            // Unsubscribe
            $.post(tukiNotifications.ajaxUrl, {
                action: 'tukitask_unsubscribe_notification',
                nonce: tukiNotifications.nonce,
                type: type,
                target_id: targetId
            }, function(response) {
                if (response.success) {
                    $btn.removeClass('subscribed');
                    $btn.find('.icon').text('🔔');
                    $btn.find('.label').text(tukiNotifications.i18n.notifyMe);
                    showToast(response.data.message, 'info');
                }
            });
        }
    }
    
    /**
     * Save subscription
     */
    function saveSubscription(type, targetId, lat, lng, $btn) {
        $.post(tukiNotifications.ajaxUrl, {
            action: 'tukitask_subscribe_notification',
            nonce: tukiNotifications.nonce,
            type: type,
            target_id: targetId,
            lat: lat,
            lng: lng
        }, function(response) {
            $btn.prop('disabled', false);
            
            if (response.success) {
                $btn.addClass('subscribed');
                $btn.find('.icon').text('✓');
                $btn.find('.label').text(tukiNotifications.i18n.subscribed);
                showToast(response.data.message, 'success');
            }
        });
    }
    
    /**
     * Update notification badge
     */
    function updateBadge(count) {
        var $badge = $('.tuki-notif-badge');
        if (count > 0) {
            $badge.text(count > 99 ? '99+' : count).removeClass('hide');
        } else {
            $badge.addClass('hide');
        }
    }
    
    /**
     * Request push notification permission
     */
    function requestPushPermission() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            return;
        }
        
        if (Notification.permission === 'granted' && tukiNotifications.settings.push_enabled) {
            subscribeToPush();
        }
    }
    
    /**
     * Subscribe to push notifications
     */
    function subscribeToPush() {
        if (!tukiNotifications.vapidPublicKey) return;
        
        navigator.serviceWorker.ready.then(function(registration) {
            return registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(tukiNotifications.vapidPublicKey)
            });
        }).then(function(subscription) {
            // Save subscription to server
            $.post(tukiNotifications.ajaxUrl, {
                action: 'tukitask_save_push_subscription',
                nonce: tukiNotifications.nonce,
                subscription: JSON.stringify(subscription)
            });
        }).catch(function(err) {
            console.log('Push subscription failed:', err);
        });
    }
    
    /**
     * Start polling for new notifications
     */
    function startPolling() {
        // Poll every 30 seconds
        pollInterval = setInterval(function() {
            checkNewNotifications();
        }, 30000);
    }
    
    /**
     * Check for new notifications
     */
    function checkNewNotifications() {
        $.ajax({
            url: tukiNotifications.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_get_notifications',
                nonce: tukiNotifications.nonce
            },
            success: function(response) {
                if (response.success) {
                    var newCount = response.data.unread_count;
                    var currentCount = parseInt($('.tuki-notif-badge').text()) || 0;
                    
                    if (newCount > currentCount) {
                        // New notification received
                        updateBadge(newCount);
                        
                        // Show browser notification if permitted
                        if (Notification.permission === 'granted' && response.data.notifications.length > 0) {
                            var newest = response.data.notifications[0];
                            if (!newest.read) {
                                showBrowserNotification(newest);
                            }
                        }
                        
                        // Play sound
                        playNotificationSound();
                        
                        // Animate bell
                        animateBell();
                    }
                }
            }
        });
    }
    
    /**
     * Show browser notification
     */
    function showBrowserNotification(notif) {
        new Notification(notif.title, {
            body: notif.message,
            icon: '/wp-content/plugins/tukitask-local-drivers/assets/img/notification-icon.png',
            badge: '/wp-content/plugins/tukitask-local-drivers/assets/img/badge-icon.png',
            tag: notif.id,
            data: { url: notif.link }
        }).onclick = function(event) {
            event.preventDefault();
            window.focus();
            if (notif.link) {
                window.location.href = notif.link;
            }
        };
    }
    
    /**
     * Play notification sound
     */
    function playNotificationSound() {
        try {
            var audio = new Audio('/wp-content/plugins/tukitask-local-drivers/assets/sounds/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(function() {}); // Ignore autoplay errors
        } catch (e) {}
    }
    
    /**
     * Animate bell icon
     */
    function animateBell() {
        var $bell = $('.tuki-notif-bell');
        $bell.addClass('shake');
        setTimeout(function() {
            $bell.removeClass('shake');
        }, 500);
    }
    
    /**
     * Show toast notification
     */
    function showToast(message, type) {
        type = type || 'info';
        
        var icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ'
        };
        
        var $toast = $('<div class="tuki-toast ' + type + '">' +
            '<span>' + icons[type] + '</span>' +
            '<span>' + message + '</span>' +
            '</div>');
        
        $('body').append($toast);
        
        setTimeout(function() {
            $toast.addClass('show');
        }, 10);
        
        setTimeout(function() {
            $toast.removeClass('show');
            setTimeout(function() {
                $toast.remove();
            }, 300);
        }, 3000);
    }
    
    /**
     * Format distance
     */
    function formatDistance(meters) {
        if (meters < 1000) {
            return meters + 'm';
        }
        return (meters / 1000).toFixed(1) + 'km';
    }
    
    /**
     * Time ago helper
     */
    function timeAgo(dateString) {
        var date = new Date(dateString);
        var now = new Date();
        var seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'ahora';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'min';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        return Math.floor(seconds / 86400) + 'd';
    }
    
    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Convert VAPID key
     */
    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    // Add shake animation
    $('<style>')
        .text('.tuki-notif-bell.shake { animation: bellShake 0.5s ease; }' +
              '@keyframes bellShake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(15deg); } 75% { transform: rotate(-15deg); } }')
        .appendTo('head');
    
})(jQuery);
