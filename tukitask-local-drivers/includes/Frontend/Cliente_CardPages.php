<?php
/**
 * Shortcodes para páginas individuales de cada tarjeta del dashboard cliente.
 * - [tukitask_llega_hoy] - Productos con entrega hoy (driver cerca de tienda)
 * - [tukitask_en_movimiento] - Productos de tiendas móviles y vendedores viajando
 * - [tukitask_marketplace] - Todos los productos del marketplace
 * - [tukitask_transporte] - Solicitar transporte
 * 
 * @package Tukitask\LocalDrivers\Frontend
 */

use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode;
use Tukitask\LocalDrivers\Mobile_Store\Store_Proximity_Service;
use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Output shared CSS styles for all tukitask shortcodes.
 */
function tukitask_output_card_styles() {
    static $styles_output = false;
    if ($styles_output) return;
    $styles_output = true;
    ?>
    <style>
    .tuki-cd-page {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 20px 0;
    }
    .tuki-cd-page h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 5px;
        color: #1f2937;
    }
    .tuki-cd-page .tuki-subtitle {
        color: #6b7280;
        margin: 0 0 20px;
        font-size: 14px;
    }
    .tuki-location-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 12px;
        margin-bottom: 20px;
        border: 1px solid #e2e8f0;
    }
    .tuki-location-bar .loc-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #64748b;
    }
    .tuki-location-bar .loc-info svg {
        color: #8B5CF6;
    }
    .tuki-location-bar button {
        padding: 6px 14px;
        background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tuki-location-bar button:hover {
        transform: scale(1.03);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    .tuki-section-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-left: 10px;
        vertical-align: middle;
    }
    .tuki-section-badge.live {
        background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
        color: white;
        animation: pulse-badge 2s infinite;
    }
    .tuki-section-badge.fast {
        background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
        color: white;
    }
    .tuki-section-badge.moving {
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        color: white;
    }
    @keyframes pulse-badge {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
    .tuki-products-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
    @media (min-width: 640px) {
        .tuki-products-grid { grid-template-columns: repeat(3, 1fr); gap: 15px; }
    }
    @media (min-width: 1024px) {
        .tuki-products-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
    }
    .tuki-product-card {
        background: white;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        transition: all 0.3s ease;
        border: 1px solid #f0f0f0;
    }
    .tuki-product-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .tuki-card-image {
        position: relative;
        padding-top: 100%;
        background: #f8f8f8;
    }
    .tuki-card-image img {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
    }
    .tuki-card-badge {
        position: absolute;
        top: 8px; left: 8px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 4px;
        color: white;
    }
    .tuki-card-badge.vendor { background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); }
    .tuki-card-badge.llega-hoy { background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); }
    .tuki-card-badge.mobile { background: linear-gradient(135deg, #10B981 0%, #059669 100%); }
    .tuki-card-content {
        padding: 12px;
    }
    .tuki-card-title {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        color: #1f2937;
    }
    .tuki-card-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        flex-wrap: wrap;
        gap: 4px;
    }
    .tuki-price {
        font-size: 15px;
        font-weight: 800;
        color: #1f2937;
    }
    .tuki-price del { font-size: 11px; color: #9ca3af; font-weight: 400; }
    .tuki-price ins { text-decoration: none; color: #EF4444; }
    .tuki-distance {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        color: #6b7280;
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 10px;
    }
    .tuki-vendor-name {
        font-size: 10px;
        color: #9ca3af;
        margin-bottom: 8px;
        display: block;
    }
    .tuki-buy-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        width: 100%;
        padding: 8px 12px;
        background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
        color: white !important;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        text-decoration: none !important;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tuki-buy-btn:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
    }
    .tuki-empty-state {
        text-align: center;
        padding: 50px 20px;
        background: #f8fafc;
        border-radius: 16px;
        border: 2px dashed #e2e8f0;
    }
    .tuki-empty-state .icon { font-size: 50px; margin-bottom: 15px; }
    .tuki-empty-state h3 { margin: 0 0 10px; font-size: 1.2rem; color: #1f2937; }
    .tuki-empty-state p { margin: 0; color: #6b7280; font-size: 14px; }
    </style>
    <?php
}

/**
 * Render location bar for enabling geolocation.
 */
function tukitask_render_location_bar($location) {
    ?>
    <div class="tuki-location-bar">
        <?php if ($location): ?>
        <div class="loc-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span><?php esc_html_e('Ubicación activa', 'tukitask-local-drivers'); ?></span>
        </div>
        <button type="button" onclick="tukiRefreshLocation()"><?php esc_html_e('Actualizar', 'tukitask-local-drivers'); ?></button>
        <?php else: ?>
        <div class="loc-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span><?php esc_html_e('Activa tu ubicación para ver distancias', 'tukitask-local-drivers'); ?></span>
        </div>
        <button type="button" onclick="tukiEnableLocation()"><?php esc_html_e('Activar', 'tukitask-local-drivers'); ?></button>
        <?php endif; ?>
    </div>
    <script>
    function tukiEnableLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
                document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
                location.reload();
            }, function() {
                alert('<?php esc_html_e('No pudimos obtener tu ubicación. Activa los permisos de ubicación.', 'tukitask-local-drivers'); ?>');
            });
        }
    }
    function tukiRefreshLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
                document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
                location.reload();
            });
        }
    }
    </script>
    <?php
}

