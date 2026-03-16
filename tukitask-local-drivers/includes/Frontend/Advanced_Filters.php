<?php
/**
 * Advanced Filters System.
 *
 * Provides sophisticated filtering for products, stores, and vendors.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Helpers\Geo;

/**
 * Advanced_Filters Class.
 *
 * Handles advanced product filtering with AJAX support.
 */
class Advanced_Filters {

    /**
     * Singleton instance.
     *
     * @var Advanced_Filters
     */
    private static $instance = null;

    /**
     * Filter cache duration (5 minutes).
     */
    const CACHE_DURATION = 300;

    /**
     * Get singleton instance.
     *
     * @return Advanced_Filters
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
        // Shortcodes
        add_shortcode('tukitask_filtros', array($this, 'render_filters_shortcode'));
        add_shortcode('tukitask_productos_filtrados', array($this, 'render_filtered_products'));
        add_shortcode('tukitask_barra_filtros', array($this, 'render_filter_bar'));
        
        // Assets
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));
        
        // AJAX endpoints
        add_action('wp_ajax_tukitask_filter_products', array($this, 'ajax_filter_products'));
        add_action('wp_ajax_nopriv_tukitask_filter_products', array($this, 'ajax_filter_products'));
        add_action('wp_ajax_tukitask_get_filter_counts', array($this, 'ajax_get_filter_counts'));
        add_action('wp_ajax_nopriv_tukitask_get_filter_counts', array($this, 'ajax_get_filter_counts'));
        
        // Modify WooCommerce queries
        add_action('woocommerce_product_query', array($this, 'modify_product_query'), 10, 2);
        add_filter('woocommerce_shortcode_products_query', array($this, 'modify_shortcode_query'), 10, 3);
    }

    /**
     * Register assets.
     */
    public function register_assets() {
        wp_register_style(
            'tukitask-filters',
            plugins_url('assets/css/advanced-filters.css', dirname(dirname(__FILE__))),
            array(),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0'
        );
        
        wp_register_script(
            'tukitask-filters',
            plugins_url('assets/js/advanced-filters.js', dirname(dirname(__FILE__))),
            array('jquery'),
            defined('TUKITASK_LD_VERSION') ? TUKITASK_LD_VERSION : '1.0.0',
            true
        );
    }

    /**
     * Enqueue assets with config.
     */
    private function enqueue_assets() {
        wp_enqueue_style('tukitask-filters');
        wp_enqueue_script('tukitask-filters');
        
        $user_location = Geo::get_current_customer_location();
        
        wp_localize_script('tukitask-filters', 'TukitaskFilters', array(
            'ajax_url'     => admin_url('admin-ajax.php'),
            'nonce'        => wp_create_nonce('tukitask_filters_nonce'),
            'user_lat'     => $user_location ? $user_location['lat'] : null,
            'user_lng'     => $user_location ? $user_location['lng'] : null,
            'currency'     => function_exists('get_woocommerce_currency_symbol') ? get_woocommerce_currency_symbol() : '$',
            'strings'      => array(
                'loading'       => __('Cargando...', 'tukitask-local-drivers'),
                'no_results'    => __('No se encontraron productos', 'tukitask-local-drivers'),
                'error'         => __('Error al cargar productos', 'tukitask-local-drivers'),
                'apply'         => __('Aplicar', 'tukitask-local-drivers'),
                'clear'         => __('Limpiar', 'tukitask-local-drivers'),
                'show_results'  => __('Mostrar %d productos', 'tukitask-local-drivers'),
                'filters'       => __('Filtros', 'tukitask-local-drivers'),
                'sort_by'       => __('Ordenar por', 'tukitask-local-drivers'),
                'distance'      => __('Distancia', 'tukitask-local-drivers'),
                'price'         => __('Precio', 'tukitask-local-drivers'),
                'rating'        => __('Valoración', 'tukitask-local-drivers'),
                'newest'        => __('Más reciente', 'tukitask-local-drivers'),
                'popular'       => __('Más popular', 'tukitask-local-drivers'),
            ),
        ));
    }

