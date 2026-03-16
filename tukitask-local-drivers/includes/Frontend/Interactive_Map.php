<?php
/**
 * Interactive Map System.
 *
 * Provides real-time map visualization of stores, drivers, and products.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Helpers\Geo;

/**
 * Interactive_Map Class.
 *
 * Handles map rendering and AJAX endpoints for markers.
 */
class Interactive_Map {

    /**
     * Singleton instance.
     *
     * @var Interactive_Map
     */
    private static $instance = null;

    /**
     * Default map center (can be overridden by settings).
     */
    const DEFAULT_LAT = 19.4326; // Mexico City
    const DEFAULT_LNG = -99.1332;
    const DEFAULT_ZOOM = 13;

    /**
     * Get singleton instance.
     *
     * @return Interactive_Map
     */
    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor.
     */
    private function __construct() {
        add_shortcode('tukitask_mapa', array($this, 'render_map_shortcode'));
        add_shortcode('tukitask_mapa_tiendas', array($this, 'render_stores_map'));
        add_shortcode('tukitask_mapa_drivers', array($this, 'render_drivers_map'));
        
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));
        
        // AJAX endpoints
        add_action('wp_ajax_tukitask_get_map_markers', array($this, 'ajax_get_markers'));
        add_action('wp_ajax_nopriv_tukitask_get_map_markers', array($this, 'ajax_get_markers'));
        add_action('wp_ajax_tukitask_get_marker_details', array($this, 'ajax_get_marker_details'));
        add_action('wp_ajax_nopriv_tukitask_get_marker_details', array($this, 'ajax_get_marker_details'));
        add_action('wp_ajax_tukitask_search_map', array($this, 'ajax_search_map'));
        add_action('wp_ajax_nopriv_tukitask_search_map', array($this, 'ajax_search_map'));
    }

    /**
     * Register map assets.
     */
    public function register_assets() {
        // Leaflet CSS
        wp_register_style(
            'leaflet',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
            array(),
            '1.9.4'
        );
        
        // Leaflet MarkerCluster CSS
        wp_register_style(
            'leaflet-markercluster',
            'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css',
            array('leaflet'),
            '1.4.1'
        );
        
        wp_register_style(
            'leaflet-markercluster-default',
            'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css',
            array('leaflet-markercluster'),
            '1.4.1'
        );
        
        // Custom map styles
        wp_register_style(
            'tukitask-map',
            plugins_url('assets/css/interactive-map.css', dirname(dirname(__FILE__))),
            array('leaflet', 'leaflet-markercluster-default'),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0'
        );
        
        // Leaflet JS
        wp_register_script(
            'leaflet',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
            array(),
            '1.9.4',
            true
        );
        
        // Leaflet MarkerCluster JS
        wp_register_script(
            'leaflet-markercluster',
            'https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js',
            array('leaflet'),
            '1.4.1',
            true
        );
        
        // Custom map script
        wp_register_script(
            'tukitask-map',
            plugins_url('assets/js/interactive-map.js', dirname(dirname(__FILE__))),
            array('jquery', 'leaflet', 'leaflet-markercluster'),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0',
            true
        );
    }

    /**
     * Enqueue map assets with config.
     *
     * @param array $config Map configuration.
     */
    private function enqueue_map_assets($config = array()) {
        wp_enqueue_style('tukitask-map');
        wp_enqueue_script('tukitask-map');
        
        $default_config = array(
            'ajax_url'      => admin_url('admin-ajax.php'),
            'nonce'         => wp_create_nonce('tukitask_map_nonce'),
            'default_lat'   => floatval(get_option('tukitask_ld_default_lat', self::DEFAULT_LAT)),
            'default_lng'   => floatval(get_option('tukitask_ld_default_lng', self::DEFAULT_LNG)),
            'default_zoom'  => intval(get_option('tukitask_ld_default_zoom', self::DEFAULT_ZOOM)),
            'cluster_radius' => 80,
            'refresh_interval' => 30000, // 30 seconds
            'strings'       => array(
                'loading'       => __('Cargando mapa...', 'tukitask-local-drivers'),
                'error'         => __('Error al cargar el mapa', 'tukitask-local-drivers'),
                'no_results'    => __('No se encontraron resultados', 'tukitask-local-drivers'),
                'your_location' => __('Tu ubicación', 'tukitask-local-drivers'),
                'stores'        => __('Tiendas', 'tukitask-local-drivers'),
                'drivers'       => __('Repartidores', 'tukitask-local-drivers'),
                'products'      => __('Productos', 'tukitask-local-drivers'),
                'km_away'       => __('km de distancia', 'tukitask-local-drivers'),
                'open_now'      => __('Abierto ahora', 'tukitask-local-drivers'),
                'closed'        => __('Cerrado', 'tukitask-local-drivers'),
                'available'     => __('Disponible', 'tukitask-local-drivers'),
                'busy'          => __('Ocupado', 'tukitask-local-drivers'),
                'view_store'    => __('Ver tienda', 'tukitask-local-drivers'),
                'view_products' => __('Ver productos', 'tukitask-local-drivers'),
                'arrives_today' => __('Llega hoy', 'tukitask-local-drivers'),
                'search_placeholder' => __('Buscar tiendas, productos...', 'tukitask-local-drivers'),
            ),
            'icons'         => array(
                'store'     => plugins_url('assets/img/marker-store.png', dirname(dirname(__FILE__))),
                'driver'    => plugins_url('assets/img/marker-driver.png', dirname(dirname(__FILE__))),
                'product'   => plugins_url('assets/img/marker-product.png', dirname(dirname(__FILE__))),
                'user'      => plugins_url('assets/img/marker-user.png', dirname(dirname(__FILE__))),
            ),
        );
        
        $config = wp_parse_args($config, $default_config);
        
        wp_localize_script('tukitask-map', 'TukitaskMap', $config);
    }

    /**
     * Render main map shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_map_shortcode($atts) {
        $atts = shortcode_atts(array(
            'height'        => '500px',
            'show_stores'   => 'yes',
            'show_drivers'  => 'yes',
            'show_products' => 'no',
            'show_filters'  => 'yes',
            'show_search'   => 'yes',
            'radius'        => 10,
            'auto_locate'   => 'yes',
            'style'         => 'default', // default, dark, satellite
        ), $atts, 'tukitask_mapa');
        
        $this->enqueue_map_assets(array(
            'show_stores'   => $atts['show_stores'] === 'yes',
            'show_drivers'  => $atts['show_drivers'] === 'yes',
            'show_products' => $atts['show_products'] === 'yes',
            'radius'        => intval($atts['radius']),
            'auto_locate'   => $atts['auto_locate'] === 'yes',
            'map_style'     => $atts['style'],
        ));
        
        $map_id = 'tukitask-map-' . wp_rand(1000, 9999);
        
        ob_start();
        ?>
        <div class="tukitask-map-wrapper" data-map-id="<?php echo esc_attr($map_id); ?>">
            <?php if ($atts['show_search'] === 'yes'): ?>
            <div class="tukitask-map-search">
                <div class="tukitask-search-input-wrapper">
                    <svg class="tukitask-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" 
                           class="tukitask-map-search-input" 
                           placeholder="<?php esc_attr_e('Buscar tiendas, productos...', 'tukitask-local-drivers'); ?>"
                           autocomplete="off">
                    <button type="button" class="tukitask-search-clear" style="display:none;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="tukitask-search-results"></div>
            </div>
            <?php endif; ?>
            
            <?php if ($atts['show_filters'] === 'yes'): ?>
            <div class="tukitask-map-filters">
                <div class="tukitask-filter-chips">
                    <?php if ($atts['show_stores'] === 'yes'): ?>
                    <button type="button" class="tukitask-filter-chip active" data-filter="stores">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        <span><?php esc_html_e('Tiendas', 'tukitask-local-drivers'); ?></span>
                        <span class="tukitask-filter-count" data-count="stores">0</span>
                    </button>
                    <?php endif; ?>
                    
                    <?php if ($atts['show_drivers'] === 'yes'): ?>
                    <button type="button" class="tukitask-filter-chip active" data-filter="drivers">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 8v4l3 3"/>
                        </svg>
                        <span><?php esc_html_e('Repartidores', 'tukitask-local-drivers'); ?></span>
                        <span class="tukitask-filter-count" data-count="drivers">0</span>
                    </button>
                    <?php endif; ?>
                    
                    <?php if ($atts['show_products'] === 'yes'): ?>
                    <button type="button" class="tukitask-filter-chip" data-filter="products">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 0 1-8 0"/>
                        </svg>
                        <span><?php esc_html_e('Productos', 'tukitask-local-drivers'); ?></span>
                        <span class="tukitask-filter-count" data-count="products">0</span>
                    </button>
                    <?php endif; ?>
                    
                    <button type="button" class="tukitask-filter-chip" data-filter="llega-hoy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                        <span><?php esc_html_e('Llega Hoy', 'tukitask-local-drivers'); ?></span>
                    </button>
                </div>
                
                <div class="tukitask-filter-radius">
                    <label><?php esc_html_e('Radio:', 'tukitask-local-drivers'); ?></label>
                    <select class="tukitask-radius-select">
                        <option value="2">2 km</option>
                        <option value="5">5 km</option>
                        <option value="10" selected>10 km</option>
                        <option value="20">20 km</option>
                        <option value="50">50 km</option>
                    </select>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="tukitask-map-container" 
                 id="<?php echo esc_attr($map_id); ?>"
                 style="height: <?php echo esc_attr($atts['height']); ?>;"
                 data-show-stores="<?php echo esc_attr($atts['show_stores']); ?>"
                 data-show-drivers="<?php echo esc_attr($atts['show_drivers']); ?>"
                 data-show-products="<?php echo esc_attr($atts['show_products']); ?>"
                 data-radius="<?php echo esc_attr($atts['radius']); ?>"
                 data-auto-locate="<?php echo esc_attr($atts['auto_locate']); ?>"
                 data-style="<?php echo esc_attr($atts['style']); ?>">
                <div class="tukitask-map-loading">
                    <div class="tukitask-map-spinner"></div>
                    <span><?php esc_html_e('Cargando mapa...', 'tukitask-local-drivers'); ?></span>
                </div>
            </div>
            
            <div class="tukitask-map-controls">
                <button type="button" class="tukitask-map-btn tukitask-locate-btn" title="<?php esc_attr_e('Mi ubicación', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                    </svg>
                </button>
                <button type="button" class="tukitask-map-btn tukitask-zoom-in" title="<?php esc_attr_e('Acercar', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button type="button" class="tukitask-map-btn tukitask-zoom-out" title="<?php esc_attr_e('Alejar', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button type="button" class="tukitask-map-btn tukitask-fullscreen-btn" title="<?php esc_attr_e('Pantalla completa', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 3 21 3 21 9"/>
                        <polyline points="9 21 3 21 3 15"/>
                        <line x1="21" y1="3" x2="14" y2="10"/>
                        <line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                </button>
            </div>
            
            <div class="tukitask-map-legend">
                <div class="tukitask-legend-item">
                    <span class="tukitask-legend-marker store"></span>
                    <span><?php esc_html_e('Tiendas', 'tukitask-local-drivers'); ?></span>
                </div>
                <div class="tukitask-legend-item">
                    <span class="tukitask-legend-marker driver"></span>
                    <span><?php esc_html_e('Repartidores', 'tukitask-local-drivers'); ?></span>
                </div>
                <div class="tukitask-legend-item">
                    <span class="tukitask-legend-marker llega-hoy"></span>
                    <span><?php esc_html_e('Llega Hoy', 'tukitask-local-drivers'); ?></span>
                </div>
            </div>
            
            <!-- Side panel for details -->
            <div class="tukitask-map-panel">
                <button type="button" class="tukitask-panel-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
                <div class="tukitask-panel-content"></div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render stores-only map.
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_stores_map($atts) {
        $atts = shortcode_atts(array(
            'height'      => '400px',
            'show_search' => 'yes',
            'radius'      => 20,
        ), $atts);
        
        return $this->render_map_shortcode(array_merge($atts, array(
            'show_stores'   => 'yes',
            'show_drivers'  => 'no',
            'show_products' => 'no',
            'show_filters'  => 'no',
        )));
    }

    /**
     * Render drivers-only map (usually for admin).
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_drivers_map($atts) {
        $atts = shortcode_atts(array(
            'height'      => '400px',
            'show_search' => 'no',
            'radius'      => 50,
        ), $atts);
        
        return $this->render_map_shortcode(array_merge($atts, array(
            'show_stores'   => 'no',
            'show_drivers'  => 'yes',
            'show_products' => 'no',
            'show_filters'  => 'no',
        )));
    }

    /**
     * AJAX: Get map markers.
     */
    public function ajax_get_markers() {
        check_ajax_referer('tukitask_map_nonce', 'nonce');
        
        $lat = isset($_POST['lat']) ? floatval($_POST['lat']) : null;
        $lng = isset($_POST['lng']) ? floatval($_POST['lng']) : null;
        $radius = isset($_POST['radius']) ? intval($_POST['radius']) : 10;
        $types = isset($_POST['types']) ? array_map('sanitize_text_field', (array) $_POST['types']) : array('stores', 'drivers');
        $llega_hoy_only = isset($_POST['llega_hoy']) && $_POST['llega_hoy'] === 'true';
        
        $markers = array(
            'stores'  => array(),
            'drivers' => array(),
            'products' => array(),
        );
        
        // Get stores
        if (in_array('stores', $types)) {
            $markers['stores'] = $this->get_store_markers($lat, $lng, $radius, $llega_hoy_only);
        }
        
        // Get drivers
        if (in_array('drivers', $types)) {
            $markers['drivers'] = $this->get_driver_markers($lat, $lng, $radius);
        }
        
        // Get products with location
        if (in_array('products', $types)) {
            $markers['products'] = $this->get_product_markers($lat, $lng, $radius, $llega_hoy_only);
        }
        
        wp_send_json_success(array(
            'markers' => $markers,
            'counts'  => array(
                'stores'   => count($markers['stores']),
                'drivers'  => count($markers['drivers']),
                'products' => count($markers['products']),
            ),
        ));
    }

    /**
     * Get store markers.
     *
     * @param float|null $lat User latitude.
     * @param float|null $lng User longitude.
     * @param int        $radius Search radius in km.
     * @param bool       $llega_hoy_only Only show stores with Llega Hoy active.
     * @return array
     */
    private function get_store_markers($lat, $lng, $radius, $llega_hoy_only = false) {
        global $wpdb;
        
        $stores = array();
        
        // Get vendors with store locations
        $results = $wpdb->get_results(
            "SELECT u.ID, u.display_name,
                    lat.meta_value as lat,
                    lng.meta_value as lng,
                    addr.meta_value as address,
                    logo.meta_value as logo
             FROM {$wpdb->users} u
             INNER JOIN {$wpdb->usermeta} lat ON u.ID = lat.user_id AND lat.meta_key = '_vendedor_store_lat'
             INNER JOIN {$wpdb->usermeta} lng ON u.ID = lng.user_id AND lng.meta_key = '_vendedor_store_lng'
             LEFT JOIN {$wpdb->usermeta} addr ON u.ID = addr.user_id AND addr.meta_key = '_vendedor_store_address'
             LEFT JOIN {$wpdb->usermeta} logo ON u.ID = logo.user_id AND logo.meta_key = '_vendedor_store_logo'
             WHERE lat.meta_value != '' AND lng.meta_value != ''",
            ARRAY_A
        );
        
        foreach ($results as $row) {
            $store_lat = floatval($row['lat']);
            $store_lng = floatval($row['lng']);
            
            // Calculate distance if user location provided
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, $store_lat, $store_lng);
                if ($distance > $radius) {
                    continue;
                }
            }
            
            // Check Llega Hoy status
            $has_llega_hoy = $this->vendor_has_llega_hoy($row['ID']);
            if ($llega_hoy_only && !$has_llega_hoy) {
                continue;
            }
            
            // Get store info
            $product_count = $this->get_vendor_product_count($row['ID']);
            $rating = $this->get_vendor_rating($row['ID']);
            $is_open = $this->is_store_open($row['ID']);
            
            $stores[] = array(
                'id'           => $row['ID'],
                'type'         => 'store',
                'name'         => $row['display_name'],
                'lat'          => $store_lat,
                'lng'          => $store_lng,
                'address'      => $row['address'] ?: '',
                'logo'         => $row['logo'] ? wp_get_attachment_url($row['logo']) : '',
                'distance'     => $distance,
                'has_llega_hoy' => $has_llega_hoy,
                'product_count' => $product_count,
                'rating'       => $rating,
                'is_open'      => $is_open,
                'url'          => $this->get_store_url($row['ID']),
            );
        }
        
        // Also include Dokan vendors if available
        if (function_exists('dokan_get_sellers')) {
            $dokan_stores = $this->get_dokan_store_markers($lat, $lng, $radius, $llega_hoy_only);
            $stores = array_merge($stores, $dokan_stores);
        }
        
        // Sort by distance
        if ($lat && $lng) {
            usort($stores, function($a, $b) {
                return ($a['distance'] ?? 999) <=> ($b['distance'] ?? 999);
            });
        }
        
        return $stores;
    }

    /**
     * Get Dokan store markers.
     */
    private function get_dokan_store_markers($lat, $lng, $radius, $llega_hoy_only) {
        if (!function_exists('dokan_get_sellers')) {
            return array();
        }
        
        $stores = array();
        $sellers = dokan_get_sellers(array('number' => -1));
        
        if (empty($sellers['users'])) {
            return array();
        }
        
        foreach ($sellers['users'] as $seller) {
            $store_info = dokan_get_store_info($seller->ID);
            
            if (empty($store_info['location'])) {
                continue;
            }
            
            $loc = explode(',', $store_info['location']);
            if (count($loc) < 2) {
                continue;
            }
            
            $store_lat = floatval(trim($loc[0]));
            $store_lng = floatval(trim($loc[1]));
            
            // Calculate distance
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, $store_lat, $store_lng);
                if ($distance > $radius) {
                    continue;
                }
            }
            
            $has_llega_hoy = $this->vendor_has_llega_hoy($seller->ID);
            if ($llega_hoy_only && !$has_llega_hoy) {
                continue;
            }
            
            $stores[] = array(
                'id'           => $seller->ID,
                'type'         => 'store',
                'name'         => $store_info['store_name'] ?: $seller->display_name,
                'lat'          => $store_lat,
                'lng'          => $store_lng,
                'address'      => $store_info['address']['street_1'] ?? '',
                'logo'         => $store_info['gravatar'] ?? '',
                'distance'     => $distance,
                'has_llega_hoy' => $has_llega_hoy,
                'product_count' => $this->get_vendor_product_count($seller->ID),
                'rating'       => $this->get_vendor_rating($seller->ID),
                'is_open'      => true,
                'url'          => dokan_get_store_url($seller->ID),
            );
        }
        
        return $stores;
    }

    /**
     * Get driver markers.
     *
     * @param float|null $lat User latitude.
     * @param float|null $lng User longitude.
     * @param int        $radius Search radius in km.
     * @return array
     */
    private function get_driver_markers($lat, $lng, $radius) {
        $drivers = array();
        
        // Get active drivers
        $driver_posts = get_posts(array(
            'post_type'      => 'tukitask_driver',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'meta_query'     => array(
                array(
                    'key'     => '_driver_status',
                    'value'   => array('available', 'busy'),
                    'compare' => 'IN',
                ),
                array(
                    'key'     => '_driver_lat',
                    'compare' => 'EXISTS',
                ),
                array(
                    'key'     => '_driver_lng',
                    'compare' => 'EXISTS',
                ),
            ),
        ));
        
        foreach ($driver_posts as $driver) {
            $driver_lat = floatval(get_post_meta($driver->ID, '_driver_lat', true));
            $driver_lng = floatval(get_post_meta($driver->ID, '_driver_lng', true));
            
            if (!$driver_lat || !$driver_lng) {
                continue;
            }
            
            // Calculate distance
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, $driver_lat, $driver_lng);
                if ($distance > $radius) {
                    continue;
                }
            }
            
            $status = get_post_meta($driver->ID, '_driver_status', true);
            $vehicle = get_post_meta($driver->ID, '_driver_vehicle_type', true);
            $user_id = get_post_meta($driver->ID, '_driver_user_id', true);
            $rating = $this->get_driver_rating($driver->ID);
            
            // Get profile photo
            $photo = '';
            if ($user_id) {
                $photo = get_avatar_url($user_id, array('size' => 64));
            }
            
            $drivers[] = array(
                'id'           => $driver->ID,
                'type'         => 'driver',
                'name'         => $driver->post_title,
                'lat'          => $driver_lat,
                'lng'          => $driver_lng,
                'distance'     => $distance,
                'status'       => $status,
                'vehicle'      => $vehicle ?: 'moto',
                'photo'        => $photo,
                'rating'       => $rating,
                'is_available' => $status === 'available',
            );
        }
        
        // Sort by distance
        if ($lat && $lng) {
            usort($drivers, function($a, $b) {
                return ($a['distance'] ?? 999) <=> ($b['distance'] ?? 999);
            });
        }
        
        return $drivers;
    }

    /**
     * Get product markers (products with Llega Hoy).
     *
     * @param float|null $lat User latitude.
     * @param float|null $lng User longitude.
     * @param int        $radius Search radius in km.
     * @param bool       $llega_hoy_only Only show Llega Hoy products.
     * @return array
     */
    private function get_product_markers($lat, $lng, $radius, $llega_hoy_only = true) {
        if (!function_exists('wc_get_products')) {
            return array();
        }
        
        $products = array();
        
        $args = array(
            'status'    => 'publish',
            'limit'     => 100,
            'orderby'   => 'date',
            'order'     => 'DESC',
        );
        
        if ($llega_hoy_only) {
            $args['meta_query'] = array(
                array(
                    'key'     => '_tukitask_llega_hoy',
                    'value'   => '1',
                    'compare' => '=',
                ),
            );
        }
        
        $wc_products = wc_get_products($args);
        
        foreach ($wc_products as $product) {
            // Get vendor location
            $vendor_id = get_post_field('post_author', $product->get_id());
            $vendor_lat = get_user_meta($vendor_id, '_vendedor_store_lat', true);
            $vendor_lng = get_user_meta($vendor_id, '_vendedor_store_lng', true);
            
            if (!$vendor_lat || !$vendor_lng) {
                continue;
            }
            
            $product_lat = floatval($vendor_lat);
            $product_lng = floatval($vendor_lng);
            
            // Calculate distance
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, $product_lat, $product_lng);
                if ($distance > $radius) {
                    continue;
                }
            }
            
            $products[] = array(
                'id'           => $product->get_id(),
                'type'         => 'product',
                'name'         => $product->get_name(),
                'lat'          => $product_lat,
                'lng'          => $product_lng,
                'distance'     => $distance,
                'price'        => $product->get_price_html(),
                'image'        => wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src(),
                'has_llega_hoy' => (bool) $product->get_meta('_tukitask_llega_hoy'),
                'url'          => $product->get_permalink(),
                'vendor_id'    => $vendor_id,
            );
        }
        
        // Sort by distance
        if ($lat && $lng) {
            usort($products, function($a, $b) {
                return ($a['distance'] ?? 999) <=> ($b['distance'] ?? 999);
            });
        }
        
        return array_slice($products, 0, 50); // Limit to 50 products
    }

    /**
     * AJAX: Get marker details.
     */
    public function ajax_get_marker_details() {
        check_ajax_referer('tukitask_map_nonce', 'nonce');
        
        $type = isset($_POST['type']) ? sanitize_text_field($_POST['type']) : '';
        $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
        
        if (!$type || !$id) {
            wp_send_json_error(array('message' => 'Invalid parameters'));
        }
        
        $details = array();
        
        switch ($type) {
            case 'store':
                $details = $this->get_store_details($id);
                break;
            case 'driver':
                $details = $this->get_driver_details($id);
                break;
            case 'product':
                $details = $this->get_product_details($id);
                break;
        }
        
        if (empty($details)) {
            wp_send_json_error(array('message' => 'Not found'));
        }
        
        wp_send_json_success($details);
    }

    /**
     * Get store details for panel.
     */
    private function get_store_details($vendor_id) {
        $user = get_user_by('ID', $vendor_id);
        if (!$user) {
            return null;
        }
        
        $logo = get_user_meta($vendor_id, '_vendedor_store_logo', true);
        $banner = get_user_meta($vendor_id, '_vendedor_store_banner', true);
        $description = get_user_meta($vendor_id, '_vendedor_store_description', true);
        $phone = get_user_meta($vendor_id, '_vendedor_phone', true);
        
        // Get featured products
        $products = wc_get_products(array(
            'author'      => $vendor_id,
            'limit'       => 4,
            'status'      => 'publish',
            'orderby'     => 'popularity',
        ));
        
        $featured_products = array();
        foreach ($products as $product) {
            $featured_products[] = array(
                'id'    => $product->get_id(),
                'name'  => $product->get_name(),
                'price' => $product->get_price_html(),
                'image' => wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src(),
                'url'   => $product->get_permalink(),
            );
        }
        
        return array(
            'id'          => $vendor_id,
            'type'        => 'store',
            'name'        => $user->display_name,
            'logo'        => $logo ? wp_get_attachment_url($logo) : get_avatar_url($vendor_id),
            'banner'      => $banner ? wp_get_attachment_url($banner) : '',
            'description' => $description ?: '',
            'phone'       => $phone ?: '',
            'rating'      => $this->get_vendor_rating($vendor_id),
            'product_count' => $this->get_vendor_product_count($vendor_id),
            'has_llega_hoy' => $this->vendor_has_llega_hoy($vendor_id),
            'is_open'     => $this->is_store_open($vendor_id),
            'url'         => $this->get_store_url($vendor_id),
            'products'    => $featured_products,
        );
    }

    /**
     * Get driver details for panel.
     */
    private function get_driver_details($driver_id) {
        $driver = get_post($driver_id);
        if (!$driver || $driver->post_type !== 'tukitask_driver') {
            return null;
        }
        
        $user_id = get_post_meta($driver_id, '_driver_user_id', true);
        $status = get_post_meta($driver_id, '_driver_status', true);
        $vehicle = get_post_meta($driver_id, '_driver_vehicle_type', true);
        $completed_orders = get_post_meta($driver_id, '_driver_completed_orders', true) ?: 0;
        
        return array(
            'id'              => $driver_id,
            'type'            => 'driver',
            'name'            => $driver->post_title,
            'photo'           => $user_id ? get_avatar_url($user_id, array('size' => 128)) : '',
            'status'          => $status,
            'vehicle'         => $vehicle ?: 'moto',
            'rating'          => $this->get_driver_rating($driver_id),
            'completed_orders' => intval($completed_orders),
            'is_available'    => $status === 'available',
        );
    }

    /**
     * Get product details for panel.
     */
    private function get_product_details($product_id) {
        $product = wc_get_product($product_id);
        if (!$product) {
            return null;
        }
        
        $vendor_id = get_post_field('post_author', $product_id);
        
        return array(
            'id'           => $product_id,
            'type'         => 'product',
            'name'         => $product->get_name(),
            'image'        => wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src(),
            'gallery'      => array_map('wp_get_attachment_url', $product->get_gallery_image_ids()),
            'price'        => $product->get_price_html(),
            'regular_price' => $product->get_regular_price(),
            'sale_price'   => $product->get_sale_price(),
            'description'  => wp_trim_words($product->get_short_description(), 30),
            'has_llega_hoy' => (bool) $product->get_meta('_tukitask_llega_hoy'),
            'in_stock'     => $product->is_in_stock(),
            'url'          => $product->get_permalink(),
            'vendor'       => array(
                'id'   => $vendor_id,
                'name' => get_the_author_meta('display_name', $vendor_id),
            ),
        );
    }

    /**
     * AJAX: Search map.
     */
    public function ajax_search_map() {
        check_ajax_referer('tukitask_map_nonce', 'nonce');
        
        $query = isset($_POST['query']) ? sanitize_text_field($_POST['query']) : '';
        $lat = isset($_POST['lat']) ? floatval($_POST['lat']) : null;
        $lng = isset($_POST['lng']) ? floatval($_POST['lng']) : null;
        
        if (strlen($query) < 2) {
            wp_send_json_success(array('results' => array()));
        }
        
        $results = array();
        
        // Search stores
        $stores = $this->search_stores($query, $lat, $lng);
        $results = array_merge($results, $stores);
        
        // Search products
        $products = $this->search_products($query, $lat, $lng);
        $results = array_merge($results, $products);
        
        // Sort by distance if location available
        if ($lat && $lng) {
            usort($results, function($a, $b) {
                return ($a['distance'] ?? 999) <=> ($b['distance'] ?? 999);
            });
        }
        
        wp_send_json_success(array(
            'results' => array_slice($results, 0, 10),
        ));
    }

    /**
     * Search stores by name.
     */
    private function search_stores($query, $lat, $lng) {
        global $wpdb;
        
        $like = '%' . $wpdb->esc_like($query) . '%';
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT u.ID, u.display_name,
                    lat.meta_value as lat,
                    lng.meta_value as lng
             FROM {$wpdb->users} u
             INNER JOIN {$wpdb->usermeta} lat ON u.ID = lat.user_id AND lat.meta_key = '_vendedor_store_lat'
             INNER JOIN {$wpdb->usermeta} lng ON u.ID = lng.user_id AND lng.meta_key = '_vendedor_store_lng'
             WHERE u.display_name LIKE %s
             AND lat.meta_value != '' AND lng.meta_value != ''
             LIMIT 5",
            $like
        ), ARRAY_A);
        
        $stores = array();
        foreach ($results as $row) {
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, floatval($row['lat']), floatval($row['lng']));
            }
            
            $stores[] = array(
                'id'       => $row['ID'],
                'type'     => 'store',
                'name'     => $row['display_name'],
                'lat'      => floatval($row['lat']),
                'lng'      => floatval($row['lng']),
                'distance' => $distance,
                'icon'     => 'store',
            );
        }
        
        return $stores;
    }

    /**
     * Search products by name.
     */
    private function search_products($query, $lat, $lng) {
        $products = wc_get_products(array(
            's'      => $query,
            'limit'  => 5,
            'status' => 'publish',
        ));
        
        $results = array();
        foreach ($products as $product) {
            $vendor_id = get_post_field('post_author', $product->get_id());
            $vendor_lat = get_user_meta($vendor_id, '_vendedor_store_lat', true);
            $vendor_lng = get_user_meta($vendor_id, '_vendedor_store_lng', true);
            
            if (!$vendor_lat || !$vendor_lng) {
                continue;
            }
            
            $distance = null;
            if ($lat && $lng) {
                $distance = Distance::haversine($lat, $lng, floatval($vendor_lat), floatval($vendor_lng));
            }
            
            $results[] = array(
                'id'       => $product->get_id(),
                'type'     => 'product',
                'name'     => $product->get_name(),
                'lat'      => floatval($vendor_lat),
                'lng'      => floatval($vendor_lng),
                'distance' => $distance,
                'price'    => $product->get_price_html(),
                'icon'     => 'product',
            );
        }
        
        return $results;
    }

    // Helper methods
    
    private function vendor_has_llega_hoy($vendor_id) {
        $cache_key = 'tukitask_vendor_llega_hoy_' . $vendor_id;
        $cached = get_transient($cache_key);
        
        if (false !== $cached) {
            return $cached === 'yes';
        }
        
        $has = get_user_meta($vendor_id, '_tukitask_llega_hoy_active', true) === '1';
        
        set_transient($cache_key, $has ? 'yes' : 'no', 120); // 2 min cache
        
        return $has;
    }
    
    private function get_vendor_product_count($vendor_id) {
        $count = count_user_posts($vendor_id, 'product');
        return intval($count);
    }
    
    private function get_vendor_rating($vendor_id) {
        // Try Dokan rating
        if (function_exists('dokan_get_seller_rating')) {
            $rating = dokan_get_seller_rating($vendor_id);
            if (!empty($rating['rating'])) {
                return floatval($rating['rating']);
            }
        }
        
        // Fallback to custom rating
        $rating = get_user_meta($vendor_id, '_vendor_average_rating', true);
        return $rating ? floatval($rating) : 0;
    }
    
    private function get_driver_rating($driver_id) {
        $rating = get_post_meta($driver_id, '_driver_average_rating', true);
        return $rating ? floatval($rating) : 0;
    }
    
    private function is_store_open($vendor_id) {
        // Check store hours if defined
        $hours = get_user_meta($vendor_id, '_vendedor_store_hours', true);
        if (empty($hours)) {
            return true; // Assume open if no hours set
        }
        
        $current_day = strtolower(date('l'));
        $current_time = date('H:i');
        
        if (isset($hours[$current_day])) {
            $day_hours = $hours[$current_day];
            if (isset($day_hours['open']) && isset($day_hours['close'])) {
                return $current_time >= $day_hours['open'] && $current_time <= $day_hours['close'];
            }
        }
        
        return true;
    }
    
    private function get_store_url($vendor_id) {
        // Dokan store URL
        if (function_exists('dokan_get_store_url')) {
            return dokan_get_store_url($vendor_id);
        }
        
        // Custom store page
        $store_page = get_option('tukitask_ld_store_page');
        if ($store_page) {
            return add_query_arg('vendor', $vendor_id, get_permalink($store_page));
        }
        
        return get_author_posts_url($vendor_id);
    }
}

// Initialize
Interactive_Map::instance();
