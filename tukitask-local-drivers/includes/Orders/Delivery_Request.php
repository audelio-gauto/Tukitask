<?php
/**
 * Delivery Request System - Envío de paquetes tipo Bolt sin WooCommerce.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

use Tukitask\LocalDrivers\Helpers\Broadcast_Store;
use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Helpers\Geo;

/**
 * Delivery_Request Class.
 *
 * Sistema de solicitud de envío de paquetes punto a punto
 * sin necesidad de compra en WooCommerce.
 */
class Delivery_Request {

    /**
     * Singleton instance.
     */
    private static $instance = null;

    /**
     * CPT Slug.
     */
    const POST_TYPE = 'tukitask_delivery';

    /**
     * Estados posibles del delivery.
     */
    const STATUS_PENDING = 'pending';
    const STATUS_SEARCHING = 'searching';
    const STATUS_ASSIGNED = 'assigned';
    const STATUS_PICKUP = 'pickup';
    const STATUS_IN_TRANSIT = 'in_transit';
    const STATUS_DELIVERED = 'delivered';
    const STATUS_CANCELLED = 'cancelled';

    /**
     * Get singleton instance.
     */
    public static function instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor.
     */
    private function __construct() {
        // Registrar CPT
        add_action( 'init', array( $this, 'register_post_type' ) );
        
        // Shortcodes
        add_shortcode( 'tukitask_solicitar_envio', array( $this, 'render_request_form' ) );
        add_shortcode( 'tukitask_mis_envios', array( $this, 'render_my_deliveries' ) );
        add_shortcode( 'tukitask_tracking_envio', array( $this, 'render_tracking' ) );
        
        // AJAX handlers
        add_action( 'wp_ajax_tukitask_create_delivery_request', array( $this, 'ajax_create_request' ) );
        add_action( 'wp_ajax_tukitask_calculate_delivery_price', array( $this, 'ajax_calculate_price' ) );
        add_action( 'wp_ajax_tukitask_cancel_delivery', array( $this, 'ajax_cancel_delivery' ) );
        add_action( 'wp_ajax_tukitask_get_delivery_status', array( $this, 'ajax_get_status' ) );
        add_action( 'wp_ajax_tukitask_get_nearby_drivers', array( $this, 'ajax_get_nearby_drivers' ) );
        
        // Driver AJAX
        add_action( 'wp_ajax_tukitask_driver_accept_delivery', array( $this, 'ajax_driver_accept' ) );
        add_action( 'wp_ajax_tukitask_driver_pickup_delivery', array( $this, 'ajax_driver_pickup' ) );
        add_action( 'wp_ajax_tukitask_driver_complete_delivery', array( $this, 'ajax_driver_complete' ) );
        add_action( 'wp_ajax_tukitask_get_pending_deliveries', array( $this, 'ajax_get_pending_deliveries' ) );
        add_action( 'wp_ajax_tukitask_driver_reject_delivery', array( $this, 'ajax_driver_reject' ) );
        add_action( 'wp_ajax_tukitask_get_active_delivery', array( $this, 'ajax_get_active_delivery' ) );
        
        // Client review
        add_action( 'wp_ajax_tukitask_rate_driver', array( $this, 'ajax_rate_driver' ) );

        // Cron for expanding delivery search
        add_action( 'tukitask_expand_delivery_search', array( $this, 'expand_delivery_search' ), 10, 2 );
        
        // Enqueue scripts
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
    }

    /**
     * Register Custom Post Type for deliveries.
     */
    public function register_post_type() {
        $labels = array(
            'name'               => __( 'Envíos de Paquetes', 'tukitask-local-drivers' ),
            'singular_name'      => __( 'Envío de Paquete', 'tukitask-local-drivers' ),
            'menu_name'          => __( 'Envíos Bolt', 'tukitask-local-drivers' ),
            'add_new'            => __( 'Nuevo Envío', 'tukitask-local-drivers' ),
            'add_new_item'       => __( 'Nuevo Envío de Paquete', 'tukitask-local-drivers' ),
            'edit_item'          => __( 'Editar Envío', 'tukitask-local-drivers' ),
            'view_item'          => __( 'Ver Envío', 'tukitask-local-drivers' ),
            'all_items'          => __( 'Todos los Envíos', 'tukitask-local-drivers' ),
            'search_items'       => __( 'Buscar Envíos', 'tukitask-local-drivers' ),
        );

        $args = array(
            'labels'             => $labels,
            'public'             => false,
            'show_ui'            => true,
            'show_in_menu'       => 'tukitask_local_drivers',
            'capability_type'    => 'post',
            'hierarchical'       => false,
            'supports'           => array( 'title', 'author' ),
            'rewrite'            => false,
        );

        register_post_type( self::POST_TYPE, $args );
    }