    /**
     * Render main filters shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_filters_shortcode($atts) {
        $atts = shortcode_atts(array(
            'layout'           => 'sidebar', // sidebar, horizontal, modal
            'show_distance'    => 'yes',
            'show_price'       => 'yes',
            'show_rating'      => 'yes',
            'show_delivery'    => 'yes',
            'show_categories'  => 'yes',
            'show_vendors'     => 'yes',
            'show_llega_hoy'   => 'yes',
            'show_sort'        => 'yes',
            'collapsible'      => 'yes',
            'sticky'           => 'no',
        ), $atts, 'tukitask_filtros');
        
        $this->enqueue_assets();
        
        $filter_id = 'tukitask-filters-' . wp_rand(1000, 9999);
        
        ob_start();
        ?>
        <div class="tukitask-filters-wrapper <?php echo esc_attr($atts['layout']); ?> <?php echo $atts['sticky'] === 'yes' ? 'sticky' : ''; ?>"
             id="<?php echo esc_attr($filter_id); ?>"
             data-layout="<?php echo esc_attr($atts['layout']); ?>">
            
            <div class="tukitask-filters-header">
                <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="4" y1="21" x2="4" y2="14"/>
                        <line x1="4" y1="10" x2="4" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12" y2="3"/>
                        <line x1="20" y1="21" x2="20" y2="16"/>
                        <line x1="20" y1="12" x2="20" y2="3"/>
                        <line x1="1" y1="14" x2="7" y2="14"/>
                        <line x1="9" y1="8" x2="15" y2="8"/>
                        <line x1="17" y1="16" x2="23" y2="16"/>
                    </svg>
                    <?php esc_html_e('Filtros', 'tukitask-local-drivers'); ?>
                </h3>
                <button type="button" class="tukitask-filters-clear" style="display:none;">
                    <?php esc_html_e('Limpiar todo', 'tukitask-local-drivers'); ?>
                </button>
            </div>
            
            <div class="tukitask-filters-body">
                <?php if ($atts['show_llega_hoy'] === 'yes'): ?>
                <!-- Llega Hoy -->
                <div class="tukitask-filter-section highlight">
                    <label class="tukitask-filter-toggle">
                        <input type="checkbox" name="llega_hoy" value="1">
                        <span class="toggle-switch"></span>
                        <span class="toggle-label">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                            <?php esc_html_e('Llega Hoy', 'tukitask-local-drivers'); ?>
                        </span>
                    </label>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_distance'] === 'yes'): ?>
                <!-- Distance Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Distancia', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-range-filter" data-filter="distance">
                            <div class="range-labels">
                                <span class="range-min">0 km</span>
                                <span class="range-value">10 km</span>
                                <span class="range-max">50 km</span>
                            </div>
                            <input type="range" name="distance" min="1" max="50" value="10" step="1">
                            <div class="range-options">
                                <button type="button" class="range-preset" data-value="2">2 km</button>
                                <button type="button" class="range-preset" data-value="5">5 km</button>
                                <button type="button" class="range-preset" data-value="10">10 km</button>
                                <button type="button" class="range-preset" data-value="20">20 km</button>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_price'] === 'yes'): ?>
                <!-- Price Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Precio', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-price-range">
                            <div class="price-inputs">
                                <div class="price-input-group">
                                    <span class="currency"><?php echo get_woocommerce_currency_symbol(); ?></span>
                                    <input type="number" name="price_min" placeholder="Min" min="0">
                                </div>
                                <span class="price-separator">—</span>
                                <div class="price-input-group">
                                    <span class="currency"><?php echo get_woocommerce_currency_symbol(); ?></span>
                                    <input type="number" name="price_max" placeholder="Max" min="0">
                                </div>
                            </div>
                            <div class="price-presets">
                                <button type="button" class="price-preset" data-min="0" data-max="100">
                                    <?php printf(__('Hasta %s100', 'tukitask-local-drivers'), get_woocommerce_currency_symbol()); ?>
                                </button>
                                <button type="button" class="price-preset" data-min="100" data-max="500">
                                    <?php echo get_woocommerce_currency_symbol(); ?>100 - <?php echo get_woocommerce_currency_symbol(); ?>500
                                </button>
                                <button type="button" class="price-preset" data-min="500" data-max="">
                                    <?php printf(__('%s500+', 'tukitask-local-drivers'), get_woocommerce_currency_symbol()); ?>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_rating'] === 'yes'): ?>
                <!-- Rating Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Valoración', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-rating-filter">
                            <?php for ($i = 5; $i >= 1; $i--): ?>
                            <label class="rating-option">
                                <input type="radio" name="rating" value="<?php echo $i; ?>">
                                <span class="rating-stars">
                                    <?php for ($j = 1; $j <= 5; $j++): ?>
                                    <svg viewBox="0 0 24 24" fill="<?php echo $j <= $i ? 'currentColor' : 'none'; ?>" stroke="currentColor" stroke-width="2">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                    </svg>
                                    <?php endfor; ?>
                                </span>
                                <span class="rating-text"><?php echo $i === 1 ? __('y más', 'tukitask-local-drivers') : __('y más', 'tukitask-local-drivers'); ?></span>
                                <span class="rating-count" data-rating="<?php echo $i; ?>">0</span>
                            </label>
                            <?php endfor; ?>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_delivery'] === 'yes'): ?>
                <!-- Delivery Time Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Tiempo de entrega', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-delivery-filter">
                            <label class="delivery-option">
                                <input type="checkbox" name="delivery_time[]" value="express">
                                <span class="option-icon">⚡</span>
                                <span class="option-text"><?php esc_html_e('Express (< 1 hora)', 'tukitask-local-drivers'); ?></span>
                            </label>
                            <label class="delivery-option">
                                <input type="checkbox" name="delivery_time[]" value="same_day">
                                <span class="option-icon">📦</span>
                                <span class="option-text"><?php esc_html_e('Mismo día', 'tukitask-local-drivers'); ?></span>
                            </label>
                            <label class="delivery-option">
                                <input type="checkbox" name="delivery_time[]" value="next_day">
                                <span class="option-icon">🚚</span>
                                <span class="option-text"><?php esc_html_e('Día siguiente', 'tukitask-local-drivers'); ?></span>
                            </label>
                            <label class="delivery-option">
                                <input type="checkbox" name="delivery_time[]" value="scheduled">
                                <span class="option-icon">📅</span>
                                <span class="option-text"><?php esc_html_e('Programado', 'tukitask-local-drivers'); ?></span>
                            </label>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_categories'] === 'yes'): ?>
                <!-- Categories Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Categorías', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-category-filter">
                            <div class="category-search">
                                <input type="text" placeholder="<?php esc_attr_e('Buscar categoría...', 'tukitask-local-drivers'); ?>">
                            </div>
                            <div class="category-list">
                                <?php echo $this->render_category_checkboxes(); ?>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if ($atts['show_vendors'] === 'yes'): ?>
                <!-- Vendors Filter -->
                <div class="tukitask-filter-section <?php echo $atts['collapsible'] === 'yes' ? 'collapsible' : ''; ?>">
                    <div class="filter-section-header">
                        <h4><?php esc_html_e('Tiendas', 'tukitask-local-drivers'); ?></h4>
                        <?php if ($atts['collapsible'] === 'yes'): ?>
                        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        <?php endif; ?>
                    </div>
                    <div class="filter-section-content">
                        <div class="tukitask-vendor-filter">
                            <div class="vendor-search">
                                <input type="text" placeholder="<?php esc_attr_e('Buscar tienda...', 'tukitask-local-drivers'); ?>">
                            </div>
                            <div class="vendor-list">
                                <?php echo $this->render_vendor_checkboxes(); ?>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <!-- Additional Options -->
                <div class="tukitask-filter-section">
                    <div class="tukitask-additional-filters">
                        <label class="additional-option">
                            <input type="checkbox" name="in_stock" value="1" checked>
                            <span><?php esc_html_e('Solo en stock', 'tukitask-local-drivers'); ?></span>
                        </label>
                        <label class="additional-option">
                            <input type="checkbox" name="on_sale" value="1">
                            <span><?php esc_html_e('En oferta', 'tukitask-local-drivers'); ?></span>
                        </label>
                        <label class="additional-option">
                            <input type="checkbox" name="free_shipping" value="1">
                            <span><?php esc_html_e('Envío gratis', 'tukitask-local-drivers'); ?></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="tukitask-filters-footer">
                <button type="button" class="tukitask-btn-clear">
                    <?php esc_html_e('Limpiar', 'tukitask-local-drivers'); ?>
                </button>
                <button type="button" class="tukitask-btn-apply">
                    <?php esc_html_e('Aplicar filtros', 'tukitask-local-drivers'); ?>
                    <span class="filter-count"></span>
                </button>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render compact filter bar (for horizontal layouts).
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_filter_bar($atts) {
        $atts = shortcode_atts(array(
            'show_sort' => 'yes',
        ), $atts, 'tukitask_barra_filtros');
        
        $this->enqueue_assets();
        
        ob_start();
        ?>
        <div class="tukitask-filter-bar">
            <div class="filter-bar-left">
                <button type="button" class="filter-bar-btn open-filters">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="4" y1="21" x2="4" y2="14"/>
                        <line x1="4" y1="10" x2="4" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12" y2="3"/>
                        <line x1="20" y1="21" x2="20" y2="16"/>
                        <line x1="20" y1="12" x2="20" y2="3"/>
                    </svg>
                    <?php esc_html_e('Filtros', 'tukitask-local-drivers'); ?>
                    <span class="active-filters-count" style="display:none;">0</span>
                </button>
                
                <!-- Quick Filters -->
                <div class="quick-filters">
                    <button type="button" class="quick-filter" data-filter="llega_hoy" data-value="1">
                        ⚡ <?php esc_html_e('Llega Hoy', 'tukitask-local-drivers'); ?>
                    </button>
                    <button type="button" class="quick-filter" data-filter="on_sale" data-value="1">
                        🏷️ <?php esc_html_e('Ofertas', 'tukitask-local-drivers'); ?>
                    </button>
                    <button type="button" class="quick-filter" data-filter="free_shipping" data-value="1">
                        🚚 <?php esc_html_e('Envío gratis', 'tukitask-local-drivers'); ?>
                    </button>
                </div>
            </div>
            
            <?php if ($atts['show_sort'] === 'yes'): ?>
            <div class="filter-bar-right">
                <div class="sort-dropdown">
                    <select name="orderby" class="tukitask-sort-select">
                        <option value="relevance"><?php esc_html_e('Relevancia', 'tukitask-local-drivers'); ?></option>
                        <option value="distance"><?php esc_html_e('Más cercano', 'tukitask-local-drivers'); ?></option>
                        <option value="price-asc"><?php esc_html_e('Precio: menor a mayor', 'tukitask-local-drivers'); ?></option>
                        <option value="price-desc"><?php esc_html_e('Precio: mayor a menor', 'tukitask-local-drivers'); ?></option>
                        <option value="rating"><?php esc_html_e('Mejor valorados', 'tukitask-local-drivers'); ?></option>
                        <option value="date"><?php esc_html_e('Más recientes', 'tukitask-local-drivers'); ?></option>
                        <option value="popularity"><?php esc_html_e('Más populares', 'tukitask-local-drivers'); ?></option>
                    </select>
                </div>
                
                <div class="view-toggle">
                    <button type="button" class="view-btn active" data-view="grid" title="<?php esc_attr_e('Vista cuadrícula', 'tukitask-local-drivers'); ?>">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                        </svg>
                    </button>
                    <button type="button" class="view-btn" data-view="list" title="<?php esc_attr_e('Vista lista', 'tukitask-local-drivers'); ?>">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="3" y="4" width="18" height="4"/>
                            <rect x="3" y="10" width="18" height="4"/>
                            <rect x="3" y="16" width="18" height="4"/>
                        </svg>
                    </button>
                </div>
            </div>
            <?php endif; ?>
        </div>
        
        <!-- Active Filters Tags -->
        <div class="tukitask-active-filters" style="display:none;">
            <span class="active-filters-label"><?php esc_html_e('Filtros activos:', 'tukitask-local-drivers'); ?></span>
            <div class="active-filters-tags"></div>
            <button type="button" class="clear-all-filters"><?php esc_html_e('Limpiar todo', 'tukitask-local-drivers'); ?></button>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render filtered products grid.
     *
     * @param array $atts Shortcode attributes.
     * @return string HTML output.
     */
    public function render_filtered_products($atts) {
        $atts = shortcode_atts(array(
            'columns'     => 4,
            'per_page'    => 12,
            'paginate'    => 'yes',
            'show_count'  => 'yes',
        ), $atts, 'tukitask_productos_filtrados');
        
        $this->enqueue_assets();
        
        ob_start();
        ?>
        <div class="tukitask-products-container"
             data-columns="<?php echo esc_attr($atts['columns']); ?>"
             data-per-page="<?php echo esc_attr($atts['per_page']); ?>"
             data-paginate="<?php echo esc_attr($atts['paginate']); ?>">
            
            <?php if ($atts['show_count'] === 'yes'): ?>
            <div class="products-header">
                <span class="products-count">
                    <span class="count-number">0</span> <?php esc_html_e('productos encontrados', 'tukitask-local-drivers'); ?>
                </span>
            </div>
            <?php endif; ?>
            
            <div class="tukitask-products-grid columns-<?php echo esc_attr($atts['columns']); ?>">
                <div class="products-loading">
                    <div class="loading-spinner"></div>
                    <span><?php esc_html_e('Cargando productos...', 'tukitask-local-drivers'); ?></span>
                </div>
            </div>
            
            <?php if ($atts['paginate'] === 'yes'): ?>
            <div class="tukitask-products-pagination"></div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render category checkboxes.
     */
    private function render_category_checkboxes() {
        $categories = get_terms(array(
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
            'parent'     => 0,
            'number'     => 20,
        ));
        
        if (empty($categories) || is_wp_error($categories)) {
            return '';
        }
        
        $output = '';
        foreach ($categories as $category) {
            $count = $category->count;
            $output .= sprintf(
                '<label class="category-option">
                    <input type="checkbox" name="categories[]" value="%d">
                    <span class="option-name">%s</span>
                    <span class="option-count">%d</span>
                </label>',
                $category->term_id,
                esc_html($category->name),
                $count
            );
        }
        
        return $output;
    }

    /**
     * Render vendor checkboxes.
     */
    private function render_vendor_checkboxes() {
        global $wpdb;
        
        // Get vendors with products
        $vendors = $wpdb->get_results(
            "SELECT DISTINCT p.post_author as id, u.display_name as name, COUNT(*) as count
             FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->users} u ON p.post_author = u.ID
             WHERE p.post_type = 'product' AND p.post_status = 'publish'
             GROUP BY p.post_author
             ORDER BY count DESC
             LIMIT 20",
            ARRAY_A
        );
        
        if (empty($vendors)) {
            return '';
        }
        
        $output = '';
        foreach ($vendors as $vendor) {
            $logo = get_user_meta($vendor['id'], '_vendedor_store_logo', true);
            $logo_url = $logo ? wp_get_attachment_thumb_url($logo) : get_avatar_url($vendor['id'], array('size' => 32));
            
            $output .= sprintf(
                '<label class="vendor-option">
                    <input type="checkbox" name="vendors[]" value="%d">
                    <img src="%s" alt="" class="vendor-avatar">
                    <span class="option-name">%s</span>
                    <span class="option-count">%d</span>
                </label>',
                $vendor['id'],
                esc_url($logo_url),
                esc_html($vendor['name']),
                $vendor['count']
            );
        }
        
        return $output;
    }