/**
 * Render a product card.
 */
function tukitask_render_product_card($product_data, $badge_type = 'llega-hoy') {
    $badge_class = $badge_type;
    $badge_text = '';
    $badge_icon = '';
    
    switch ($badge_type) {
        case 'vendor':
            $badge_text = __('VENDEDOR CERCA', 'tukitask-local-drivers');
            $badge_icon = '🚗';
            break;
        case 'llega-hoy':
            $badge_text = __('LLEGA HOY', 'tukitask-local-drivers');
            $badge_icon = '⚡';
            break;
        case 'mobile':
            $badge_text = __('EN MOVIMIENTO', 'tukitask-local-drivers');
            $badge_icon = '📦';
            break;
    }
    
    $distance_text = '';
    if (isset($product_data['distance_m'])) {
        $distance_text = $product_data['distance_m'] < 1000 
            ? sprintf(__('%d m', 'tukitask-local-drivers'), $product_data['distance_m'])
            : sprintf(__('%.1f km', 'tukitask-local-drivers'), $product_data['distance_m'] / 1000);
    }
    
    $image_url = $product_data['image'] ?: wc_placeholder_img_src();
    ?>
    <div class="tuki-product-card">
        <div class="tuki-card-image">
            <a href="<?php echo esc_url($product_data['permalink']); ?>">
                <img src="<?php echo esc_url($image_url); ?>" alt="<?php echo esc_attr($product_data['title']); ?>">
            </a>
            <div class="tuki-card-badge <?php echo esc_attr($badge_class); ?>">
                <span><?php echo $badge_icon; ?></span>
                <span><?php echo esc_html($badge_text); ?></span>
            </div>
        </div>
        <div class="tuki-card-content">
            <h3 class="tuki-card-title">
                <a href="<?php echo esc_url($product_data['permalink']); ?>"><?php echo esc_html($product_data['title']); ?></a>
            </h3>
            <div class="tuki-card-meta">
                <span class="tuki-price"><?php echo wp_kses_post($product_data['price_html']); ?></span>
                <?php if ($distance_text): ?>
                <span class="tuki-distance">📍 <?php echo esc_html($distance_text); ?></span>
                <?php endif; ?>
            </div>
            <?php if (!empty($product_data['vendor_name'])): ?>
            <span class="tuki-vendor-name"><?php echo esc_html($product_data['vendor_name']); ?></span>
            <?php endif; ?>
            <a href="<?php echo esc_url(add_query_arg('add-to-cart', $product_data['id'], wc_get_cart_url())); ?>" class="tuki-buy-btn">
                🛒 <?php esc_html_e('Comprar Ahora', 'tukitask-local-drivers'); ?>
            </a>
        </div>
    </div>
    <?php
}

