<?php
/**
 * REST API Orders Controller.
 *
 * @package Tukitask\LocalDrivers\Rest
 */

namespace Tukitask\LocalDrivers\Rest;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Orders_Controller Class.
 *
 * REST API endpoints for order management.
 */
class Orders_Controller extends \WP_REST_Controller {

	/**
	 * Namespace.
	 *
	 * @var string
	 */
	protected $namespace = 'tukitask/v1';

	/**
	 * Rest base.
	 *
	 * @var string
	 */
	protected $rest_base = 'orders';

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'rest_api_init', $this, 'register_routes' );
	}

	/**
	 * Register REST API routes.
	 */
	public function register_routes() {
		// Get driver's orders.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/driver/(?P<driver_id>[\d]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_driver_orders' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
					'args'                => array(
						'driver_id' => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
					),
				),
			)
		);

		// Update delivery status.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<order_id>[\d]+)/delivery-status',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_delivery_status' ),
					'permission_callback' => array( $this, 'update_item_permissions_check' ),
					'args'                => array(
						'order_id' => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
						'status'   => array(
							'required'          => true,
							'validate_callback' => function ( $param ) {
								return in_array( $param, array( 'picked_up', 'in_transit', 'nearby', 'delivered' ), true );
							},
						),
					),
				),
			)
		);

		// Get order tracking.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<order_id>[\d]+)/tracking',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_order_tracking' ),
					'permission_callback' => '__return_true', // Public endpoint with order key validation.
					'args'                => array(
						'order_id'  => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
						'order_key' => array(
							'required' => true,
						),
					),
				),
			)
		);

		// Get all active orders.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/active',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'permission_callback' => array( $this, 'get_admin_permissions_check' ),
				),
			)
		);

		// Get heatmap data (GeoJSON).
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/heatmap',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_heatmap_data' ),
					'permission_callback' => array( $this, 'get_admin_permissions_check' ),
				),
			)
		);
	}

	/**
	 * Get items permissions check.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|\WP_Error
	 */
	public function get_items_permissions_check( $request ) {
		return \Tukitask\LocalDrivers\Helpers\Security::validate_api_request( $request );
	}

	/**
	 * Update item permissions check.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|\WP_Error
	 */
	public function update_item_permissions_check( $request ) {
		if ( ! \Tukitask\LocalDrivers\Helpers\Security::can_access_driver_panel() ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'No tienes permisos para actualizar pedidos.', 'tukitask-local-drivers' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * Get driver's assigned orders.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_driver_orders( $request ) {
		$driver_id = intval( $request['driver_id'] );

		if ( 'tukitask_driver' !== get_post_type( $driver_id ) ) {
			return new \WP_Error(
				'rest_driver_invalid',
				__( 'Conductor no encontrado.', 'tukitask-local-drivers' ),
				array( 'status' => 404 )
			);
		}

		// Get orders assigned to this driver.
		$orders = wc_get_orders(
			array(
				'limit'      => 50,
				'meta_key'   => '_assigned_driver_id',
				'meta_value' => $driver_id,
				'status'     => array( 'processing', 'on-hold', 'pending', 'completed' ),
			)
		);

		$orders_data = array();

		foreach ( $orders as $order ) {
			$orders_data[] = array(
				'id'               => $order->get_id(),
				'number'           => $order->get_order_number(),
				'status'           => $order->get_status(),
				'delivery_status'  => $order->get_meta( '_delivery_status' ),
				'total'            => $order->get_total(),
				'customer_name'    => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
				'customer_phone'   => $order->get_billing_phone(),
				'shipping_address' => $order->get_formatted_shipping_address(),
				'shipping_lat'     => $order->get_meta( '_shipping_lat' ),
				'shipping_lng'     => $order->get_meta( '_shipping_lng' ),
				'date_created'     => $order->get_date_created()->date( 'c' ),
			);
		}

		return new \WP_REST_Response( $orders_data, 200 );
	}

	/**
	 * Update delivery status.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_delivery_status( $request ) {
		$order_id = intval( $request['order_id'] );
		$status   = sanitize_text_field( $request['status'] );

		$result = Order_Manager::update_delivery_status( $order_id, $status );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return new \WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Estado de entrega actualizado correctamente.', 'tukitask-local-drivers' ),
				'status'  => $status,
			),
			200
		);
	}

	/**
	 * Get order tracking information.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_order_tracking( $request ) {
		$order_id  = intval( $request['order_id'] );
		$order_key = sanitize_text_field( $request['order_key'] );

		$order = wc_get_order( $order_id );

		if ( ! $order || $order->get_order_key() !== $order_key ) {
			return new \WP_Error(
				'rest_order_invalid',
				__( 'Pedido no encontrado o clave inválida.', 'tukitask-local-drivers' ),
				array( 'status' => 404 )
			);
		}

		$driver_id       = $order->get_meta( '_assigned_driver_id' );
		$delivery_status = $order->get_meta( '_delivery_status' );
		$tracking_events = $order->get_meta( '_tracking_events' );

		$tracking_data = array(
			'order_id'        => $order->get_id(),
			'order_number'    => $order->get_order_number(),
			'order_status'    => $order->get_status(),
			'delivery_status' => $delivery_status ? $delivery_status : 'pending',
			'lat'             => floatval( $order->get_meta( '_shipping_lat' ) ),
			'lng'             => floatval( $order->get_meta( '_shipping_lng' ) ),
			'tracking_events' => is_array( $tracking_events ) ? $tracking_events : array(),
			'driver'          => null,
		);

		if ( $driver_id ) {
			$tracking_data['driver'] = array(
				'id'      => $driver_id,
				'name'    => get_the_title( $driver_id ),
				'lat'     => floatval( get_post_meta( $driver_id, '_driver_lat', true ) ),
				'lng'     => floatval( get_post_meta( $driver_id, '_driver_lng', true ) ),
				'vehicle' => get_post_meta( $driver_id, '_driver_vehicle', true ),
				'phone'   => get_post_meta( $driver_id, '_driver_phone', true ),
			);
		}

		return new \WP_REST_Response( $tracking_data, 200 );
	}

	public function get_admin_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Get all active orders.
	 */
	public function get_active_orders( $request ) {
		$orders = wc_get_orders( array(
			'limit'  => 100,
			'status' => array( 'processing', 'on-hold', 'pending' ), 
		) );

		$orders_data = array();

		foreach ( $orders as $order ) {
			$orders_data[] = array(
				'id'               => $order->get_id(),
				'number'           => $order->get_order_number(),
				'status'           => $order->get_status(),
				'delivery_status'  => $order->get_meta( '_delivery_status' ) ? $order->get_meta( '_delivery_status' ) : 'pending',
				'lat'              => $order->get_meta( '_shipping_lat' ),
				'lng'              => $order->get_meta( '_shipping_lng' ),
				'driver_id'        => $order->get_meta( '_assigned_driver_id' ),
				'total'            => $order->get_total(),
			);
		}

		return new \WP_REST_Response( $orders_data, 200 );
	}

	/**
	 * Get GeoJSON for heatmap visualization.
	 */
	public function get_heatmap_data( $request ) {
		global $wpdb;
		
		// Get all orders with locations from last 90 days
		$results = $wpdb->get_results( "
			SELECT m1.meta_value as lat, m2.meta_value as lng
			FROM {$wpdb->postmeta} m1
			JOIN {$wpdb->postmeta} m2 ON m1.post_id = m2.post_id
			JOIN {$wpdb->posts} p ON m1.post_id = p.ID
			WHERE m1.meta_key = '_shipping_lat' AND m2.meta_key = '_shipping_lng'
			AND p.post_type = 'shop_order'
			AND p.post_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
		" );

		$features = array();
		foreach ( $results as $row ) {
			$features[] = array(
				'type' => 'Feature',
				'geometry' => array(
					'type' => 'Point',
					'coordinates' => array( floatval( $row->lng ), floatval( $row->lat ) )
				)
			);
		}

		return new \WP_REST_Response( array(
			'type' => 'FeatureCollection',
			'features' => $features
		), 200 );
	}
}
