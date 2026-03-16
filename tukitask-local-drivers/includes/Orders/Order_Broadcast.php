<?php
/**
 * Order Broadcast System - Notifica a drivers cercanos y gestiona aceptación.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;
use Tukitask\LocalDrivers\Helpers\Broadcast_Store;
use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Helpers\Distance;

/**
 * Order_Broadcast Class.
 *
 * Sistema de broadcast de pedidos a drivers cercanos.
 * El primer driver que acepta gana la carrera.
 */
class Order_Broadcast {

    /**
     * Singleton instance.
     */
    private static $instance = null;

    /**
     * Número de drivers a notificar por lote.
     */
    const BATCH_SIZE = 100;

    /**
     * Tiempo de espera antes de ampliar búsqueda (segundos).
     */
    const WAIT_TIME = 60;

    /**
     * Máximo de intentos de broadcast.
     */
    const MAX_ATTEMPTS = 3;

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
        // AJAX handlers para drivers
        add_action( 'wp_ajax_tukitask_accept_broadcast_order', array( $this, 'ajax_accept_order' ) );
        add_action( 'wp_ajax_tukitask_reject_broadcast_order', array( $this, 'ajax_reject_order' ) );
        add_action( 'wp_ajax_tukitask_get_broadcast_orders', array( $this, 'ajax_get_broadcast_orders' ) );
        
        // AJAX para vendedor - reintentar búsqueda
        add_action( 'wp_ajax_tukitask_retry_driver_search', array( $this, 'ajax_retry_driver_search' ) );
        add_action( 'wp_ajax_tukitask_check_order_assignment', array( $this, 'ajax_check_assignment_status' ) );
        
        // Cron para expandir búsqueda
        add_action( 'tukitask_expand_driver_search', array( $this, 'expand_driver_search' ), 10, 2 );
        