// ============================================================
// SHORTCODE: [tukitask_llega_hoy]
// Muestra productos con entrega hoy (driver cerca de tienda)
// ============================================================
add_shortcode('tukitask_llega_hoy', function($atts) {
    $atts = shortcode_atts(array('limit' => 12), $atts);
    
    ob_start();
    tukitask_output_card_styles();
    
    $location = Geo::get_current_customer_location();
    
    echo '<div class="tuki-cd-page tuki-cd-llega-hoy">';
    echo '<h2>⚡ ' . esc_html__('Productos que Llegan Hoy', 'tukitask-local-drivers');
    echo '<span class="tuki-section-badge fast">' . esc_html__('RÁPIDO', 'tukitask-local-drivers') . '</span></h2>';
    echo '<p class="tuki-subtitle">' . esc_html__('Hay un repartidor cerca de estas tiendas, tu pedido llega hoy mismo.', 'tukitask-local-drivers') . '</p>';
    
    tukitask_render_location_bar($location);
    
    // Get products with Llega Hoy status
    $products = tukitask_get_llega_hoy_products($location, intval($atts['limit']));
    
    if (empty($products)) {
        echo '<div class="tuki-empty-state">';
        echo '<div class="icon">📦</div>';
        echo '<h3>' . esc_html__('No hay productos con entrega hoy', 'tukitask-local-drivers') . '</h3>';
        echo '<p>' . esc_html__('No hay repartidores cerca de tiendas en este momento. Vuelve a revisar más tarde.', 'tukitask-local-drivers') . '</p>';
        echo '</div>';
    } else {
        echo '<div class="tuki-products-grid">';
        foreach ($products as $p) {
            tukitask_render_product_card($p, 'llega-hoy');
        }
        echo '</div>';
    }
    
    echo '</div>';
    return ob_get_clean();
});

/**
 * Get products with Llega Hoy status.
 */
function tukitask_get_llega_hoy_products($location, $limit = 12) {
    global $wpdb;
    $products = array();
    
    // Get vendors with active "Llega Hoy" (driver near their store)
    $results = $wpdb->get_results(
        "SELECT option_name, option_value FROM {$wpdb->options} 
         WHERE option_name LIKE '_transient_tukitask_store_proximity_llega_hoy_%'",
        ARRAY_A
    );
    
    foreach ($results as $row) {
        $data = maybe_unserialize($row['option_value']);
        if (empty($data['active'])) continue;
        
        $vendor_id = intval(str_replace('_transient_tukitask_store_proximity_llega_hoy_', '', $row['option_name']));
        if ($vendor_id <= 0) continue;
        
        $driver_distance = isset($data['distance']) ? floatval($data['distance']) : 0;
        
        // Get vendor's products
        $vendor_products = get_posts(array(
            'post_type' => 'product',
            'post_status' => 'publish',
            'author' => $vendor_id,
            'posts_per_page' => 4,
        ));
        
        foreach ($vendor_products as $p) {
            $_product = wc_get_product($p->ID);
            if (!$_product) continue;
            
            $products[] = array(
                'id' => $p->ID,
                'title' => $p->post_title,
                'price' => $_product->get_price(),
                'price_html' => $_product->get_price_html(),
                'image' => wp_get_attachment_url($_product->get_image_id()),
                'permalink' => get_permalink($p->ID),
                'distance_m' => round($driver_distance * 1000),
                'vendor_name' => get_userdata($vendor_id)->display_name,
                'vendor_id' => $vendor_id,
            );
        }
    }
    
    // Sort by distance
    usort($products, function($a, $b) {
        return ($a['distance_m'] ?? 9999) <=> ($b['distance_m'] ?? 9999);
    });
    
    return array_slice($products, 0, $limit);
}

