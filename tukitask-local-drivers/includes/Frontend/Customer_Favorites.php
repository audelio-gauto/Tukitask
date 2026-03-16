<?php
/**
 * Sistema de Favoritos para Clientes
 * Permite guardar y gestionar productos favoritos
 * 
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

class Customer_Favorites {
    
    private static $instance = null;
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // AJAX handlers
        add_action('wp_ajax_tukitask_toggle_favorite', array($this, 'ajax_toggle_favorite'));
        add_action('wp_ajax_nopriv_tukitask_toggle_favorite', array($this, 'ajax_toggle_favorite_guest'));
        
        // Add heart button to products
        add_action('woocommerce_before_shop_loop_item_title', array($this, 'add_favorite_button'), 15);
        add_action('woocommerce_product_thumbnails', array($this, 'add_favorite_button_single'), 20);
        
        // Enqueue scripts
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Add endpoint for favorites page
        add_action('init', array($this, 'add_endpoints'));
        add_filter('woocommerce_account_menu_items', array($this, 'add_menu_item'));
        add_action('woocommerce_account_favoritos_endpoint', array($this, 'favorites_content'));
        
        // Register shortcode
        add_shortcode('tukitask_favorites', array($this, 'shortcode_favorites'));
    }
    
    /**
     * Add WooCommerce endpoint.
     */
    public function add_endpoints() {
        add_rewrite_endpoint('favoritos', EP_ROOT | EP_PAGES);
    }
    
    /**
     * Add menu item to My Account.
     */
    public function add_menu_item($items) {
        $new_items = array();
        foreach ($items as $key => $value) {
            $new_items[$key] = $value;
            if ($key === 'orders') {
                $new_items['favoritos'] = __('Favoritos', 'tukitask-local-drivers');
            }
        }
        return $new_items;
    }
    
    /**
     * Enqueue scripts and styles.
     */
    public function enqueue_scripts() {
        if (!is_shop() && !is_product() && !is_product_category() && !is_account_page()) {
            return;
        }
        
        wp_enqueue_script(
            'tukitask-favorites',
            plugins_url('assets/js/favorites.js', dirname(dirname(__FILE__))),
            array('jquery'),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0',
            true
        );
        
        wp_localize_script('tukitask-favorites', 'tukiFavorites', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tukitask_favorites_nonce'),
            'favorites' => $this->get_user_favorites(),
            'isLoggedIn' => is_user_logged_in(),
            'loginUrl' => wp_login_url(get_permalink()),
            'i18n' => array(
                'addedToFavorites' => __('¡Añadido a favoritos!', 'tukitask-local-drivers'),
                'removedFromFavorites' => __('Eliminado de favoritos', 'tukitask-local-drivers'),
                'loginRequired' => __('Inicia sesión para guardar favoritos', 'tukitask-local-drivers'),
            ),
        ));
        
        $this->inline_styles();
    }
    
    /**
     * Inline CSS styles.
     */
    public function inline_styles() {
        ?>
        <style>
        .tuki-favorite-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            background: white;
            border: none;
            border-radius: 50%;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 10;
            padding: 0;
        }
        .tuki-favorite-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        }
        .tuki-favorite-btn svg {
            width: 20px;
            height: 20px;
            transition: all 0.3s ease;
        }
        .tuki-favorite-btn .heart-outline {
            stroke: #9ca3af;
            fill: none;
        }
        .tuki-favorite-btn .heart-filled {
            display: none;
            fill: #EF4444;
            stroke: #EF4444;
        }
        .tuki-favorite-btn.is-favorite .heart-outline { display: none; }
        .tuki-favorite-btn.is-favorite .heart-filled { display: block; }
        .tuki-favorite-btn.is-favorite {
            animation: heartPop 0.3s ease;
        }
        @keyframes heartPop {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }
        
        /* Toast notification */
        .tuki-toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #1f2937;
            color: white;
            padding: 12px 24px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 500;
            z-index: 9999;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: transform 0.3s ease;
        }
        .tuki-toast.show {
            transform: translateX(-50%) translateY(0);
        }
        .tuki-toast.success { background: #059669; }
        .tuki-toast.error { background: #DC2626; }
        
        /* Favorites grid */
        .tuki-favorites-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        @media (min-width: 640px) {
            .tuki-favorites-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 1024px) {
            .tuki-favorites-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .tuki-fav-card {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.06);
            transition: all 0.3s;
            position: relative;
        }
        .tuki-fav-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .tuki-fav-card img {
            width: 100%;
            height: 150px;
            object-fit: cover;
        }
        .tuki-fav-card-body {
            padding: 12px;
        }
        .tuki-fav-card h4 {
            margin: 0 0 8px;
            font-size: 13px;
            font-weight: 600;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .tuki-fav-price {
            font-size: 15px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 10px;
        }
        .tuki-fav-actions {
            display: flex;
            gap: 8px;
        }
        .tuki-fav-actions a,
        .tuki-fav-actions button {
            flex: 1;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            text-align: center;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }
        .tuki-add-cart-btn {
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            color: white !important;
        }
        .tuki-add-cart-btn:hover {
            transform: scale(1.02);
        }
        .tuki-remove-fav-btn {
            background: #f3f4f6;
            color: #6b7280 !important;
        }
        .tuki-remove-fav-btn:hover {
            background: #FEE2E2;
            color: #DC2626 !important;
        }
        .tuki-empty-favorites {
            text-align: center;
            padding: 50px 20px;
            background: #f8fafc;
            border-radius: 16px;
        }
        .tuki-empty-favorites .icon { font-size: 50px; margin-bottom: 15px; }
        .tuki-empty-favorites h3 { margin: 0 0 10px; color: #1f2937; }
        .tuki-empty-favorites p { margin: 0 0 20px; color: #6b7280; }
        .tuki-empty-favorites a {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
            color: white !important;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
        }
        </style>
        <?php
    }
    
    /**
     * Add favorite button to product loop.
     */
    public function add_favorite_button() {
        global $product;
        if (!$product) return;
        
        $product_id = $product->get_id();
        $is_favorite = $this->is_favorite($product_id);
        
        $this->render_button($product_id, $is_favorite);
    }
    
    /**
     * Add favorite button to single product.
     */
    public function add_favorite_button_single() {
        global $product;
        if (!$product) return;
        
        $product_id = $product->get_id();
        $is_favorite = $this->is_favorite($product_id);
        
        echo '<div style="position:relative;display:inline-block;margin-top:10px;">';
        $this->render_button($product_id, $is_favorite, 'large');
        echo '</div>';
    }
    
    /**
     * Render favorite button.
     */
    private function render_button($product_id, $is_favorite, $size = 'normal') {
        $class = $is_favorite ? 'tuki-favorite-btn is-favorite' : 'tuki-favorite-btn';
        $width = $size === 'large' ? 44 : 36;
        $icon_size = $size === 'large' ? 24 : 20;
        ?>
        <button type="button" 
                class="<?php echo esc_attr($class); ?>" 
                data-product-id="<?php echo esc_attr($product_id); ?>"
                style="width:<?php echo $width; ?>px;height:<?php echo $width; ?>px;"
                aria-label="<?php esc_attr_e('Añadir a favoritos', 'tukitask-local-drivers'); ?>">
            <svg class="heart-outline" width="<?php echo $icon_size; ?>" height="<?php echo $icon_size; ?>" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <svg class="heart-filled" width="<?php echo $icon_size; ?>" height="<?php echo $icon_size; ?>" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        </button>
        <?php
    }
    
    /**
     * AJAX handler for toggling favorite.
     */
    public function ajax_toggle_favorite() {
        check_ajax_referer('tukitask_favorites_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error(array('message' => __('Debes iniciar sesión', 'tukitask-local-drivers')));
        }
        
        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        if (!$product_id) {
            wp_send_json_error(array('message' => __('Producto inválido', 'tukitask-local-drivers')));
        }
        
        $favorites = $this->get_user_favorites($user_id);
        $is_favorite = in_array($product_id, $favorites);
        
        if ($is_favorite) {
            // Remove from favorites
            $favorites = array_diff($favorites, array($product_id));
            $action = 'removed';
        } else {
            // Add to favorites
            $favorites[] = $product_id;
            $action = 'added';
        }
        
        update_user_meta($user_id, '_tukitask_favorites', array_values($favorites));
        
        wp_send_json_success(array(
            'action' => $action,
            'favorites' => array_values($favorites),
            'count' => count($favorites),
        ));
    }
    
    /**
     * AJAX handler for guests.
     */
    public function ajax_toggle_favorite_guest() {
        wp_send_json_error(array(
            'message' => __('Debes iniciar sesión para guardar favoritos', 'tukitask-local-drivers'),
            'login_required' => true,
        ));
    }
    
    /**
     * Check if product is in favorites.
     */
    public function is_favorite($product_id, $user_id = null) {
        $favorites = $this->get_user_favorites($user_id);
        return in_array($product_id, $favorites);
    }
    
    /**
     * Get user's favorites.
     */
    public function get_user_favorites($user_id = null) {
        if (!$user_id) {
            $user_id = get_current_user_id();
        }
        if (!$user_id) {
            return array();
        }
        
        $favorites = get_user_meta($user_id, '_tukitask_favorites', true);
        return is_array($favorites) ? $favorites : array();
    }
    
    /**
     * Favorites page content for My Account.
     */
    public function favorites_content() {
        echo $this->render_favorites_page();
    }
    
    /**
     * Shortcode [tukitask_favorites].
     */
    public function shortcode_favorites($atts) {
        return $this->render_favorites_page();
    }
    
    /**
     * Render favorites page.
     */
    private function render_favorites_page() {
        $user_id = get_current_user_id();
        
        if (!$user_id) {
            return '<p>' . sprintf(
                __('Debes <a href="%s">iniciar sesión</a> para ver tus favoritos.', 'tukitask-local-drivers'),
                esc_url(wp_login_url(get_permalink()))
            ) . '</p>';
        }
        
        $favorites = $this->get_user_favorites($user_id);
        
        ob_start();
        ?>
        <div class="tuki-favorites-page">
            <h2>❤️ <?php esc_html_e('Mis Favoritos', 'tukitask-local-drivers'); ?> 
                <span style="font-size:0.8em;color:#6b7280;">(<?php echo count($favorites); ?>)</span>
            </h2>
            
            <?php if (empty($favorites)): ?>
            <div class="tuki-empty-favorites">
                <div class="icon">💔</div>
                <h3><?php esc_html_e('No tienes favoritos aún', 'tukitask-local-drivers'); ?></h3>
                <p><?php esc_html_e('Explora el marketplace y guarda los productos que te gusten.', 'tukitask-local-drivers'); ?></p>
                <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>">
                    🛒 <?php esc_html_e('Explorar productos', 'tukitask-local-drivers'); ?>
                </a>
            </div>
            <?php else: ?>
            <div class="tuki-favorites-grid">
                <?php foreach ($favorites as $product_id): 
                    $product = wc_get_product($product_id);
                    if (!$product) continue;
                ?>
                <div class="tuki-fav-card" data-product-id="<?php echo esc_attr($product_id); ?>">
                    <button type="button" class="tuki-favorite-btn is-favorite" data-product-id="<?php echo esc_attr($product_id); ?>">
                        <svg class="heart-outline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <svg class="heart-filled" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                    <a href="<?php echo esc_url(get_permalink($product_id)); ?>">
                        <img src="<?php echo esc_url(wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src()); ?>" 
                             alt="<?php echo esc_attr($product->get_name()); ?>">
                    </a>
                    <div class="tuki-fav-card-body">
                        <h4><a href="<?php echo esc_url(get_permalink($product_id)); ?>"><?php echo esc_html($product->get_name()); ?></a></h4>
                        <div class="tuki-fav-price"><?php echo wp_kses_post($product->get_price_html()); ?></div>
                        <div class="tuki-fav-actions">
                            <a href="<?php echo esc_url(add_query_arg('add-to-cart', $product_id, wc_get_cart_url())); ?>" class="tuki-add-cart-btn">
                                🛒 <?php esc_html_e('Comprar', 'tukitask-local-drivers'); ?>
                            </a>
                            <button type="button" class="tuki-remove-fav-btn" onclick="tukiRemoveFavorite(<?php echo esc_attr($product_id); ?>, this)">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <script>
            function tukiRemoveFavorite(productId, btn) {
                var card = btn.closest('.tuki-fav-card');
                card.style.opacity = '0.5';
                
                jQuery.post(tukiFavorites.ajaxUrl, {
                    action: 'tukitask_toggle_favorite',
                    nonce: tukiFavorites.nonce,
                    product_id: productId
                }, function(response) {
                    if (response.success) {
                        card.style.transform = 'scale(0.8)';
                        card.style.opacity = '0';
                        setTimeout(function() {
                            card.remove();
                            // Check if empty
                            if (document.querySelectorAll('.tuki-fav-card').length === 0) {
                                location.reload();
                            }
                        }, 300);
                    }
                });
            }
            </script>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }
}

// Initialize
Customer_Favorites::instance();