    /**
     * AJAX: Filter products.
     */
    public function ajax_filter_products() {
        check_ajax_referer('tukitask_filters_nonce', 'nonce');
        
        $filters = $this->parse_filters($_POST);
        $page = isset($_POST['page']) ? intval($_POST['page']) : 1;
        $per_page = isset($_POST['per_page']) ? intval($_POST['per_page']) : 12;
        
        $products = $this->query_filtered_products($filters, $page, $per_page);
        
        ob_start();
        if (!empty($products['items'])) {
            foreach ($products['items'] as $product_data) {
                echo $this->render_product_card($product_data);
            }
        } else {
            echo '<div class="no-products-found">';
            echo '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
            echo '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
            echo '<h4>' . esc_html__('No se encontraron productos', 'tukitask-local-drivers') . '</h4>';
            echo '<p>' . esc_html__('Intenta ajustar los filtros para ver más resultados.', 'tukitask-local-drivers') . '</p>';
            echo '</div>';
        }
        $html = ob_get_clean();
        
        // Pagination
        $pagination = '';
        if ($products['total_pages'] > 1) {
            $pagination = $this->render_pagination($page, $products['total_pages'], $products['total']);
        }
        
        wp_send_json_success(array(
            'html'         => $html,
            'pagination'   => $pagination,
            'total'        => $products['total'],
            'total_pages'  => $products['total_pages'],
            'current_page' => $page,
        ));
    }