// ============================================================
// SHORTCODE: [tukitask_en_movimiento]
// Muestra productos de vendedores viajando y tiendas móviles
// ============================================================
add_shortcode('tukitask_en_movimiento', function($atts) {
    $atts = shortcode_atts(array('limit' => 12), $atts);
    
    ob_start();
    tukitask_output_card_styles();
    
    $location = Geo::get_current_customer_location();
    
    echo '<div class="tuki-cd-page tuki-cd-en-movimiento">';
    echo '<h2>🚗 ' . esc_html__('Productos en Movimiento', 'tukitask-local-drivers');
    echo '<span class="tuki-section-badge live">' . esc_html__('EN VIVO', 'tukitask-local-drivers') . '</span></h2>';
    echo '<p class="tuki-subtitle">' . esc_html__('Vendedores y tiendas móviles cerca de ti. Entrega en minutos.', 'tukitask-local-drivers') . '</p>';
    
    tukitask_render_location_bar($location);
    
    if (!$location) {
        echo '<div class="tuki-empty-state">';
        echo '<div class="icon">📍</div>';
        echo '<h3>' . esc_html__('Activa tu ubicación', 'tukitask-local-drivers') . '</h3>';
        echo '<p>' . esc_html__('Necesitamos tu ubicación para mostrarte vendedores y tiendas móviles cerca de ti.', 'tukitask-local-drivers') . '</p>';
        echo '</div>';
        echo '</div>';
        return ob_get_clean();
    }
    
    // Get products from traveling vendors and mobile stores
    $vendor_products = tukitask_get_traveling_vendor_products($location, intval($atts['limit']));
    $mobile_products = tukitask_get_mobile_store_products($location, intval($atts['limit']));
    
    // Show traveling vendor products first
    if (!empty($vendor_products)) {
        echo '<h3 style="margin: 20px 0 15px; font-size: 1.1rem;">🚗 ' . esc_html__('Vendedores Viajando', 'tukitask-local-drivers') . '</h3>';
        echo '<div class="tuki-products-grid">';
        foreach ($vendor_products as $p) {
            tukitask_render_product_card($p, 'vendor');
        }
        echo '</div>';
    }
    
    // Show mobile store products
    if (!empty($mobile_products)) {
        echo '<h3 style="margin: 30px 0 15px; font-size: 1.1rem;">📦 ' . esc_html__('Tiendas Móviles', 'tukitask-local-drivers') . '</h3>';
        echo '<div class="tuki-products-grid">';
        foreach ($mobile_products as $p) {
            tukitask_render_product_card($p, 'mobile');
        }
        echo '</div>';
    }
    
    if (empty($vendor_products) && empty($mobile_products)) {
        echo '<div class="tuki-empty-state">';
        echo '<div class="icon">🚗</div>';
        echo '<h3>' . esc_html__('No hay vendedores cerca', 'tukitask-local-drivers') . '</h3>';
        echo '<p>' . esc_html__('No hay vendedores viajando ni tiendas móviles cerca de ti en este momento.', 'tukitask-local-drivers') . '</p>';
        echo '</div>';
    }
    
    echo '</div>';
    return ob_get_clean();
});

/**
 * Get products from traveling vendors.
 */
