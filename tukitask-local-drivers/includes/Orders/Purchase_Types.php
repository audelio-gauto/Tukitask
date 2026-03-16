<?php
/**
 * Purchase Types System - Tipos de Compra
 * Normal, Llega Hoy, Tienda Móvil
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

/**
 * Purchase_Types Class.
 *
 * Gestiona los diferentes tipos de compra:
 * - Normal: Compra tradicional con envío estándar
 * - Llega Hoy: Compra con entrega el mismo día (driver cerca de la tienda)
 * - Tienda Móvil: Compra de productos que viajan con el driver
 */
class Purchase_Types {

    /**
     * Singleton instance.
     */
    private static $instance = null;

    /**
     * Purchase type constants.
     */
    const TYPE_NORMAL = 'normal';
    const TYPE_LLEGA_HOY = 'llega_hoy';
    const TYPE_TIENDA_MOVIL = 'tienda_movil';

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
        // Hooks para WooCommerce
        add_action( 'woocommerce_checkout_update_order_meta', array( $this, 'save_purchase_type' ), 10, 2 );
        add_filter( 'woocommerce_cart_shipping_method_full_label', array( $this, 'modify_shipping_label' ), 10, 2 );
        
        // Mostrar tipo de compra en admin y frontend
        add_action( 'woocommerce_admin_order_data_after_billing_address', array( $this, 'display_purchase_type_admin' ) );
        add_action( 'woocommerce_order_details_after_order_table', array( $this, 'display_purchase_type_frontend' ) );
        
        // AJAX handlers
        add_action( 'wp_ajax_tukitask_get_available_purchase_types', array( $this, 'ajax_get_available_types' ) );
        add_action( 'wp_ajax_nopriv_tukitask_get_available_purchase_types', array( $this, 'ajax_get_available_types' ) );
        add_action( 'wp_ajax_tukitask_set_purchase_type', array( $this, 'ajax_set_purchase_type' ) );
        add_action( 'wp_ajax_nopriv_tukitask_set_purchase_type', array( $this, 'ajax_set_purchase_type' ) );
        
        // Shortcodes
        add_shortcode( 'tukitask_purchase_type_selector', array( $this, 'render_purchase_type_selector' ) );
        add_shortcode( 'tukitask_productos_llega_hoy', array( $this, 'render_llega_hoy_products' ) );
        add_shortcode( 'tukitask_tienda_movil', array( $this, 'render_mobile_store_products' ) );
        
        // Enqueue scripts
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
        
