<?php
/**
 * Driver Management Service.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Driver_Manager Class.
 *
 * Centralizes logic for driver mapping, metadata synchronization, and status management.
 */
class Driver_Manager {

	/**
	 * Mappings cache.
	 *
	 * @var array
	 */
	private static $user_to_driver = array();

	/**
	 * Get Driver Post ID from User ID.
	 *
	 * @param int $user_id WordPress User ID.
	 * @return int Driver Post ID or 0 if not found.
	 */
	public static function get_driver_id_by_user( $user_id ) {
		if ( isset( self::$user_to_driver[ $user_id ] ) ) {
			return self::$user_to_driver[ $user_id ];
		}

		$args = array(
			'post_type'      => 'tukitask_driver',
			'meta_key'       => '_driver_user_id',
			'meta_value'     => $user_id,
			'fields'         => 'ids',
			'posts_per_page' => 1,
			'no_found_rows'  => true,
		);

		$posts = get_posts( $args );
		$driver_id = ! empty( $posts ) ? $posts[0] : 0;

		self::$user_to_driver[ $user_id ] = $driver_id;

		return $driver_id;
	}

	/**
	 * Ensure metadata is synchronized between User and Post.
	 *
	 * @param int   $driver_id Driver Post ID.
	 * @param array $data      Metadata to sync.
	 */
	public static function sync_driver_data( $driver_id, $data ) {
		$user_id = get_post_meta( $driver_id, '_driver_user_id', true );
		if ( ! $user_id ) {
			return;
		}

		$sync_map = array(
			'vehicle_type'   => array( '_driver_vehicle', '_driver_vehicle_type' ),
			'license_plate'  => array( '_driver_license', '_driver_license_plate' ),
			'pickup_range'   => array( '_driver_radius', '_driver_pickup_range' ),
			'delivery_range' => array( '_driver_radius', '_driver_delivery_range' ), // Often same, but we can treat radius as primary
		);

		foreach ( $data as $key => $value ) {
			// Update matching user meta
			update_user_meta( $user_id, '_driver_' . $key, $value );

			// Update matching post meta based on map
			if ( isset( $sync_map[ $key ] ) ) {
				foreach ( $sync_map[ $key ] as $meta_key ) {
					update_post_meta( $driver_id, $meta_key, $value );
				}
			}
		}

		// Special case: Unify generic radius with specific ranges if provided
		if ( isset( $data['pickup_range'] ) ) {
			update_post_meta( $driver_id, '_driver_radius', $data['pickup_range'] );
		}
	}

	/**
	 * Update driver status with cache clearing.
	 *
	 * @param int    $driver_id Driver Post ID.
	 * @param string $status    Status slug.
	 * @return bool
	 */
	public static function update_status( $driver_id, $status ) {
		update_post_meta( $driver_id, '_driver_status', $status );
		update_post_meta( $driver_id, '_driver_last_status_update', current_time( 'timestamp' ) );

		Driver_Availability::clear_available_drivers_cache();

		return true;
	}

	/**
	 * Record driver location update.
	 *
	 * @param int   $driver_id Driver Post ID.
	 * @param float $lat       Latitude.
	 * @param float $lng       Longitude.
	 */
	public static function update_location( $driver_id, $lat, $lng ) {
		update_post_meta( $driver_id, '_driver_lat', $lat );
		update_post_meta( $driver_id, '_driver_lng', $lng );
		update_post_meta( $driver_id, '_driver_last_location_update', current_time( 'timestamp' ) );

		Driver_Availability::clear_available_drivers_cache();
	}

	/**
	 * Get total active orders for a driver.
	 */
	public static function get_active_orders_count( $driver_id ) {
		$args = array(
			'limit'      => -1,
			'return'     => 'ids',
			'meta_query' => array(
				'relation' => 'AND',
				array(
					'key'     => '_assigned_driver_id',
					'value'   => $driver_id,
					'compare' => '=',
				),
				array(
					'key'     => '_delivery_status',
					'value'   => 'delivered',
					'compare' => '!=',
				),
			),
		);
		$orders = wc_get_orders( $args );
		return count( $orders );
	}

	/**
	 * Check if driver is at batch capacity (3).
	 */
	public static function is_at_capacity( $driver_id ) {
		return self::get_active_orders_count( $driver_id ) >= 3;
	}
}