function tukitask_get_traveling_vendor_products($location, $limit = 12) {
    if (!$location) return array();
    
    $products = array();
    $traveling_vendors = Vendor_Travel_Mode::find_nearby_traveling_vendors($location['lat'], $location['lng']);
    
    foreach ($traveling_vendors as $vendor) {
        $vendor_products = get_posts(array(
            'post_type' => 'product',
            'post_status' => 'publish',
            'author' => $vendor['vendor_id'],
            'posts_per_page' => 4,
            'meta_query' => array(
                array(
                    'key' => '_tukitask_is_mobile_stock',
                    'value' => 'yes',
                    'compare' => '='
                )
            )
        ));
        
        foreach ($vendor_products as $p) {
            $_product = wc_get_product($p->ID);
            if (!$_product) continue;
            
            $products[] = array(
                'id' => $p->ID,
                'title' => $p->post_title,
                'price' => $_product->get_price(),
                'price_html' => $_product->get_price_html(),
                'image' => wp_get_attachment_url($_product->get_image_id()),
                'permalink' => get_permalink($p->ID),
                'distance_m' => round($vendor['distance'] * 1000),
                'vendor_name' => $vendor['name'],
                'vendor_id' => $vendor['vendor_id'],
            );
        }
    }
    
    usort($products, function($a, $b) {
        return $a['distance_m'] <=> $b['distance_m'];
    });
    
    return array_slice($products, 0, $limit);
}

/**
 * Get products from mobile stores (drivers with stock).
 */
function tukitask_get_mobile_store_products($location, $limit = 12) {
    if (!$location) return array();
    
    $products = array();
    $mobile_radius = floatval(get_option('tukitask_ld_mobile_store_radius', 5));
    $nearby_drivers = Driver_Availability::get_available_drivers($location['lat'], $location['lng'], $mobile_radius);
    
    foreach ($nearby_drivers as $driver_data) {
        $driver_id = $driver_data['id'];
        $is_mobile_active = get_post_meta($driver_id, '_mobile_store_active', true) === 'yes';
        
        if (!$is_mobile_active) continue;
        
        $mobile_stock = get_post_meta($driver_id, '_driver_mobile_stock_products', true);
        if (!is_array($mobile_stock)) continue;
        
        foreach ($mobile_stock as $product_id) {
            $_product = wc_get_product($product_id);
            if (!$_product) continue;
            
            $products[] = array(
                'id' => $product_id,
                'title' => $_product->get_name(),
                'price' => $_product->get_price(),
                'price_html' => $_product->get_price_html(),
                'image' => wp_get_attachment_url($_product->get_image_id()),
                'permalink' => get_permalink($product_id),
                'distance_m' => round($driver_data['distance'] * 1000),
                'driver_name' => get_the_title($driver_id),
                'driver_id' => $driver_id,
            );
        }
    }
    
    usort($products, function($a, $b) {
        return $a['distance_m'] <=> $b['distance_m'];
    });
    
    return array_slice($products, 0, $limit);
}

