<?php
/**
 * Sistema de Notificaciones de Proximidad
 * 
 * Notifica a clientes cuando:
 * - Un vendedor favorito está cerca
 * - Un producto favorito está disponible para entrega rápida
 * - Un driver está cerca de una tienda con productos que les interesa
 * 
 * @package Tukitask\LocalDrivers\Notifications
 */

namespace Tukitask\LocalDrivers\Notifications;

use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode;

class Proximity_Notifications {
    
    private static $instance = null;
    
    /**
     * Notification types
     */
    const TYPE_VENDOR_NEARBY = 'vendor_nearby';
    const TYPE_PRODUCT_AVAILABLE = 'product_available';
    const TYPE_DRIVER_AT_STORE = 'driver_at_store';
    const TYPE_FAVORITE_MOVING = 'favorite_moving';
    
    /**
     * Default proximity radius in km
     */
    const DEFAULT_RADIUS = 3;
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // AJAX handlers
        add_action('wp_ajax_tukitask_subscribe_notification', array($this, 'ajax_subscribe'));
        add_action('wp_ajax_tukitask_unsubscribe_notification', array($this, 'ajax_unsubscribe'));
        add_action('wp_ajax_tukitask_get_notifications', array($this, 'ajax_get_notifications'));
        add_action('wp_ajax_tukitask_mark_notification_read', array($this, 'ajax_mark_read'));
        add_action('wp_ajax_tukitask_update_notification_settings', array($this, 'ajax_update_settings'));
        add_action('wp_ajax_tukitask_save_push_subscription', array($this, 'ajax_save_push_subscription'));
        
        // Cron for checking proximity
        add_action('tukitask_check_proximity_notifications', array($this, 'check_and_send_notifications'));
        
        // Schedule cron if not already
        if (!wp_next_scheduled('tukitask_check_proximity_notifications')) {
            wp_schedule_event(time(), 'every_two_minutes', 'tukitask_check_proximity_notifications');
        }
        
        // Enqueue scripts
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Add notification bell to header
        add_action('wp_footer', array($this, 'render_notification_widget'));
        
        // WooCommerce endpoint
        add_action('init', array($this, 'add_endpoints'));
        add_filter('woocommerce_account_menu_items', array($this, 'add_menu_item'));
        add_action('woocommerce_account_notificaciones_endpoint', array($this, 'notifications_page_content'));
        
