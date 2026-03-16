<?php
/**
 * Proximity Manager Helper.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Proximity_Manager Class.
 *
 * Provides high-performance methods for proximity checks with caching.
 */
class Proximity_Manager {

	/**
	 * Cache of nearby drivers per location.
	 *
	 * @var array
	 */
	private static $nearby_drivers_cache = array();

	/**
	 * Get all drivers available near a location.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @param float $radius Radius in km.
	 * @return array Array of driver data.
	 */
	public static function get_nearby_drivers( $lat, $lng, $radius = null ) {
		if ( null === $radius ) {
			$radius = floatval( get_option( 'tukitask_ld_max_distance', 10 ) );
		}

		$cache_key = md5( $lat . '|' . $lng . '|' . $radius );

		if ( isset( self::$nearby_drivers_cache[ $cache_key ] ) ) {
			return self::$nearby_drivers_cache[ $cache_key ];
		}

		$drivers = \Tukitask\LocalDrivers\Drivers\Driver_Availability::get_available_drivers( $lat, $lng, $radius );
		
		self::$nearby_drivers_cache[ $cache_key ] = $drivers;
		return $drivers;
	}

	/**
	 * Get product proximity status.
	 * 
	 * @param int   $product_id Product ID.
	 * @param array $location   Customer location ['lat', 'lng'].
	 * @return string|false 'mobile_store', 'llega_hoy' or false.
	 */
	public static function get_product_status( $product_id, $location ) {
		if ( ! $location ) return false;

		$nearby_drivers = self::get_nearby_drivers( $location['lat'], $location['lng'] );
		
		if ( empty( $nearby_drivers ) ) return false;

		// Check for Tienda Móvil first (Higher priority)
		foreach ( $nearby_drivers as $driver_data ) {
			$driver_id = $driver_data['id'];
			
			$is_mobile_active = get_post_meta( $driver_id, '_mobile_store_active', true ) === 'yes';
			if ( ! $is_mobile_active ) continue;

			$driver_stock = get_post_meta( $driver_id, '_driver_mobile_stock_products', true );
			if ( is_array( $driver_stock ) && in_array( $product_id, $driver_stock ) ) {
				return 'mobile_store';
			}
		}

		// If any driver is nearby (available and in radius), it's at least "Llega Hoy"
		// (Assuming a driver nearby can deliver anything from the shop or theirs)
		return 'llega_hoy';
	}
}