// ============================================================
// SHORTCODE: [tukitask_marketplace]
// Muestra todos los productos del marketplace con filtros
// ============================================================
add_shortcode('tukitask_marketplace', function($atts) {
    $atts = shortcode_atts(array(
        'limit' => 24,
        'columns' => 4,
        'orderby' => 'date',
        'order' => 'DESC'
    ), $atts);
    
    ob_start();
    tukitask_output_card_styles();
    
    $location = Geo::get_current_customer_location();
    
    echo '<div class="tuki-cd-page tuki-cd-marketplace">';
    echo '<h2>🛒 ' . esc_html__('Marketplace', 'tukitask-local-drivers') . '</h2>';
    echo '<p class="tuki-subtitle">' . esc_html__('Explora todos los productos disponibles. Los productos con badges tienen entrega rápida.', 'tukitask-local-drivers') . '</p>';
    
    tukitask_render_location_bar($location);
    
    // Filters bar
    ?>
    <div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;">
        <select id="tuki-filter-category" onchange="tukiFilterMarketplace()" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;">
            <option value=""><?php esc_html_e('Todas las categorías', 'tukitask-local-drivers'); ?></option>
            <?php
            $categories = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => true));
            foreach ($categories as $cat) {
                echo '<option value="' . esc_attr($cat->slug) . '">' . esc_html($cat->name) . '</option>';
            }
            ?>
        </select>
        <select id="tuki-filter-delivery" onchange="tukiFilterMarketplace()" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;">
            <option value=""><?php esc_html_e('Cualquier entrega', 'tukitask-local-drivers'); ?></option>
            <option value="fast"><?php esc_html_e('Solo entrega rápida', 'tukitask-local-drivers'); ?></option>
        </select>
    </div>
    <script>
    function tukiFilterMarketplace() {
        var cat = document.getElementById('tuki-filter-category').value;
        var delivery = document.getElementById('tuki-filter-delivery').value;
        var url = new URL(window.location.href);
        if (cat) url.searchParams.set('product_cat', cat);
        else url.searchParams.delete('product_cat');
        if (delivery) url.searchParams.set('delivery_type', delivery);
        else url.searchParams.delete('delivery_type');
        window.location.href = url.toString();
    }
    </script>
    <?php
    
    // Build query
    $args = array(
        'post_type' => 'product',
        'post_status' => 'publish',
        'posts_per_page' => intval($atts['limit']),
        'orderby' => $atts['orderby'],
        'order' => $atts['order'],
    );
    
    // Category filter
    if (!empty($_GET['product_cat'])) {
        $args['tax_query'] = array(
            array(
                'taxonomy' => 'product_cat',
                'field' => 'slug',
                'terms' => sanitize_text_field($_GET['product_cat']),
            )
        );
    }
    
    $query = new WP_Query($args);
    
    if (!$query->have_posts()) {
        echo '<div class="tuki-empty-state">';
        echo '<div class="icon">🛒</div>';
        echo '<h3>' . esc_html__('No hay productos', 'tukitask-local-drivers') . '</h3>';
        echo '<p>' . esc_html__('No se encontraron productos con los filtros seleccionados.', 'tukitask-local-drivers') . '</p>';
        echo '</div>';
    } else {
        // Get availability data if we have location
        $availability_service = null;
        if ($location && class_exists('\Tukitask\LocalDrivers\Mobile_Store\AvailabilityService')) {
            $availability_service = new \Tukitask\LocalDrivers\Mobile_Store\AvailabilityService();
        }
        
        $delivery_filter = !empty($_GET['delivery_type']) ? sanitize_text_field($_GET['delivery_type']) : '';
        
        echo '<div class="tuki-products-grid">';
        while ($query->have_posts()) {
            $query->the_post();
            $_product = wc_get_product(get_the_ID());
            if (!$_product) continue;
            
            // Determine badge type
            $badge_type = '';
            $distance_m = null;
            $vendor_name = '';
            
            if ($availability_service && $location) {
                $status = $availability_service->get_product_availability_status(get_the_ID(), $location);
                if ($status && isset($status['status'])) {
                    switch ($status['status']) {
                        case 'vendedor_viajando':
                            $badge_type = 'vendor';
                            $distance_m = isset($status['distance']) ? round($status['distance'] * 1000) : null;
                            break;
                        case 'llega_hoy':
                            $badge_type = 'llega-hoy';
                            $distance_m = isset($status['distance']) ? round($status['distance'] * 1000) : null;
                            break;
                        case 'tienda_movil':
                            $badge_type = 'mobile';
                            $distance_m = isset($status['distance']) ? round($status['distance'] * 1000) : null;
                            break;
                    }
                }
            }
            
            // Filter by delivery type if requested
            if ($delivery_filter === 'fast' && empty($badge_type)) {
                continue;
            }
            
            $product_data = array(
                'id' => get_the_ID(),
                'title' => get_the_title(),
                'price' => $_product->get_price(),
                'price_html' => $_product->get_price_html(),
                'image' => wp_get_attachment_url($_product->get_image_id()),
                'permalink' => get_permalink(),
                'distance_m' => $distance_m,
                'vendor_name' => get_the_author(),
            );
            
            tukitask_render_product_card($product_data, $badge_type ?: 'standard');
        }
        echo '</div>';
        wp_reset_postdata();
    }
    
    echo '</div>';
    return ob_get_clean();
});

// Add standard badge style
add_action('wp_head', function() {
    echo '<style>.tuki-card-badge.standard { display: none; }</style>';
});