    /**
     * Enqueue scripts and styles.
     */
    public function enqueue_scripts() {
        if ( ! is_user_logged_in() ) {
            return;
        }

        wp_enqueue_style(
            'tukitask-delivery-request',
            plugins_url( 'assets/css/delivery-request.css', dirname( __DIR__, 2 ) . '/tukitask-local-drivers.php' ),
            array(),
            defined( 'TUKITASK_LD_VERSION' ) ? TUKITASK_LD_VERSION . '.16' : '1.0.16'
        );

        wp_enqueue_script(
            'tukitask-delivery-request',
            plugins_url( 'assets/js/delivery-request.js', dirname( __DIR__, 2 ) . '/tukitask-local-drivers.php' ),
            array( 'jquery' ),
            defined( 'TUKITASK_LD_VERSION' ) ? TUKITASK_LD_VERSION . '.16' : '1.0.16',
            true
        );

        // Leaflet para mapas
        wp_enqueue_style( 'leaflet', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' );
        wp_enqueue_script( 'leaflet', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', array(), '1.9.4', true );

        wp_localize_script( 'tukitask-delivery-request', 'tukitaskDelivery', array(
            'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
            'nonce'     => wp_create_nonce( 'tukitask_delivery_nonce' ),
            'currency'  => get_woocommerce_currency_symbol(),
            'strings'   => array(
                'calculating'     => __( 'Calculando precio...', 'tukitask-local-drivers' ),
                'searching'       => __( 'Buscando conductores cercanos...', 'tukitask-local-drivers' ),
                'error'           => __( 'Error al procesar la solicitud', 'tukitask-local-drivers' ),
                'confirm_cancel'  => __( '¿Estás seguro de cancelar este envío?', 'tukitask-local-drivers' ),
                'select_location' => __( 'Haz clic en el mapa para seleccionar ubicación', 'tukitask-local-drivers' ),
            ),
        ) );
    }

    /**
     * Render delivery request form shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_request_form( $atts = array() ) {
        if ( ! is_user_logged_in() ) {
            return '<div class="tuki-login-required">' . 
                   '<p>' . __( 'Debes iniciar sesión para solicitar un envío.', 'tukitask-local-drivers' ) . '</p>' .
                   '<a href="' . wp_login_url( get_permalink() ) . '" class="tuki-btn">' . __( 'Iniciar Sesión', 'tukitask-local-drivers' ) . '</a>' .
                   '</div>';
        }

        $user = wp_get_current_user();
        $currency = function_exists('get_woocommerce_currency_symbol') ? get_woocommerce_currency_symbol() : '₲';
        
        ob_start();
        ?>
        <div class="tuki-delivery-request-container tuki-bolt-ui" id="tuki-bolt-ui">

            <!-- FULL-SCREEN MAP BACKGROUND -->
            <div id="tuki-delivery-map" class="tuki-fullscreen-map"></div>

            <!-- Hamburger menu (Bolt style) -->
            <button type="button" class="tuki-app-menu-btn" id="tuki-menu-btn" aria-label="<?php esc_attr_e( 'Menú', 'tukitask-local-drivers' ); ?>">
                <i class="fas fa-bars"></i>
            </button>

            <!-- App drawer -->
            <div class="tuki-app-drawer" id="tuki-app-drawer">
                <div class="tuki-drawer-overlay" id="tuki-drawer-overlay"></div>
                <div class="tuki-drawer-panel">
                    <div class="tuki-drawer-header">
                        <p class="drawer-user-name"><?php echo esc_html( $user->display_name ); ?></p>
                        <span class="drawer-user-email"><?php echo esc_html( $user->user_email ); ?></span>
                    </div>
                    <nav class="tuki-drawer-nav">
                        <a href="<?php echo esc_url( home_url( '/' ) ); ?>"><i class="fas fa-home"></i> <?php esc_html_e( 'Inicio', 'tukitask-local-drivers' ); ?></a>
                        <a href="#" class="active"><i class="fas fa-paper-plane"></i> <?php esc_html_e( 'Solicitar Envío', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/mis-envios/' ) ); ?>"><i class="fas fa-box"></i> <?php esc_html_e( 'Mis Envíos', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/tracking/' ) ); ?>"><i class="fas fa-map-marker-alt"></i> <?php esc_html_e( 'Rastrear Envío', 'tukitask-local-drivers' ); ?></a>
                        <div class="tuki-drawer-divider"></div>
                        <a href="<?php echo esc_url( wc_get_account_endpoint_url( 'dashboard' ) ); ?>"><i class="fas fa-user"></i> <?php esc_html_e( 'Mi Cuenta', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( wp_logout_url( home_url() ) ); ?>"><i class="fas fa-sign-out-alt"></i> <?php esc_html_e( 'Cerrar Sesión', 'tukitask-local-drivers' ); ?></a>
                    </nav>
                </div>
            </div>

            <!-- Map top bar: route info -->
            <div class="tuki-map-topbar">
                <div id="tuki-route-info" class="tuki-route-badge" style="display:none;">
                    <span><i class="fas fa-road"></i> <strong id="route-distance">--</strong> km</span>
                    <span class="badge-sep">&bull;</span>
                    <span><i class="fas fa-clock"></i> <strong id="route-time">--</strong> min</span>
                </div>
            </div>

            <!-- BOTTOM SHEET -->
            <div id="tuki-bottom-sheet" class="tuki-bottom-sheet tuki-sheet-small">
                <div class="tuki-sheet-handle-area" id="tuki-sheet-handle">
                    <div class="tuki-sheet-handle"></div>
                </div>

                <form id="tuki-delivery-request-form" class="tuki-delivery-form">
                    <?php wp_nonce_field( 'tukitask_delivery_nonce', 'delivery_nonce' ); ?>
                    <input type="hidden" id="pickup_lat" name="pickup_lat">
                    <input type="hidden" id="pickup_lng" name="pickup_lng">
                    <input type="hidden" id="delivery_lat" name="delivery_lat">
                    <input type="hidden" id="delivery_lng" name="delivery_lng">

                    <!-- ====== STATE 1: Addresses (always visible) ====== -->
                    <div class="tuki-sheet-section tuki-sheet-addresses" id="tuki-state-1">
                        <div class="tuki-addr-row">
                            <div class="tuki-addr-dots">
                                <span class="dot dot-green"></span>
                                <span class="dot-line"></span>
                                <span class="dot dot-red"></span>
                            </div>
                            <div class="tuki-addr-fields">
                                <div class="tuki-addr-input-wrap">
                                    <input type="text" id="pickup_address" name="pickup_address" required autocomplete="off"
                                           placeholder="<?php esc_attr_e( 'Punto de recogida', 'tukitask-local-drivers' ); ?>">
                                    <button type="button" class="tuki-use-location" data-target="pickup" title="<?php esc_attr_e( 'Mi ubicación', 'tukitask-local-drivers' ); ?>">
                                        <i class="fas fa-crosshairs"></i>
                                    </button>
                                </div>
                                <div class="tuki-addr-input-wrap">
                                    <input type="text" id="delivery_address" name="delivery_address" required autocomplete="off"
                                           placeholder="<?php esc_attr_e( '¿A dónde va el paquete?', 'tukitask-local-drivers' ); ?>">
                                    <button type="button" class="tuki-use-location" data-target="delivery" title="<?php esc_attr_e( 'Mi ubicación', 'tukitask-local-drivers' ); ?>">
                                        <i class="fas fa-crosshairs"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ====== STATE 2: Vehicle + Package (visible at medium+) ====== -->
                    <div class="tuki-sheet-section tuki-sheet-selection" id="tuki-state-2">
                        <h3 class="tuki-sheet-title"><?php esc_html_e( 'Tipo de vehículo', 'tukitask-local-drivers' ); ?></h3>
                        <div class="tuki-bolt-cards tuki-vehicle-cards">
                            <label class="tuki-bolt-card selected" data-value="motorcycle">
                                <input type="radio" name="vehicle_type" value="motorcycle" checked>
                                <div class="tuki-bolt-card-icon">🏍️</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Moto', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Paquetes chicos', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="car">
                                <input type="radio" name="vehicle_type" value="car">
                                <div class="tuki-bolt-card-icon">🚙</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Auto', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Más capacidad', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="motocarro">
                                <input type="radio" name="vehicle_type" value="motocarro">
                                <div class="tuki-bolt-card-icon">🛵</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Moto carro', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Envíos rápidos', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="truck_3000">
                                <input type="radio" name="vehicle_type" value="truck_3000">
                                <div class="tuki-bolt-card-icon">🚛</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Camión 3T', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Carga mediana', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="truck_5000">
                                <input type="radio" name="vehicle_type" value="truck_5000">
                                <div class="tuki-bolt-card-icon">🚚</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Camión 5T', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Carga pesada', 'tukitask-local-drivers' ); ?></small>
                            </label>
                        </div>

                        <h3 class="tuki-sheet-title" style="margin-top:14px;"><?php esc_html_e( 'Tipo de paquete', 'tukitask-local-drivers' ); ?></h3>
                        <div class="tuki-bolt-cards tuki-bolt-cards-2col tuki-package-group" data-vehicles="motorcycle,car">
                            <label class="tuki-bolt-card selected" data-value="small">
                                <input type="radio" name="package_type" value="small" checked>
                                <div class="tuki-bolt-card-icon">📦</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Pequeño', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Hasta 5 kg', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="document">
                                <input type="radio" name="package_type" value="document">
                                <div class="tuki-bolt-card-icon">📄</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Documento', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Sobre / carta', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="medium">
                                <input type="radio" name="package_type" value="medium">
                                <div class="tuki-bolt-card-icon">📦</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Mediano', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( '5 - 15 kg', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="large">
                                <input type="radio" name="package_type" value="large">
                                <div class="tuki-bolt-card-icon">📦</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Grande', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( '15 - 30 kg', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="fragile">
                                <input type="radio" name="package_type" value="fragile">
                                <div class="tuki-bolt-card-icon">⚠️</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Frágil', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Cuidado especial', 'tukitask-local-drivers' ); ?></small>
                            </label>
                        </div>
                        <div class="tuki-bolt-cards tuki-bolt-cards-2col tuki-package-group" data-vehicles="motocarro,truck_3000,truck_5000" style="display:none;">
                            <label class="tuki-bolt-card" data-value="flete">
                                <input type="radio" name="package_type" value="flete">
                                <div class="tuki-bolt-card-icon">🏗️</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Flete', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Transporte de carga', 'tukitask-local-drivers' ); ?></small>
                            </label>
                            <label class="tuki-bolt-card" data-value="mudanza">
                                <input type="radio" name="package_type" value="mudanza">
                                <div class="tuki-bolt-card-icon">🏠</div>
                                <span class="tuki-bolt-card-label"><?php esc_html_e( 'Mudanza', 'tukitask-local-drivers' ); ?></span>
                                <small><?php esc_html_e( 'Hogar / oficina', 'tukitask-local-drivers' ); ?></small>
                            </label>
                        </div>
                    </div>

                    <!-- ====== STATE 3: Details + Price + Submit (visible at full) ====== -->
                    <div class="tuki-sheet-section tuki-sheet-details" id="tuki-state-3">
                        <h3 class="tuki-sheet-title"><?php esc_html_e( 'Detalles del envío', 'tukitask-local-drivers' ); ?></h3>

                        <div class="tuki-detail-group">
                            <div class="tuki-detail-row">
                                <div class="tuki-detail-field">
                                    <label><?php esc_html_e( 'Contacto recogida', 'tukitask-local-drivers' ); ?></label>
                                    <input type="text" id="pickup_contact" name="pickup_contact" required
                                           value="<?php echo esc_attr( $user->display_name ); ?>"
                                           placeholder="<?php esc_attr_e( 'Tu nombre', 'tukitask-local-drivers' ); ?>">
                                </div>
                                <div class="tuki-detail-field">
                                    <label><?php esc_html_e( 'Teléfono', 'tukitask-local-drivers' ); ?></label>
                                    <input type="tel" id="pickup_phone" name="pickup_phone" required
                                           value="<?php echo esc_attr( get_user_meta( $user->ID, 'billing_phone', true ) ); ?>"
                                           placeholder="<?php esc_attr_e( '0981...', 'tukitask-local-drivers' ); ?>">
                                </div>
                            </div>
                            <div class="tuki-detail-field">
                                <label><?php esc_html_e( 'Instrucciones recogida', 'tukitask-local-drivers' ); ?></label>
                                <input type="text" id="pickup_instructions" name="pickup_instructions"
                                       placeholder="<?php esc_attr_e( 'Ej: Tocar timbre del depto 5B', 'tukitask-local-drivers' ); ?>">
                            </div>
                        </div>

                        <div class="tuki-detail-group">
                            <div class="tuki-detail-row">
                                <div class="tuki-detail-field">
                                    <label><?php esc_html_e( 'Destinatario', 'tukitask-local-drivers' ); ?></label>
                                    <input type="text" id="delivery_contact" name="delivery_contact" required
                                           placeholder="<?php esc_attr_e( 'Nombre completo', 'tukitask-local-drivers' ); ?>">
                                </div>
                                <div class="tuki-detail-field">
                                    <label><?php esc_html_e( 'Tel. destinatario', 'tukitask-local-drivers' ); ?></label>
                                    <input type="tel" id="delivery_phone" name="delivery_phone" required
                                           placeholder="<?php esc_attr_e( '0981...', 'tukitask-local-drivers' ); ?>">
                                </div>
                            </div>
                            <div class="tuki-detail-field">
                                <label><?php esc_html_e( 'Instrucciones entrega', 'tukitask-local-drivers' ); ?></label>
                                <input type="text" id="delivery_instructions" name="delivery_instructions"
                                       placeholder="<?php esc_attr_e( 'Ej: Dejar con el portero', 'tukitask-local-drivers' ); ?>">
                            </div>
                        </div>

                        <div class="tuki-detail-group">
                            <div class="tuki-detail-field">
                                <label><?php esc_html_e( 'Método de pago', 'tukitask-local-drivers' ); ?> *</label>
                                <div class="tuki-payment-method-cards">
                                    <label class="tuki-payment-card selected" data-value="cash">
                                        <input type="radio" name="payment_method" value="cash" checked>
                                        <div class="tuki-payment-card-icon">💵</div>
                                        <span class="tuki-payment-card-label"><?php esc_html_e( 'En efectivo', 'tukitask-local-drivers' ); ?></span>
                                    </label>
                                    <label class="tuki-payment-card" data-value="transfer">
                                        <input type="radio" name="payment_method" value="transfer">
                                        <div class="tuki-payment-card-icon">🏦</div>
                                        <span class="tuki-payment-card-label"><?php esc_html_e( 'Transferencia', 'tukitask-local-drivers' ); ?></span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Price breakdown -->
                        <div class="tuki-price-block" id="tuki-price-block">
                            <span id="price-base" style="display:none;">--</span>
                            <span id="price-distance-km" style="display:none;">0</span>
                            <span id="price-distance" style="display:none;">--</span>
                            <div class="tuki-price-total">
                                <span><?php esc_html_e( 'Total estimado', 'tukitask-local-drivers' ); ?></span>
                                <span class="tuki-total-amount" id="price-total">--</span>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="tuki-sheet-actions">
                            <button type="button" id="tuki-calculate-btn" class="tuki-btn-calc">
                                <i class="fas fa-calculator"></i> <?php esc_html_e( 'Calcular', 'tukitask-local-drivers' ); ?>
                            </button>
                            <button type="submit" id="tuki-submit-btn" class="tuki-btn-submit" disabled>
                                <?php esc_html_e( 'Solicitar Envío', 'tukitask-local-drivers' ); ?> <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>

                </form>
            </div><!-- /bottom-sheet -->

            <!-- Modal de confirmación -->
            <div id="tuki-delivery-modal" class="tuki-modal" style="display:none;">
                <div class="tuki-modal-content">
                    <div class="tuki-modal-header">
                        <h3><i class="fas fa-check-circle"></i> <?php esc_html_e( '¡Solicitud Enviada!', 'tukitask-local-drivers' ); ?></h3>
                    </div>
                    <div class="tuki-modal-body">
                        <p><?php esc_html_e( 'Estamos buscando un conductor cerca de ti...', 'tukitask-local-drivers' ); ?></p>
                        <div class="tuki-searching-animation">
                            <div class="pulse-ring"></div>
                            <i class="fas fa-motorcycle"></i>
                        </div>
                        <p id="tuki-modal-message"></p>
                        <p class="tracking-code"><?php esc_html_e( 'Código de seguimiento:', 'tukitask-local-drivers' ); ?> <strong id="tuki-tracking-code">--</strong></p>
                    </div>
                    <div class="tuki-modal-footer">
                        <a href="#" id="tuki-view-delivery" class="tuki-btn tuki-btn-primary"><?php esc_html_e( 'Ver Mi Envío', 'tukitask-local-drivers' ); ?></a>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render my deliveries shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_my_deliveries( $atts = array() ) {
        if ( ! is_user_logged_in() ) {
            return '<p>' . __( 'Debes iniciar sesión para ver tus envíos.', 'tukitask-local-drivers' ) . '</p>';
        }

        $user_id = get_current_user_id();
        
        $deliveries = get_posts( array(
            'post_type'      => self::POST_TYPE,
            'author'         => $user_id,
            'posts_per_page' => 20,
            'orderby'        => 'date',
            'order'          => 'DESC',
        ) );

        ob_start();
        ?>
        <div class="tuki-my-deliveries">
            <?php if ( empty( $deliveries ) ) : ?>
                <div class="tuki-empty-state">
                    <i class="fas fa-box-open"></i>
                    <p><?php esc_html_e( 'No tienes envíos aún.', 'tukitask-local-drivers' ); ?></p>
                    <a href="<?php echo esc_url( home_url( '/solicitar-envio/' ) ); ?>" class="tuki-btn tuki-btn-primary">
                        <?php esc_html_e( 'Solicitar Envío', 'tukitask-local-drivers' ); ?>
                    </a>
                </div>
            <?php else : ?>
                <div class="tuki-deliveries-list">
                    <?php foreach ( $deliveries as $delivery ) : 
                        $status = get_post_meta( $delivery->ID, '_delivery_status', true );
                        $tracking_code = get_post_meta( $delivery->ID, '_tracking_code', true );
                        $pickup_address = get_post_meta( $delivery->ID, '_pickup_address', true );
                        $delivery_address = get_post_meta( $delivery->ID, '_delivery_address', true );
                        $price = get_post_meta( $delivery->ID, '_delivery_price', true );
                        $driver_id = get_post_meta( $delivery->ID, '_assigned_driver_id', true );
                    ?>
                        <div class="tuki-delivery-card" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>">
                            <div class="delivery-header">
                                <span class="tracking-code">#<?php echo esc_html( $tracking_code ); ?></span>
                                <span class="delivery-status status-<?php echo esc_attr( $status ); ?>">
                                    <?php echo esc_html( $this->get_status_label( $status ) ); ?>
                                </span>
                            </div>
                            <div class="delivery-route">
                                <div class="route-point pickup">
                                    <i class="fas fa-circle"></i>
                                    <span><?php echo esc_html( $pickup_address ); ?></span>
                                </div>
                                <div class="route-line"></div>
                                <div class="route-point delivery">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <span><?php echo esc_html( $delivery_address ); ?></span>
                                </div>
                            </div>
                            <div class="delivery-info">
                                <span class="delivery-date">
                                    <i class="fas fa-calendar"></i>
                                    <?php echo esc_html( get_the_date( 'd/m/Y H:i', $delivery ) ); ?>
                                </span>
                                <span class="delivery-price">
                                    <?php echo wc_price( $price ); ?>
                                </span>
                            </div>
                            <?php if ( $driver_id ) : 
                                $driver_name = get_the_title( $driver_id );
                                $driver_phone = get_post_meta( $driver_id, '_driver_phone', true );
                                $d_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
                                $d_avatar_id = $d_user_id ? get_user_meta( $d_user_id, '_tukitask_driver_avatar_id', true ) : 0;
                                $d_avatar = $d_avatar_id ? wp_get_attachment_image_url( $d_avatar_id, 'thumbnail' ) : ( $d_user_id ? get_avatar_url( $d_user_id, array( 'size' => 48 ) ) : '' );
                            ?>
                                <div class="delivery-driver" style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                                    <?php if ( $d_avatar ) : ?>
                                        <img src="<?php echo esc_url( $d_avatar ); ?>" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
                                    <?php else : ?>
                                        <i class="fas fa-user-circle" style="font-size:32px;color:#9ca3af;"></i>
                                    <?php endif; ?>
                                    <div style="display:flex;flex-direction:column;">
                                        <span><?php echo esc_html( $driver_name ); ?></span>
                                        <?php
                                        $d_rating = class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Review_Manager' ) ? \Tukitask\LocalDrivers\Helpers\Review_Manager::get_average_rating( $driver_id, 'driver' ) : array( 'rating' => 0, 'count' => 0 );
                                        if ( $d_rating['count'] > 0 ) : ?>
                                            <span style="font-size:0.8rem;color:#f59e0b;">⭐ <?php echo esc_html( $d_rating['rating'] ); ?> <small style="color:#9ca3af;">(<?php echo esc_html( $d_rating['count'] ); ?>)</small></span>
                                        <?php endif; ?>
                                    </div>
                                    <?php if ( $driver_phone && in_array( $status, array( self::STATUS_ASSIGNED, self::STATUS_PICKUP, self::STATUS_IN_TRANSIT ) ) ) : ?>
                                        <a href="tel:<?php echo esc_attr( $driver_phone ); ?>" class="driver-phone" style="margin-left:auto;">
                                            <i class="fas fa-phone"></i>
                                        </a>
                                    <?php endif; ?>
                                </div>
                                <?php if ( $status === self::STATUS_DELIVERED && ! get_post_meta( $delivery->ID, '_driver_rated', true ) ) : ?>
                                    <button type="button" class="tuki-btn tuki-btn-small tuki-open-rating" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>" style="margin-top:4px;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:#fff;border:none;cursor:pointer;">
                                        <i class="fas fa-star"></i> <?php esc_html_e( 'Calificar conductor', 'tukitask-local-drivers' ); ?>
                                    </button>
                                    <div class="tuki-inline-rating" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>" style="display:none;margin-top:10px;padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                                        <p style="margin:0 0 8px;font-size:0.85rem;color:#6b7280;"><?php esc_html_e( '¿Cómo fue tu experiencia?', 'tukitask-local-drivers' ); ?></p>
                                        <div class="tuki-inline-stars" style="display:flex;gap:4px;margin-bottom:8px;">
                                            <?php for ( $i = 1; $i <= 5; $i++ ) : ?>
                                                <span class="tuki-inline-star" data-value="<?php echo $i; ?>" style="font-size:26px;cursor:pointer;color:#d1d5db;transition:color 0.15s;">&#9733;</span>
                                            <?php endfor; ?>
                                        </div>
                                        <textarea class="tuki-inline-comment" placeholder="<?php esc_attr_e( 'Comentario (opcional)', 'tukitask-local-drivers' ); ?>" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;resize:none;height:50px;box-sizing:border-box;"></textarea>
                                        <button type="button" class="tuki-btn tuki-btn-small tuki-send-rating" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>" style="margin-top:8px;width:100%;padding:10px;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                                            <?php esc_html_e( 'Enviar Calificación', 'tukitask-local-drivers' ); ?>
                                        </button>
                                    </div>
                                <?php elseif ( $status === self::STATUS_DELIVERED && get_post_meta( $delivery->ID, '_driver_rated', true ) ) : ?>
                                    <span style="font-size:0.8rem;color:#16a34a;margin-top:4px;display:inline-block;">✅ <?php esc_html_e( 'Calificado', 'tukitask-local-drivers' ); ?></span>
                                <?php endif; ?>
                            <?php endif; ?>
                            <div class="delivery-actions">
                                <a href="<?php echo esc_url( add_query_arg( 'tracking', $tracking_code, home_url( '/tracking-envio/' ) ) ); ?>" class="tuki-btn tuki-btn-small">
                                    <i class="fas fa-map-marked-alt"></i> <?php esc_html_e( 'Seguimiento', 'tukitask-local-drivers' ); ?>
                                </a>
                                <?php if ( in_array( $status, array( self::STATUS_PENDING, self::STATUS_SEARCHING ) ) ) : ?>
                                    <button type="button" class="tuki-btn tuki-btn-small tuki-btn-danger tuki-cancel-delivery" 
                                            data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>">
                                        <i class="fas fa-times"></i> <?php esc_html_e( 'Cancelar', 'tukitask-local-drivers' ); ?>
                                    </button>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render tracking shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_tracking( $atts = array() ) {
        $tracking_code = isset( $_GET['tracking'] ) ? sanitize_text_field( $_GET['tracking'] ) : '';
        
        if ( ! $tracking_code ) {
            return $this->render_tracking_search();
        }

        // Buscar el delivery por tracking code
        $deliveries = get_posts( array(
            'post_type'      => self::POST_TYPE,
            'posts_per_page' => 1,
            'meta_query'     => array(
                array(
                    'key'   => '_tracking_code',
                    'value' => $tracking_code,
                ),
            ),
        ) );

        if ( empty( $deliveries ) ) {
            return '<div class="tuki-tracking-error">' .
                   '<i class="fas fa-exclamation-triangle"></i>' .
                   '<p>' . __( 'No se encontró ningún envío con ese código.', 'tukitask-local-drivers' ) . '</p>' .
                   '</div>' . $this->render_tracking_search();
        }

        $delivery = $deliveries[0];
        return $this->render_tracking_details( $delivery );
    }

    /**
     * Render tracking search form — fullscreen map + bottom sheet style.
     *
     * @return string
     */
    private function render_tracking_search() {
        $user = wp_get_current_user();
        ob_start();
        ?>
        <div class="tuki-tracking-fullscreen tuki-bolt-ui" id="tuki-tracking-ui">

            <!-- FULL-SCREEN MAP BACKGROUND -->
            <div id="tuki-tracking-map-bg" class="tuki-fullscreen-map"></div>

            <!-- Hamburger menu -->
            <button type="button" class="tuki-app-menu-btn" id="tuki-tracking-menu-btn" aria-label="<?php esc_attr_e( 'Menú', 'tukitask-local-drivers' ); ?>">
                <i class="fas fa-bars"></i>
            </button>

            <!-- App drawer -->
            <div class="tuki-app-drawer" id="tuki-tracking-drawer">
                <div class="tuki-drawer-overlay" id="tuki-tracking-drawer-overlay"></div>
                <div class="tuki-drawer-panel">
                    <div class="tuki-drawer-header">
                        <p class="drawer-user-name"><?php echo esc_html( $user->display_name ); ?></p>
                        <span class="drawer-user-email"><?php echo esc_html( $user->user_email ); ?></span>
                    </div>
                    <nav class="tuki-drawer-nav">
                        <a href="<?php echo esc_url( home_url( '/' ) ); ?>"><i class="fas fa-home"></i> <?php esc_html_e( 'Inicio', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/solicitar-envio/' ) ); ?>"><i class="fas fa-paper-plane"></i> <?php esc_html_e( 'Solicitar Envío', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/mis-envios/' ) ); ?>"><i class="fas fa-box"></i> <?php esc_html_e( 'Mis Envíos', 'tukitask-local-drivers' ); ?></a>
                        <a href="#" class="active"><i class="fas fa-map-marker-alt"></i> <?php esc_html_e( 'Rastrear Envío', 'tukitask-local-drivers' ); ?></a>
                        <div class="tuki-drawer-divider"></div>
                        <a href="<?php echo esc_url( wc_get_account_endpoint_url( 'dashboard' ) ); ?>"><i class="fas fa-user"></i> <?php esc_html_e( 'Mi Cuenta', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( wp_logout_url( home_url() ) ); ?>"><i class="fas fa-sign-out-alt"></i> <?php esc_html_e( 'Cerrar Sesión', 'tukitask-local-drivers' ); ?></a>
                    </nav>
                </div>
            </div>

            <!-- BOTTOM SHEET -->
            <div id="tuki-tracking-sheet" class="tuki-bottom-sheet tuki-sheet-medium">
                <div class="tuki-sheet-handle-area" id="tuki-tracking-sheet-handle">
                    <div class="tuki-sheet-handle"></div>
                </div>
                <div class="tuki-tracking-sheet-content">
                    <div class="tuki-tracking-search-inner">
                        <h2><i class="fas fa-search"></i> <?php esc_html_e( 'Rastrear Envío', 'tukitask-local-drivers' ); ?></h2>
                        <form method="get" class="tuki-tracking-form">
                            <div class="tuki-input-group">
                                <input type="text" name="tracking" placeholder="<?php esc_attr_e( 'Ingresa tu código de seguimiento', 'tukitask-local-drivers' ); ?>" required>
                                <button type="submit" class="tuki-btn tuki-btn-primary">
                                    <i class="fas fa-search"></i>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render tracking details — fullscreen map + bottom sheet with timeline.
     *
     * @param \WP_Post $delivery Delivery post object.
     * @return string
     */
    private function render_tracking_details( $delivery ) {
        $status = get_post_meta( $delivery->ID, '_delivery_status', true );
        $tracking_code = get_post_meta( $delivery->ID, '_tracking_code', true );
        $pickup_address = get_post_meta( $delivery->ID, '_pickup_address', true );
        $delivery_address = get_post_meta( $delivery->ID, '_delivery_address', true );
        $pickup_lat = get_post_meta( $delivery->ID, '_pickup_lat', true );
        $pickup_lng = get_post_meta( $delivery->ID, '_pickup_lng', true );
        $delivery_lat = get_post_meta( $delivery->ID, '_delivery_lat', true );
        $delivery_lng = get_post_meta( $delivery->ID, '_delivery_lng', true );
        $driver_id = get_post_meta( $delivery->ID, '_assigned_driver_id', true );
        $history = get_post_meta( $delivery->ID, '_status_history', true ) ?: array();
        $price = get_post_meta( $delivery->ID, '_delivery_price', true );
        $user = wp_get_current_user();

        ob_start();
        ?>
        <div class="tuki-tracking-fullscreen tuki-bolt-ui" id="tuki-tracking-ui">

            <!-- FULL-SCREEN MAP BACKGROUND -->
            <div id="tuki-tracking-map" class="tuki-fullscreen-map"
                 data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>"
                 data-pickup-lat="<?php echo esc_attr( $pickup_lat ); ?>"
                 data-pickup-lng="<?php echo esc_attr( $pickup_lng ); ?>"
                 data-delivery-lat="<?php echo esc_attr( $delivery_lat ); ?>"
                 data-delivery-lng="<?php echo esc_attr( $delivery_lng ); ?>"
                 data-driver-id="<?php echo esc_attr( $driver_id ); ?>"
                 data-status="<?php echo esc_attr( $status ); ?>">
            </div>

            <!-- Hamburger menu -->
            <button type="button" class="tuki-app-menu-btn" id="tuki-tracking-menu-btn" aria-label="<?php esc_attr_e( 'Menú', 'tukitask-local-drivers' ); ?>">
                <i class="fas fa-bars"></i>
            </button>

            <!-- App drawer -->
            <div class="tuki-app-drawer" id="tuki-tracking-drawer">
                <div class="tuki-drawer-overlay" id="tuki-tracking-drawer-overlay"></div>
                <div class="tuki-drawer-panel">
                    <div class="tuki-drawer-header">
                        <p class="drawer-user-name"><?php echo esc_html( $user->display_name ); ?></p>
                        <span class="drawer-user-email"><?php echo esc_html( $user->user_email ); ?></span>
                    </div>
                    <nav class="tuki-drawer-nav">
                        <a href="<?php echo esc_url( home_url( '/' ) ); ?>"><i class="fas fa-home"></i> <?php esc_html_e( 'Inicio', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/solicitar-envio/' ) ); ?>"><i class="fas fa-paper-plane"></i> <?php esc_html_e( 'Solicitar Envío', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( home_url( '/mis-envios/' ) ); ?>"><i class="fas fa-box"></i> <?php esc_html_e( 'Mis Envíos', 'tukitask-local-drivers' ); ?></a>
                        <a href="#" class="active"><i class="fas fa-map-marker-alt"></i> <?php esc_html_e( 'Rastrear Envío', 'tukitask-local-drivers' ); ?></a>
                        <div class="tuki-drawer-divider"></div>
                        <a href="<?php echo esc_url( wc_get_account_endpoint_url( 'dashboard' ) ); ?>"><i class="fas fa-user"></i> <?php esc_html_e( 'Mi Cuenta', 'tukitask-local-drivers' ); ?></a>
                        <a href="<?php echo esc_url( wp_logout_url( home_url() ) ); ?>"><i class="fas fa-sign-out-alt"></i> <?php esc_html_e( 'Cerrar Sesión', 'tukitask-local-drivers' ); ?></a>
                    </nav>
                </div>
            </div>

            <!-- BOTTOM SHEET -->
            <div id="tuki-tracking-sheet" class="tuki-bottom-sheet tuki-sheet-small">
                <div class="tuki-sheet-handle-area" id="tuki-tracking-sheet-handle">
                    <div class="tuki-sheet-handle"></div>
                </div>
                <div class="tuki-tracking-sheet-content" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>">

                    <!-- Status badge + tracking code -->
                    <div class="tuki-tracking-top-row">
                        <div class="tracking-status-badge status-<?php echo esc_attr( $status ); ?>">
                            <i class="<?php echo esc_attr( $this->get_status_icon( $status ) ); ?>"></i>
                            <?php echo esc_html( $this->get_status_label( $status ) ); ?>
                        </div>
                        <span class="tracking-code-pill">#<?php echo esc_html( $tracking_code ); ?></span>
                    </div>

                    <!-- Addresses summary -->
                    <div class="tuki-tracking-addresses">
                        <div class="tuki-tracking-addr-row">
                            <span class="dot dot-green"></span>
                            <span class="addr-text"><?php echo esc_html( $pickup_address ); ?></span>
                        </div>
                        <div class="tuki-tracking-addr-row">
                            <span class="dot dot-red"></span>
                            <span class="addr-text"><?php echo esc_html( $delivery_address ); ?></span>
                        </div>
                    </div>

                    <!-- Timeline -->
                    <div class="tracking-timeline">
                        <?php
                        $statuses = array(
                            self::STATUS_PENDING    => __( 'Solicitud creada', 'tukitask-local-drivers' ),
                            self::STATUS_SEARCHING  => __( 'Buscando conductor', 'tukitask-local-drivers' ),
                            self::STATUS_ASSIGNED   => __( 'Conductor asignado', 'tukitask-local-drivers' ),
                            self::STATUS_PICKUP     => __( 'En recogida', 'tukitask-local-drivers' ),
                            self::STATUS_IN_TRANSIT => __( 'En camino', 'tukitask-local-drivers' ),
                            self::STATUS_DELIVERED  => __( 'Entregado', 'tukitask-local-drivers' ),
                        );

                        $status_keys = array_keys( $statuses );
                        $current_index = array_search( $status, $status_keys );
                        $is_final = ( $status === self::STATUS_DELIVERED );
                        $index = 0;

                        foreach ( $statuses as $key => $label ) :
                            $is_completed = $is_final ? ( $index <= $current_index ) : ( $index < $current_index );
                            $is_current = ! $is_final && ( $index === $current_index );
                            $class = $is_completed ? 'completed' : ( $is_current ? 'current' : '' );
                        ?>
                            <div class="timeline-item <?php echo esc_attr( $class ); ?>">
                                <div class="timeline-marker"></div>
                                <div class="timeline-content">
                                    <span class="timeline-label"><?php echo esc_html( $label ); ?></span>
                                    <?php
                                    foreach ( $history as $entry ) {
                                        if ( $entry['status'] === $key ) {
                                            echo '<span class="timeline-time">' . esc_html( date_i18n( 'd/m H:i', $entry['timestamp'] ) ) . '</span>';
                                            break;
                                        }
                                    }
                                    ?>
                                </div>
                            </div>
                        <?php 
                            $index++;
                        endforeach; 
                        ?>
                    </div>

                    <!-- Driver info -->
                    <?php if ( $driver_id && in_array( $status, array( self::STATUS_ASSIGNED, self::STATUS_PICKUP, self::STATUS_IN_TRANSIT, self::STATUS_DELIVERED ) ) ) : 
                        $driver_name = get_the_title( $driver_id );
                        $driver_phone = get_post_meta( $driver_id, '_driver_phone', true );
                        $driver_vehicle = get_post_meta( $driver_id, '_driver_vehicle', true );
                        $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
                        $avatar_id = $driver_user_id ? get_user_meta( $driver_user_id, '_tukitask_driver_avatar_id', true ) : 0;
                        $driver_avatar = $avatar_id ? wp_get_attachment_image_url( $avatar_id, 'thumbnail' ) : ( $driver_user_id ? get_avatar_url( $driver_user_id, array( 'size' => 80 ) ) : '' );
                    ?>
                        <div class="tracking-driver-info">
                            <div class="driver-card">
                                <div class="driver-avatar" style="width:50px;height:50px;border-radius:50%;overflow:hidden;flex-shrink:0;">
                                    <?php if ( $driver_avatar ) : ?>
                                        <img src="<?php echo esc_url( $driver_avatar ); ?>" alt="" style="width:100%;height:100%;object-fit:cover;">
                                    <?php else : ?>
                                        <i class="fas fa-user-circle" style="font-size:50px;color:#9ca3af;"></i>
                                    <?php endif; ?>
                                </div>
                                <div class="driver-details">
                                    <strong><?php echo esc_html( $driver_name ); ?></strong>
                                    <?php if ( $driver_vehicle ) : ?>
                                        <span class="driver-vehicle"><i class="fas fa-motorcycle"></i> <?php echo esc_html( $driver_vehicle ); ?></span>
                                    <?php endif; ?>
                                </div>
                                <div class="driver-actions">
                                    <?php if ( $driver_phone ) : ?>
                                        <a href="tel:<?php echo esc_attr( $driver_phone ); ?>" class="tuki-btn-call">
                                            <i class="fas fa-phone"></i>
                                        </a>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>

                    <!-- Price -->
                    <?php if ( $price ) : ?>
                        <div class="tuki-tracking-price">
                            <span class="price-label"><?php esc_html_e( 'Precio del envío', 'tukitask-local-drivers' ); ?></span>
                            <span class="price-value"><?php echo esc_html( function_exists('get_woocommerce_currency_symbol') ? get_woocommerce_currency_symbol() : '₲' ); ?><?php echo esc_html( number_format( floatval( $price ), 0, ',', '.' ) ); ?></span>
                        </div>
                    <?php endif; ?>

                    <!-- Rating form (only on delivered, not yet rated) -->
                    <?php if ( $status === self::STATUS_DELIVERED && $driver_id && ! get_post_meta( $delivery->ID, '_driver_rated', true ) ) : ?>
                        <div class="tuki-rate-driver" id="tuki-rate-driver" style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                            <h4 style="margin:0 0 8px;font-size:1rem;color:#1f2937;">⭐ <?php esc_html_e( '¿Cómo fue tu experiencia?', 'tukitask-local-drivers' ); ?></h4>
                            <p style="margin:0 0 12px;font-size:0.85rem;color:#6b7280;"><?php esc_html_e( 'Califica al conductor', 'tukitask-local-drivers' ); ?></p>
                            <div class="tuki-stars" id="tuki-rating-stars" style="display:flex;gap:6px;margin-bottom:12px;">
                                <?php for ( $i = 1; $i <= 5; $i++ ) : ?>
                                    <span class="tuki-star" data-value="<?php echo $i; ?>" style="font-size:28px;cursor:pointer;color:#d1d5db;transition:color 0.15s;">★</span>
                                <?php endfor; ?>
                            </div>
                            <textarea id="tuki-rating-comment" placeholder="<?php esc_attr_e( 'Comentario (opcional)', 'tukitask-local-drivers' ); ?>" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.9rem;resize:none;height:60px;box-sizing:border-box;"></textarea>
                            <button type="button" id="tuki-submit-rating" data-delivery-id="<?php echo esc_attr( $delivery->ID ); ?>" style="margin-top:10px;width:100%;padding:12px;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:#fff;border:none;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer;">
                                <?php esc_html_e( 'Enviar Calificación', 'tukitask-local-drivers' ); ?>
                            </button>
                        </div>
                    <?php elseif ( $status === self::STATUS_DELIVERED && get_post_meta( $delivery->ID, '_driver_rated', true ) ) : ?>
                        <div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:12px;text-align:center;border:1px solid #bbf7d0;">
                            <span style="font-size:0.9rem;color:#16a34a;">✅ <?php esc_html_e( 'Ya calificaste este envío. ¡Gracias!', 'tukitask-local-drivers' ); ?></span>
                        </div>
                    <?php endif; ?>

                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * AJAX: Crear solicitud de envío.
     */
    public function ajax_create_request() {
        check_ajax_referer( 'tukitask_delivery_nonce', 'security' );

        if ( ! is_user_logged_in() ) {
            wp_send_json_error( array( 'message' => __( 'Debes iniciar sesión.', 'tukitask-local-drivers' ) ) );
        }

        // Validar campos requeridos
        $required = array( 'pickup_address', 'pickup_lat', 'pickup_lng', 'pickup_contact', 'pickup_phone',
                          'delivery_address', 'delivery_lat', 'delivery_lng', 'delivery_contact', 'delivery_phone',
                          'package_type', 'payment_method' );

        foreach ( $required as $field ) {
            if ( empty( $_POST[ $field ] ) ) {
                wp_send_json_error( array( 'message' => sprintf( __( 'El campo %s es requerido.', 'tukitask-local-drivers' ), $field ) ) );
            }
        }

        $user_id = get_current_user_id();

        // Calcular precio
        $price_data = $this->calculate_delivery_price( $_POST );
        if ( ! $price_data || $price_data['total'] <= 0 ) {
            wp_send_json_error( array( 'message' => __( 'Error al calcular el precio.', 'tukitask-local-drivers' ) ) );
        }

        // Generar código de tracking único
        $tracking_code = strtoupper( 'TK' . substr( md5( uniqid( $user_id, true ) ), 0, 8 ) );

        // Crear delivery post
        $delivery_id = wp_insert_post( array(
            'post_type'   => self::POST_TYPE,
            'post_title'  => $tracking_code . ' - ' . sanitize_text_field( $_POST['pickup_address'] ) . ' → ' . sanitize_text_field( $_POST['delivery_address'] ),
            'post_status' => 'publish',
            'post_author' => $user_id,
        ) );

        if ( is_wp_error( $delivery_id ) ) {
            wp_send_json_error( array( 'message' => __( 'Error al crear la solicitud.', 'tukitask-local-drivers' ) ) );
        }

        // Guardar metadata
        $meta_fields = array(
            '_tracking_code'         => $tracking_code,
            '_delivery_status'       => self::STATUS_SEARCHING,
            '_pickup_address'        => sanitize_text_field( $_POST['pickup_address'] ),
            '_pickup_lat'            => floatval( $_POST['pickup_lat'] ),
            '_pickup_lng'            => floatval( $_POST['pickup_lng'] ),
            '_pickup_contact'        => sanitize_text_field( $_POST['pickup_contact'] ),
            '_pickup_phone'          => sanitize_text_field( $_POST['pickup_phone'] ),
            '_pickup_instructions'   => sanitize_textarea_field( $_POST['pickup_instructions'] ?? '' ),
            '_delivery_address'      => sanitize_text_field( $_POST['delivery_address'] ),
            '_delivery_lat'          => floatval( $_POST['delivery_lat'] ),
            '_delivery_lng'          => floatval( $_POST['delivery_lng'] ),
            '_delivery_contact'      => sanitize_text_field( $_POST['delivery_contact'] ),
            '_delivery_phone'        => sanitize_text_field( $_POST['delivery_phone'] ),
            '_delivery_instructions' => sanitize_textarea_field( $_POST['delivery_instructions'] ?? '' ),
            '_package_type'          => sanitize_text_field( $_POST['package_type'] ),
            '_vehicle_type'          => sanitize_text_field( $_POST['vehicle_type'] ?? 'any' ),
            '_payment_method'        => in_array( sanitize_text_field( $_POST['payment_method'] ?? 'cash' ), array( 'cash', 'transfer' ), true ) ? sanitize_text_field( $_POST['payment_method'] ) : 'cash',
            '_delivery_price'        => $price_data['total'],
            '_price_breakdown'       => $price_data,
            '_distance_km'           => $price_data['distance'],
            '_status_history'        => array(
                array(
                    'status'    => self::STATUS_PENDING,
                    'timestamp' => current_time( 'timestamp' ),
                    'note'      => __( 'Solicitud creada', 'tukitask-local-drivers' ),
                ),
                array(
                    'status'    => self::STATUS_SEARCHING,
                    'timestamp' => current_time( 'timestamp' ),
                    'note'      => __( 'Buscando conductores', 'tukitask-local-drivers' ),
                ),
            ),
        );

        foreach ( $meta_fields as $key => $value ) {
            update_post_meta( $delivery_id, $key, $value );
        }

        // Iniciar broadcast a drivers cercanos
        $this->broadcast_delivery_to_drivers( $delivery_id );

        wp_send_json_success( array(
            'message'       => __( '¡Solicitud creada! Buscando conductores cercanos...', 'tukitask-local-drivers' ),
            'delivery_id'   => $delivery_id,
            'tracking_code' => $tracking_code,
            'price'         => wc_price( $price_data['total'] ),
            'redirect'      => add_query_arg( 'tracking', $tracking_code, home_url( '/tracking-envio/' ) ),
        ) );
    }

    /**
     * AJAX: Calcular precio del envío.
     */
    public function ajax_calculate_price() {
        check_ajax_referer( 'tukitask_delivery_nonce', 'security' );

        $price_data = $this->calculate_delivery_price( $_POST );
        
        if ( ! $price_data ) {
            wp_send_json_error( array( 'message' => __( 'No se pudo calcular el precio.', 'tukitask-local-drivers' ) ) );
        }

        wp_send_json_success( $price_data );
    }

    /**
     * Calculate driver earning based on per-vehicle commission mode.
     *
     * @param float  $price        Delivery price.
     * @param string $vehicle_type Vehicle type key.
     * @return float Driver earning.
     */
    private static function calculate_driver_earning( $price, $vehicle_type = 'motorcycle' ) {
        $price = floatval( $price );
        $mode  = get_option( 'tukitask_ld_' . $vehicle_type . '_commission_mode', 'percentage' );

        if ( 'fixed' === $mode ) {
            return floatval( get_option( 'tukitask_ld_' . $vehicle_type . '_commission_fixed', 0 ) );
        }

        // Percentage mode (default)
        $pct = floatval( get_option( 'tukitask_ld_' . $vehicle_type . '_commission_pct', 80 ) );
        return ( $price * $pct ) / 100;
    }

    /**
     * Public wrapper for calculate_driver_earning (used by Driver_Dashboard).
     *
     * @param float  $price        Delivery price.
     * @param string $vehicle_type Vehicle type key.
     * @return float
     */
    public static function calculate_driver_earning_public( $price, $vehicle_type = 'motorcycle' ) {
        return self::calculate_driver_earning( $price, $vehicle_type );
    }

    /**
     * Calcular precio del envío.
     *
     * @param array $data Form data.
     * @return array|false
     */
    private function calculate_delivery_price( $data ) {
        $pickup_lat = isset( $data['pickup_lat'] ) ? floatval( $data['pickup_lat'] ) : 0;
        $pickup_lng = isset( $data['pickup_lng'] ) ? floatval( $data['pickup_lng'] ) : 0;
        $delivery_lat = isset( $data['delivery_lat'] ) ? floatval( $data['delivery_lat'] ) : 0;
        $delivery_lng = isset( $data['delivery_lng'] ) ? floatval( $data['delivery_lng'] ) : 0;

        if ( ! $pickup_lat || ! $pickup_lng || ! $delivery_lat || ! $delivery_lng ) {
            return false;
        }

        // Calcular distancia
        $distance = Distance::haversine( $pickup_lat, $pickup_lng, $delivery_lat, $delivery_lng );

        // Per-vehicle pricing configuration
        $vehicle_type = isset( $data['vehicle_type'] ) ? sanitize_key( $data['vehicle_type'] ) : 'motorcycle';
        $package_type = isset( $data['package_type'] ) ? sanitize_key( $data['package_type'] ) : 'document';

        $global_base    = floatval( get_option( 'tukitask_ld_base_price', 5 ) );
        $global_km      = floatval( get_option( 'tukitask_ld_price_per_km', 1.5 ) );
        $min_price      = floatval( get_option( 'tukitask_delivery_min_price', 8 ) );

        // Vehicle-specific overrides (fall back to global if empty/0)
        $v_base = floatval( get_option( 'tukitask_ld_' . $vehicle_type . '_base_price', 0 ) );
        $base_price = $v_base > 0 ? $v_base : $global_base;

        $v_km = floatval( get_option( 'tukitask_ld_' . $vehicle_type . '_price_per_km', 0 ) );
        $price_per_km = $v_km > 0 ? $v_km : $global_km;

        // Calcular precio base + distancia
        $distance_price = $distance * $price_per_km;
        $subtotal = $base_price + $distance_price;

        // Aplicar multiplicador por tipo de paquete (configurable desde admin)
        $defaults = array(
            'document' => 1.0,
            'small'    => 1.0,
            'medium'   => 1.2,
            'large'    => 1.5,
            'fragile'  => 1.3,
            'flete'    => 2.0,
            'mudanza'  => 2.5,
        );
        $default_val = isset( $defaults[ $package_type ] ) ? $defaults[ $package_type ] : 1.0;
        $saved = get_option( 'tukitask_ld_package_multiplier_' . $package_type, 0 );
        $package_multiplier = floatval( $saved ) > 0 ? floatval( $saved ) : $default_val;
        $subtotal *= $package_multiplier;

        // Aplicar mínimo
        $total = max( $subtotal, $min_price );

        // Estimar tiempo (asumiendo 30 km/h promedio en ciudad)
        $estimated_time = ceil( ( $distance / 30 ) * 60 );

        return array(
            'distance'       => round( $distance, 2 ),
            'base'           => $base_price,
            'distance_price' => round( $distance_price, 2 ),
            'total'          => round( $total, 2 ),
            'estimated_time' => $estimated_time,
            'currency'       => get_woocommerce_currency_symbol(),
        );
    }

    /**
     * Broadcast delivery request to nearby drivers.
     *
     * @param int $delivery_id Delivery post ID.
     */
    private function broadcast_delivery_to_drivers( $delivery_id, $range_multiplier = 1 ) {
        $pickup_lat = get_post_meta( $delivery_id, '_pickup_lat', true );
        $pickup_lng = get_post_meta( $delivery_id, '_pickup_lng', true );
        $delivery_lat = get_post_meta( $delivery_id, '_delivery_lat', true );
        $delivery_lng = get_post_meta( $delivery_id, '_delivery_lng', true );
        $vehicle_type = get_post_meta( $delivery_id, '_vehicle_type', true );
        $package_type = get_post_meta( $delivery_id, '_package_type', true );
        $price = get_post_meta( $delivery_id, '_delivery_price', true );

        // Buscar drivers cercanos que acepten paquetes
        $max_range = floatval( get_option( 'tukitask_ld_max_distance', 50 ) ) * $range_multiplier;
        $lat_range = $max_range / 111.0;
        $lng_range = $max_range / ( 111.0 * cos( deg2rad( $pickup_lat ) ) );

        $meta_query = array(
            'relation' => 'AND',
            array(
                'key'     => '_driver_status',
                'value'   => 'available',
                'compare' => '=',
            ),
            array(
                'relation' => 'OR',
                array(
                    'key'     => '_driver_accepts_packages',
                    'value'   => 'yes',
                    'compare' => '=',
                ),
                array(
                    'key'     => '_driver_accepts_packages',
                    'compare' => 'NOT EXISTS',
                ),
            ),
            array(
                'key'     => '_driver_lat',
                'value'   => array( $pickup_lat - $lat_range, $pickup_lat + $lat_range ),
                'type'    => 'DECIMAL(10,6)',
                'compare' => 'BETWEEN',
            ),
            array(
                'key'     => '_driver_lng',
                'value'   => array( $pickup_lng - $lng_range, $pickup_lng + $lng_range ),
                'type'    => 'DECIMAL(10,6)',
                'compare' => 'BETWEEN',
            ),
        );

        // Filtrar por tipo de vehículo si se especificó
        if ( $vehicle_type && $vehicle_type !== 'any' ) {
            $meta_query[] = array(
                'key'     => '_driver_vehicle_type',
                'value'   => $vehicle_type,
                'compare' => '=',
            );
        }

        $args = array(
            'post_type'      => 'tukitask_driver',
            'post_status'    => 'publish',
            'posts_per_page' => 100,
            'meta_query'     => $meta_query,
        );

        $query = new \WP_Query( $args );
        $notified_drivers = array();

        error_log( '[TukiTask Delivery] broadcast_delivery_to_drivers #' . $delivery_id . ' - Query found ' . $query->found_posts . ' drivers (pickup_lat=' . $pickup_lat . ', pickup_lng=' . $pickup_lng . ', range=' . $max_range . 'km)' );

        if ( $query->have_posts() ) {
            while ( $query->have_posts() ) {
                $query->the_post();
                $driver_id = get_the_ID();
                $driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
                $driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );
                $pickup_range = floatval( get_post_meta( $driver_id, '_driver_pickup_range', true ) )
                    ?: floatval( get_post_meta( $driver_id, '_driver_radius', true ) )
                    ?: $max_range;

                // Calcular distancia
                $distance_to_pickup = Distance::haversine( $driver_lat, $driver_lng, $pickup_lat, $pickup_lng );

                if ( $distance_to_pickup <= $pickup_range ) {
                    $notified_drivers[] = $driver_id;
                    $this->send_delivery_notification_to_driver( $driver_id, $delivery_id, $distance_to_pickup, $price );
                }
            }
            wp_reset_postdata();
        }

        // Guardar drivers notificados
        update_post_meta( $delivery_id, '_notified_drivers', $notified_drivers );
        update_post_meta( $delivery_id, '_broadcast_attempt', 1 );
        update_post_meta( $delivery_id, '_broadcast_started_at', current_time( 'timestamp' ) );

        error_log( '[TukiTask Delivery] broadcast_delivery_to_drivers #' . $delivery_id . ' - Notified ' . count( $notified_drivers ) . ' drivers: ' . implode( ',', $notified_drivers ) );

        // Si no hay drivers, programar reintento
        if ( empty( $notified_drivers ) ) {
            wp_schedule_single_event(
                time() + 60,
                'tukitask_expand_delivery_search',
                array( $delivery_id, 2 )
            );
        }
    }

    /**
     * Send notification to driver about delivery request.
     *
     * @param int   $driver_id         Driver ID.
     * @param int   $delivery_id       Delivery ID.
     * @param float $distance_to_pickup Distance to pickup.
     * @param float $price             Delivery price.
     */
    private function send_delivery_notification_to_driver( $driver_id, $delivery_id, $distance_to_pickup, $price ) {
        $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
        if ( ! $driver_user_id ) {
            return;
        }

        $tracking_code = get_post_meta( $delivery_id, '_tracking_code', true );
        $pickup_address = get_post_meta( $delivery_id, '_pickup_address', true );
        $delivery_address = get_post_meta( $delivery_id, '_delivery_address', true );
        $package_type = get_post_meta( $delivery_id, '_package_type', true );
        $vehicle_type = get_post_meta( $delivery_id, '_vehicle_type', true ) ?: 'motorcycle';

        // Comisión del driver (per-vehicle)
        $driver_earning = self::calculate_driver_earning( $price, $vehicle_type );

        // Crear broadcast entry para el driver en tabla indexada
        Broadcast_Store::add( $driver_id, $delivery_id, 'delivery', array(
            'pickup_distance' => $distance_to_pickup,
        ), 300 );

        // Enviar push notification
        if ( class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $driver_user_id,
                __( '📦 ¡Nuevo envío de paquete!', 'tukitask-local-drivers' ),
                sprintf(
                    __( 'A %.1f km de ti. Gana %s', 'tukitask-local-drivers' ),
                    $distance_to_pickup,
                    wc_price( $driver_earning )
                ),
                home_url( '/driver-dashboard/?action=delivery&id=' . $delivery_id ),
                array(
                    'type'        => 'delivery_request',
                    'delivery_id' => $delivery_id,
                    'actions'     => array(
                        array( 'action' => 'accept_delivery', 'title' => __( 'Aceptar', 'tukitask-local-drivers' ) ),
                        array( 'action' => 'reject_delivery', 'title' => __( 'Rechazar', 'tukitask-local-drivers' ) ),
                    ),
                )
            );
        }
    }

    /**
     * AJAX: Driver acepta delivery.
     */
    public function ajax_driver_accept() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        if ( ! current_user_can( 'tukitask_driver_access' ) ) {
            wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
        }

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;

        // Auto-detect driver_id from current user if not provided
        if ( ! $driver_id ) {
            $driver_id = $this->get_driver_post_id_by_user( get_current_user_id() );
        }

        if ( ! $delivery_id || ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        // Verificar que no esté asignado
        $current_driver = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        if ( $current_driver ) {
            wp_send_json_error( array(
                'message'      => __( '¡Este envío ya fue tomado por otro conductor!', 'tukitask-local-drivers' ),
                'already_taken' => true,
            ) );
        }

        // Lock para evitar race conditions
        $lock_key = 'tukitask_delivery_lock_' . $delivery_id;
        if ( get_transient( $lock_key ) ) {
            wp_send_json_error( array( 'message' => __( 'Procesando. Intenta de nuevo.', 'tukitask-local-drivers' ), 'retry' => true ) );
        }
        set_transient( $lock_key, $driver_id, 5 );

        // Asignar driver
        update_post_meta( $delivery_id, '_assigned_driver_id', $driver_id );
        update_post_meta( $delivery_id, '_driver_assigned_at', current_time( 'timestamp' ) );
        update_post_meta( $delivery_id, '_delivery_status', self::STATUS_ASSIGNED );

        // Actualizar historial
        $history = get_post_meta( $delivery_id, '_status_history', true ) ?: array();
        $history[] = array(
            'status'    => self::STATUS_ASSIGNED,
            'timestamp' => current_time( 'timestamp' ),
            'note'      => sprintf( __( 'Conductor %s asignado', 'tukitask-local-drivers' ), get_the_title( $driver_id ) ),
        );
        update_post_meta( $delivery_id, '_status_history', $history );

        // Actualizar estado del driver
        update_post_meta( $driver_id, '_driver_active_delivery', $delivery_id );
        update_post_meta( $driver_id, '_driver_status', 'en_viaje' );

        delete_transient( $lock_key );

        // Limpiar todos los broadcasts de este envío
        Broadcast_Store::remove_all_for_item( $delivery_id, 'delivery' );

        // Notificar al cliente
        $this->notify_customer_driver_assigned( $delivery_id, $driver_id );

        wp_send_json_success( array(
            'message'  => __( '¡Envío aceptado! Dirígete al punto de recogida.', 'tukitask-local-drivers' ),
            'redirect' => home_url( '/driver-dashboard/?delivery_id=' . $delivery_id ),
        ) );
    }

    /**
     * AJAX: Driver confirma recogida.
     */
    public function ajax_driver_pickup() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
        $pickup_code = isset( $_POST['pickup_code'] ) ? sanitize_text_field( $_POST['pickup_code'] ) : '';

        if ( ! $driver_id ) {
            $driver_id = $this->get_driver_post_id_by_user( get_current_user_id() );
        }

        if ( ! $delivery_id || ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        // Verificar que es el driver asignado
        $assigned_driver = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        if ( intval( $assigned_driver ) !== $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'No estás asignado a este envío.', 'tukitask-local-drivers' ) ) );
        }

        // Actualizar estado
        update_post_meta( $delivery_id, '_delivery_status', self::STATUS_IN_TRANSIT );
        update_post_meta( $delivery_id, '_pickup_confirmed_at', current_time( 'timestamp' ) );

        // Historial
        $history = get_post_meta( $delivery_id, '_status_history', true ) ?: array();
        $history[] = array(
            'status'    => self::STATUS_IN_TRANSIT,
            'timestamp' => current_time( 'timestamp' ),
            'note'      => __( 'Paquete recogido, en camino a destino', 'tukitask-local-drivers' ),
        );
        update_post_meta( $delivery_id, '_status_history', $history );

        // Notificar al cliente
        $this->notify_customer_status_update( $delivery_id, self::STATUS_IN_TRANSIT );

        wp_send_json_success( array(
            'message' => __( '¡Recogida confirmada! Ahora dirígete al destino.', 'tukitask-local-drivers' ),
        ) );
    }