        // Hook cuando pedido está listo para retiro
        add_action( 'tukitask_order_ready_for_pickup', array( $this, 'broadcast_to_nearby_drivers' ), 20, 2 );
    }

    /**
     * Iniciar broadcast a drivers cercanos cuando el pedido está listo.
     *
     * @param int $order_id  Order ID.
     * @param int $vendor_id Vendor user ID.
     */
    public function broadcast_to_nearby_drivers( $order_id, $vendor_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        // Verificar que no tenga driver asignado ya
        if ( $order->get_meta( '_assigned_driver_id' ) ) {
            return;
        }

        // Obtener coordenadas de la tienda
        $store_coords = $this->get_store_coordinates( $order, $vendor_id );
        if ( ! $store_coords ) {
            $order->add_order_note( __( '❌ No se puede asignar driver: tienda sin ubicación configurada.', 'tukitask-local-drivers' ) );
            $order->update_meta_data( '_broadcast_status', 'failed_no_location' );
            $order->save();
            return;
        }

        // Obtener coordenadas de entrega
        $delivery_coords = Geo::get_order_coordinates( $order );

        // Inicializar datos de broadcast
        $broadcast_data = array(
            'order_id'        => $order_id,
            'vendor_id'       => $vendor_id,
            'store_lat'       => $store_coords['lat'],
            'store_lng'       => $store_coords['lng'],
            'delivery_lat'    => $delivery_coords ? $delivery_coords['lat'] : null,
            'delivery_lng'    => $delivery_coords ? $delivery_coords['lng'] : null,
            'attempt'         => 1,
            'notified_drivers' => array(),
            'rejected_drivers' => array(),
            'started_at'      => current_time( 'timestamp' ),
            'last_expanded_at' => current_time( 'timestamp' ),
        );

        $order->update_meta_data( '_broadcast_data', $broadcast_data );
        $order->update_meta_data( '_broadcast_status', 'searching' );
        $order->save();

        // Buscar y notificar a los primeros 100 drivers
        $this->notify_driver_batch( $order_id, $broadcast_data );
    }

    /**
     * Notificar a un lote de drivers cercanos.
     *
     * @param int   $order_id       Order ID.
     * @param array $broadcast_data Broadcast data.
     */
    private function notify_driver_batch( $order_id, $broadcast_data ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        // Calcular rango de búsqueda basado en intento
        $base_range = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );
        $search_range = $base_range * $broadcast_data['attempt'];

        // Obtener drivers disponibles que no han sido notificados
        $available_drivers = $this->get_eligible_drivers(
            $broadcast_data['store_lat'],
            $broadcast_data['store_lng'],
            $broadcast_data['delivery_lat'],
            $broadcast_data['delivery_lng'],
            $search_range,
            $broadcast_data['notified_drivers'],
            $broadcast_data['rejected_drivers']
        );

        if ( empty( $available_drivers ) ) {
            // No hay más drivers disponibles
            if ( $broadcast_data['attempt'] >= self::MAX_ATTEMPTS ) {
                $this->mark_no_drivers_available( $order, $broadcast_data );
            } else {
                // Programar expansión de búsqueda
                wp_schedule_single_event(
                    time() + self::WAIT_TIME,
                    'tukitask_expand_driver_search',
                    array( $order_id, $broadcast_data['attempt'] + 1 )
                );
                
                $order->add_order_note(
                    sprintf(
                        __( '🔍 Buscando drivers (intento %d/%d). Esperando %d segundos...', 'tukitask-local-drivers' ),
                        $broadcast_data['attempt'],
                        self::MAX_ATTEMPTS,
                        self::WAIT_TIME
                    )
                );
            }
            return;
        }

        // Limitar a BATCH_SIZE drivers
        $drivers_to_notify = array_slice( $available_drivers, 0, self::BATCH_SIZE );
        $notified_ids = array();

        foreach ( $drivers_to_notify as $driver_data ) {
            $driver_id = $driver_data['id'];
            $notified_ids[] = $driver_id;

            // Crear entrada de broadcast para el driver
            $this->create_driver_broadcast_entry( $order_id, $driver_id, $driver_data );

            // Enviar push notification al driver
            $this->send_driver_push_notification( $driver_id, $order, $driver_data );
        }

        // Actualizar broadcast data
        $broadcast_data['notified_drivers'] = array_merge(
            $broadcast_data['notified_drivers'],
            $notified_ids
        );

        $order->update_meta_data( '_broadcast_data', $broadcast_data );
        $order->add_order_note(
            sprintf(
                __( '📡 Broadcast enviado a %d drivers cercanos (intento %d).', 'tukitask-local-drivers' ),
                count( $notified_ids ),
                $broadcast_data['attempt']
            )
        );
        $order->save();
    }

    /**
     * Obtener drivers elegibles para el pedido.
     *
     * @param float $store_lat      Latitud de la tienda.
     * @param float $store_lng      Longitud de la tienda.
     * @param float $delivery_lat   Latitud de entrega.
     * @param float $delivery_lng   Longitud de entrega.
     * @param float $max_range      Rango máximo de búsqueda.
     * @param array $exclude_ids    IDs a excluir (ya notificados).
     * @param array $rejected_ids   IDs que rechazaron.
     * @return array
     */
    private function get_eligible_drivers( $store_lat, $store_lng, $delivery_lat, $delivery_lng, $max_range, $exclude_ids = array(), $rejected_ids = array() ) {
        // Obtener todos los drivers activos en el área
        $all_excluded = array_merge( $exclude_ids, $rejected_ids );

        // Query optimizada con bounding box
        $lat_range = $max_range / 111.0;
        $lng_range = $max_range / ( 111.0 * cos( deg2rad( $store_lat ) ) );

        $args = array(
            'post_type'      => 'tukitask_driver',
            'post_status'    => 'publish',
            'posts_per_page' => 500, // Pool grande para filtrar
            'post__not_in'   => $all_excluded,
            'meta_query'     => array(
                'relation' => 'AND',
                array(
                    'key'     => '_driver_status',
                    'value'   => array( 'available' ),
                    'compare' => 'IN',
                ),
                array(
                    'key'     => '_driver_lat',
                    'value'   => array( $store_lat - $lat_range, $store_lat + $lat_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
                array(
                    'key'     => '_driver_lng',
                    'value'   => array( $store_lng - $lng_range, $store_lng + $lng_range ),
                    'type'    => 'DECIMAL(10,6)',
                    'compare' => 'BETWEEN',
                ),
            ),
        );

        $query = new \WP_Query( $args );
        $eligible_drivers = array();

        if ( $query->have_posts() ) {
            while ( $query->have_posts() ) {
                $query->the_post();
                $driver_id = get_the_ID();

                // Obtener configuración del driver
                $driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
                $driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );
                $pickup_range = floatval( get_post_meta( $driver_id, '_driver_pickup_range', true ) ) ?: 10;
                $delivery_range = floatval( get_post_meta( $driver_id, '_driver_delivery_range', true ) ) ?: 15;
                $driver_radius = floatval( get_post_meta( $driver_id, '_driver_radius', true ) ) ?: 20;

                // Calcular distancia a la tienda (recogida)
                $pickup_distance = Distance::haversine( $driver_lat, $driver_lng, $store_lat, $store_lng );

                // Verificar si está dentro del rango de recogida del driver
                if ( $pickup_distance > $pickup_range && $pickup_distance > $driver_radius ) {
                    continue;
                }

                // Si hay coordenadas de entrega, verificar rango de entrega
                $delivery_distance = 0;
                if ( $delivery_lat && $delivery_lng ) {
                    $delivery_distance = Distance::haversine( $store_lat, $store_lng, $delivery_lat, $delivery_lng );
                    
                    // Verificar si la entrega está dentro del rango del driver
                    if ( $delivery_distance > $delivery_range ) {
                        continue;
                    }
                }

                // Verificar que no esté en capacidad máxima
                if ( \Tukitask\LocalDrivers\Drivers\Driver_Manager::is_at_capacity( $driver_id ) ) {
                    continue;
                }

                // Verificar tipos de pedido que acepta
                $accepts_woo = get_post_meta( $driver_id, '_driver_accepts_woo_orders', true ) !== 'no';
                $accepts_packages = get_post_meta( $driver_id, '_driver_accepts_packages', true ) === 'yes';

                $eligible_drivers[] = array(
                    'id'                => $driver_id,
                    'pickup_distance'   => $pickup_distance,
                    'delivery_distance' => $delivery_distance,
                    'total_distance'    => $pickup_distance + $delivery_distance,
                    'accepts_woo'       => $accepts_woo,
                    'accepts_packages'  => $accepts_packages,
                );
            }
            wp_reset_postdata();
        }

        // Ordenar por distancia total
        usort( $eligible_drivers, function( $a, $b ) {
            return $a['total_distance'] <=> $b['total_distance'];
        });

        return $eligible_drivers;
    }

    /**
     * Crear entrada de broadcast para un driver específico.
     *
     * @param int   $order_id    Order ID.
     * @param int   $driver_id   Driver ID.
     * @param array $driver_data Driver data.
     */
    private function create_driver_broadcast_entry( $order_id, $driver_id, $driver_data ) {
        Broadcast_Store::add( $driver_id, $order_id, 'order', array(
            'pickup_distance'   => $driver_data['pickup_distance'],
            'delivery_distance' => $driver_data['delivery_distance'],
            'total_distance'    => $driver_data['total_distance'],
        ), 300 );
    }

    /**
     * Enviar push notification al driver.
     *
     * @param int       $driver_id Driver ID.
     * @param \WC_Order $order     Order object.
     * @param array     $driver_data Driver data.
     */
    private function send_driver_push_notification( $driver_id, $order, $driver_data ) {
        $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
        if ( ! $driver_user_id ) {
            return;
        }

        $order_id = $order->get_id();
        $total = $order->get_total();
        $vendor_name = $this->get_vendor_name_from_order( $order );

        // Calcular ganancia estimada
        $commission_rate = floatval( get_option( 'tukitask_ld_driver_commission', 15 ) );
        $estimated_earning = ( $total * $commission_rate ) / 100;

        $notification_data = array(
            'title'    => __( '🚗 ¡Nuevo pedido disponible!', 'tukitask-local-drivers' ),
            'body'     => sprintf(
                __( '%s - %.1f km de recogida. Ganancia estimada: %s', 'tukitask-local-drivers' ),
                $vendor_name,
                $driver_data['pickup_distance'],
                wc_price( $estimated_earning )
            ),
            'icon'     => 'delivery',
            'data'     => array(
                'type'              => 'new_order_broadcast',
                'order_id'          => $order_id,
                'pickup_distance'   => $driver_data['pickup_distance'],
                'delivery_distance' => $driver_data['delivery_distance'],
                'estimated_earning' => $estimated_earning,
                'actions'           => array(
                    array( 'action' => 'accept', 'title' => __( 'Aceptar', 'tukitask-local-drivers' ) ),
                    array( 'action' => 'reject', 'title' => __( 'Rechazar', 'tukitask-local-drivers' ) ),
                ),
            ),
            'url'      => home_url( '/driver-dashboard/?action=accept_order&order_id=' . $order_id ),
            'tag'      => 'order_broadcast_' . $order_id,
        );

        // Usar Push_Manager si existe
        if ( class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $driver_user_id,
                $notification_data['title'],
                $notification_data['body'],
                $notification_data['url'],
                $notification_data['data']
            );
        }

        // También guardar en notificaciones internas
        $this->save_internal_notification( $driver_user_id, $notification_data );
    }

    /**
     * Guardar notificación interna para el driver.
     */
    private function save_internal_notification( $user_id, $notification_data ) {
        $notifications_key = 'tukitask_driver_notifications_' . $user_id;
        $notifications = get_transient( $notifications_key ) ?: array();

        array_unshift( $notifications, array(
            'id'         => uniqid( 'notif_' ),
            'title'      => $notification_data['title'],
            'body'       => $notification_data['body'],
            'data'       => $notification_data['data'],
            'url'        => $notification_data['url'],
            'read'       => false,
            'created_at' => current_time( 'timestamp' ),
        ));

        // Mantener solo últimas 50 notificaciones
        $notifications = array_slice( $notifications, 0, 50 );

        set_transient( $notifications_key, $notifications, DAY_IN_SECONDS );
    }

    /**
     * AJAX: Driver acepta el pedido.
     */
    public function ajax_accept_order() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        if ( ! current_user_can( 'tukitask_driver_access' ) && ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;

        // Auto-detect driver_id from current user if not provided
        if ( ! $driver_id ) {
            $user_id = get_current_user_id();
            $driver_posts = get_posts( array(
                'post_type'   => 'tukitask_driver',
                'meta_key'    => '_driver_user_id',
                'meta_value'  => $user_id,
                'fields'      => 'ids',
                'numberposts' => 1,
            ) );
            $driver_id = ! empty( $driver_posts ) ? $driver_posts[0] : 0;
        }

        if ( ! $order_id || ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        // Verificar que el driver pertenece al usuario actual
        $user_id = get_current_user_id();
        $driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
        
        if ( intval( $driver_user_id ) !== $user_id && ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'No tienes permiso para este conductor.', 'tukitask-local-drivers' ) ) );
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
        }

        // CARRERA: Verificar si ya fue asignado a otro driver
        $current_driver = $order->get_meta( '_assigned_driver_id' );
        if ( $current_driver ) {
            wp_send_json_error( array(
                'message' => __( '¡Demasiado tarde! Este pedido ya fue tomado por otro conductor.', 'tukitask-local-drivers' ),
                'already_taken' => true,
            ) );
        }

        // LOCK: Usar transient para evitar race conditions
        $lock_key = 'tukitask_order_lock_' . $order_id;
        if ( get_transient( $lock_key ) ) {
            wp_send_json_error( array(
                'message' => __( 'Pedido en proceso de asignación. Intenta de nuevo.', 'tukitask-local-drivers' ),
                'retry' => true,
            ) );
        }

        // Establecer lock por 5 segundos
        set_transient( $lock_key, $driver_id, 5 );

        // Asignar driver al pedido
        $order->update_meta_data( '_assigned_driver_id', $driver_id );
        $order->update_meta_data( '_driver_assigned_at', current_time( 'timestamp' ) );
        $order->update_meta_data( '_driver_assignment_method', 'broadcast_accepted' );
        $order->update_meta_data( '_driver_accepted', 'yes' );
        $order->update_meta_data( '_broadcast_status', 'assigned' );
        $order->update_meta_data( '_delivery_status', 'driver_assigned' );

        $driver_name = get_the_title( $driver_id );
        $order->add_order_note(
            sprintf(
                __( '✅ Conductor %s aceptó el pedido (vía broadcast).', 'tukitask-local-drivers' ),
                $driver_name
            )
        );
        $order->save();

        // Actualizar estado del driver
        update_post_meta( $driver_id, '_driver_active_trip', $order_id );
        update_post_meta( $driver_id, '_driver_status', 'en_viaje' );

        // Limpiar broadcast del orden
        $this->cleanup_order_broadcast( $order_id );

        // Limpiar caches
        Driver_Availability::clear_available_drivers_cache();
        delete_transient( $lock_key );

        // Notificar al vendedor
        $this->notify_vendor_driver_assigned( $order, $driver_id );

        do_action( 'tukitask_driver_assigned', $order_id, $driver_id );

        wp_send_json_success( array(
            'message'  => __( '¡Pedido aceptado! Dirígete a recoger el pedido.', 'tukitask-local-drivers' ),
            'order_id' => $order_id,
            'redirect' => home_url( '/driver-dashboard/?order_id=' . $order_id ),
        ) );
    }

    /**
     * AJAX: Driver rechaza el pedido.
     */
    public function ajax_reject_order() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        if ( ! current_user_can( 'tukitask_driver_access' ) && ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
        $driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
        $reason = isset( $_POST['reason'] ) ? sanitize_text_field( $_POST['reason'] ) : '';

        // Auto-detect driver_id from current user if not provided
        if ( ! $driver_id ) {
            $user_id = get_current_user_id();
            $driver_posts = get_posts( array(
                'post_type'   => 'tukitask_driver',
                'meta_key'    => '_driver_user_id',
                'meta_value'  => $user_id,
                'fields'      => 'ids',
                'numberposts' => 1,
            ) );
            $driver_id = ! empty( $driver_posts ) ? $driver_posts[0] : 0;
        }

        if ( ! $order_id || ! $driver_id ) {
            wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
        }

        // Actualizar broadcast data con driver rechazado
        $broadcast_data = $order->get_meta( '_broadcast_data' );
        if ( is_array( $broadcast_data ) ) {
            $broadcast_data['rejected_drivers'][] = $driver_id;
            $order->update_meta_data( '_broadcast_data', $broadcast_data );
            $order->save();
        }

        // Limpiar broadcast del driver para este pedido
        Broadcast_Store::remove( $driver_id, $order_id, 'order' );

        wp_send_json_success( array(
            'message' => __( 'Pedido rechazado.', 'tukitask-local-drivers' ),
        ) );
    }

    /**
     * Expandir búsqueda de drivers (llamado por cron).
     *
     * @param int $order_id Order ID.
     * @param int $attempt  Número de intento.
     */
    public function expand_driver_search( $order_id, $attempt ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        // Verificar que no tenga driver asignado ya
        if ( $order->get_meta( '_assigned_driver_id' ) ) {
            return;
        }

        $broadcast_data = $order->get_meta( '_broadcast_data' );
        if ( ! is_array( $broadcast_data ) ) {
            return;
        }

        // Actualizar intento
        $broadcast_data['attempt'] = $attempt;
        $broadcast_data['last_expanded_at'] = current_time( 'timestamp' );
        $order->update_meta_data( '_broadcast_data', $broadcast_data );
        $order->save();

        // Notificar a nuevo lote de drivers
        $this->notify_driver_batch( $order_id, $broadcast_data );
    }

    /**
     * Marcar pedido sin drivers disponibles.
     *
     * @param \WC_Order $order          Order object.
     * @param array     $broadcast_data Broadcast data.
     */
    private function mark_no_drivers_available( $order, $broadcast_data ) {
        $order->update_meta_data( '_broadcast_status', 'no_drivers' );
        $order->update_meta_data( '_no_drivers_at', current_time( 'timestamp' ) );
        $order->add_order_note(
            __( '❌ No hay conductores disponibles. El vendedor puede reintentar la búsqueda.', 'tukitask-local-drivers' )
        );
        $order->save();

        // Notificar al vendedor
        $this->notify_vendor_no_drivers( $order );
    }

    /**
     * Notificar al vendedor que no hay drivers disponibles.
     *
     * @param \WC_Order $order Order object.
     */
    private function notify_vendor_no_drivers( $order ) {
        $vendor_id = null;
        foreach ( $order->get_items() as $item ) {
            $product_id = $item->get_product_id();
            $vendor_id = get_post_field( 'post_author', $product_id );
            if ( $vendor_id ) break;
        }

        if ( ! $vendor_id ) {
            return;
        }

        if ( class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $vendor_id,
                __( '⚠️ No hay conductores disponibles', 'tukitask-local-drivers' ),
                sprintf(
                    __( 'No encontramos conductores para el pedido #%s. Puedes reintentar la búsqueda desde tu panel.', 'tukitask-local-drivers' ),
                    $order->get_order_number()
                ),
                home_url( '/vendedor-dashboard/?order_id=' . $order->get_id() )
            );
        }
    }

    /**
     * Notificar al vendedor que un driver fue asignado.
     *
     * @param \WC_Order $order     Order object.
     * @param int       $driver_id Driver ID.
     */
    private function notify_vendor_driver_assigned( $order, $driver_id ) {
        $vendor_id = null;
        foreach ( $order->get_items() as $item ) {
            $product_id = $item->get_product_id();
            $vendor_id = get_post_field( 'post_author', $product_id );
            if ( $vendor_id ) break;
        }

        if ( ! $vendor_id ) {
            return;
        }

        $driver_name = get_the_title( $driver_id );
        $driver_phone = get_post_meta( $driver_id, '_driver_phone', true );

        if ( class_exists( '\\Tukitask\\LocalDrivers\\Helpers\\Push_Manager' ) ) {
            \Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $vendor_id,
                __( '✅ Conductor asignado', 'tukitask-local-drivers' ),
                sprintf(
                    __( '%s recogerá el pedido #%s. Tel: %s', 'tukitask-local-drivers' ),
                    $driver_name,
                    $order->get_order_number(),
                    $driver_phone ?: 'N/A'
                ),
                home_url( '/vendedor-dashboard/?order_id=' . $order->get_id() )
            );
        }
    }

    /**
     * AJAX: Vendedor reintenta búsqueda de driver.
     */
    public function ajax_retry_driver_search() {
        check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
        if ( ! $order_id ) {
            wp_send_json_error( array( 'message' => __( 'ID de pedido inválido.', 'tukitask-local-drivers' ) ) );
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
        }

        // Verificar que el vendedor tiene permiso sobre este pedido
        $user_id = get_current_user_id();
        $is_owner = false;
        foreach ( $order->get_items() as $item ) {
            $product = $item->get_product();
            if ( $product && (int) get_post_field( 'post_author', $product->get_id() ) === $user_id ) {
                $is_owner = true;
                break;
            }
        }

        if ( ! $is_owner && ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'No tienes permisos sobre este pedido.', 'tukitask-local-drivers' ) ) );
        }

        // Resetear broadcast data
        $broadcast_data = array(
            'order_id'         => $order_id,
            'vendor_id'        => $user_id,
            'store_lat'        => get_user_meta( $user_id, '_vendedor_store_lat', true ),
            'store_lng'        => get_user_meta( $user_id, '_vendedor_store_lng', true ),
            'delivery_lat'     => $order->get_meta( '_delivery_lat' ),
            'delivery_lng'     => $order->get_meta( '_delivery_lng' ),
            'attempt'          => 1,
            'notified_drivers' => array(),
            'rejected_drivers' => array(),
            'started_at'       => current_time( 'timestamp' ),
            'last_expanded_at' => current_time( 'timestamp' ),
        );

        $order->update_meta_data( '_broadcast_data', $broadcast_data );
        $order->update_meta_data( '_broadcast_status', 'searching' );
        $order->add_order_note( __( '🔄 Vendedor reinició la búsqueda de conductores.', 'tukitask-local-drivers' ) );
        $order->save();

        // Iniciar nuevo broadcast
        $this->notify_driver_batch( $order_id, $broadcast_data );

        wp_send_json_success( array(
            'message' => __( 'Búsqueda reiniciada. Buscando conductores cercanos...', 'tukitask-local-drivers' ),
        ) );
    }

    /**
     * AJAX: Verificar estado de asignación del pedido.
     */
    public function ajax_check_assignment_status() {
        check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

        $order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
        if ( ! $order_id ) {
            wp_send_json_error( array( 'message' => __( 'ID inválido.', 'tukitask-local-drivers' ) ) );
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
        }

        $broadcast_status = $order->get_meta( '_broadcast_status' );
        $assigned_driver = $order->get_meta( '_assigned_driver_id' );
        $broadcast_data = $order->get_meta( '_broadcast_data' );

        $response = array(
            'status'          => $broadcast_status ?: 'none',
            'driver_assigned' => ! empty( $assigned_driver ),
            'driver_name'     => $assigned_driver ? get_the_title( $assigned_driver ) : null,
            'driver_phone'    => $assigned_driver ? get_post_meta( $assigned_driver, '_driver_phone', true ) : null,
            'attempt'         => isset( $broadcast_data['attempt'] ) ? $broadcast_data['attempt'] : 0,
            'notified_count'  => isset( $broadcast_data['notified_drivers'] ) ? count( $broadcast_data['notified_drivers'] ) : 0,
            'can_retry'       => $broadcast_status === 'no_drivers',
        );

        wp_send_json_success( $response );
    }

    /**
     * Limpiar datos de broadcast cuando se asigna un driver.
     *
     * @param int $order_id Order ID.
     */
    private function cleanup_order_broadcast( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        $broadcast_data = $order->get_meta( '_broadcast_data' );
        if ( ! is_array( $broadcast_data ) || empty( $broadcast_data['notified_drivers'] ) ) {
            return;
        }

        // Limpiar todos los broadcasts de este pedido de una sola query
        Broadcast_Store::remove_all_for_item( $order_id, 'order' );

        // Cancelar cron jobs pendientes
        wp_clear_scheduled_hook( 'tukitask_expand_driver_search', array( $order_id ) );
    }

    /**
     * Obtener coordenadas de la tienda para un pedido.
     *
     * @param \WC_Order $order     Order object.
     * @param int       $vendor_id Vendor ID.
     * @return array|false
     */
    private function get_store_coordinates( $order, $vendor_id = null ) {
        if ( ! $vendor_id ) {
            foreach ( $order->get_items() as $item ) {
                $product_id = $item->get_product_id();
                $vendor_id = get_post_field( 'post_author', $product_id );
                if ( $vendor_id ) break;
            }
        }

        if ( ! $vendor_id ) {
            return false;
        }

        $store_lat = get_user_meta( $vendor_id, '_vendedor_store_lat', true );
        $store_lng = get_user_meta( $vendor_id, '_vendedor_store_lng', true );

        if ( $store_lat && $store_lng ) {
            return array(
                'lat' => floatval( $store_lat ),
                'lng' => floatval( $store_lng ),
            );
        }

        // Fallback a Dokan
        if ( function_exists( 'dokan_get_store_info' ) ) {
            $store_info = dokan_get_store_info( $vendor_id );
            if ( ! empty( $store_info['location'] ) ) {
                $parts = explode( ',', $store_info['location'] );
                if ( count( $parts ) >= 2 ) {
                    return array(
                        'lat' => floatval( trim( $parts[0] ) ),
                        'lng' => floatval( trim( $parts[1] ) ),
                    );
                }
            }
        }

        return false;
    }

    /**
     * Obtener nombre del vendedor desde el pedido.
     *
     * @param \WC_Order $order Order object.
     * @return string
     */
    private function get_vendor_name_from_order( $order ) {
        foreach ( $order->get_items() as $item ) {
            $product_id = $item->get_product_id();
            $vendor_id = get_post_field( 'post_author', $product_id );
            if ( $vendor_id ) {
                $vendor = get_user_by( 'id', $vendor_id );
                return $vendor ? $vendor->display_name : __( 'Tienda', 'tukitask-local-drivers' );
            }
        }
        return __( 'Tienda', 'tukitask-local-drivers' );
    }

    /**
     * AJAX: Driver polls for available broadcast orders.
     */
    public function ajax_get_broadcast_orders() {
        check_ajax_referer( 'tukitask_driver_action', 'nonce' );

        if ( ! current_user_can( 'tukitask_driver_access' ) && ! current_user_can( 'manage_options' ) ) {
            wp_send_json_success( array( 'orders' => array() ) );
        }

        $user_id = get_current_user_id();

        // Get driver post ID
        $driver_posts = get_posts( array(
            'post_type'   => 'tukitask_driver',
            'meta_key'    => '_driver_user_id',
            'meta_value'  => $user_id,
            'fields'      => 'ids',
            'numberposts' => 1,
        ) );
        $driver_post_id = ! empty( $driver_posts ) ? $driver_posts[0] : 0;

        if ( ! $driver_post_id ) {
            wp_send_json_success( array( 'orders' => array() ) );
        }

        $broadcasts = self::get_pending_broadcasts_for_driver( $driver_post_id );
        $data = array();

        foreach ( $broadcasts as $order_id => $bcast ) {
            $order = wc_get_order( $order_id );
            if ( ! $order ) continue;

            // Get pickup info from vendor
            $pickup_address = '';
            $vendor_name = '';
            $vendor_phone = '';
            $items = $order->get_items();
            if ( ! empty( $items ) ) {
                $first_item = reset( $items );
                $product_id = $first_item->get_product_id();
                $vendor_id = get_post_field( 'post_author', $product_id );
                $pickup_address = trim( get_user_meta( $vendor_id, 'billing_address_1', true ) . ', ' . get_user_meta( $vendor_id, 'billing_city', true ), ', ' );
                $vendor_user = get_userdata( $vendor_id );
                if ( $vendor_user ) {
                    $vendor_name = $vendor_user->display_name;
                    $vendor_phone = get_user_meta( $vendor_id, 'billing_phone', true );
                }
            }

            $delivery_address = $order->get_shipping_address_1() . ', ' . $order->get_shipping_city();

            $data[] = array(
                'order_id'          => $order_id,
                'order_number'      => $order->get_order_number(),
                'customer_name'     => $order->get_formatted_billing_full_name(),
                'pickup_address'    => $pickup_address,
                'delivery_address'  => $delivery_address,
                'total'             => floatval( $order->get_total() ),
                'items_count'       => $order->get_item_count(),
                'vendor_name'       => $vendor_name,
                'payment_method'    => $order->get_payment_method_title(),
                'pickup_distance'   => round( $bcast['pickup_distance'] ?? 0, 1 ),
                'delivery_distance' => round( $bcast['delivery_distance'] ?? 0, 1 ),
            );
        }

        wp_send_json_success( array( 'orders' => $data ) );
    }

    /**
     * Obtener pedidos de broadcast pendientes para un driver.
     *
     * @param int $driver_id Driver ID.
     * @return array
     */
    public static function get_pending_broadcasts_for_driver( $driver_id ) {
        $broadcasts = Broadcast_Store::get_for_driver( $driver_id, 'order' );
        $valid_broadcasts = array();

        foreach ( $broadcasts as $order_id => $data ) {
            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                continue;
            }

            if ( $order->get_meta( '_assigned_driver_id' ) ) {
                // Already assigned — clean stale row
                Broadcast_Store::remove( $driver_id, $order_id, 'order' );
                continue;
            }

            $data['order'] = array(
                'id'            => $order_id,
                'number'        => $order->get_order_number(),
                'total'         => $order->get_total(),
                'items_count'   => $order->get_item_count(),
                'vendor_name'   => self::instance()->get_vendor_name_from_order( $order ),
                'delivery_address' => $order->get_shipping_address_1() ?: $order->get_billing_address_1(),
            );

            $valid_broadcasts[ $order_id ] = $data;
        }

        return $valid_broadcasts;
    }
}
