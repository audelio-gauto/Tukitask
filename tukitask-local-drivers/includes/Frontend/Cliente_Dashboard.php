<?php
/**
 * Shortcode: [tukitask_cliente_dashboard]
 * Dashboard visual profesional para clientes con:
 * - Header con saludo y ubicación
 * - Pedidos activos en tiempo real
 * - Tarjetas de acceso rápido (Llega Hoy, En Movimiento, Marketplace)
 * - Productos favoritos
 * - Compras recientes
 * - Integración con WooCommerce My Account
 *
 * Uso: [tukitask_cliente_dashboard]
 * 
 * @package Tukitask\LocalDrivers\Frontend
 */

// Ensure we don't have fatal errors
if (!function_exists('tukitask_get_dashboard_counts')) {

add_shortcode('tukitask_cliente_dashboard', function($atts) {
    // Check if WooCommerce is active
    if (!class_exists('WooCommerce')) {
        return '<p>WooCommerce is required.</p>';
    }
    
    $atts = shortcode_atts(array(
        'show_wc_account' => 'yes',
    ), $atts);
    
    $user = wp_get_current_user();
    $user_id = get_current_user_id();
    
    // Safe location check
    $location = null;
    if (class_exists('\Tukitask\LocalDrivers\Helpers\Geo')) {
        $location = \Tukitask\LocalDrivers\Helpers\Geo::get_current_customer_location();
    }
    
    // Get real counts with error handling
    $counts = tukitask_get_dashboard_counts($user_id, $location);
    
    // Get active orders
    $active_orders = tukitask_get_active_orders($user_id);
    
    // Get favorites
    $favorites = tukitask_get_customer_favorites($user_id);
    
    // Get recent purchases
    $recent_products = tukitask_get_recent_purchases($user_id);
    
    ob_start();
    tukitask_output_dashboard_styles();
    ?>
    
    <div class="tuki-dashboard">
        <!-- Header Section -->
        <div class="tuki-dash-header">
            <div class="tuki-dash-welcome">
                <div class="tuki-avatar">
                    <?php echo get_avatar($user_id, 60); ?>
                </div>
                <div class="tuki-welcome-text">
                    <span class="tuki-greeting"><?php echo tukitask_get_greeting(); ?></span>
                    <h1><?php echo esc_html($user->display_name ?: $user->user_login); ?></h1>
                </div>
            </div>
            <div class="tuki-dash-location">
                <?php if ($location): ?>
                <div class="tuki-loc-active">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span><?php esc_html_e('Ubicación activa', 'tukitask-local-drivers'); ?></span>
                    <button type="button" onclick="tukiUpdateLocation()" class="tuki-loc-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                </div>
                <?php else: ?>
                <button type="button" onclick="tukiEnableLocation()" class="tuki-enable-loc-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    <?php esc_html_e('Activar ubicación', 'tukitask-local-drivers'); ?>
                </button>
                <?php endif; ?>
            </div>
        </div>
        
        <?php if (!empty($active_orders)): ?>
        <!-- Active Orders Section -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>🚚 <?php esc_html_e('Pedidos Activos', 'tukitask-local-drivers'); ?></h2>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('orders')); ?>" class="tuki-view-all">
                    <?php esc_html_e('Ver todos', 'tukitask-local-drivers'); ?> →
                </a>
            </div>
            <div class="tuki-orders-carousel">
                <?php foreach ($active_orders as $order): ?>
                <div class="tuki-order-card <?php echo esc_attr($order['status_class']); ?>">
                    <div class="tuki-order-header">
                        <span class="tuki-order-number">#<?php echo esc_html($order['number']); ?></span>
                        <span class="tuki-order-status"><?php echo esc_html($order['status_label']); ?></span>
                    </div>
                    <div class="tuki-order-body">
                        <div class="tuki-order-items">
                            <?php foreach (array_slice($order['items'], 0, 3) as $item): ?>
                            <img src="<?php echo esc_url($item['image']); ?>" alt="" class="tuki-order-item-img">
                            <?php endforeach; ?>
                            <?php if (count($order['items']) > 3): ?>
                            <span class="tuki-order-more">+<?php echo count($order['items']) - 3; ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="tuki-order-info">
                            <span class="tuki-order-total"><?php echo wp_kses_post($order['total']); ?></span>
                            <span class="tuki-order-date"><?php echo esc_html($order['date']); ?></span>
                        </div>
                    </div>
                    <?php if ($order['tracking_url']): ?>
                    <a href="<?php echo esc_url($order['tracking_url']); ?>" class="tuki-track-btn">
                        📍 <?php esc_html_e('Rastrear pedido', 'tukitask-local-drivers'); ?>
                    </a>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
        
        <!-- Quick Access Cards -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>⚡ <?php esc_html_e('Acceso Rápido', 'tukitask-local-drivers'); ?></h2>
            </div>
            <div class="tuki-quick-grid">
                <!-- Llega Hoy Card -->
                <a href="<?php echo esc_url(home_url('/llega-hoy/')); ?>" class="tuki-quick-card tuki-card-llega">
                    <div class="tuki-card-icon">⚡</div>
                    <div class="tuki-card-content">
                        <span class="tuki-card-count"><?php echo esc_html($counts['llega_hoy']); ?></span>
                        <h3><?php esc_html_e('Llega Hoy', 'tukitask-local-drivers'); ?></h3>
                        <p><?php esc_html_e('Productos con entrega hoy', 'tukitask-local-drivers'); ?></p>
                    </div>
                    <div class="tuki-card-arrow">→</div>
                </a>
                
                <!-- En Movimiento Card -->
                <a href="<?php echo esc_url(home_url('/en-movimiento/')); ?>" class="tuki-quick-card tuki-card-moving">
                    <div class="tuki-card-icon">🚗</div>
                    <div class="tuki-card-content">
                        <span class="tuki-card-count"><?php echo esc_html($counts['en_movimiento']); ?></span>
                        <h3><?php esc_html_e('En Movimiento', 'tukitask-local-drivers'); ?></h3>
                        <p><?php esc_html_e('Vendedores cerca de ti', 'tukitask-local-drivers'); ?></p>
                    </div>
                    <span class="tuki-live-badge"><?php esc_html_e('EN VIVO', 'tukitask-local-drivers'); ?></span>
                    <div class="tuki-card-arrow">→</div>
                </a>
                
                <!-- Marketplace Card -->
                <a href="<?php echo esc_url(home_url('/marketplace/')); ?>" class="tuki-quick-card tuki-card-market">
                    <div class="tuki-card-icon">🛒</div>
                    <div class="tuki-card-content">
                        <span class="tuki-card-count"><?php echo esc_html($counts['marketplace']); ?></span>
                        <h3><?php esc_html_e('Marketplace', 'tukitask-local-drivers'); ?></h3>
                        <p><?php esc_html_e('Todos los productos', 'tukitask-local-drivers'); ?></p>
                    </div>
                    <div class="tuki-card-arrow">→</div>
                </a>
                
                <!-- Transporte Card -->
                <a href="<?php echo esc_url(home_url('/transporte/')); ?>" class="tuki-quick-card tuki-card-transport">
                    <div class="tuki-card-icon">🚕</div>
                    <div class="tuki-card-content">
                        <span class="tuki-card-count"><?php echo esc_html($counts['drivers_online']); ?></span>
                        <h3><?php esc_html_e('Transporte', 'tukitask-local-drivers'); ?></h3>
                        <p><?php esc_html_e('Solicitar un viaje', 'tukitask-local-drivers'); ?></p>
                    </div>
                    <div class="tuki-card-arrow">→</div>
                </a>
            </div>
        </div>
        
        <?php if (!empty($favorites)): ?>
        <!-- Favorites Section -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>❤️ <?php esc_html_e('Tus Favoritos', 'tukitask-local-drivers'); ?></h2>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('wishlist')); ?>" class="tuki-view-all">
                    <?php esc_html_e('Ver todos', 'tukitask-local-drivers'); ?> →
                </a>
            </div>
            <div class="tuki-products-scroll">
                <?php foreach ($favorites as $product): ?>
                <div class="tuki-mini-product">
                    <a href="<?php echo esc_url($product['permalink']); ?>">
                        <img src="<?php echo esc_url($product['image']); ?>" alt="<?php echo esc_attr($product['title']); ?>">
                    </a>
                    <div class="tuki-mini-info">
                        <h4><?php echo esc_html($product['title']); ?></h4>
                        <span class="tuki-mini-price"><?php echo wp_kses_post($product['price_html']); ?></span>
                        <?php if ($product['available_today']): ?>
                        <span class="tuki-mini-badge">⚡ <?php esc_html_e('Llega hoy', 'tukitask-local-drivers'); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
        
        <?php if (!empty($recent_products)): ?>
        <!-- Recent Purchases Section -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>🕐 <?php esc_html_e('Compras Recientes', 'tukitask-local-drivers'); ?></h2>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('orders')); ?>" class="tuki-view-all">
                    <?php esc_html_e('Ver historial', 'tukitask-local-drivers'); ?> →
                </a>
            </div>
            <div class="tuki-products-scroll">
                <?php foreach ($recent_products as $product): ?>
                <div class="tuki-mini-product">
                    <a href="<?php echo esc_url($product['permalink']); ?>">
                        <img src="<?php echo esc_url($product['image']); ?>" alt="<?php echo esc_attr($product['title']); ?>">
                    </a>
                    <div class="tuki-mini-info">
                        <h4><?php echo esc_html($product['title']); ?></h4>
                        <span class="tuki-mini-price"><?php echo wp_kses_post($product['price_html']); ?></span>
                        <a href="<?php echo esc_url(add_query_arg('add-to-cart', $product['id'], wc_get_cart_url())); ?>" class="tuki-reorder-btn">
                            🔄 <?php esc_html_e('Reordenar', 'tukitask-local-drivers'); ?>
                        </a>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- Envío de Paquetes -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>📦 <?php esc_html_e('Envío de Paquetes', 'tukitask-local-drivers'); ?></h2>
            </div>
            <div class="tuki-account-links">
                <?php
                $envio_page = get_option( 'tukitask_page_solicitar_envio' );
                $mis_envios_page = get_option( 'tukitask_page_mis_envios' );
                $envio_url = $envio_page ? get_permalink( $envio_page ) : home_url( '/solicitar-envio/' );
                $mis_envios_url = $mis_envios_page ? get_permalink( $mis_envios_page ) : home_url( '/mis-envios/' );

                // Count active deliveries
                $delivery_count = count( get_posts( array(
                    'post_type'      => 'tukitask_delivery',
                    'author'         => get_current_user_id(),
                    'posts_per_page' => -1,
                    'fields'         => 'ids',
                    'meta_query'     => array(
                        array(
                            'key'     => '_delivery_status',
                            'value'   => array( 'searching', 'assigned', 'pickup', 'in_transit' ),
                            'compare' => 'IN',
                        ),
                    ),
                ) ) );
                ?>
                <a href="<?php echo esc_url( $envio_url ); ?>" class="tuki-account-link" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%); color:white; border-radius:12px;">
                    <span class="tuki-link-icon">🚀</span>
                    <span class="tuki-link-text"><?php esc_html_e('Enviar Paquete', 'tukitask-local-drivers'); ?></span>
                </a>
                <a href="<?php echo esc_url( $mis_envios_url ); ?>" class="tuki-account-link">
                    <span class="tuki-link-icon">📋</span>
                    <span class="tuki-link-text"><?php esc_html_e('Mis Envíos', 'tukitask-local-drivers'); ?></span>
                    <?php if ( $delivery_count > 0 ) : ?>
                        <span class="tuki-link-count" style="background:#10b981; color:white;"><?php echo intval( $delivery_count ); ?></span>
                    <?php endif; ?>
                </a>
            </div>
        </div>
        
        <!-- Account Quick Links -->
        <div class="tuki-dash-section">
            <div class="tuki-section-header">
                <h2>👤 <?php esc_html_e('Mi Cuenta', 'tukitask-local-drivers'); ?></h2>
            </div>
            <div class="tuki-account-links">
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('orders')); ?>" class="tuki-account-link">
                    <span class="tuki-link-icon">📦</span>
                    <span class="tuki-link-text"><?php esc_html_e('Mis Pedidos', 'tukitask-local-drivers'); ?></span>
                    <span class="tuki-link-count"><?php echo esc_html($counts['total_orders']); ?></span>
                </a>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('edit-address')); ?>" class="tuki-account-link">
                    <span class="tuki-link-icon">📍</span>
                    <span class="tuki-link-text"><?php esc_html_e('Mis Direcciones', 'tukitask-local-drivers'); ?></span>
                </a>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('payment-methods')); ?>" class="tuki-account-link">
                    <span class="tuki-link-icon">💳</span>
                    <span class="tuki-link-text"><?php esc_html_e('Métodos de Pago', 'tukitask-local-drivers'); ?></span>
                </a>
                <a href="<?php echo esc_url(wc_get_account_endpoint_url('edit-account')); ?>" class="tuki-account-link">
                    <span class="tuki-link-icon">⚙️</span>
                    <span class="tuki-link-text"><?php esc_html_e('Configuración', 'tukitask-local-drivers'); ?></span>
                </a>
                <a href="<?php echo esc_url(wp_logout_url(home_url())); ?>" class="tuki-account-link tuki-logout">
                    <span class="tuki-link-icon">🚪</span>
                    <span class="tuki-link-text"><?php esc_html_e('Cerrar Sesión', 'tukitask-local-drivers'); ?></span>
                </a>
            </div>
        </div>
        
        <?php if ($atts['show_wc_account'] === 'yes'): ?>
        <!-- WooCommerce Account Integration -->
        <div class="tuki-dash-section tuki-wc-section">
            <details class="tuki-wc-details">
                <summary><?php esc_html_e('Ver cuenta WooCommerce completa', 'tukitask-local-drivers'); ?></summary>
                <div class="tuki-wc-content">
                    <?php echo do_shortcode('[woocommerce_my_account]'); ?>
                </div>
            </details>
        </div>
        <?php endif; ?>
    </div>
    
    <script>
    function tukiEnableLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
                document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
                location.reload();
            }, function(err) {
                alert('<?php esc_html_e('No pudimos obtener tu ubicación. Activa los permisos.', 'tukitask-local-drivers'); ?>');
            }, { enableHighAccuracy: true, timeout: 10000 });
        }
    }
    function tukiUpdateLocation() {
        if (navigator.geolocation) {
            var btn = event.currentTarget;
            btn.classList.add('tuki-spinning');
            navigator.geolocation.getCurrentPosition(function(pos) {
                document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
                document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
                location.reload();
            }, function() {
                btn.classList.remove('tuki-spinning');
            }, { enableHighAccuracy: true });
        }
    }
    </script>
    
    <?php
    return ob_get_clean();
});

