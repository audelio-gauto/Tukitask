<?php
/**
 * Store Proximity Service.
 *
 * Detects when drivers are near stores and activates "Llega Hoy" for products.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Helpers\Push_Manager;

/**
 * Store_Proximity_Service Class.
 *
 * Manages real-time detection of drivers near vendor stores.
 */
class Store_Proximity_Service {

	/**
	 * Cache key prefix for store proximity.
	 */
	const CACHE_PREFIX = 'tukitask_store_proximity_';

	/**
	 * Cache duration (2 minutes for real-time updates).
	 */
	const CACHE_DURATION = 120;

	/**
	 * Default radius to consider a driver "near" a store (in km).
	 */
	const DEFAULT_LLEGA_HOY_RADIUS = 5;

	/**
	 * Constructor - Register hooks.
	 *
	 * @param object|null $loader Hook loader instance.
	 */
	public function __construct( $loader = null ) {
		if ( $loader ) {
			// Hook into driver location updates
			$loader->add_action( 'tukitask_driver_location_updated', $this, 'on_driver_location_update', 10, 3 );
			
			// Schedule cron for periodic checks
			$loader->add_action( 'init', $this, 'schedule_proximity_cron' );
			$loader->add_action( 'tukitask_check_store_proximity', $this, 'check_all_active_drivers' );
		}
	}

	/**
	 * Schedule the proximity check cron job.
	 */
	public function schedule_proximity_cron() {
		if ( ! wp_next_scheduled( 'tukitask_check_store_proximity' ) ) {
			wp_schedule_event( time(), 'every_five_minutes', 'tukitask_check_store_proximity' );
		}
	}

	/**
	 * Hook called when a driver updates their location.
	 *
	 * @param int   $driver_id Driver post ID.
	 * @param float $lat       New latitude.
	 * @param float $lng       New longitude.
	 */
	public function on_driver_location_update( $driver_id, $lat, $lng ) {
		// Check if driver is available
		$status = get_post_meta( $driver_id, '_driver_status', true );
		if ( 'available' !== $status ) {
			return;
		}

		// Get driver's vendor (employer)
		$driver_vendor_id = get_post_meta( $driver_id, '_driver_user_id', true );
		if ( ! $driver_vendor_id ) {
			return;
		}

		// Check proximity to all stores
		$nearby_stores = $this->find_nearby_stores( $lat, $lng );

		if ( ! empty( $nearby_stores ) ) {
			foreach ( $nearby_stores as $store_data ) {
				$this->activate_llega_hoy_for_store( $store_data['vendor_id'], $driver_id, $store_data['distance'] );
			}
		}

		// Update driver's "near store" status
		$this->update_driver_store_proximity( $driver_id, $nearby_stores );
	}

	/**
	 * Find all stores within the "Llega Hoy" radius of a location.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @return array Array of store data with vendor_id and distance.
	 */
	public function find_nearby_stores( $lat, $lng ) {
		$radius = floatval( get_option( 'tukitask_ld_llega_hoy_radius', self::DEFAULT_LLEGA_HOY_RADIUS ) );
		$nearby = array();

		// Get all vendors with store locations
		$vendors = $this->get_all_vendor_stores();

		foreach ( $vendors as $vendor ) {
			$distance = Distance::haversine( $lat, $lng, $vendor['lat'], $vendor['lng'] );

			if ( $distance <= $radius ) {
				$nearby[] = array(
					'vendor_id'   => $vendor['vendor_id'],
					'vendor_name' => $vendor['name'],
					'distance'    => $distance,
					'lat'         => $vendor['lat'],
					'lng'         => $vendor['lng'],
				);
			}
		}

		// Sort by distance
		usort( $nearby, function( $a, $b ) {
			return $a['distance'] <=> $b['distance'];
		});

		return $nearby;
	}