    /**
     * Parse filter parameters.
     */
    private function parse_filters($data) {
        return array(
            'llega_hoy'     => isset($data['llega_hoy']) && $data['llega_hoy'] === '1',
            'distance'      => isset($data['distance']) ? intval($data['distance']) : null,
            'price_min'     => isset($data['price_min']) && $data['price_min'] !== '' ? floatval($data['price_min']) : null,
            'price_max'     => isset($data['price_max']) && $data['price_max'] !== '' ? floatval($data['price_max']) : null,
            'rating'        => isset($data['rating']) ? intval($data['rating']) : null,
            'delivery_time' => isset($data['delivery_time']) ? array_map('sanitize_text_field', (array) $data['delivery_time']) : array(),
            'categories'    => isset($data['categories']) ? array_map('intval', (array) $data['categories']) : array(),
            'vendors'       => isset($data['vendors']) ? array_map('intval', (array) $data['vendors']) : array(),
            'in_stock'      => isset($data['in_stock']) && $data['in_stock'] === '1',
            'on_sale'       => isset($data['on_sale']) && $data['on_sale'] === '1',
            'free_shipping' => isset($data['free_shipping']) && $data['free_shipping'] === '1',
            'orderby'       => isset($data['orderby']) ? sanitize_text_field($data['orderby']) : 'relevance',
            'search'        => isset($data['search']) ? sanitize_text_field($data['search']) : '',
            'user_lat'      => isset($data['user_lat']) ? floatval($data['user_lat']) : null,
            'user_lng'      => isset($data['user_lng']) ? floatval($data['user_lng']) : null,
        );
    }