        // Shortcode
        add_shortcode('tukitask_notifications', array($this, 'shortcode_notifications'));
        add_shortcode('tukitask_notify_button', array($this, 'shortcode_notify_button'));
    }
    
    /**
     * Add WooCommerce endpoint.
     */
    public function add_endpoints() {
        add_rewrite_endpoint('notificaciones', EP_ROOT | EP_PAGES);
    }
    
    /**
     * Add menu item to My Account.
     */
    public function add_menu_item($items) {
        $new_items = array();
        foreach ($items as $key => $value) {
            $new_items[$key] = $value;
            if ($key === 'favoritos' || $key === 'orders') {
                $new_items['notificaciones'] = __('Notificaciones', 'tukitask-local-drivers');
            }
        }
        return $new_items;
    }
    
    /**
     * Enqueue scripts.
     */
    public function enqueue_scripts() {
        if (!is_user_logged_in()) return;
        
        wp_enqueue_script(
            'tukitask-notifications',
            plugins_url('assets/js/notifications.js', dirname(dirname(__FILE__))),
            array('jquery'),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0',
            true
        );
        
        $user_id = get_current_user_id();
        $unread_count = $this->get_unread_count($user_id);
        $settings = $this->get_user_settings($user_id);
        
        wp_localize_script('tukitask-notifications', 'tukiNotifications', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tukitask_notifications_nonce'),
            'unreadCount' => $unread_count,
            'settings' => $settings,
            'vapidPublicKey' => get_option('tukitask_vapid_public_key', ''),
            'i18n' => array(
                'vendorNearby' => __('¡Vendedor cerca!', 'tukitask-local-drivers'),
                'productAvailable' => __('¡Producto disponible!', 'tukitask-local-drivers'),
                'driverAtStore' => __('¡Entrega rápida disponible!', 'tukitask-local-drivers'),
                'notifyMe' => __('Avisarme cuando esté cerca', 'tukitask-local-drivers'),
                'subscribed' => __('¡Te avisaremos!', 'tukitask-local-drivers'),
                'permissionDenied' => __('Activa las notificaciones en tu navegador', 'tukitask-local-drivers'),
            ),
        ));
        
        $this->inline_styles();
    }
    
    /**
     * Inline CSS styles.
     */
    private function inline_styles() {
        ?>
        <style>
        /* Notification Bell Widget */
        .tuki-notif-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9998;
        }
        .tuki-notif-bell {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
            transition: all 0.3s;
            position: relative;
        }
        .tuki-notif-bell:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 25px rgba(139, 92, 246, 0.5);
        }
        .tuki-notif-bell svg {
            width: 24px;
            height: 24px;
            color: white;
        }
        .tuki-notif-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            min-width: 22px;
            height: 22px;
            background: #EF4444;
            color: white;
            border-radius: 11px;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 6px;
            border: 2px solid white;
            animation: pulse-badge 2s infinite;
        }
        .tuki-notif-badge:empty,
        .tuki-notif-badge.hide { display: none; }
        @keyframes pulse-badge {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        
        /* Notification Panel */
        .tuki-notif-panel {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 360px;
            max-width: calc(100vw - 40px);
            max-height: 70vh;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            z-index: 9999;
            display: none;
            flex-direction: column;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }
        .tuki-notif-panel.active { display: flex; }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .tuki-notif-header {
            padding: 16px 20px;
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .tuki-notif-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
        }
        .tuki-notif-header-actions {
            display: flex;
            gap: 10px;
        }
        .tuki-notif-header button {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .tuki-notif-header button:hover {
            background: rgba(255,255,255,0.3);
        }
        .tuki-notif-list {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }
        .tuki-notif-item {
            display: flex;
            gap: 12px;
            padding: 12px;
            border-radius: 12px;
            margin-bottom: 8px;
            background: #f8fafc;
            transition: all 0.2s;
            cursor: pointer;
            border-left: 3px solid transparent;
        }
        .tuki-notif-item:hover {
            background: #f1f5f9;
        }
        .tuki-notif-item.unread {
            background: #EDE9FE;
            border-left-color: #8B5CF6;
        }
        .tuki-notif-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
        }
        .tuki-notif-icon.vendor { background: linear-gradient(135deg, #10B981 0%, #059669 100%); }
        .tuki-notif-icon.product { background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); }
        .tuki-notif-icon.driver { background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); }
        .tuki-notif-content {
            flex: 1;
            min-width: 0;
        }
        .tuki-notif-title {
            font-weight: 600;
            font-size: 13px;
            color: #1f2937;
            margin-bottom: 3px;
        }
        .tuki-notif-message {
            font-size: 12px;
            color: #6b7280;
            line-height: 1.4;
        }
        .tuki-notif-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
        }
        .tuki-notif-time {
            font-size: 10px;
            color: #9ca3af;
        }
        .tuki-notif-distance {
            font-size: 10px;
            padding: 2px 6px;
            background: #DBEAFE;
            color: #2563EB;
            border-radius: 8px;
            font-weight: 600;
        }
        .tuki-notif-action {
            padding: 5px 10px;
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            color: white !important;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px;
            text-decoration: none;
        }
        .tuki-notif-empty {
            text-align: center;
            padding: 40px 20px;
            color: #9ca3af;
        }
        .tuki-notif-empty .icon { font-size: 40px; margin-bottom: 10px; }
        
        /* Subscribe Button */
        .tuki-notify-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: #f3f4f6;
            border: 1px dashed #d1d5db;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tuki-notify-btn:hover {
            background: #EDE9FE;
            border-color: #8B5CF6;
            color: #7C3AED;
        }
        .tuki-notify-btn.subscribed {
            background: #D1FAE5;
            border-style: solid;
            border-color: #10B981;
            color: #059669;
        }
        .tuki-notify-btn.subscribed:hover {
            background: #FEE2E2;
            border-color: #EF4444;
            color: #DC2626;
        }
        
        /* Settings Page */
        .tuki-notif-settings {
            max-width: 600px;
        }
        .tuki-settings-section {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .tuki-settings-section h3 {
            margin: 0 0 15px;
            font-size: 16px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tuki-setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f3f4f6;
        }
        .tuki-setting-row:last-child { border-bottom: none; }
        .tuki-setting-label {
            font-size: 14px;
            color: #1f2937;
        }
        .tuki-setting-desc {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
        }
        .tuki-toggle {
            position: relative;
            width: 48px;
            height: 26px;
        }
        .tuki-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .tuki-toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #e5e7eb;
            transition: 0.3s;
            border-radius: 26px;
        }
        .tuki-toggle-slider:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 3px;
            background: white;
            transition: 0.3s;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .tuki-toggle input:checked + .tuki-toggle-slider {
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
        }
        .tuki-toggle input:checked + .tuki-toggle-slider:before {
            transform: translateX(22px);
        }
        .tuki-radius-select {
            padding: 8px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            background: white;
        }
        </style>
        <?php
    }
    
    /**
     * Render notification widget in footer.
     */
    public function render_notification_widget() {
        if (!is_user_logged_in()) return;
        
        $user_id = get_current_user_id();
        $unread_count = $this->get_unread_count($user_id);
        ?>
        <div class="tuki-notif-widget">
            <button type="button" class="tuki-notif-bell" onclick="tukiToggleNotifPanel()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span class="tuki-notif-badge <?php echo $unread_count ? '' : 'hide'; ?>"><?php echo $unread_count; ?></span>
            </button>
            
            <div class="tuki-notif-panel" id="tukiNotifPanel">
                <div class="tuki-notif-header">
                    <h3>🔔 <?php esc_html_e('Notificaciones', 'tukitask-local-drivers'); ?></h3>
                    <div class="tuki-notif-header-actions">
                        <button type="button" onclick="tukiMarkAllRead()"><?php esc_html_e('Marcar leídas', 'tukitask-local-drivers'); ?></button>
                        <a href="<?php echo esc_url(wc_get_account_endpoint_url('notificaciones')); ?>" style="color:white;text-decoration:none;font-size:11px;">⚙️</a>
                    </div>
                </div>
                <div class="tuki-notif-list" id="tukiNotifList">
                    <div class="tuki-notif-empty">
                        <div class="icon">🔔</div>
                        <p><?php esc_html_e('Cargando...', 'tukitask-local-drivers'); ?></p>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
        var tukiNotifPanelOpen = false;
        
        function tukiToggleNotifPanel() {
            var panel = document.getElementById('tukiNotifPanel');
            tukiNotifPanelOpen = !tukiNotifPanelOpen;
            panel.classList.toggle('active', tukiNotifPanelOpen);
            if (tukiNotifPanelOpen) {
                tukiLoadNotifications();
            }
        }
        
        // Close panel when clicking outside
        document.addEventListener('click', function(e) {
            if (tukiNotifPanelOpen && !e.target.closest('.tuki-notif-widget')) {
                tukiNotifPanelOpen = false;
                document.getElementById('tukiNotifPanel').classList.remove('active');
            }
        });
        </script>
        <?php
    }
    
    /**
     * AJAX: Subscribe to notifications.
     */
    public function ajax_subscribe() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $type = isset($_POST['type']) ? sanitize_text_field($_POST['type']) : '';
        $target_id = isset($_POST['target_id']) ? absint($_POST['target_id']) : 0;
        $lat = isset($_POST['lat']) ? floatval($_POST['lat']) : 0;
        $lng = isset($_POST['lng']) ? floatval($_POST['lng']) : 0;
        
        if (!$type || !$target_id) {
            wp_send_json_error(array('message' => __('Datos inválidos', 'tukitask-local-drivers')));
        }
        
        // Save subscription
        $subscriptions = get_user_meta($user_id, '_tukitask_notification_subscriptions', true);
        if (!is_array($subscriptions)) $subscriptions = array();
        
        $key = $type . '_' . $target_id;
        $subscriptions[$key] = array(
            'type' => $type,
            'target_id' => $target_id,
            'lat' => $lat,
            'lng' => $lng,
            'created_at' => current_time('mysql'),
        );
        
        update_user_meta($user_id, '_tukitask_notification_subscriptions', $subscriptions);
        
        wp_send_json_success(array(
            'message' => __('¡Te avisaremos cuando esté cerca!', 'tukitask-local-drivers'),
            'subscribed' => true,
        ));
    }
    
    /**
     * AJAX: Unsubscribe from notifications.
     */
    public function ajax_unsubscribe() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $type = isset($_POST['type']) ? sanitize_text_field($_POST['type']) : '';
        $target_id = isset($_POST['target_id']) ? absint($_POST['target_id']) : 0;
        
        $subscriptions = get_user_meta($user_id, '_tukitask_notification_subscriptions', true);
        if (!is_array($subscriptions)) $subscriptions = array();
        
        $key = $type . '_' . $target_id;
        unset($subscriptions[$key]);
        
        update_user_meta($user_id, '_tukitask_notification_subscriptions', $subscriptions);
        
        wp_send_json_success(array(
            'message' => __('Suscripción cancelada', 'tukitask-local-drivers'),
            'subscribed' => false,
        ));
    }
    
    /**
     * AJAX: Get notifications list.
     */
    public function ajax_get_notifications() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $notifications = $this->get_user_notifications($user_id, 20);
        
        wp_send_json_success(array(
            'notifications' => $notifications,
            'unread_count' => $this->get_unread_count($user_id),
        ));
    }
    
    /**
     * AJAX: Mark notification as read.
     */
    public function ajax_mark_read() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        $notification_id = isset($_POST['notification_id']) ? sanitize_text_field($_POST['notification_id']) : '';
        $mark_all = isset($_POST['mark_all']) && $_POST['mark_all'] === 'true';
        
        if ($mark_all) {
            $this->mark_all_read($user_id);
        } else if ($notification_id) {
            $this->mark_read($user_id, $notification_id);
        }
        
        wp_send_json_success(array(
            'unread_count' => $this->get_unread_count($user_id),
        ));
    }
    
    /**
     * AJAX: Update notification settings.
     */
    public function ajax_update_settings() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $settings = array(
            'push_enabled' => isset($_POST['push_enabled']) && $_POST['push_enabled'] === 'true',
            'email_enabled' => isset($_POST['email_enabled']) && $_POST['email_enabled'] === 'true',
            'vendor_nearby' => isset($_POST['vendor_nearby']) && $_POST['vendor_nearby'] === 'true',
            'product_available' => isset($_POST['product_available']) && $_POST['product_available'] === 'true',
            'driver_nearby' => isset($_POST['driver_nearby']) && $_POST['driver_nearby'] === 'true',
            'radius_km' => isset($_POST['radius_km']) ? floatval($_POST['radius_km']) : self::DEFAULT_RADIUS,
        );
        
        update_user_meta($user_id, '_tukitask_notification_settings', $settings);
        
        wp_send_json_success(array(
            'message' => __('Configuración guardada', 'tukitask-local-drivers'),
            'settings' => $settings,
        ));
    }
    
    /**
     * AJAX: Save push subscription.
     */
    public function ajax_save_push_subscription() {
        check_ajax_referer('tukitask_notifications_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $subscription = isset($_POST['subscription']) ? $_POST['subscription'] : null;
        
        if ($subscription) {
            update_user_meta($user_id, '_tukitask_push_subscription', $subscription);
            wp_send_json_success(array('message' => __('Push notifications activadas', 'tukitask-local-drivers')));
        } else {
            delete_user_meta($user_id, '_tukitask_push_subscription');
            wp_send_json_success(array('message' => __('Push notifications desactivadas', 'tukitask-local-drivers')));
        }
    }
    
    /**
     * Get user's notifications.
     */
    public function get_user_notifications($user_id, $limit = 20) {
        $notifications = get_user_meta($user_id, '_tukitask_notifications', true);
        if (!is_array($notifications)) return array();
        
        // Sort by date descending
        usort($notifications, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });
        
        return array_slice($notifications, 0, $limit);
    }
    
    /**
     * Get unread count.
     */
    public function get_unread_count($user_id) {
        $notifications = get_user_meta($user_id, '_tukitask_notifications', true);
        if (!is_array($notifications)) return 0;
        
        return count(array_filter($notifications, function($n) {
            return empty($n['read']);
        }));
    }
    
    /**
     * Mark notification as read.
     */
    public function mark_read($user_id, $notification_id) {
        $notifications = get_user_meta($user_id, '_tukitask_notifications', true);
        if (!is_array($notifications)) return;
        
        foreach ($notifications as &$notif) {
            if ($notif['id'] === $notification_id) {
                $notif['read'] = true;
                break;
            }
        }
        
        update_user_meta($user_id, '_tukitask_notifications', $notifications);
    }
    
    /**
     * Mark all notifications as read.
     */
    public function mark_all_read($user_id) {
        $notifications = get_user_meta($user_id, '_tukitask_notifications', true);
        if (!is_array($notifications)) return;
        
        foreach ($notifications as &$notif) {
            $notif['read'] = true;
        }
        
        update_user_meta($user_id, '_tukitask_notifications', $notifications);
    }
    
    /**
     * Get user's notification settings.
     */
    public function get_user_settings($user_id) {
        $settings = get_user_meta($user_id, '_tukitask_notification_settings', true);
        
        return wp_parse_args($settings, array(
            'push_enabled' => false,
            'email_enabled' => true,
            'vendor_nearby' => true,
            'product_available' => true,
            'driver_nearby' => true,
            'radius_km' => self::DEFAULT_RADIUS,
        ));
    }
    
    /**
     * Create a notification for a user.
     */
    public function create_notification($user_id, $type, $data) {
        $notifications = get_user_meta($user_id, '_tukitask_notifications', true);
        if (!is_array($notifications)) $notifications = array();
        
        $notification = array(
            'id' => uniqid('notif_'),
            'type' => $type,
            'title' => $data['title'],
            'message' => $data['message'],
            'icon' => $data['icon'] ?? '🔔',
            'link' => $data['link'] ?? '',
            'distance_m' => $data['distance_m'] ?? null,
            'target_id' => $data['target_id'] ?? 0,
            'read' => false,
            'created_at' => current_time('mysql'),
        );
        
        // Add to beginning of array
        array_unshift($notifications, $notification);
        
        // Keep only last 50 notifications
        $notifications = array_slice($notifications, 0, 50);
        
        update_user_meta($user_id, '_tukitask_notifications', $notifications);
        
        // Send push notification if enabled
        $settings = $this->get_user_settings($user_id);
        if ($settings['push_enabled']) {
            $this->send_push_notification($user_id, $notification);
        }
        
        // Send email if enabled
        if ($settings['email_enabled']) {
            $this->send_email_notification($user_id, $notification);
        }
        
        return $notification;
    }
    
    /**
     * Check subscriptions and send notifications (Cron job).
     */
    public function check_and_send_notifications() {
        global $wpdb;
        
        // Get all users with subscriptions
        $users = $wpdb->get_col(
            "SELECT user_id FROM {$wpdb->usermeta} 
             WHERE meta_key = '_tukitask_notification_subscriptions' 
             AND meta_value != 'a:0:{}'"
        );
        
        foreach ($users as $user_id) {
            $this->check_user_subscriptions($user_id);
        }
    }
    
    /**
     * Check a user's subscriptions.
     */
    private function check_user_subscriptions($user_id) {
        $subscriptions = get_user_meta($user_id, '_tukitask_notification_subscriptions', true);
        if (!is_array($subscriptions) || empty($subscriptions)) return;
        
        $settings = $this->get_user_settings($user_id);
        $radius_km = $settings['radius_km'] ?? self::DEFAULT_RADIUS;
        
        foreach ($subscriptions as $key => $sub) {
            // Check if already notified recently (prevent spam)
            $last_notified = get_user_meta($user_id, '_tukitask_last_notified_' . $key, true);
            if ($last_notified && (time() - $last_notified) < 1800) { // 30 minutes cooldown
                continue;
            }
            
            $notification = null;
            
            switch ($sub['type']) {
                case 'vendor':
                    $notification = $this->check_vendor_proximity($sub, $radius_km);
                    break;
                case 'product':
                    $notification = $this->check_product_availability($sub, $radius_km);
                    break;
            }
            
            if ($notification) {
                $this->create_notification($user_id, $sub['type'] . '_nearby', $notification);
                update_user_meta($user_id, '_tukitask_last_notified_' . $key, time());
            }
        }
    }
    
    /**
     * Check if a vendor is nearby.
     */
    private function check_vendor_proximity($subscription, $radius_km) {
        $vendor_id = $subscription['target_id'];
        $user_lat = $subscription['lat'];
        $user_lng = $subscription['lng'];
        
        // Check if vendor is traveling
        $travel_data = get_user_meta($vendor_id, '_tukitask_travel_mode', true);
        if (empty($travel_data['active'])) return null;
        
        $vendor_lat = floatval($travel_data['lat']);
        $vendor_lng = floatval($travel_data['lng']);
        
        $distance = Distance::haversine($user_lat, $user_lng, $vendor_lat, $vendor_lng);
        
        if ($distance <= $radius_km) {
            $vendor = get_userdata($vendor_id);
            return array(
                'title' => sprintf(__('¡%s está cerca!', 'tukitask-local-drivers'), $vendor->display_name),
                'message' => sprintf(__('A solo %s de ti. ¡Compra ahora para entrega inmediata!', 'tukitask-local-drivers'), 
                    $distance < 1 ? round($distance * 1000) . 'm' : round($distance, 1) . 'km'),
                'icon' => '🚗',
                'link' => get_author_posts_url($vendor_id),
                'distance_m' => round($distance * 1000),
                'target_id' => $vendor_id,
            );
        }
        
        return null;
    }
    
    /**
     * Check if a product is available for fast delivery.
     */
    private function check_product_availability($subscription, $radius_km) {
        $product_id = $subscription['target_id'];
        $user_lat = $subscription['lat'];
        $user_lng = $subscription['lng'];
        
        $product = wc_get_product($product_id);
        if (!$product) return null;
        
        $vendor_id = $product->post->post_author;
        
        // Check vendor travel mode
        $travel_data = get_user_meta($vendor_id, '_tukitask_travel_mode', true);
        if (!empty($travel_data['active'])) {
            $vendor_lat = floatval($travel_data['lat']);
            $vendor_lng = floatval($travel_data['lng']);
            $distance = Distance::haversine($user_lat, $user_lng, $vendor_lat, $vendor_lng);
            
            if ($distance <= $radius_km) {
                return array(
                    'title' => sprintf(__('¡%s disponible cerca!', 'tukitask-local-drivers'), $product->get_name()),
                    'message' => sprintf(__('El vendedor está a %s. ¡Entrega inmediata!', 'tukitask-local-drivers'),
                        $distance < 1 ? round($distance * 1000) . 'm' : round($distance, 1) . 'km'),
                    'icon' => '⚡',
                    'link' => get_permalink($product_id),
                    'distance_m' => round($distance * 1000),
                    'target_id' => $product_id,
                );
            }
        }
        
        // Check if there's a driver near the store (Llega Hoy)
        $llega_hoy = get_transient('tukitask_store_proximity_llega_hoy_' . $vendor_id);
        if ($llega_hoy && !empty($llega_hoy['active'])) {
            return array(
                'title' => sprintf(__('¡%s llega hoy!', 'tukitask-local-drivers'), $product->get_name()),
                'message' => __('Hay un repartidor cerca de la tienda. ¡Compra ahora!', 'tukitask-local-drivers'),
                'icon' => '📦',
                'link' => get_permalink($product_id),
                'target_id' => $product_id,
            );
        }
        
        return null;
    }
    
    /**
     * Send push notification.
     */
    private function send_push_notification($user_id, $notification) {
        $subscription = get_user_meta($user_id, '_tukitask_push_subscription', true);
        if (!$subscription) return;
        
        // This requires a push notification service (Web Push)
        // For now, we'll store it for the JS to poll
        $pending = get_user_meta($user_id, '_tukitask_pending_push', true);
        if (!is_array($pending)) $pending = array();
        
        $pending[] = array(
            'title' => $notification['title'],
            'body' => $notification['message'],
            'icon' => $notification['icon'],
            'data' => array('url' => $notification['link']),
            'timestamp' => time(),
        );
        
        // Keep only last 5 pending
        $pending = array_slice($pending, -5);
        
        update_user_meta($user_id, '_tukitask_pending_push', $pending);
    }
    
    /**
     * Send email notification.
     */
    private function send_email_notification($user_id, $notification) {
        $user = get_userdata($user_id);
        if (!$user) return;
        
        $subject = '🔔 ' . $notification['title'];
        
        $message = sprintf(
            '<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">%s</h1>
                </div>
                <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px;">
                    <p style="font-size: 16px; color: #1f2937; margin: 0 0 20px;">%s</p>
                    %s
                    <a href="%s" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver ahora →</a>
                </div>
            </div>',
            esc_html($notification['title']),
            esc_html($notification['message']),
            $notification['distance_m'] ? '<p style="font-size: 14px; color: #6b7280; margin: 0 0 20px;">📍 ' . sprintf(__('A %s de ti', 'tukitask-local-drivers'), $notification['distance_m'] < 1000 ? $notification['distance_m'] . 'm' : round($notification['distance_m'] / 1000, 1) . 'km') . '</p>' : '',
            esc_url($notification['link'] ?: home_url())
        );
        
        $headers = array('Content-Type: text/html; charset=UTF-8');
        
        wp_mail($user->user_email, $subject, $message, $headers);
    }
    
    /**
     * Shortcode: Notify me button.
     */
    public function shortcode_notify_button($atts) {
        $atts = shortcode_atts(array(
            'type' => 'product',
            'id' => 0,
            'label' => '',
        ), $atts);
        
        if (!$atts['id']) {
            global $product;
            if ($product) {
                $atts['id'] = $product->get_id();
            }
        }
        
        if (!$atts['id']) return '';
        
        $user_id = get_current_user_id();
        $is_subscribed = false;
        
        if ($user_id) {
            $subscriptions = get_user_meta($user_id, '_tukitask_notification_subscriptions', true);
            $key = $atts['type'] . '_' . $atts['id'];
            $is_subscribed = isset($subscriptions[$key]);
        }
        
        $label = $atts['label'] ?: ($is_subscribed ? __('Te avisaremos', 'tukitask-local-drivers') : __('Avisarme cuando esté cerca', 'tukitask-local-drivers'));
        
        ob_start();
        ?>
        <button type="button" 
                class="tuki-notify-btn <?php echo $is_subscribed ? 'subscribed' : ''; ?>" 
                data-type="<?php echo esc_attr($atts['type']); ?>"
                data-target-id="<?php echo esc_attr($atts['id']); ?>"
                onclick="tukiToggleNotifySubscription(this)">
            <span class="icon"><?php echo $is_subscribed ? '✓' : '🔔'; ?></span>
            <span class="label"><?php echo esc_html($label); ?></span>
        </button>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Shortcode: Full notifications list.
     */
    public function shortcode_notifications($atts) {
        return $this->render_notifications_page();
    }
    
    /**
     * WooCommerce account page content.
     */
    public function notifications_page_content() {
        echo $this->render_notifications_page();
    }
    
    /**
     * Render notifications settings page.
     */
    private function render_notifications_page() {
        $user_id = get_current_user_id();
        
        if (!$user_id) {
            return '<p>' . sprintf(
                __('Debes <a href="%s">iniciar sesión</a> para ver tus notificaciones.', 'tukitask-local-drivers'),
                esc_url(wp_login_url(get_permalink()))
            ) . '</p>';
        }
        
        $settings = $this->get_user_settings($user_id);
        $notifications = $this->get_user_notifications($user_id, 30);
        $subscriptions = get_user_meta($user_id, '_tukitask_notification_subscriptions', true);
        if (!is_array($subscriptions)) $subscriptions = array();
        
        ob_start();
        ?>
        <div class="tuki-notif-page">
            <h2>🔔 <?php esc_html_e('Notificaciones', 'tukitask-local-drivers'); ?></h2>
            
            <!-- Settings Section -->
            <div class="tuki-notif-settings">
                <div class="tuki-settings-section">
                    <h3>⚙️ <?php esc_html_e('Configuración', 'tukitask-local-drivers'); ?></h3>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label"><?php esc_html_e('Notificaciones Push', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Recibe alertas en tu navegador', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <label class="tuki-toggle">
                            <input type="checkbox" id="tuki-push-enabled" <?php checked($settings['push_enabled']); ?> onchange="tukiSaveSettings()">
                            <span class="tuki-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label"><?php esc_html_e('Notificaciones por Email', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Recibe alertas en tu correo', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <label class="tuki-toggle">
                            <input type="checkbox" id="tuki-email-enabled" <?php checked($settings['email_enabled']); ?> onchange="tukiSaveSettings()">
                            <span class="tuki-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label"><?php esc_html_e('Radio de proximidad', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Distancia para recibir alertas', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <select id="tuki-radius" class="tuki-radius-select" onchange="tukiSaveSettings()">
                            <option value="1" <?php selected($settings['radius_km'], 1); ?>>1 km</option>
                            <option value="2" <?php selected($settings['radius_km'], 2); ?>>2 km</option>
                            <option value="3" <?php selected($settings['radius_km'], 3); ?>>3 km</option>
                            <option value="5" <?php selected($settings['radius_km'], 5); ?>>5 km</option>
                            <option value="10" <?php selected($settings['radius_km'], 10); ?>>10 km</option>
                        </select>
                    </div>
                </div>
                
                <div class="tuki-settings-section">
                    <h3>📱 <?php esc_html_e('Tipos de Notificaciones', 'tukitask-local-drivers'); ?></h3>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label">🚗 <?php esc_html_e('Vendedor cerca', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Cuando un vendedor favorito está viajando cerca', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <label class="tuki-toggle">
                            <input type="checkbox" id="tuki-vendor-nearby" <?php checked($settings['vendor_nearby']); ?> onchange="tukiSaveSettings()">
                            <span class="tuki-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label">⚡ <?php esc_html_e('Producto disponible', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Cuando un producto favorito tiene entrega rápida', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <label class="tuki-toggle">
                            <input type="checkbox" id="tuki-product-available" <?php checked($settings['product_available']); ?> onchange="tukiSaveSettings()">
                            <span class="tuki-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label">📦 <?php esc_html_e('Repartidor cerca', 'tukitask-local-drivers'); ?></div>
                            <div class="tuki-setting-desc"><?php esc_html_e('Cuando hay entrega disponible para el mismo día', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <label class="tuki-toggle">
                            <input type="checkbox" id="tuki-driver-nearby" <?php checked($settings['driver_nearby']); ?> onchange="tukiSaveSettings()">
                            <span class="tuki-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                
                <?php if (!empty($subscriptions)): ?>
                <div class="tuki-settings-section">
                    <h3>👀 <?php esc_html_e('Siguiendo', 'tukitask-local-drivers'); ?> (<?php echo count($subscriptions); ?>)</h3>
                    
                    <?php foreach ($subscriptions as $key => $sub): ?>
                    <?php
                    $target_name = '';
                    $target_link = '#';
                    if ($sub['type'] === 'vendor') {
                        $vendor = get_userdata($sub['target_id']);
                        $target_name = $vendor ? $vendor->display_name : __('Vendedor', 'tukitask-local-drivers');
                        $target_link = get_author_posts_url($sub['target_id']);
                    } elseif ($sub['type'] === 'product') {
                        $product = wc_get_product($sub['target_id']);
                        $target_name = $product ? $product->get_name() : __('Producto', 'tukitask-local-drivers');
                        $target_link = $product ? get_permalink($sub['target_id']) : '#';
                    }
                    ?>
                    <div class="tuki-setting-row">
                        <div>
                            <div class="tuki-setting-label">
                                <?php echo $sub['type'] === 'vendor' ? '🚗' : '📦'; ?>
                                <a href="<?php echo esc_url($target_link); ?>"><?php echo esc_html($target_name); ?></a>
                            </div>
                            <div class="tuki-setting-desc"><?php echo esc_html(human_time_diff(strtotime($sub['created_at']), current_time('timestamp'))); ?> <?php esc_html_e('siguiendo', 'tukitask-local-drivers'); ?></div>
                        </div>
                        <button type="button" class="tuki-notify-btn subscribed" onclick="tukiUnsubscribe('<?php echo esc_js($sub['type']); ?>', <?php echo esc_js($sub['target_id']); ?>, this)">
                            ✕ <?php esc_html_e('Dejar de seguir', 'tukitask-local-drivers'); ?>
                        </button>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            
            <!-- Recent Notifications -->
            <div class="tuki-settings-section" style="margin-top:30px;">
                <h3>📬 <?php esc_html_e('Notificaciones Recientes', 'tukitask-local-drivers'); ?></h3>
                
                <?php if (empty($notifications)): ?>
                <div class="tuki-notif-empty">
                    <div class="icon">🔔</div>
                    <p><?php esc_html_e('No tienes notificaciones aún', 'tukitask-local-drivers'); ?></p>
                </div>
                <?php else: ?>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <?php foreach ($notifications as $notif): ?>
                    <div class="tuki-notif-item <?php echo empty($notif['read']) ? 'unread' : ''; ?>" onclick="window.location='<?php echo esc_url($notif['link'] ?: '#'); ?>'">
                        <div class="tuki-notif-icon <?php echo esc_attr(str_replace('_nearby', '', $notif['type'])); ?>">
                            <?php echo $notif['icon']; ?>
                        </div>
                        <div class="tuki-notif-content">
                            <div class="tuki-notif-title"><?php echo esc_html($notif['title']); ?></div>
                            <div class="tuki-notif-message"><?php echo esc_html($notif['message']); ?></div>
                            <div class="tuki-notif-meta">
                                <span class="tuki-notif-time"><?php echo esc_html(human_time_diff(strtotime($notif['created_at']), current_time('timestamp'))); ?></span>
                                <?php if (!empty($notif['distance_m'])): ?>
                                <span class="tuki-notif-distance">📍 <?php echo $notif['distance_m'] < 1000 ? $notif['distance_m'] . 'm' : round($notif['distance_m'] / 1000, 1) . 'km'; ?></span>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
        </div>
        
        <script>
        function tukiSaveSettings() {
            jQuery.post(tukiNotifications.ajaxUrl, {
                action: 'tukitask_update_notification_settings',
                nonce: tukiNotifications.nonce,
                push_enabled: jQuery('#tuki-push-enabled').is(':checked'),
                email_enabled: jQuery('#tuki-email-enabled').is(':checked'),
                vendor_nearby: jQuery('#tuki-vendor-nearby').is(':checked'),
                product_available: jQuery('#tuki-product-available').is(':checked'),
                driver_nearby: jQuery('#tuki-driver-nearby').is(':checked'),
                radius_km: jQuery('#tuki-radius').val()
            });
        }
        
        function tukiUnsubscribe(type, targetId, btn) {
            btn.disabled = true;
            jQuery.post(tukiNotifications.ajaxUrl, {
                action: 'tukitask_unsubscribe_notification',
                nonce: tukiNotifications.nonce,
                type: type,
                target_id: targetId
            }, function(response) {
                if (response.success) {
                    jQuery(btn).closest('.tuki-setting-row').fadeOut(300, function() { jQuery(this).remove(); });
                }
            });
        }
        </script>
        <?php
        return ob_get_clean();
    }
}

// Initialize
Proximity_Notifications::instance();