	/**
	 * Get all vendor stores with their locations.
	 *
	 * @return array Array of vendor data.
	 */
	private function get_all_vendor_stores() {
		$cache_key = self::CACHE_PREFIX . 'all_stores';
		$cached = get_transient( $cache_key );

		if ( false !== $cached ) {
			return $cached;
		}

		$stores = array();

		// Query users with store locations (vendors from our system)
		global $wpdb;
		
		$results = $wpdb->get_results(
			"SELECT u.ID, u.display_name,
					lat.meta_value as lat,
					lng.meta_value as lng
			 FROM {$wpdb->users} u
			 INNER JOIN {$wpdb->usermeta} lat ON u.ID = lat.user_id AND lat.meta_key = '_vendedor_store_lat'
			 INNER JOIN {$wpdb->usermeta} lng ON u.ID = lng.user_id AND lng.meta_key = '_vendedor_store_lng'
			 WHERE lat.meta_value != '' AND lng.meta_value != ''",
			ARRAY_A
		);

		foreach ( $results as $row ) {
			$stores[] = array(
				'vendor_id' => intval( $row['ID'] ),
				'name'      => $row['display_name'],
				'lat'       => floatval( $row['lat'] ),
				'lng'       => floatval( $row['lng'] ),
			);
		}

		// Also check Dokan vendors if available
		if ( function_exists( 'dokan_get_sellers' ) ) {
			$dokan_sellers = dokan_get_sellers( array( 'number' => -1 ) );
			if ( ! empty( $dokan_sellers['users'] ) ) {
				foreach ( $dokan_sellers['users'] as $seller ) {
					// Skip if already added
					$exists = array_filter( $stores, function( $s ) use ( $seller ) {
						return $s['vendor_id'] === $seller->ID;
					});
					if ( ! empty( $exists ) ) continue;

					$store_info = dokan_get_store_info( $seller->ID );
					if ( ! empty( $store_info['location'] ) ) {
						$loc = explode( ',', $store_info['location'] );
						if ( count( $loc ) >= 2 ) {
							$stores[] = array(
								'vendor_id' => $seller->ID,
								'name'      => $seller->display_name,
								'lat'       => floatval( trim( $loc[0] ) ),
								'lng'       => floatval( trim( $loc[1] ) ),
							);
						}
					}
				}
			}
		}

		// Cache for 10 minutes (stores don't move often)
		set_transient( $cache_key, $stores, 600 );

		return $stores;
	}

	/**
	 * Activate "Llega Hoy" for all products of a store.
	 *
	 * @param int   $vendor_id  Vendor user ID.
	 * @param int   $driver_id  Driver post ID (who is nearby).
	 * @param float $distance   Distance in km.
	 */
	public function activate_llega_hoy_for_store( $vendor_id, $driver_id, $distance ) {
		$cache_key = self::CACHE_PREFIX . 'llega_hoy_' . $vendor_id;
		
		// Check if we already notified recently (avoid spam)
		$last_notification = get_transient( self::CACHE_PREFIX . 'notified_' . $vendor_id . '_' . $driver_id );
		$should_notify = ( false === $last_notification );
		
		// Store the activation data
		$activation_data = array(
			'active'       => true,
			'driver_id'    => $driver_id,
			'distance'     => $distance,
			'activated_at' => current_time( 'timestamp' ),
			'expires_at'   => current_time( 'timestamp' ) + self::CACHE_DURATION,
		);

		set_transient( $cache_key, $activation_data, self::CACHE_DURATION );

		// Clear product availability cache for this vendor's products
		$this->clear_vendor_product_cache( $vendor_id );

		// Send push notification to vendor (once every 10 minutes per driver)
		if ( $should_notify ) {
			$this->notify_vendor_driver_nearby( $vendor_id, $driver_id, $distance );
			// Mark as notified for 10 minutes
			set_transient( self::CACHE_PREFIX . 'notified_' . $vendor_id . '_' . $driver_id, true, 600 );
		}

		// Log for debugging
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			error_log( sprintf(
				'[TukiTask] Llega Hoy activado: Vendor %d, Driver %d, Distancia: %.2f km',
				$vendor_id,
				$driver_id,
				$distance
			) );
		}