    /**
     * Query filtered products.
     */
    private function query_filtered_products($filters, $page, $per_page) {
        global $wpdb;
        
        $args = array(
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => $per_page,
            'paged'          => $page,
            'fields'         => 'ids',
        );
        
        $meta_query = array('relation' => 'AND');
        $tax_query = array('relation' => 'AND');
        
        // Llega Hoy filter
        if ($filters['llega_hoy']) {
            $meta_query[] = array(
                'key'     => '_tukitask_llega_hoy',
                'value'   => '1',
                'compare' => '=',
            );
        }
        
        // Price range
        if ($filters['price_min'] !== null || $filters['price_max'] !== null) {
            if ($filters['price_min'] !== null && $filters['price_max'] !== null) {
                $meta_query[] = array(
                    'key'     => '_price',
                    'value'   => array($filters['price_min'], $filters['price_max']),
                    'type'    => 'NUMERIC',
                    'compare' => 'BETWEEN',
                );
            } elseif ($filters['price_min'] !== null) {
                $meta_query[] = array(
                    'key'     => '_price',
                    'value'   => $filters['price_min'],
                    'type'    => 'NUMERIC',
                    'compare' => '>=',
                );
            } else {
                $meta_query[] = array(
                    'key'     => '_price',
                    'value'   => $filters['price_max'],
                    'type'    => 'NUMERIC',
                    'compare' => '<=',
                );
            }
        }
        
        // Rating filter
        if ($filters['rating']) {
            $meta_query[] = array(
                'key'     => '_wc_average_rating',
                'value'   => $filters['rating'],
                'type'    => 'NUMERIC',
                'compare' => '>=',
            );
        }
        
        // Stock filter
        if ($filters['in_stock']) {
            $meta_query[] = array(
                'key'     => '_stock_status',
                'value'   => 'instock',
                'compare' => '=',
            );
        }
        
        // On sale filter
        if ($filters['on_sale']) {
            $args['post__in'] = wc_get_product_ids_on_sale();
            if (empty($args['post__in'])) {
                $args['post__in'] = array(0);
            }
        }
        
        // Categories
        if (!empty($filters['categories'])) {
            $tax_query[] = array(
                'taxonomy' => 'product_cat',
                'field'    => 'term_id',
                'terms'    => $filters['categories'],
                'operator' => 'IN',
            );
        }
        
        // Vendors
        if (!empty($filters['vendors'])) {
            $args['author__in'] = $filters['vendors'];
        }
        
        // Search
        if (!empty($filters['search'])) {
            $args['s'] = $filters['search'];
        }
        
        // Orderby
        switch ($filters['orderby']) {
            case 'price-asc':
                $args['meta_key'] = '_price';
                $args['orderby'] = 'meta_value_num';
                $args['order'] = 'ASC';
                break;
            case 'price-desc':
                $args['meta_key'] = '_price';
                $args['orderby'] = 'meta_value_num';
                $args['order'] = 'DESC';
                break;
            case 'rating':
                $args['meta_key'] = '_wc_average_rating';
                $args['orderby'] = 'meta_value_num';
                $args['order'] = 'DESC';
                break;
            case 'date':
                $args['orderby'] = 'date';
                $args['order'] = 'DESC';
                break;
            case 'popularity':
                $args['meta_key'] = 'total_sales';
                $args['orderby'] = 'meta_value_num';
                $args['order'] = 'DESC';
                break;
            case 'distance':
                // Will sort after query
                break;
        }
        
        if (count($meta_query) > 1) {
            $args['meta_query'] = $meta_query;
        }
        if (count($tax_query) > 1) {
            $args['tax_query'] = $tax_query;
        }
        
        $query = new \WP_Query($args);
        $product_ids = $query->posts;
        
        // Build product data with distance
        $products = array();
        foreach ($product_ids as $product_id) {
            $product = wc_get_product($product_id);
            if (!$product) continue;
            
            $vendor_id = get_post_field('post_author', $product_id);
            $vendor_lat = get_user_meta($vendor_id, '_vendedor_store_lat', true);
            $vendor_lng = get_user_meta($vendor_id, '_vendedor_store_lng', true);
            
            $distance = null;
            if ($filters['user_lat'] && $filters['user_lng'] && $vendor_lat && $vendor_lng) {
                $distance = Distance::haversine(
                    $filters['user_lat'], 
                    $filters['user_lng'], 
                    floatval($vendor_lat), 
                    floatval($vendor_lng)
                );
                
                // Filter by distance if set
                if ($filters['distance'] && $distance > $filters['distance']) {
                    continue;
                }
            }
            
            $products[] = array(
                'id'           => $product_id,
                'product'      => $product,
                'distance'     => $distance,
                'vendor_id'    => $vendor_id,
                'has_llega_hoy' => (bool) get_post_meta($product_id, '_tukitask_llega_hoy', true),
            );
        }
        
        // Sort by distance if requested
        if ($filters['orderby'] === 'distance' && $filters['user_lat'] && $filters['user_lng']) {
            usort($products, function($a, $b) {
                return ($a['distance'] ?? 999) <=> ($b['distance'] ?? 999);
            });
        }
        
        $total = count($products);
        $total_pages = ceil($total / $per_page);
        
        // Paginate after distance filter
        $offset = ($page - 1) * $per_page;
        $products = array_slice($products, $offset, $per_page);
        
        return array(
            'items'       => $products,
            'total'       => $total,
            'total_pages' => $total_pages,
        );
    }