/**
 * Output dashboard CSS styles.
 */
function tukitask_output_dashboard_styles() {
    static $output = false;
    if ($output) return;
    $output = true;
    ?>
    <style>
    .tuki-dashboard {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
    }
    
    /* Header */
    .tuki-dash-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 30px;
        padding: 20px 25px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 20px;
        color: white;
    }
    .tuki-dash-welcome {
        display: flex;
        align-items: center;
        gap: 15px;
    }
    .tuki-avatar img {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: 3px solid rgba(255,255,255,0.3);
    }
    .tuki-greeting {
        font-size: 13px;
        opacity: 0.9;
    }
    .tuki-welcome-text h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
    }
    .tuki-loc-active {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 15px;
        background: rgba(255,255,255,0.2);
        border-radius: 25px;
        font-size: 13px;
    }
    .tuki-loc-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        transition: background 0.2s;
    }
    .tuki-loc-btn:hover { background: rgba(255,255,255,0.2); }
    .tuki-loc-btn.tuki-spinning svg { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .tuki-enable-loc-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: rgba(255,255,255,0.2);
        border: 2px dashed rgba(255,255,255,0.5);
        border-radius: 25px;
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tuki-enable-loc-btn:hover {
        background: rgba(255,255,255,0.3);
        border-style: solid;
    }
    
    /* Sections */
    .tuki-dash-section {
        margin-bottom: 30px;
    }
    .tuki-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }
    .tuki-section-header h2 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 700;
        color: #1f2937;
    }
    .tuki-view-all {
        font-size: 13px;
        color: #8B5CF6;
        text-decoration: none;
        font-weight: 600;
    }
    .tuki-view-all:hover { text-decoration: underline; }
    
    /* Orders Carousel */
    .tuki-orders-carousel {
        display: flex;
        gap: 15px;
        overflow-x: auto;
        padding-bottom: 10px;
        -webkit-overflow-scrolling: touch;
    }
    .tuki-orders-carousel::-webkit-scrollbar { height: 6px; }
    .tuki-orders-carousel::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
    .tuki-orders-carousel::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
    .tuki-order-card {
        flex: 0 0 280px;
        background: white;
        border-radius: 16px;
        padding: 15px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        border-left: 4px solid #8B5CF6;
    }
    .tuki-order-card.status-processing { border-left-color: #F59E0B; }
    .tuki-order-card.status-on-delivery { border-left-color: #10B981; animation: pulse-border 2s infinite; }
    .tuki-order-card.status-completed { border-left-color: #22C55E; }
    @keyframes pulse-border { 0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.08); } 50% { box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3); } }
    .tuki-order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    .tuki-order-number { font-weight: 700; color: #1f2937; }
    .tuki-order-status {
        font-size: 10px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 20px;
        background: #f3f4f6;
        color: #6b7280;
        text-transform: uppercase;
    }
    .status-on-delivery .tuki-order-status { background: #D1FAE5; color: #059669; }
    .tuki-order-body {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    .tuki-order-items {
        display: flex;
        gap: -8px;
    }
    .tuki-order-item-img {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
        border: 2px solid white;
        margin-left: -8px;
    }
    .tuki-order-item-img:first-child { margin-left: 0; }
    .tuki-order-more {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: #f3f4f6;
        font-size: 11px;
        font-weight: 600;
        color: #6b7280;
        margin-left: -8px;
    }
    .tuki-order-info { text-align: right; }
    .tuki-order-total { display: block; font-weight: 700; color: #1f2937; }
    .tuki-order-date { font-size: 11px; color: #9ca3af; }
    .tuki-track-btn {
        display: block;
        width: 100%;
        padding: 10px;
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        color: white !important;
        text-align: center;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.2s;
    }
    .tuki-track-btn:hover { transform: scale(1.02); }
    
    /* Quick Access Grid */
    .tuki-quick-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }
    @media (min-width: 768px) {
        .tuki-quick-grid { grid-template-columns: repeat(4, 1fr); }
    }
    .tuki-quick-card {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        text-decoration: none;
        color: inherit;
        transition: all 0.3s;
        overflow: hidden;
    }
    .tuki-quick-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .tuki-card-icon {
        font-size: 2rem;
        margin-bottom: 10px;
    }
    .tuki-card-count {
        font-size: 1.8rem;
        font-weight: 800;
        color: #1f2937;
    }
    .tuki-card-content h3 {
        margin: 5px 0;
        font-size: 1rem;
        font-weight: 700;
        color: #1f2937;
    }
    .tuki-card-content p {
        margin: 0;
        font-size: 12px;
        color: #6b7280;
    }
    .tuki-card-arrow {
        position: absolute;
        bottom: 15px;
        right: 15px;
        font-size: 1.2rem;
        color: #d1d5db;
        transition: all 0.2s;
    }
    .tuki-quick-card:hover .tuki-card-arrow {
        color: #8B5CF6;
        transform: translateX(5px);
    }
    .tuki-live-badge {
        position: absolute;
        top: 15px;
        right: 15px;
        padding: 3px 8px;
        background: #EF4444;
        color: white;
        font-size: 9px;
        font-weight: 800;
        border-radius: 10px;
        animation: pulse-badge 2s infinite;
    }
    @keyframes pulse-badge { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    
    /* Card Colors */
    .tuki-card-llega { border-top: 4px solid #F59E0B; }
    .tuki-card-llega .tuki-card-count { color: #F59E0B; }
    .tuki-card-moving { border-top: 4px solid #10B981; }
    .tuki-card-moving .tuki-card-count { color: #10B981; }
    .tuki-card-market { border-top: 4px solid #8B5CF6; }
    .tuki-card-market .tuki-card-count { color: #8B5CF6; }
    .tuki-card-transport { border-top: 4px solid #3B82F6; }
    .tuki-card-transport .tuki-card-count { color: #3B82F6; }
    
    /* Products Scroll */
    .tuki-products-scroll {
        display: flex;
        gap: 15px;
        overflow-x: auto;
        padding-bottom: 10px;
        -webkit-overflow-scrolling: touch;
    }
    .tuki-mini-product {
        flex: 0 0 140px;
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .tuki-mini-product img {
        width: 100%;
        height: 100px;
        object-fit: cover;
    }
    .tuki-mini-info {
        padding: 10px;
    }
    .tuki-mini-info h4 {
        margin: 0 0 5px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .tuki-mini-price {
        font-size: 13px;
        font-weight: 700;
        color: #1f2937;
    }
    .tuki-mini-badge {
        display: inline-block;
        margin-top: 5px;
        padding: 2px 6px;
        background: #FEF3C7;
        color: #D97706;
        font-size: 9px;
        font-weight: 700;
        border-radius: 8px;
    }
    .tuki-reorder-btn {
        display: block;
        margin-top: 8px;
        padding: 5px 8px;
        background: #f3f4f6;
        color: #6b7280 !important;
        font-size: 10px;
        font-weight: 600;
        text-align: center;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
    }
    .tuki-reorder-btn:hover {
        background: #8B5CF6;
        color: white !important;
    }
    
    /* Account Links */
    .tuki-account-links {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
    }
    @media (min-width: 768px) {
        .tuki-account-links { grid-template-columns: repeat(5, 1fr); }
    }
    .tuki-account-link {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px 15px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        text-decoration: none;
        color: #1f2937;
        transition: all 0.2s;
    }
    .tuki-account-link:hover {
        background: #f8fafc;
        transform: translateY(-2px);
    }
    .tuki-link-icon { font-size: 1.5rem; }
    .tuki-link-text { font-size: 12px; font-weight: 600; text-align: center; }
    .tuki-link-count {
        font-size: 11px;
        padding: 2px 8px;
        background: #E0E7FF;
        color: #4F46E5;
        border-radius: 10px;
        font-weight: 700;
    }
    .tuki-logout { color: #EF4444; }
    .tuki-logout:hover { background: #FEF2F2; }
    
    /* WooCommerce Section */
    .tuki-wc-section {
        margin-top: 30px;
    }
    .tuki-wc-details {
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    .tuki-wc-details summary {
        padding: 15px 20px;
        cursor: pointer;
        font-weight: 600;
        color: #6b7280;
        list-style: none;
    }
    .tuki-wc-details summary::-webkit-details-marker { display: none; }
    .tuki-wc-details summary::before { content: '▶ '; font-size: 10px; }
    .tuki-wc-details[open] summary::before { content: '▼ '; }
    .tuki-wc-content {
        padding: 20px;
        border-top: 1px solid #f3f4f6;
    }
    </style>
    <?php
}

/**
 * Get greeting based on time of day.
 */
function tukitask_get_greeting() {
    $hour = current_time('G');
    if ($hour < 12) return __('Buenos días,', 'tukitask-local-drivers');
    if ($hour < 19) return __('Buenas tardes,', 'tukitask-local-drivers');
    return __('Buenas noches,', 'tukitask-local-drivers');
}

/**
 * Get dashboard counts.
 */
function tukitask_get_dashboard_counts($user_id, $location) {
    global $wpdb;
    
    // Cache for 5 minutes
    $cache_key = 'tuki_dash_counts_' . $user_id . '_' . ($location ? md5($location['lat'] . $location['lng']) : 'no_loc');
    $cached = get_transient($cache_key);
    if ($cached !== false) return $cached;
    
    $counts = array(
        'llega_hoy' => 0,
        'en_movimiento' => 0,
        'marketplace' => 0,
        'drivers_online' => 0,
        'total_orders' => 0,
    );
    
    // Count Llega Hoy products
    $llega_hoy_vendors = $wpdb->get_var(
        "SELECT COUNT(*) FROM {$wpdb->options} 
         WHERE option_name LIKE '_transient_tukitask_store_proximity_llega_hoy_%'"
    );
    $counts['llega_hoy'] = max(0, intval($llega_hoy_vendors) * 5); // Estimate ~5 products per vendor
    
    // Count traveling vendors
    if ($location && class_exists('\Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode')) {
        $traveling = \Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode::find_nearby_traveling_vendors(
            $location['lat'], $location['lng']
        );
        $counts['en_movimiento'] = count($traveling) * 4;
    }
    
    // Total products
    $counts['marketplace'] = wp_count_posts('product')->publish;
    
    // Online drivers
    if (class_exists('\Tukitask\LocalDrivers\Drivers\Driver_Availability')) {
        $online = \Tukitask\LocalDrivers\Drivers\Driver_Availability::get_online_drivers_count();
        $counts['drivers_online'] = $online;
    }
    
    // User's total orders
    if ($user_id) {
        $counts['total_orders'] = wc_get_customer_order_count($user_id);
    }
    
    set_transient($cache_key, $counts, 5 * MINUTE_IN_SECONDS);
    return $counts;
}

/**
 * Get user's active orders.
 */
function tukitask_get_active_orders($user_id) {
    if (!$user_id) return array();
    
    $orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'status' => array('pending', 'processing', 'on-hold', 'tuki-assigned', 'tuki-picked', 'tuki-on-way'),
        'limit' => 5,
        'orderby' => 'date',
        'order' => 'DESC',
    ));
    
    $result = array();
    foreach ($orders as $order) {
        $items = array();
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            if (!$product) continue;
            $items[] = array(
                'name' => $item->get_name(),
                'image' => wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src(),
            );
        }
        
        $status = $order->get_status();
        $status_class = 'status-' . sanitize_html_class($status);
        
        $status_labels = array(
            'pending' => __('Pendiente', 'tukitask-local-drivers'),
            'processing' => __('Procesando', 'tukitask-local-drivers'),
            'on-hold' => __('En espera', 'tukitask-local-drivers'),
            'tuki-assigned' => __('Asignado', 'tukitask-local-drivers'),
            'tuki-picked' => __('Recogido', 'tukitask-local-drivers'),
            'tuki-on-way' => __('En camino', 'tukitask-local-drivers'),
        );
        
        // Check if has tracking
        $ride_id = $order->get_meta('_tukitask_ride_id');
        $tracking_url = $ride_id ? home_url('/tracking/?ride=' . $ride_id) : '';
        
        $result[] = array(
            'id' => $order->get_id(),
            'number' => $order->get_order_number(),
            'status' => $status,
            'status_class' => $status_class,
            'status_label' => $status_labels[$status] ?? wc_get_order_status_name($status),
            'total' => $order->get_formatted_order_total(),
            'date' => $order->get_date_created()->date_i18n(get_option('date_format')),
            'items' => $items,
            'tracking_url' => $tracking_url,
        );
    }
    
    return $result;
}

/**
 * Get customer favorites.
 */
function tukitask_get_customer_favorites($user_id) {
    if (!$user_id) return array();
    
    // Try YITH Wishlist
    $favorites = array();
    if (function_exists('YITH_WCWL')) {
        $wishlist_items = YITH_WCWL()->get_products(array('user_id' => $user_id, 'limit' => 6));
        foreach ($wishlist_items as $item) {
            $product = wc_get_product($item['prod_id']);
            if (!$product) continue;
            $favorites[] = tukitask_format_product_for_dashboard($product);
        }
    }
    
    // Fallback: get from user meta
    if (empty($favorites)) {
        $saved = get_user_meta($user_id, '_tukitask_favorites', true);
        if (is_array($saved)) {
            foreach (array_slice($saved, 0, 6) as $product_id) {
                $product = wc_get_product($product_id);
                if (!$product) continue;
                $favorites[] = tukitask_format_product_for_dashboard($product);
            }
        }
    }
    
    return $favorites;
}

/**
 * Get recent purchases.
 */
function tukitask_get_recent_purchases($user_id) {
    if (!$user_id) return array();
    
    $orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'status' => 'completed',
        'limit' => 3,
        'orderby' => 'date',
        'order' => 'DESC',
    ));
    
    $product_ids = array();
    $products = array();
    
    foreach ($orders as $order) {
        foreach ($order->get_items() as $item) {
            $product_id = $item->get_product_id();
            if (in_array($product_id, $product_ids)) continue;
            
            $product = wc_get_product($product_id);
            if (!$product) continue;
            
            $product_ids[] = $product_id;
            $products[] = tukitask_format_product_for_dashboard($product);
            
            if (count($products) >= 6) break 2;
        }
    }
    
    return $products;
}

/**
 * Format product data for dashboard display.
 */
function tukitask_format_product_for_dashboard($product) {
    $location = null;
    if (class_exists('\Tukitask\LocalDrivers\Helpers\Geo')) {
        $location = \Tukitask\LocalDrivers\Helpers\Geo::get_current_customer_location();
    }
    $available_today = false;
    
    // Check if product is available today
    if ($location && class_exists('\Tukitask\LocalDrivers\Mobile_Store\AvailabilityService')) {
        $service = new \Tukitask\LocalDrivers\Mobile_Store\AvailabilityService();
        $status = $service->get_product_availability_status($product->get_id(), $location);
        $available_today = !empty($status['status']);
    }
    
    return array(
        'id' => $product->get_id(),
        'title' => $product->get_name(),
        'price_html' => $product->get_price_html(),
        'image' => wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src(),
        'permalink' => get_permalink($product->get_id()),
        'available_today' => $available_today,
    );
}

} // End if function_exists check