		// Fire action for extensibility
		do_action( 'tukitask_llega_hoy_activated', $vendor_id, $driver_id, $distance );
	}

	/**
	 * Send push notification to vendor when driver is nearby.
	 *
	 * @param int   $vendor_id Vendor user ID.
	 * @param int   $driver_id Driver post ID.
	 * @param float $distance  Distance in km.
	 */
	private function notify_vendor_driver_nearby( $vendor_id, $driver_id, $distance ) {
		$driver_name = get_the_title( $driver_id );
		$distance_text = number_format( $distance, 1 );

		$title = __( '🚗 Repartidor Cerca', 'tukitask-local-drivers' );
		$body = sprintf(
			/* translators: 1: driver name, 2: distance in km */
			__( '%1$s está a %2$s km de tu tienda. "Llega Hoy" activado para tus productos.', 'tukitask-local-drivers' ),
			$driver_name,
			$distance_text
		);

		// Get the vendor's dashboard URL
		$dashboard_url = get_option( 'tukitask_ld_vendor_panel_url', home_url( '/vendedor-panel/' ) );

		Push_Manager::send_notification(
			$vendor_id,
			$title,
			$body,
			$dashboard_url,
			array(
				'type'      => 'driver_nearby',
				'driver_id' => $driver_id,
				'distance'  => $distance,
			)
		);
	}

	/**
	 * Check if "Llega Hoy" is active for a vendor.
	 *
	 * @param int $vendor_id Vendor user ID.
	 * @return array|false Activation data or false.
	 */
	public static function is_llega_hoy_active( $vendor_id ) {
		$cache_key = self::CACHE_PREFIX . 'llega_hoy_' . $vendor_id;
		$data = get_transient( $cache_key );

		if ( $data && ! empty( $data['active'] ) ) {
			return $data;
		}

		return false;
	}

	/**
	 * Get the nearest driver for a vendor (if any).
	 *
	 * @param int $vendor_id Vendor user ID.
	 * @return array|false Driver data or false.
	 */
	public static function get_nearest_driver_for_vendor( $vendor_id ) {
		$llega_hoy = self::is_llega_hoy_active( $vendor_id );
		
		if ( ! $llega_hoy ) {
			return false;
		}

		return array(
			'driver_id' => $llega_hoy['driver_id'],
			'distance'  => $llega_hoy['distance'],
		);
	}

	/**
	 * Clear product availability cache for a vendor.
	 *
	 * @param int $vendor_id Vendor user ID.
	 */
	private function clear_vendor_product_cache( $vendor_id ) {
		global $wpdb;

		// Get all product IDs for this vendor
		$product_ids = $wpdb->get_col( $wpdb->prepare(
			"SELECT ID FROM {$wpdb->posts} WHERE post_type = 'product' AND post_author = %d AND post_status = 'publish'",
			$vendor_id
		) );

		// Clear availability cache for each product
		foreach ( $product_ids as $product_id ) {
			// Clear all location-based caches for this product
			$wpdb->query( $wpdb->prepare(
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
				'_transient_tukitask_product_availability_' . md5( $product_id ) . '%'
			) );
		}
	}

	/**
	 * Update driver's store proximity metadata.
	 *
	 * @param int   $driver_id     Driver post ID.
	 * @param array $nearby_stores Array of nearby stores.
	 */
	private function update_driver_store_proximity( $driver_id, $nearby_stores ) {
		if ( empty( $nearby_stores ) ) {
			delete_post_meta( $driver_id, '_driver_near_stores' );
			return;
		}

		// Store simplified data
		$store_ids = array_column( $nearby_stores, 'vendor_id' );
		update_post_meta( $driver_id, '_driver_near_stores', $store_ids );
		update_post_meta( $driver_id, '_driver_nearest_store', $nearby_stores[0]['vendor_id'] );
		update_post_meta( $driver_id, '_driver_nearest_store_distance', $nearby_stores[0]['distance'] );
	}

	/**
	 * Check all active drivers for store proximity (cron job).
	 */
	public function check_all_active_drivers() {
		$drivers = get_posts( array(
			'post_type'      => 'tukitask_driver',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'meta_query'     => array(
				array(
					'key'   => '_driver_status',
					'value' => 'available',
				),
				array(
					'key'     => '_driver_lat',
					'compare' => 'EXISTS',
				),
			),
		) );

		foreach ( $drivers as $driver ) {
			$lat = get_post_meta( $driver->ID, '_driver_lat', true );
			$lng = get_post_meta( $driver->ID, '_driver_lng', true );

			if ( $lat && $lng ) {
				$this->on_driver_location_update( $driver->ID, floatval( $lat ), floatval( $lng ) );
			}
		}
	}

	/**
	 * Get all vendors with active "Llega Hoy" status.
	 *
	 * @return array Array of vendor IDs with active status.
	 */
	public static function get_all_active_llega_hoy_vendors() {
		global $wpdb;

		$results = $wpdb->get_col(
			"SELECT option_name FROM {$wpdb->options} 
			 WHERE option_name LIKE '_transient_tukitask_store_proximity_llega_hoy_%'
			 AND option_value != ''"
		);

		$vendor_ids = array();
		foreach ( $results as $option_name ) {
			// Extract vendor ID from option name
			$vendor_id = str_replace( '_transient_tukitask_store_proximity_llega_hoy_', '', $option_name );
			if ( is_numeric( $vendor_id ) ) {
				$data = get_transient( 'tukitask_store_proximity_llega_hoy_' . $vendor_id );
				if ( $data && ! empty( $data['active'] ) ) {
					$vendor_ids[] = intval( $vendor_id );
				}
			}
		}

		return $vendor_ids;
	}
}