    /**
     * Render product card.
     */
    private function render_product_card($data) {
        $product = $data['product'];
        $distance = $data['distance'];
        $has_llega_hoy = $data['has_llega_hoy'];
        
        $image = wp_get_attachment_url($product->get_image_id()) ?: wc_placeholder_img_src();
        $rating = $product->get_average_rating();
        $review_count = $product->get_review_count();
        $vendor_name = get_the_author_meta('display_name', $data['vendor_id']);
        
        ob_start();
        ?>
        <div class="tukitask-product-card" data-product-id="<?php echo esc_attr($product->get_id()); ?>">
            <a href="<?php echo esc_url($product->get_permalink()); ?>" class="product-link">
                <div class="product-image-wrapper">
                    <img src="<?php echo esc_url($image); ?>" alt="<?php echo esc_attr($product->get_name()); ?>" loading="lazy">
                    
                    <?php if ($has_llega_hoy): ?>
                    <span class="product-badge llega-hoy">⚡ Llega Hoy</span>
                    <?php endif; ?>
                    
                    <?php if ($product->is_on_sale()): ?>
                    <span class="product-badge sale">
                        <?php 
                        $regular = floatval($product->get_regular_price());
                        $sale = floatval($product->get_sale_price());
                        if ($regular > 0) {
                            echo '-' . round((($regular - $sale) / $regular) * 100) . '%';
                        }
                        ?>
                    </span>
                    <?php endif; ?>
                    
                    <button type="button" class="product-wishlist" data-product-id="<?php echo esc_attr($product->get_id()); ?>">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>
                </div>
                
                <div class="product-info">
                    <span class="product-vendor"><?php echo esc_html($vendor_name); ?></span>
                    <h3 class="product-name"><?php echo esc_html($product->get_name()); ?></h3>
                    
                    <div class="product-meta">
                        <?php if ($rating > 0): ?>
                        <span class="product-rating">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            <?php echo number_format($rating, 1); ?>
                            <span class="review-count">(<?php echo $review_count; ?>)</span>
                        </span>
                        <?php endif; ?>
                        
                        <?php if ($distance !== null): ?>
                        <span class="product-distance">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            <?php echo number_format($distance, 1); ?> km
                        </span>
                        <?php endif; ?>
                    </div>
                    
                    <div class="product-price">
                        <?php echo $product->get_price_html(); ?>
                    </div>
                </div>
            </a>
            
            <div class="product-actions">
                <?php if ($product->is_in_stock()): ?>
                <button type="button" class="btn-add-to-cart" data-product-id="<?php echo esc_attr($product->get_id()); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                    <?php esc_html_e('Agregar', 'tukitask-local-drivers'); ?>
                </button>
                <?php else: ?>
                <span class="out-of-stock"><?php esc_html_e('Agotado', 'tukitask-local-drivers'); ?></span>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render pagination.
     */
    private function render_pagination($current, $total_pages, $total) {
        ob_start();
        ?>
        <div class="tukitask-pagination">
            <span class="pagination-info">
                <?php printf(__('Página %d de %d', 'tukitask-local-drivers'), $current, $total_pages); ?>
            </span>
            
            <div class="pagination-buttons">
                <?php if ($current > 1): ?>
                <button type="button" class="pagination-btn" data-page="1" title="<?php esc_attr_e('Primera', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="11 17 6 12 11 7"/>
                        <polyline points="18 17 13 12 18 7"/>
                    </svg>
                </button>
                <button type="button" class="pagination-btn" data-page="<?php echo $current - 1; ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
                <?php endif; ?>
                
                <?php
                $start = max(1, $current - 2);
                $end = min($total_pages, $current + 2);
                
                for ($i = $start; $i <= $end; $i++):
                ?>
                <button type="button" class="pagination-btn <?php echo $i === $current ? 'active' : ''; ?>" data-page="<?php echo $i; ?>">
                    <?php echo $i; ?>
                </button>
                <?php endfor; ?>
                
                <?php if ($current < $total_pages): ?>
                <button type="button" class="pagination-btn" data-page="<?php echo $current + 1; ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </button>
                <button type="button" class="pagination-btn" data-page="<?php echo $total_pages; ?>" title="<?php esc_attr_e('Última', 'tukitask-local-drivers'); ?>">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="13 17 18 12 13 7"/>
                        <polyline points="6 17 11 12 6 7"/>
                    </svg>
                </button>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * AJAX: Get filter counts.
     */
    public function ajax_get_filter_counts() {
        check_ajax_referer('tukitask_filters_nonce', 'nonce');
        
        $counts = array(
            'ratings' => $this->get_rating_counts(),
            'categories' => $this->get_category_counts(),
        );
        
        wp_send_json_success($counts);
    }

    /**
     * Get rating counts.
     */
    private function get_rating_counts() {
        global $wpdb;
        
        $counts = array();
        for ($i = 1; $i <= 5; $i++) {
            $counts[$i] = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->postmeta} 
                 WHERE meta_key = '_wc_average_rating' 
                 AND CAST(meta_value AS DECIMAL(10,2)) >= %d",
                $i
            ));
        }
        
