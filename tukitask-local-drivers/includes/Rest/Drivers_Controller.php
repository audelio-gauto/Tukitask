<?php
/**
 * REST API Drivers Controller.
 *
 * @package Tukitask\LocalDrivers\Rest
 */

namespace Tukitask\LocalDrivers\Rest;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Drivers_Controller Class.
 *
 * REST API endpoints for driver management.
 */
class Drivers_Controller extends \WP_REST_Controller {

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
	protected $rest_base = 'drivers';

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
		// Get all drivers.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'get_items_permissions_check' ),
				),
			)
		);

		// Get single driver.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<id>[\d]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_item' ),
					'permission_callback' => array( $this, 'get_item_permissions_check' ),
					'args'                => array(
						'id' => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
					),
				),
			)
		);

		// Update driver location.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<id>[\d]+)/location',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_location' ),
					'permission_callback' => array( $this, 'update_item_permissions_check' ),
					'args'                => array(
						'id'  => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
						'lat' => array(
							'required'          => true,
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
						'lng' => array(
							'required'          => true,
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
					),
				),
			)
		);

		// Update driver status.
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<id>[\d]+)/status',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_status' ),
					'permission_callback' => array( $this, 'update_item_permissions_check' ),
					'args'                => array(
						'id'     => array(
							'validate_callback' => function ( $param ) {
								return is_numeric( $param );
							},
						),
						'status' => array(
							'required'          => true,
							'validate_callback' => function ( $param ) {
								return in_array( $param, array( 'available', 'en_viaje', 'ocupado', 'offline' ), true );
							},
						),
					),
				),
			)
		);
	}

	/**
	 * Get items permissions check.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|WP_Error
	 */
	public function get_items_permissions_check( $request ) {
		return \Tukitask\LocalDrivers\Helpers\Security::validate_api_request( $request );
	}

	/**
	 * Get item permissions check.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|WP_Error
	 */
	public function get_item_permissions_check( $request ) {
		return \Tukitask\LocalDrivers\Helpers\Security::validate_api_request( $request );
	}

	/**
	 * Update item permissions check.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|WP_Error
	 */
	public function update_item_permissions_check( $request ) {
		// Simply check if user is logged in
		if ( ! is_user_logged_in() ) {
			return new \WP_Error(
				'rest_unauthorized',
				__( 'Debes iniciar sesión.', 'tukitask-local-drivers' ),
				array( 'status' => 401 )
			);
		}
		return true;
	}

	/**
	 * Get all drivers.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_items( $request ) {
		$args = array(
			'post_type'      => 'tukitask_driver',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
		);

		// Filter by status if provided.
		if ( ! empty( $request['status'] ) ) {
			$args['meta_query'] = array(
				array(
					'key'     => '_driver_status',
					'value'   => sanitize_text_field( $request['status'] ),
					'compare' => '=',
				),
			);
		}

		$query   = new \WP_Query( $args );
		$drivers = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$driver_id = get_the_ID();

				$user_id = get_post_meta( $driver_id, '_driver_user_id', true );
				$avatar_id = get_user_meta( $user_id, '_tukitask_driver_avatar_id', true );
				$avatar_url = $avatar_id ? wp_get_attachment_image_url( $avatar_id, 'thumbnail' ) : get_avatar_url( $user_id );

				$drivers[] = array(
					'id'               => $driver_id,
					'name'             => get_the_title(),
					'status'           => get_post_meta( $driver_id, '_driver_status', true ),
					'lat'              => floatval( get_post_meta( $driver_id, '_driver_lat', true ) ),
					'lng'              => floatval( get_post_meta( $driver_id, '_driver_lng', true ) ),
					'vehicle'          => get_user_meta( $user_id, '_driver_vehicle_type', true ),
					'avatar'           => $avatar_url,
					'active_trip'      => get_post_meta( $driver_id, '_driver_active_trip', true ),
					'total_deliveries' => intval( get_post_meta( $driver_id, '_driver_total_deliveries', true ) ),
				);
			}
			wp_reset_postdata();
		}

		return new \WP_REST_Response( $drivers, 200 );
	}

	/**
	 * Get single driver.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_item( $request ) {
		$driver_id = intval( $request['id'] );

		if ( 'tukitask_driver' !== get_post_type( $driver_id ) ) {
			return new \WP_Error(
				'rest_driver_invalid',
				__( 'Conductor no encontrado.', 'tukitask-local-drivers' ),
				array( 'status' => 404 )
			);
		}

		$driver = array(
			'id'               => $driver_id,
			'name'             => get_the_title( $driver_id ),
			'status'           => get_post_meta( $driver_id, '_driver_status', true ),
			'lat'              => floatval( get_post_meta( $driver_id, '_driver_lat', true ) ),
			'lng'              => floatval( get_post_meta( $driver_id, '_driver_lng', true ) ),
			'vehicle'          => get_post_meta( $driver_id, '_driver_vehicle', true ),
			'capacity'         => floatval( get_post_meta( $driver_id, '_driver_capacity', true ) ),
			'radius'           => floatval( get_post_meta( $driver_id, '_driver_radius', true ) ),
			'phone'            => get_post_meta( $driver_id, '_driver_phone', true ),
			'active_trip'      => get_post_meta( $driver_id, '_driver_active_trip', true ),
			'total_deliveries' => intval( get_post_meta( $driver_id, '_driver_total_deliveries', true ) ),
			'last_update'      => get_post_meta( $driver_id, '_driver_last_location_update', true ),
		);

		return new \WP_REST_Response( $driver, 200 );
	}

	/**
	 * Update driver location.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_location( $request ) {
		$driver_id = intval( $request['id'] );
		$lat       = floatval( $request['lat'] );
		$lng       = floatval( $request['lng'] );

		if ( 'tukitask_driver' !== get_post_type( $driver_id ) ) {
			return new \WP_Error(
				'rest_driver_invalid',
				__( 'Conductor no encontrado.', 'tukitask-local-drivers' ),
				array( 'status' => 404 )
			);
		}

		// Update location.
		update_post_meta( $driver_id, '_driver_lat', $lat );
		update_post_meta( $driver_id, '_driver_lng', $lng );
		update_post_meta( $driver_id, '_driver_last_location_update', current_time( 'timestamp' ) );

		// Sync Mobile Store location if active (with safety check).
		if ( class_exists( '\\Tukitask\\LocalDrivers\\Mobile_Store\\Activation' ) && 
		     method_exists( '\\Tukitask\\LocalDrivers\\Mobile_Store\\Activation', 'update_mobile_store_location' ) ) {
			\Tukitask\LocalDrivers\Mobile_Store\Activation::update_mobile_store_location( $driver_id, $lat, $lng );
		}

		// Store location history (with safety check).
		if ( method_exists( 'Tukitask\\LocalDrivers\\Drivers\\Driver_Availability', 'update_location_history' ) ) {
			Driver_Availability::update_location_history( $driver_id, $lat, $lng );
		}

		// NEW: Fire hook for Store Proximity detection (Llega Hoy activation)
		do_action( 'tukitask_driver_location_updated', $driver_id, $lat, $lng );

		// Proximity check for active trip.
		$proximity = $this->check_proximity( $driver_id, $lat, $lng );

		// Clear cache.
		Driver_Availability::clear_available_drivers_cache();

		return new \WP_REST_Response(
			array(
				'success'   => true,
				'message'   => __( 'Ubicación actualizada correctamente.', 'tukitask-local-drivers' ),
				'proximity' => $proximity,
			),
			200
		);
	}

	/**
	 * Check driver proximity to store and customer for active order.
	 *
	 * @param int   $driver_id Driver post ID.
	 * @param float $lat       Driver latitude.
	 * @param float $lng       Driver longitude.
	 * @return array Proximity data.
	 */
	private function check_proximity( $driver_id, $lat, $lng ) {
		$active_order_id = get_post_meta( $driver_id, '_driver_active_trip', true );
		if ( ! $active_order_id ) {
			return array();
		}

		$order = wc_get_order( $active_order_id );
		if ( ! $order ) {
			return array();
		}

		// Get driver ranges from user meta.
		$user_id        = get_post_meta( $driver_id, '_driver_user_id', true );
		$pickup_range   = floatval( get_user_meta( $user_id, '_driver_pickup_range', true ) );
		$delivery_range = floatval( get_user_meta( $user_id, '_driver_delivery_range', true ) );

		// Defaults if not configured (km).
		if ( $pickup_range <= 0 ) {
			$pickup_range = 0.5;
		}
		if ( $delivery_range <= 0 ) {
			$delivery_range = 0.5;
		}

		$result = array(
			'order_id'      => $active_order_id,
			'near_store'    => false,
			'near_customer' => false,
			'store_dist'    => null,
			'customer_dist' => null,
		);

		// Get store coordinates from vendor.
		$vendor_id = $order->get_meta( '_vendor_user_id' );
		if ( $vendor_id ) {
			$store_lat = floatval( get_user_meta( $vendor_id, '_vendedor_store_lat', true ) );
			$store_lng = floatval( get_user_meta( $vendor_id, '_vendedor_store_lng', true ) );

			if ( $store_lat && $store_lng ) {
				$store_dist = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $lat, $lng, $store_lat, $store_lng );
				$result['store_dist'] = round( $store_dist, 3 );
				$result['near_store'] = ( $store_dist <= $pickup_range );
			}
		}

		// Get customer coordinates from shipping address.
		$cust_lat = floatval( $order->get_meta( '_shipping_lat' ) );
		$cust_lng = floatval( $order->get_meta( '_shipping_lng' ) );

		if ( $cust_lat && $cust_lng ) {
			$cust_dist = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $lat, $lng, $cust_lat, $cust_lng );
			$result['customer_dist'] = round( $cust_dist, 3 );
			$result['near_customer'] = ( $cust_dist <= $delivery_range );
		}

		// Determine proximity label and persist on the order.
		$proximity_label = '';
		if ( $result['near_store'] ) {
			$proximity_label = 'near_store';
		}
		if ( $result['near_customer'] ) {
			$proximity_label = 'near_customer';
		}

		$old_proximity = $order->get_meta( '_driver_proximity' );
		if ( $proximity_label !== $old_proximity ) {
			$order->update_meta_data( '_driver_proximity', $proximity_label );
			$order->save();
		}

		return $result;
	}

	/**
	 * Update driver status.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_status( $request ) {
		$driver_id = intval( $request['id'] );
		$status    = sanitize_text_field( $request['status'] );

		if ( 'tukitask_driver' !== get_post_type( $driver_id ) ) {
			return new \WP_Error(
				'rest_driver_invalid',
				__( 'Conductor no encontrado.', 'tukitask-local-drivers' ),
				array( 'status' => 404 )
			);
		}

		// Update status and clear cache.
		Driver_Availability::update_driver_status( $driver_id, $status );

		return new \WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Estado actualizado correctamente.', 'tukitask-local-drivers' ),
				'status'  => $status,
			),
			200
		);
	}
}
