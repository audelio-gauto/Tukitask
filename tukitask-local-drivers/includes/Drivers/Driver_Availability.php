<?php
/**
 * Driver Availability Management.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Driver_Availability Class.
 *
 * Manages driver availability status and location updates.
 */
class Driver_Availability {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'init', $this, 'register_availability_endpoint' );
		$loader->add_action( 'wp_ajax_tukitask_update_driver_status', $this, 'ajax_update_driver_status' );
		$loader->add_action( 'wp_ajax_tukitask_update_driver_location', $this, 'ajax_update_driver_location' );
	}

	/**
	 * Register custom endpoint for driver availability.
	 */
	public function register_availability_endpoint() {
		add_rewrite_endpoint( 'driver-status', EP_ROOT | EP_PAGES );
	}

	/**
	 * AJAX handler to update driver status.
	 */
	public function ajax_update_driver_status() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! current_user_can( 'tukitask_driver_access' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
		$status    = isset( $_POST['status'] ) ? sanitize_text_field( $_POST['status'] ) : '';

		if ( ! $driver_id || ! in_array( $status, array( 'available', 'en_viaje', 'ocupado', 'offline' ), true ) ) {
			wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
		}

		// Verify user owns this driver.
		$user_id        = get_current_user_id();
		$driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );

		if ( intval( $driver_user_id ) !== $user_id && ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para modificar este conductor.', 'tukitask-local-drivers' ) ) );
		}

		// Update status using Driver_Manager.
		Driver_Manager::update_status( $driver_id, $status );

		wp_send_json_success(
			array(
				'message' => __( 'Estado actualizado correctamente.', 'tukitask-local-drivers' ),
				'status'  => $status,
			)
		);
	}

	/**
	 * AJAX handler to update driver location.
	 */
	public function ajax_update_driver_location() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! current_user_can( 'tukitask_driver_access' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
		$lat       = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : 0;
		$lng       = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : 0;

		if ( ! $driver_id || ! $lat || ! $lng ) {
			wp_send_json_error( array( 'message' => __( 'Datos de ubicación inválidos.', 'tukitask-local-drivers' ) ) );
		}

		// Verify user owns this driver.
		$user_id        = get_current_user_id();
		$driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );

		if ( intval( $driver_user_id ) !== $user_id && ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para modificar este conductor.', 'tukitask-local-drivers' ) ) );
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
		if ( method_exists( __CLASS__, 'update_location_history' ) ) {
			self::update_location_history( $driver_id, $lat, $lng );
		}

		wp_send_json_success(
			array(
				'message' => __( 'Ubicación actualizada correctamente.', 'tukitask-local-drivers' ),
				'lat'     => $lat,
				'lng'     => $lng,
			)
		);
	}

	/**
	 * Update driver location history.
	 *
	 * @param int   $driver_id Driver ID.
	 * @param float $lat       Latitude.
	 * @param float $lng       Longitude.
	 */
	public static function update_location_history( $driver_id, $lat, $lng ) {
		$history = get_post_meta( $driver_id, '_driver_location_history', true );
		$history = is_array( $history ) ? $history : array();

		$history[] = array(
			'lat'       => $lat,
			'lng'       => $lng,
			'timestamp' => current_time( 'timestamp' ),
		);

		// Keep only last 10 positions.
		if ( count( $history ) > 10 ) {
			$history = array_slice( $history, -10 );
		}

		update_post_meta( $driver_id, '_driver_location_history', $history );
	}

	/**
	 * Clears all available-driver caches by bumping a generation counter.
	 * Uses wp_cache (Redis/Memcached when available) instead of LIKE queries on wp_options.
	 */
	public static function clear_available_drivers_cache() {
		$gen = absint( get_option( 'tukitask_drivers_cache_gen', 0 ) ) + 1;
		update_option( 'tukitask_drivers_cache_gen', $gen, true );
	}

	/**
	 * Update driver status and clear cache.
	 *
	 * @param int    $driver_id Driver ID.
	 * @param string $status    Status.
	 * @return bool
	 */
	public static function update_driver_status( $driver_id, $status ) {
		return Driver_Manager::update_status( $driver_id, $status );
	}

	/**
	 * Get available drivers within radius of a location.
	 *
	 * @param float $lat      Latitude.
	 * @param float $lng      Longitude.
	 * @param float $max_distance Maximum distance in km.
	 * @return array Array of driver IDs.
	 */
	public static function get_available_drivers( $lat, $lng, $max_distance = null ) {
		if ( null === $max_distance ) {
			$max_distance = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );
		}

		// Try to get from cache (generation-based invalidation).
		$gen       = absint( get_option( 'tukitask_drivers_cache_gen', 0 ) );
		$cache_key = 'tuki_drv_' . $gen . '_' . md5( $lat . $lng . $max_distance );
		$cached    = wp_cache_get( $cache_key, 'tukitask_drivers' );

		if ( false !== $cached ) {
			return $cached;
		}

		// SQL Optimization: Calculate a bounding box (approx +/- 0.5 deg is roughly 50km)
		// This drastically reduces the number of post objects WP needs to load.
		$lat_range = $max_distance / 111.0; // 1 degree lat is ~111km
		$lng_range = $max_distance / ( 111.0 * cos( deg2rad( $lat ) ) );

		$args = array(
			'post_type'      => 'tukitask_driver',
			'post_status'    => 'publish',
			'posts_per_page' => 100, // Safety limit for extreme density
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
		);

		$query   = new \WP_Query( $args );
		$drivers = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$driver_id = get_the_ID();

				$driver_lat    = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
				$driver_lng    = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );
				$driver_radius = floatval( get_post_meta( $driver_id, '_driver_radius', true ) );

				// Default radius to max_distance if driver hasn't configured one.
				if ( $driver_radius <= 0 ) {
					$driver_radius = $max_distance;
				}

				// Fine-grained Haversine distance check
				$distance = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $lat, $lng, $driver_lat, $driver_lng );

				if ( $distance <= $driver_radius && $distance <= $max_distance ) {
					if ( ! Driver_Manager::is_at_capacity( $driver_id ) ) {
						$drivers[] = array(
							'id'       => $driver_id,
							'distance' => $distance,
						);
					}
				}
			}
			wp_reset_postdata();
		}

		// Sort by distance.
		usort(
			$drivers,
			function ( $a, $b ) {
				return $a['distance'] <=> $b['distance'];
			}
		);

		// Cache for 5 minutes using wp_cache (uses Redis/Memcached when available).
		$cache_duration = intval( get_option( 'tukitask_ld_cache_duration', 300 ) );
		wp_cache_set( $cache_key, $drivers, 'tukitask_drivers', $cache_duration );

		return $drivers;
	}
}