        // Hook para procesar tipo de compra al agregar al carrito
        add_filter( 'woocommerce_add_cart_item_data', array( $this, 'add_purchase_type_to_cart' ), 10, 3 );
        add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'save_purchase_type_to_order_item' ), 10, 4 );
    }

    /**
     * Enqueue scripts and styles.
     */
    public function enqueue_scripts() {
        if ( is_product() || is_shop() || is_cart() || is_checkout() ) {
            wp_enqueue_style(
                'tukitask-purchase-types',
                plugins_url( 'assets/css/purchase-types.css', dirname( __DIR__, 2 ) . '/tukitask-local-drivers.php' ),
                array(),
                defined( 'TUKITASK_LD_VERSION' ) ? TUKITASK_LD_VERSION : '1.0.0'
            );

            wp_enqueue_script(
                'tukitask-purchase-types',
                plugins_url( 'assets/js/purchase-types.js', dirname( __DIR__, 2 ) . '/tukitask-local-drivers.php' ),
                array( 'jquery' ),
                defined( 'TUKITASK_LD_VERSION' ) ? TUKITASK_LD_VERSION : '1.0.0',
                true
            );

            wp_localize_script( 'tukitask-purchase-types', 'tukitaskPurchase', array(
                'ajaxUrl' => admin_url( 'admin-ajax.php' ),
                'nonce'   => wp_create_nonce( 'tukitask_purchase_nonce' ),
                'strings' => array(
                    'normal'       => __( 'Envío Normal', 'tukitask-local-drivers' ),
                    'llega_hoy'    => __( '¡Llega Hoy!', 'tukitask-local-drivers' ),
                    'tienda_movil' => __( 'Tienda Móvil', 'tukitask-local-drivers' ),
                    'loading'      => __( 'Verificando disponibilidad...', 'tukitask-local-drivers' ),
                    'unavailable'  => __( 'No disponible en tu zona', 'tukitask-local-drivers' ),
                ),
            ) );
        }
    }

    /**
     * Get available purchase types for a product based on user location.
     *
     * @param int   $product_id Product ID.
     * @param float $user_lat   User latitude.
     * @param float $user_lng   User longitude.
     * @return array
     */
    public function get_available_purchase_types( $product_id, $user_lat = null, $user_lng = null ) {
        $available = array();
        $product = wc_get_product( $product_id );
        
        if ( ! $product ) {
            return $available;
        }

        $vendor_id = get_post_field( 'post_author', $product_id );

        // 1. Normal - Siempre disponible si el producto está en stock
        if ( $product->is_in_stock() ) {
            $available[ self::TYPE_NORMAL ] = array(
                'type'        => self::TYPE_NORMAL,
                'label'       => __( 'Envío Normal', 'tukitask-local-drivers' ),
                'description' => __( 'Entrega estándar en 2-5 días hábiles', 'tukitask-local-drivers' ),
                'icon'        => '📦',
                'available'   => true,
                'eta'         => __( '2-5 días', 'tukitask-local-drivers' ),
            );
        }

        // 2. Llega Hoy - Disponible si hay driver cerca de la tienda
        if ( $product->is_in_stock() && $user_lat && $user_lng ) {
            $llega_hoy_data = $this->check_llega_hoy_availability( $product_id, $vendor_id, $user_lat, $user_lng );
            
            if ( $llega_hoy_data['available'] ) {
                $available[ self::TYPE_LLEGA_HOY ] = array(
                    'type'        => self::TYPE_LLEGA_HOY,
                    'label'       => __( '¡Llega Hoy!', 'tukitask-local-drivers' ),
                    'description' => sprintf( __( 'Entrega hoy antes de las %s', 'tukitask-local-drivers' ), $llega_hoy_data['eta'] ),
                    'icon'        => '⚡',
                    'available'   => true,
                    'eta'         => $llega_hoy_data['eta'],
                    'driver_id'   => $llega_hoy_data['driver_id'],
                    'extra_cost'  => $llega_hoy_data['extra_cost'],
                );
            }
        }

        // 3. Tienda Móvil - Disponible si hay driver con este producto cerca del usuario
        if ( $user_lat && $user_lng ) {
            $mobile_data = $this->check_mobile_store_availability( $product_id, $user_lat, $user_lng );
            
            if ( $mobile_data['available'] ) {
                $available[ self::TYPE_TIENDA_MOVIL ] = array(
                    'type'        => self::TYPE_TIENDA_MOVIL,
                    'label'       => __( 'Tienda Móvil', 'tukitask-local-drivers' ),
                    'description' => sprintf( __( 'Entrega en %d minutos (a %.1f km)', 'tukitask-local-drivers' ), $mobile_data['eta_minutes'], $mobile_data['distance'] ),
                    'icon'        => '🚗',
                    'available'   => true,
                    'eta'         => sprintf( __( '%d min', 'tukitask-local-drivers' ), $mobile_data['eta_minutes'] ),
                    'driver_id'   => $mobile_data['driver_id'],
                    'distance'    => $mobile_data['distance'],
                );
            }
        }

        return $available;
    }

    /**
     * Check Llega Hoy availability.
     *
     * @param int   $product_id Product ID.
     * @param int   $vendor_id  Vendor ID.
     * @param float $user_lat   User latitude.
     * @param float $user_lng   User longitude.
     * @return array
     */
    private function check_llega_hoy_availability( $product_id, $vendor_id, $user_lat, $user_lng ) {
        $result = array( 'available' => false );

        // Verificar si hay transient de Llega Hoy activo para este vendedor
        $llega_hoy_cache = get_transient( 'tukitask_store_proximity_llega_hoy_' . $vendor_id );
        
        if ( ! $llega_hoy_cache || empty( $llega_hoy_cache['active'] ) ) {
            return $result;
        }

        // Verificar hora límite (ej: hasta las 18:00)
        $cutoff_hour = intval( get_option( 'tukitask_llega_hoy_cutoff', 18 ) );
        $current_hour = intval( current_time( 'G' ) );
        
        if ( $current_hour >= $cutoff_hour ) {
            return $result;
        }

        // Obtener ubicación de la tienda
        $store_lat = get_user_meta( $vendor_id, '_vendedor_store_lat', true );
        $store_lng = get_user_meta( $vendor_id, '_vendedor_store_lng', true );

        if ( ! $store_lat || ! $store_lng ) {
            return $result;
        }

        // Verificar distancia del usuario a la tienda (máximo configurable)
        $max_delivery_distance = floatval( get_option( 'tukitask_llega_hoy_max_distance', 15 ) );
        $user_to_store = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $user_lat, $user_lng, $store_lat, $store_lng );

        if ( $user_to_store > $max_delivery_distance ) {
            return $result;
        }

        // Calcular ETA
        $estimated_minutes = ceil( ( $user_to_store / 30 ) * 60 ) + 30; // 30 km/h + 30 min preparación
        $delivery_time = strtotime( '+' . $estimated_minutes . ' minutes' );
        
        $result = array(
            'available'  => true,
            'driver_id'  => $llega_hoy_cache['driver_id'] ?? null,
            'eta'        => date_i18n( 'H:i', $delivery_time ),
            'extra_cost' => floatval( get_option( 'tukitask_llega_hoy_extra_cost', 0 ) ),
        );

        return $result;
    }

    /**
     * Check Mobile Store availability.
     *
     * @param int   $product_id Product ID.
     * @param float $user_lat   User latitude.
     * @param float $user_lng   User longitude.
     * @return array
     */
    private function check_mobile_store_availability( $product_id, $user_lat, $user_lng ) {
        $result = array( 'available' => false );

        // Verificar si el producto está marcado para tienda móvil
        $is_mobile_stock = get_post_meta( $product_id, '_tukitask_is_mobile_stock', true );
        if ( $is_mobile_stock !== 'yes' ) {
            return $result;
        }

        // Buscar drivers cercanos que tengan este producto
        $max_distance = floatval( get_option( 'tukitask_mobile_store_max_distance', 5 ) );
        $lat_range = $max_distance / 111.0;
        $lng_range = $max_distance / ( 111.0 * cos( deg2rad( $user_lat ) ) );

        $args = array(
            'post_type'      => 'tukitask_driver',
            'post_status'    => 'publish',
            'posts_per_page' => 10,
            'meta_query'     => array(
                'relation' => 'AND',
                array(
                    'key'     => '_driver_status',
                    'value'   => array( 'available', 'en_viaje' ),
                    'compare' => 'IN',
                ),
                array(
                    'key'     => '_driver_lat',
                    'value'   => array( $user_lat - $lat_range, $user_lat + $lat_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
                array(
                    'key'     => '_driver_lng',
                    'value'   => array( $user_lng - $lng_range, $user_lng + $lng_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
            ),
        );

        $query = new \WP_Query( $args );
        $nearest_driver = null;
        $min_distance = PHP_FLOAT_MAX;

        if ( $query->have_posts() ) {
            while ( $query->have_posts() ) {
                $query->the_post();
                $driver_id = get_the_ID();

                // Verificar si el driver tiene este producto en su stock móvil
                $mobile_stock = get_post_meta( $driver_id, '_driver_mobile_stock_products', true );
                if ( ! is_array( $mobile_stock ) || ! in_array( $product_id, $mobile_stock ) ) {
                    continue;
                }

                // Calcular distancia
                $driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
                $driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );
                $distance = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $user_lat, $user_lng, $driver_lat, $driver_lng );

                if ( $distance < $min_distance && $distance <= $max_distance ) {
                    $min_distance = $distance;
                    $nearest_driver = $driver_id;
                }
            }
            wp_reset_postdata();
        }

        if ( $nearest_driver ) {
            $eta_minutes = ceil( ( $min_distance / 25 ) * 60 ); // 25 km/h en ciudad
            $eta_minutes = max( 10, $eta_minutes ); // Mínimo 10 minutos

            $result = array(
                'available'   => true,
                'driver_id'   => $nearest_driver,
                'distance'    => round( $min_distance, 1 ),
                'eta_minutes' => $eta_minutes,
            );
        }

        return $result;
    }

    /**
     * AJAX: Get available purchase types for a product.
     */
    public function ajax_get_available_types() {
        $product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
        $user_lat = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : null;
        $user_lng = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : null;

        if ( ! $product_id ) {
            wp_send_json_error( array( 'message' => __( 'Producto no válido.', 'tukitask-local-drivers' ) ) );
        }

        $available_types = $this->get_available_purchase_types( $product_id, $user_lat, $user_lng );

        wp_send_json_success( array(
            'types'      => $available_types,
            'product_id' => $product_id,
        ) );
    }

    /**
     * AJAX: Set purchase type in session.
     */
    public function ajax_set_purchase_type() {
        check_ajax_referer( 'tukitask_purchase_nonce', 'nonce' );

        $purchase_type = isset( $_POST['type'] ) ? sanitize_text_field( $_POST['type'] ) : '';
        $product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;

        if ( ! in_array( $purchase_type, array( self::TYPE_NORMAL, self::TYPE_LLEGA_HOY, self::TYPE_TIENDA_MOVIL ) ) ) {
            wp_send_json_error( array( 'message' => __( 'Tipo de compra no válido.', 'tukitask-local-drivers' ) ) );
        }

        // Guardar en sesión
        if ( ! WC()->session ) {
            WC()->session = new \WC_Session_Handler();
            WC()->session->init();
        }

        $purchase_data = WC()->session->get( 'tukitask_purchase_types' ) ?: array();
        $purchase_data[ $product_id ] = array(
            'type'      => $purchase_type,
            'driver_id' => $driver_id,
        );
        WC()->session->set( 'tukitask_purchase_types', $purchase_data );

        wp_send_json_success( array(
            'message' => sprintf( __( 'Tipo de compra actualizado: %s', 'tukitask-local-drivers' ), $this->get_type_label( $purchase_type ) ),
        ) );
    }

    /**
     * Add purchase type to cart item data.
     *
     * @param array $cart_item_data Cart item data.
     * @param int   $product_id     Product ID.
     * @param int   $variation_id   Variation ID.
     * @return array
     */
    public function add_purchase_type_to_cart( $cart_item_data, $product_id, $variation_id ) {
        if ( ! WC()->session ) {
            return $cart_item_data;
        }

        $purchase_data = WC()->session->get( 'tukitask_purchase_types' ) ?: array();
        $id = $variation_id ?: $product_id;

        if ( isset( $purchase_data[ $id ] ) ) {
            $cart_item_data['tukitask_purchase_type'] = $purchase_data[ $id ]['type'];
            $cart_item_data['tukitask_assigned_driver'] = $purchase_data[ $id ]['driver_id'];
        }

        return $cart_item_data;
    }

    /**
     * Save purchase type to order item.
     *
     * @param \WC_Order_Item_Product $item         Order item.
     * @param string                 $cart_item_key Cart item key.
     * @param array                  $values        Cart item values.
     * @param \WC_Order              $order         Order.
     */
    public function save_purchase_type_to_order_item( $item, $cart_item_key, $values, $order ) {
        if ( isset( $values['tukitask_purchase_type'] ) ) {
            $item->add_meta_data( '_tukitask_purchase_type', $values['tukitask_purchase_type'], true );
        }
        if ( isset( $values['tukitask_assigned_driver'] ) ) {
            $item->add_meta_data( '_tukitask_assigned_driver', $values['tukitask_assigned_driver'], true );
        }
    }

    /**
     * Save purchase type to order.
     *
     * @param int   $order_id Order ID.
     * @param array $data     Posted data.
     */
    public function save_purchase_type( $order_id, $data ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        // Determinar el tipo de compra principal del pedido
        $types_in_order = array();
        foreach ( $order->get_items() as $item ) {
            $type = $item->get_meta( '_tukitask_purchase_type' );
            if ( $type ) {
                $types_in_order[] = $type;
            }
        }

        // Prioridad: tienda_movil > llega_hoy > normal
        if ( in_array( self::TYPE_TIENDA_MOVIL, $types_in_order ) ) {
            $main_type = self::TYPE_TIENDA_MOVIL;
        } elseif ( in_array( self::TYPE_LLEGA_HOY, $types_in_order ) ) {
            $main_type = self::TYPE_LLEGA_HOY;
        } else {
            $main_type = self::TYPE_NORMAL;
        }

        $order->update_meta_data( '_tukitask_purchase_type', $main_type );
        $order->save();
    }

    /**
     * Modify shipping label based on purchase type.
     *
     * @param string            $label  Label.
     * @param \WC_Shipping_Rate $method Shipping method.
     * @return string
     */
    public function modify_shipping_label( $label, $method ) {
        if ( strpos( $method->get_method_id(), 'tukitask_local_driver' ) !== false ) {
            // Check for special purchase types in cart
            if ( WC()->cart ) {
                foreach ( WC()->cart->get_cart() as $cart_item ) {
                    if ( isset( $cart_item['tukitask_purchase_type'] ) ) {
                        $type = $cart_item['tukitask_purchase_type'];
                        if ( $type === self::TYPE_LLEGA_HOY ) {
                            $label .= ' <span class="tuki-badge llega-hoy">⚡ ¡Llega Hoy!</span>';
                        } elseif ( $type === self::TYPE_TIENDA_MOVIL ) {
                            $label .= ' <span class="tuki-badge tienda-movil">🚗 Tienda Móvil</span>';
                        }
                        break;
                    }
                }
            }
        }
        return $label;
    }

    /**
     * Display purchase type in admin order.
     *
     * @param \WC_Order $order Order.
     */
    public function display_purchase_type_admin( $order ) {
        $type = $order->get_meta( '_tukitask_purchase_type' );
        if ( ! $type ) {
            return;
        }

        $label = $this->get_type_label( $type );
        $icon = $this->get_type_icon( $type );

        echo '<p><strong>' . esc_html__( 'Tipo de Compra:', 'tukitask-local-drivers' ) . '</strong><br>';
        echo '<span class="tuki-purchase-type-badge type-' . esc_attr( $type ) . '">' . $icon . ' ' . esc_html( $label ) . '</span>';
        echo '</p>';
    }

    /**
     * Display purchase type on frontend order details.
     *
     * @param \WC_Order $order Order.
     */
    public function display_purchase_type_frontend( $order ) {
        $type = $order->get_meta( '_tukitask_purchase_type' );
        if ( ! $type || $type === self::TYPE_NORMAL ) {
            return;
        }

        $label = $this->get_type_label( $type );
        $icon = $this->get_type_icon( $type );

        echo '<section class="tuki-purchase-type-info">';
        echo '<h2>' . esc_html__( 'Tipo de Envío', 'tukitask-local-drivers' ) . '</h2>';
        echo '<div class="tuki-purchase-type-badge type-' . esc_attr( $type ) . '">';
        echo $icon . ' ' . esc_html( $label );
        echo '</div>';
        echo '</section>';
    }

    /**
     * Render purchase type selector shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_purchase_type_selector( $atts = array() ) {
        $atts = shortcode_atts( array(
            'product_id' => 0,
        ), $atts );

        $product_id = $atts['product_id'] ?: get_the_ID();

        ob_start();
        ?>
        <div class="tuki-purchase-type-selector" data-product-id="<?php echo esc_attr( $product_id ); ?>">
            <div class="tuki-purchase-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <?php esc_html_e( 'Verificando disponibilidad...', 'tukitask-local-drivers' ); ?>
            </div>
            <div class="tuki-purchase-options" style="display:none;"></div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render Llega Hoy products shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_llega_hoy_products( $atts = array() ) {
        $atts = shortcode_atts( array(
            'limit'   => 12,
            'columns' => 4,
        ), $atts );

        // Obtener vendedores con Llega Hoy activo
        global $wpdb;
        $active_vendors = $wpdb->get_col(
            "SELECT REPLACE(option_name, '_transient_tukitask_store_proximity_llega_hoy_', '') 
             FROM {$wpdb->options} 
             WHERE option_name LIKE '_transient_tukitask_store_proximity_llega_hoy_%'"
        );

        if ( empty( $active_vendors ) ) {
            return '<div class="tuki-empty-state">' .
                   '<i class="fas fa-clock"></i>' .
                   '<p>' . __( 'No hay productos con entrega Llega Hoy disponibles en este momento.', 'tukitask-local-drivers' ) . '</p>' .
                   '</div>';
        }

        // Obtener productos de esos vendedores
        $args = array(
            'post_type'      => 'product',
            'post_status'    => 'publish',
            'posts_per_page' => intval( $atts['limit'] ),
            'author__in'     => array_map( 'intval', $active_vendors ),
            'meta_query'     => array(
                array(
                    'key'     => '_stock_status',
                    'value'   => 'instock',
                    'compare' => '=',
                ),
            ),
        );

        $products = new \WP_Query( $args );

        if ( ! $products->have_posts() ) {
            return '<div class="tuki-empty-state">' .
                   '<p>' . __( 'No hay productos disponibles.', 'tukitask-local-drivers' ) . '</p>' .
                   '</div>';
        }

        ob_start();
        ?>
        <div class="tuki-llega-hoy-section">
            <div class="tuki-section-header">
                <h2><span class="tuki-badge-icon">⚡</span> <?php esc_html_e( '¡Llega Hoy!', 'tukitask-local-drivers' ); ?></h2>
                <p><?php esc_html_e( 'Productos con entrega el mismo día', 'tukitask-local-drivers' ); ?></p>
            </div>
            <ul class="products columns-<?php echo esc_attr( $atts['columns'] ); ?>">
                <?php
                while ( $products->have_posts() ) {
                    $products->the_post();
                    wc_get_template_part( 'content', 'product' );
                }
                wp_reset_postdata();
                ?>
            </ul>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render Mobile Store products shortcode.
     *
     * @param array $atts Shortcode attributes.
     * @return string
     */
    public function render_mobile_store_products( $atts = array() ) {
        $atts = shortcode_atts( array(
            'limit'    => 12,
            'columns'  => 4,
            'distance' => 5, // km
        ), $atts );

        ob_start();
        ?>
        <div class="tuki-mobile-store-section" data-max-distance="<?php echo esc_attr( $atts['distance'] ); ?>">
            <div class="tuki-section-header">
                <h2><span class="tuki-badge-icon">🚗</span> <?php esc_html_e( 'Tienda Móvil', 'tukitask-local-drivers' ); ?></h2>
                <p><?php esc_html_e( 'Productos cerca de ti en este momento', 'tukitask-local-drivers' ); ?></p>
            </div>
            <div class="tuki-mobile-products-loading">
                <i class="fas fa-location-arrow"></i>
                <p><?php esc_html_e( 'Buscando productos cerca de ti...', 'tukitask-local-drivers' ); ?></p>
            </div>
            <div class="tuki-mobile-products-container" style="display:none;">
                <ul class="products columns-<?php echo esc_attr( $atts['columns'] ); ?>"></ul>
            </div>
            <div class="tuki-mobile-products-empty" style="display:none;">
                <i class="fas fa-map-marker-alt"></i>
                <p><?php esc_html_e( 'No hay productos de tienda móvil cerca de ti en este momento.', 'tukitask-local-drivers' ); ?></p>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Get type label.
     *
     * @param string $type Type.
     * @return string
     */
    private function get_type_label( $type ) {
        $labels = array(
            self::TYPE_NORMAL       => __( 'Envío Normal', 'tukitask-local-drivers' ),
            self::TYPE_LLEGA_HOY    => __( '¡Llega Hoy!', 'tukitask-local-drivers' ),
            self::TYPE_TIENDA_MOVIL => __( 'Tienda Móvil', 'tukitask-local-drivers' ),
        );
        return isset( $labels[ $type ] ) ? $labels[ $type ] : $type;
    }

    /**
     * Get type icon.
     *
     * @param string $type Type.
     * @return string
     */
    private function get_type_icon( $type ) {
        $icons = array(
            self::TYPE_NORMAL       => '📦',
            self::TYPE_LLEGA_HOY    => '⚡',
            self::TYPE_TIENDA_MOVIL => '🚗',
        );
        return isset( $icons[ $type ] ) ? $icons[ $type ] : '📦';
    }
}