        return $counts;
    }

    /**
     * Get category counts.
     */
    private function get_category_counts() {
        $categories = get_terms(array(
            'taxonomy'   => 'product_cat',
            'hide_empty' => true,
        ));
        
        $counts = array();
        foreach ($categories as $cat) {
            $counts[$cat->term_id] = $cat->count;
        }
        
        return $counts;
    }

    /**
     * Modify WooCommerce product query (for shop pages).
     */
    public function modify_product_query($query, $wc_query) {
        if (!is_admin() && $query->is_main_query()) {
            // Apply URL filters
            if (isset($_GET['tuki_llega_hoy']) && $_GET['tuki_llega_hoy'] === '1') {
                $query->set('meta_query', array_merge(
                    $query->get('meta_query') ?: array(),
                    array(
                        array(
                            'key'     => '_tukitask_llega_hoy',
                            'value'   => '1',
                            'compare' => '=',
                        ),
                    )
                ));
            }
        }
    }

    /**
     * Modify shortcode query.
     */
    public function modify_shortcode_query($query_args, $atts, $type) {
        // Allow shortcodes to use our filters
        if (isset($atts['tuki_filter']) && $atts['tuki_filter'] === 'yes') {
            if (isset($_GET['tuki_llega_hoy'])) {
                $query_args['meta_query'][] = array(
                    'key'     => '_tukitask_llega_hoy',
                    'value'   => '1',
                    'compare' => '=',
                );
            }
        }
        
        return $query_args;
    }
}

// Initialize
Advanced_Filters::instance();