    /**
     * AJAX: Driver completa entrega.
     */
    public function ajax_driver_complete() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
        $delivery_code = isset( $_POST['delivery_code'] ) ? sanitize_text_field( $_POST['delivery_code'] ) : '';
        $signature = isset( $_POST['signature'] ) ? sanitize_text_field( $_POST['signature'] ) : '';
        $photo_id = isset( $_POST['photo_id'] ) ? intval( $_POST['photo_id'] ) : 0;

        if ( ! $driver_id ) {
            $driver_id = $this->get_driver_post_id_by_user( get_current_user_id() );
        }

        if ( ! $delivery_id || ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        // Verificar driver asignado
        $assigned_driver = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        if ( intval( $assigned_driver ) !== $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'No estás asignado a este envío.', 'tukitask-local-drivers' ) ) );
        }

        // Actualizar estado
        update_post_meta( $delivery_id, '_delivery_status', self::STATUS_DELIVERED );
        update_post_meta( $delivery_id, '_delivered_at', current_time( 'timestamp' ) );
        
        if ( $signature ) {
            update_post_meta( $delivery_id, '_delivery_signature', $signature );
        }
        if ( $photo_id ) {
            update_post_meta( $delivery_id, '_delivery_photo', $photo_id );
        }

        // Historial
        $history = get_post_meta( $delivery_id, '_status_history', true ) ?: array();
        $history[] = array(
            'status'    => self::STATUS_DELIVERED,
            'timestamp' => current_time( 'timestamp' ),
            'note'      => __( 'Paquete entregado exitosamente', 'tukitask-local-drivers' ),
        );
        update_post_meta( $delivery_id, '_status_history', $history );

        // Liberar driver
        delete_post_meta( $driver_id, '_driver_active_delivery' );
        update_post_meta( $driver_id, '_driver_status', 'available' );

        // Incrementar contador de entregas
        $total_deliveries = intval( get_post_meta( $driver_id, '_driver_total_deliveries', true ) );
        update_post_meta( $driver_id, '_driver_total_deliveries', $total_deliveries + 1 );

        // Acreditar ganancia al driver (per-vehicle commission)
        $price = get_post_meta( $delivery_id, '_delivery_price', true );
        $v_type = get_post_meta( $delivery_id, '_vehicle_type', true ) ?: 'motorcycle';
        $earning = self::calculate_driver_earning( $price, $v_type );

        if ( class_exists( '\\Tukitask\\LocalDrivers\\Drivers\\Wallet_Manager' ) ) {
            $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
            if ( $driver_user_id ) {
                \Tukitask\LocalDrivers\Drivers\Wallet_Manager::add_entry( array(
                    'user_id'     => $driver_user_id,
                    'order_id'    => $delivery_id,
                    'amount'      => $earning,
                    'type'        => 'earning',
                    'description' => sprintf( __( 'Envío de paquete #%s', 'tukitask-local-drivers' ), get_post_meta( $delivery_id, '_tracking_code', true ) ),
                ) );
            }
        }

        // Notificar al cliente
        $this->notify_customer_status_update( $delivery_id, self::STATUS_DELIVERED );

        wp_send_json_success( array(
            'message' => sprintf( __( '¡Entrega completada! Ganaste %s', 'tukitask-local-drivers' ), strip_tags( wc_price( $earning ) ) ),
        ) );
    }

    /**
     * AJAX: Cancelar delivery.
     */
    public function ajax_cancel_delivery() {
        check_ajax_referer( 'tukitask_delivery_nonce', 'security' );

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        
        if ( ! $delivery_id ) {
            wp_send_json_error( array( 'message' => __( 'ID inválido.', 'tukitask-local-drivers' ) ) );
        }

        $delivery = get_post( $delivery_id );
        if ( ! $delivery || $delivery->post_author != get_current_user_id() ) {
            wp_send_json_error( array( 'message' => __( 'No tienes permiso para cancelar este envío.', 'tukitask-local-drivers' ) ) );
        }

        $status = get_post_meta( $delivery_id, '_delivery_status', true );
        if ( ! in_array( $status, array( self::STATUS_PENDING, self::STATUS_SEARCHING, self::STATUS_ASSIGNED ) ) ) {
            wp_send_json_error( array( 'message' => __( 'No se puede cancelar un envío en curso.', 'tukitask-local-drivers' ) ) );
        }

        // Actualizar estado
        update_post_meta( $delivery_id, '_delivery_status', self::STATUS_CANCELLED );
        update_post_meta( $delivery_id, '_cancelled_at', current_time( 'timestamp' ) );
        update_post_meta( $delivery_id, '_cancelled_by', 'customer' );

        // Historial
        $history = get_post_meta( $delivery_id, '_status_history', true ) ?: array();
        $history[] = array(
            'status'    => self::STATUS_CANCELLED,
            'timestamp' => current_time( 'timestamp' ),
            'note'      => __( 'Cancelado por el cliente', 'tukitask-local-drivers' ),
        );
        update_post_meta( $delivery_id, '_status_history', $history );

        // Liberar driver si estaba asignado
        $driver_id = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        if ( $driver_id ) {
            delete_post_meta( $driver_id, '_driver_active_delivery' );
            update_post_meta( $driver_id, '_driver_status', 'available' );
            
            // Notificar al driver
            $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
            if ( $driver_user_id && class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
                \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                    $driver_user_id,
                    __( '❌ Envío cancelado', 'tukitask-local-drivers' ),
                    __( 'El cliente canceló el envío.', 'tukitask-local-drivers' ),
                    home_url( '/driver-dashboard/' )
                );
            }
        }

        wp_send_json_success( array(
            'message' => __( 'Envío cancelado correctamente.', 'tukitask-local-drivers' ),
        ) );
    }

    /**
     * AJAX: Get delivery status.
     */
    public function ajax_get_status() {
        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        
        if ( ! $delivery_id ) {
            wp_send_json_error();
        }

        $status = get_post_meta( $delivery_id, '_delivery_status', true );
        $driver_id = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        
        $response = array(
            'status'       => $status,
            'status_label' => $this->get_status_label( $status ),
        );

        if ( $driver_id ) {
            $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
            $avatar_id = $driver_user_id ? get_user_meta( $driver_user_id, '_tukitask_driver_avatar_id', true ) : 0;
            $avatar_url = $avatar_id ? wp_get_attachment_image_url( $avatar_id, 'thumbnail' ) : ( $driver_user_id ? get_avatar_url( $driver_user_id, array( 'size' => 80 ) ) : '' );
            $rating_data = class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Review_Manager' ) ? \Tukitask\LocalDrivers\Helpers\Review_Manager::get_average_rating( $driver_id, 'driver' ) : array( 'rating' => 0, 'count' => 0 );

            $response['driver'] = array(
                'name'         => get_the_title( $driver_id ),
                'phone'        => get_post_meta( $driver_id, '_driver_phone', true ),
                'lat'          => get_post_meta( $driver_id, '_driver_lat', true ),
                'lng'          => get_post_meta( $driver_id, '_driver_lng', true ),
                'avatar'       => $avatar_url,
                'rating'       => $rating_data['rating'],
                'rating_count' => $rating_data['count'],
            );
        }

        wp_send_json_success( $response );
    }

    /**
     * AJAX: Get nearby available drivers for map display.
     */
    public function ajax_get_nearby_drivers() {
        check_ajax_referer( 'tukitask_delivery_nonce', 'security' );

        $lat = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : 0;
        $lng = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : 0;

        if ( ! $lat || ! $lng ) {
            wp_send_json_success( array( 'drivers' => array() ) );
        }

        $max_distance = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );
        $lat_range    = $max_distance / 111.0;
        $lng_range    = $max_distance / ( 111.0 * max( 0.01, cos( deg2rad( $lat ) ) ) );

        $query = new \WP_Query( array(
            'post_type'      => 'tukitask_driver',
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'meta_query'     => array(
                'relation' => 'AND',
                array(
                    'key'     => '_driver_status',
                    'value'   => array( 'available', 'en_viaje' ),
                    'compare' => 'IN',
                ),
                array(
                    'key'     => '_driver_lat',
                    'value'   => array( $lat - $lat_range, $lat + $lat_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
                array(
                    'key'     => '_driver_lng',
                    'value'   => array( $lng - $lng_range, $lng + $lng_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
            ),
        ) );

        $drivers = array();

        if ( $query->have_posts() ) {
            while ( $query->have_posts() ) {
                $query->the_post();
                $driver_id  = get_the_ID();
                $driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
                $driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );

                if ( ! $driver_lat || ! $driver_lng ) {
                    continue;
                }

                $vehicle = get_post_meta( $driver_id, '_driver_vehicle_type', true );
                if ( ! $vehicle ) {
                    $vehicle = 'motorcycle';
                }

                $drivers[] = array(
                    'id'      => $driver_id,
                    'lat'     => $driver_lat,
                    'lng'     => $driver_lng,
                    'vehicle' => $vehicle,
                );
            }
            wp_reset_postdata();
        }

        wp_send_json_success( array( 'drivers' => $drivers ) );
    }

    /**
     * Notify customer that driver was assigned.
     */
    private function notify_customer_driver_assigned( $delivery_id, $driver_id ) {
        $delivery = get_post( $delivery_id );
        if ( ! $delivery ) return;

        $customer_id = $delivery->post_author;
        $driver_name = get_the_title( $driver_id );
        $driver_phone = get_post_meta( $driver_id, '_driver_phone', true );
        $tracking_code = get_post_meta( $delivery_id, '_tracking_code', true );

        if ( class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $customer_id,
                __( '✅ ¡Conductor asignado!', 'tukitask-local-drivers' ),
                sprintf( __( '%s recogerá tu paquete. Tel: %s', 'tukitask-local-drivers' ), $driver_name, $driver_phone ?: 'N/A' ),
                add_query_arg( 'tracking', $tracking_code, home_url( '/tracking-envio/' ) )
            );
        }
    }

    /**
     * Notify customer of status update.
     */
    private function notify_customer_status_update( $delivery_id, $status ) {
        $delivery = get_post( $delivery_id );
        if ( ! $delivery ) return;

        $customer_id = $delivery->post_author;
        $tracking_code = get_post_meta( $delivery_id, '_tracking_code', true );

        $messages = array(
            self::STATUS_IN_TRANSIT => array(
                'title' => __( '📦 ¡Paquete en camino!', 'tukitask-local-drivers' ),
                'body'  => __( 'Tu paquete ha sido recogido y está en camino al destino.', 'tukitask-local-drivers' ),
            ),
            self::STATUS_DELIVERED => array(
                'title' => __( '✅ ¡Paquete entregado!', 'tukitask-local-drivers' ),
                'body'  => __( 'Tu paquete ha sido entregado exitosamente.', 'tukitask-local-drivers' ),
            ),
        );

        if ( isset( $messages[ $status ] ) && class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $customer_id,
                $messages[ $status ]['title'],
                $messages[ $status ]['body'],
                add_query_arg( 'tracking', $tracking_code, home_url( '/tracking-envio/' ) )
            );
        }
    }

    /**
     * Get status label.
     */
    private function get_status_label( $status ) {
        $labels = array(
            self::STATUS_PENDING    => __( 'Pendiente', 'tukitask-local-drivers' ),
            self::STATUS_SEARCHING  => __( 'Buscando conductor', 'tukitask-local-drivers' ),
            self::STATUS_ASSIGNED   => __( 'Conductor asignado', 'tukitask-local-drivers' ),
            self::STATUS_PICKUP     => __( 'En recogida', 'tukitask-local-drivers' ),
            self::STATUS_IN_TRANSIT => __( 'En camino', 'tukitask-local-drivers' ),
            self::STATUS_DELIVERED  => __( 'Entregado', 'tukitask-local-drivers' ),
            self::STATUS_CANCELLED  => __( 'Cancelado', 'tukitask-local-drivers' ),
        );
        return isset( $labels[ $status ] ) ? $labels[ $status ] : $status;
    }

    /**
     * Get status icon.
     */
    private function get_status_icon( $status ) {
        $icons = array(
            self::STATUS_PENDING    => 'fas fa-clock',
            self::STATUS_SEARCHING  => 'fas fa-search',
            self::STATUS_ASSIGNED   => 'fas fa-user-check',
            self::STATUS_PICKUP     => 'fas fa-box',
            self::STATUS_IN_TRANSIT => 'fas fa-shipping-fast',
            self::STATUS_DELIVERED  => 'fas fa-check-circle',
            self::STATUS_CANCELLED  => 'fas fa-times-circle',
        );
        return isset( $icons[ $status ] ) ? $icons[ $status ] : 'fas fa-circle';
    }

    /**
     * Get pending delivery requests for a driver (PULL-BASED).
     * Queries all deliveries in 'searching' status within driver's range.
     *
     * @param int $driver_id Driver CPT post ID.
     * @return array
     */
    public static function get_pending_deliveries_for_driver( $driver_id ) {
        $driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
        $driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );

        // Sin ubicación GPS no podemos calcular distancia
        if ( ! $driver_lat && ! $driver_lng ) {
            return array();
        }

        // --- Delivery limit enforcement (per-vehicle) ---
        $driver_vehicle = get_post_meta( $driver_id, '_driver_vehicle_type', true ) ?: 'motorcycle';
        $limit_mode = get_option( 'tukitask_ld_' . $driver_vehicle . '_limit_mode', 'none' );
        if ( 'quantity' === $limit_mode ) {
            $default_limit = absint( get_option( 'tukitask_ld_' . $driver_vehicle . '_delivery_limit', 0 ) );
            $driver_limit  = absint( get_post_meta( $driver_id, '_driver_delivery_limit', true ) );
            $limit         = $driver_limit > 0 ? $driver_limit : $default_limit;
            if ( $limit > 0 ) {
                $reset_at = get_post_meta( $driver_id, '_driver_deliveries_reset_at', true );
                $month_start = gmdate( 'Y-m-01 00:00:00' );
                if ( $reset_at && $reset_at > $month_start ) {
                    $month_start = $reset_at;
                }
                $count = (int) ( new \WP_Query( array(
                    'post_type'      => self::POST_TYPE,
                    'post_status'    => 'publish',
                    'posts_per_page' => -1,
                    'fields'         => 'ids',
                    'meta_query'     => array(
                        'relation' => 'AND',
                        array( 'key' => '_assigned_driver_id', 'value' => $driver_id ),
                        array( 'key' => '_delivery_status', 'value' => self::STATUS_DELIVERED ),
                    ),
                    'date_query'     => array( array( 'after' => $month_start ) ),
                ) ) )->found_posts;
                if ( $count >= $limit ) {
                    return array();
                }
            }
        } elseif ( 'balance' === $limit_mode ) {
            $min_balance   = floatval( get_option( 'tukitask_ld_' . $driver_vehicle . '_min_wallet_balance', 0 ) );
            if ( $min_balance > 0 && class_exists( '\\Tukitask\\LocalDrivers\\Drivers\\Wallet_Manager' ) ) {
                $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
                if ( $driver_user_id ) {
                    $balance = floatval( \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $driver_user_id ) );
                    if ( $balance < $min_balance ) {
                        return array();
                    }
                }
            }
        }

        // Rango de recogida del driver (km)
        $pickup_range = floatval( get_post_meta( $driver_id, '_driver_radius', true ) )
            ?: floatval( get_post_meta( $driver_id, '_driver_pickup_range', true ) )
            ?: 15;

        // Capacidad de peso del driver (kg)
        $driver_capacity = floatval( get_post_meta( $driver_id, '_driver_capacity', true ) );

        // Envíos que este driver ya rechazó
        $rejected = get_post_meta( $driver_id, '_rejected_deliveries', true ) ?: array();

        // Buscar envíos en estado 'searching' dentro de un bounding box
        $lat_range = $pickup_range / 111.0;
        $lng_range = $pickup_range / ( 111.0 * cos( deg2rad( $driver_lat ) ) );

        $deliveries = get_posts( array(
            'post_type'      => self::POST_TYPE,
            'post_status'    => 'publish',
            'posts_per_page' => 20,
            'meta_query'     => array(
                'relation' => 'AND',
                array(
                    'key'     => '_delivery_status',
                    'value'   => self::STATUS_SEARCHING,
                    'compare' => '=',
                ),
                array(
                    'key'     => '_assigned_driver_id',
                    'compare' => 'NOT EXISTS',
                ),
                array(
                    'key'     => '_pickup_lat',
                    'value'   => array( $driver_lat - $lat_range, $driver_lat + $lat_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
                array(
                    'key'     => '_pickup_lng',
                    'value'   => array( $driver_lng - $lng_range, $driver_lng + $lng_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
            ),
            'fields' => 'ids',
        ) );

        $valid = array();

        foreach ( $deliveries as $delivery_id ) {
            // Saltar rechazados
            if ( in_array( $delivery_id, $rejected, true ) ) {
                continue;
            }

            // Calcular distancia real con Haversine
            $pickup_lat = floatval( get_post_meta( $delivery_id, '_pickup_lat', true ) );
            $pickup_lng = floatval( get_post_meta( $delivery_id, '_pickup_lng', true ) );
            $distance   = Distance::haversine( $driver_lat, $driver_lng, $pickup_lat, $pickup_lng );

            if ( $distance > $pickup_range ) {
                continue;
            }

            // Verificar capacidad de peso del driver vs tipo de paquete
            if ( $driver_capacity > 0 ) {
                $package_type = get_post_meta( $delivery_id, '_package_type', true );
                $weight_map   = array( 'small' => 5, 'medium' => 15, 'large' => 30, 'fragile' => 10, 'flete' => 500, 'mudanza' => 1000 );
                $est_weight   = isset( $weight_map[ $package_type ] ) ? $weight_map[ $package_type ] : 10;
                if ( $est_weight > $driver_capacity ) {
                    continue;
                }
            }

            // Calcular ganancia del driver
            $price             = floatval( get_post_meta( $delivery_id, '_delivery_price', true ) );
            $d_vehicle_type    = get_post_meta( $delivery_id, '_vehicle_type', true ) ?: 'motorcycle';
            $driver_earning    = self::calculate_driver_earning( $price, $d_vehicle_type );

            $delivery_post = get_post( $delivery_id );
            $customer_name = '';
            if ( $delivery_post ) {
                $customer = get_user_by( 'id', $delivery_post->post_author );
                $customer_name = $customer ? $customer->display_name : '';
            }

            // Distance pickup → delivery (stored at creation)
            $delivery_lat = floatval( get_post_meta( $delivery_id, '_delivery_lat', true ) );
            $delivery_lng = floatval( get_post_meta( $delivery_id, '_delivery_lng', true ) );
            $distance_km  = floatval( get_post_meta( $delivery_id, '_distance_km', true ) );
            if ( ! $distance_km && $pickup_lat && $delivery_lat ) {
                $distance_km = Distance::haversine( $pickup_lat, $pickup_lng, $delivery_lat, $delivery_lng );
            }

            $valid[ $delivery_id ] = array(
                'delivery_id'        => $delivery_id,
                'tracking_code'      => get_post_meta( $delivery_id, '_tracking_code', true ),
                'pickup_address'     => get_post_meta( $delivery_id, '_pickup_address', true ),
                'delivery_address'   => get_post_meta( $delivery_id, '_delivery_address', true ),
                'pickup_lat'         => $pickup_lat,
                'pickup_lng'         => $pickup_lng,
                'delivery_lat'       => $delivery_lat,
                'delivery_lng'       => $delivery_lng,
                'package_type'       => get_post_meta( $delivery_id, '_package_type', true ),
                'distance_to_pickup' => $distance,
                'distance_km'        => round( $distance_km, 1 ),
                'price'              => $price,
                'driver_earning'     => $driver_earning,
                'customer_name'      => $customer_name,
                'payment_method'     => get_post_meta( $delivery_id, '_payment_method', true ) ?: 'cash',
                'created_at'         => get_post_time( 'U', true, $delivery_id ),
            );
        }

        return $valid;
    }

    /**
     * AJAX: Get pending delivery requests for current driver (polling).
     */
    public function ajax_get_pending_deliveries() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        if ( ! is_user_logged_in() ) {
            wp_send_json_error();
        }

        $user_id = get_current_user_id();
        $driver_post_id = $this->get_driver_post_id_by_user( $user_id );

        if ( ! $driver_post_id ) {
            wp_send_json_success( array() );
            return;
        }

        // Si el conductor ya tiene un envío activo, no recibe nuevas solicitudes
        $active_delivery = get_post_meta( $driver_post_id, '_driver_active_delivery', true );
        if ( $active_delivery ) {
            $active_status = get_post_meta( $active_delivery, '_delivery_status', true );
            // Solo bloquear si el envío activo aún no está entregado/cancelado
            if ( $active_status && ! in_array( $active_status, array( self::STATUS_DELIVERED, self::STATUS_CANCELLED ), true ) ) {
                wp_send_json_success( array() );
                return;
            }
            // Limpiar referencia si ya terminó
            delete_post_meta( $driver_post_id, '_driver_active_delivery' );
        }

        $pending = self::get_pending_deliveries_for_driver( $driver_post_id );
        $results = array();

        foreach ( $pending as $delivery_id => $data ) {
            $results[] = array(
                'delivery_id'        => $delivery_id,
                'tracking_code'      => $data['tracking_code'] ?? '',
                'pickup_address'     => $data['pickup_address'] ?? '',
                'delivery_address'   => $data['delivery_address'] ?? '',
                'package_type'       => $data['package_type'] ?? 'small',
                'distance_to_pickup' => round( $data['distance_to_pickup'] ?? 0, 1 ),
                'distance_km'        => round( $data['distance_km'] ?? 0, 1 ),
                'price'              => $data['price'] ?? 0,
                'driver_earning'     => $data['driver_earning'] ?? 0,
                'customer_name'      => $data['customer_name'] ?? '',
            );
        }

        wp_send_json_success( $results );
    }

    /**
     * AJAX: Driver rejects a delivery broadcast.
     */
    public function ajax_driver_reject() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        if ( ! $delivery_id ) {
            wp_send_json_error( array( 'message' => __( 'ID inválido.', 'tukitask-local-drivers' ) ) );
        }

        $user_id = get_current_user_id();
        $driver_post_id = $this->get_driver_post_id_by_user( $user_id );

        if ( ! $driver_post_id ) {
            wp_send_json_error( array( 'message' => __( 'No eres conductor.', 'tukitask-local-drivers' ) ) );
        }

        // Guardar rechazo para que no vuelva a aparecer
        $rejected = get_post_meta( $driver_post_id, '_rejected_deliveries', true ) ?: array();
        if ( ! in_array( $delivery_id, $rejected, true ) ) {
            $rejected[] = $delivery_id;
            update_post_meta( $driver_post_id, '_rejected_deliveries', $rejected );
        }

        // Limpiar broadcast de este driver
        Broadcast_Store::remove( $driver_post_id, $delivery_id, 'delivery' );

        wp_send_json_success( array( 'message' => __( 'Envío rechazado.', 'tukitask-local-drivers' ) ) );
    }

    /**
     * AJAX: Get the driver's active delivery (in progress).
     */
    public function ajax_get_active_delivery() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        $user_id = get_current_user_id();
        $driver_post_id = $this->get_driver_post_id_by_user( $user_id );

        if ( ! $driver_post_id ) {
            wp_send_json_success( array( 'active' => false ) );
            return;
        }

        $active_delivery_id = get_post_meta( $driver_post_id, '_driver_active_delivery', true );
        if ( ! $active_delivery_id ) {
            wp_send_json_success( array( 'active' => false ) );
            return;
        }

        $status = get_post_meta( $active_delivery_id, '_delivery_status', true );
        if ( in_array( $status, array( self::STATUS_DELIVERED, self::STATUS_CANCELLED ), true ) ) {
            delete_post_meta( $driver_post_id, '_driver_active_delivery' );
            wp_send_json_success( array( 'active' => false ) );
            return;
        }

        wp_send_json_success( array(
            'active'             => true,
            'delivery_id'        => $active_delivery_id,
            'tracking_code'      => get_post_meta( $active_delivery_id, '_tracking_code', true ),
            'status'             => $status,
            'status_label'       => $this->get_status_label( $status ),
            'pickup_address'     => get_post_meta( $active_delivery_id, '_pickup_address', true ),
            'pickup_lat'         => get_post_meta( $active_delivery_id, '_pickup_lat', true ),
            'pickup_lng'         => get_post_meta( $active_delivery_id, '_pickup_lng', true ),
            'pickup_contact'     => get_post_meta( $active_delivery_id, '_pickup_contact', true ),
            'pickup_phone'       => get_post_meta( $active_delivery_id, '_pickup_phone', true ),
            'delivery_address'   => get_post_meta( $active_delivery_id, '_delivery_address', true ),
            'delivery_lat'       => get_post_meta( $active_delivery_id, '_delivery_lat', true ),
            'delivery_lng'       => get_post_meta( $active_delivery_id, '_delivery_lng', true ),
            'delivery_contact'   => get_post_meta( $active_delivery_id, '_delivery_contact', true ),
            'delivery_phone'     => get_post_meta( $active_delivery_id, '_delivery_phone', true ),
            'package_type'       => get_post_meta( $active_delivery_id, '_package_type', true ),
            'price'              => get_post_meta( $active_delivery_id, '_delivery_price', true ),
        ) );
    }

    /**
     * Cron: Expand delivery search radius when no drivers found.
     *
     * @param int $delivery_id Delivery post ID.
     * @param int $attempt     Current attempt number.
     */
    public function expand_delivery_search( $delivery_id, $attempt = 2 ) {
        $status = get_post_meta( $delivery_id, '_delivery_status', true );
        if ( $status !== self::STATUS_SEARCHING ) {
            return;
        }

        // Re-broadcast with wider range (multiplied by attempt)
        update_post_meta( $delivery_id, '_broadcast_attempt', $attempt );
        $this->broadcast_delivery_to_drivers( $delivery_id, $attempt );

        // If still no drivers after 3 attempts, stop
        $notified = get_post_meta( $delivery_id, '_notified_drivers', true ) ?: array();
        if ( empty( $notified ) && $attempt < 3 ) {
            wp_schedule_single_event(
                time() + 90,
                'tukitask_expand_delivery_search',
                array( $delivery_id, $attempt + 1 )
            );
        }
    }

    /**
     * Helper: Get driver CPT post ID by user ID.
     *
     * @param int $user_id WordPress user ID.
     * @return int|false Driver post ID or false.
     */
    private function get_driver_post_id_by_user( $user_id ) {
        $drivers = get_posts( array(
            'post_type'      => 'tukitask_driver',
            'posts_per_page' => 1,
            'meta_key'       => '_driver_user_id',
            'meta_value'     => $user_id,
            'fields'         => 'ids',
        ) );
        return ! empty( $drivers ) ? $drivers[0] : false;
    }

    /**
     * AJAX: Client rates a driver after delivery.
     */
    public function ajax_rate_driver() {
        check_ajax_referer( 'tukitask_delivery_nonce', 'security' );

        if ( ! is_user_logged_in() ) {
            wp_send_json_error( array( 'message' => __( 'Debes iniciar sesión.', 'tukitask-local-drivers' ) ) );
        }

        $delivery_id = isset( $_POST['delivery_id'] ) ? intval( $_POST['delivery_id'] ) : 0;
        $rating      = isset( $_POST['rating'] ) ? floatval( $_POST['rating'] ) : 0;
        $comment     = isset( $_POST['comment'] ) ? sanitize_textarea_field( $_POST['comment'] ) : '';

        if ( ! $delivery_id || $rating < 1 || $rating > 5 ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        $user_id = get_current_user_id();
        $delivery = get_post( $delivery_id );

        if ( ! $delivery || $delivery->post_type !== self::POST_TYPE || intval( $delivery->post_author ) !== $user_id ) {
            wp_send_json_error( array( 'message' => __( 'Este envío no te pertenece.', 'tukitask-local-drivers' ) ) );
        }

        $driver_id = get_post_meta( $delivery_id, '_assigned_driver_id', true );
        if ( ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'No hay conductor asignado.', 'tukitask-local-drivers' ) ) );
        }

        if ( get_post_meta( $delivery_id, '_driver_rated', true ) ) {
            wp_send_json_error( array( 'message' => __( 'Ya calificaste este envío.', 'tukitask-local-drivers' ) ) );
        }

        $review_id = \Tukitask\LocalDrivers\Helpers\Review_Manager::add_review( array(
            'item_id'     => $delivery_id,
            'customer_id' => $user_id,
            'target_id'   => intval( $driver_id ),
            'target_type' => 'driver',
            'rating'      => $rating,
            'comment'     => $comment,
        ) );

        if ( $review_id ) {
            update_post_meta( $delivery_id, '_driver_rated', 1 );
            update_post_meta( $delivery_id, '_driver_rating', $rating );
            wp_send_json_success( array( 'message' => __( '¡Gracias por tu calificación!', 'tukitask-local-drivers' ) ) );
        } else {
            wp_send_json_error( array( 'message' => __( 'Error al guardar la calificación.', 'tukitask-local-drivers' ) ) );
        }
    }
}
