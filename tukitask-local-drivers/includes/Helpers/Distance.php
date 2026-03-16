<?php
/**
 * Distance calculation utilities.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Distance Class.
 *
 * Provides distance calculation utilities using Haversine formula.
 */
class Distance {

	/**
	 * Earth radius in kilometers.
	 *
	 * @var float
	 */
	const EARTH_RADIUS_KM = 6371;

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		// No hooks needed - this class only provides static utility methods.
	}

	/**
	 * Calculate distance between two coordinates using Haversine formula.
	 *
	 * @param float $lat1 Latitude of point 1.
	 * @param float $lng1 Longitude of point 1.
	 * @param float $lat2 Latitude of point 2.
	 * @param float $lng2 Longitude of point 2.
	 * @param string $unit Unit of measurement (km or mi). Default km.
	 * @return float Distance in specified unit.
	 */
	public static function haversine( $lat1, $lng1, $lat2, $lng2, $unit = 'km' ) {
		// Convert degrees to radians.
		$lat1 = deg2rad( $lat1 );
		$lng1 = deg2rad( $lng1 );
		$lat2 = deg2rad( $lat2 );
		$lng2 = deg2rad( $lng2 );

		// Haversine formula.
		$dlat = $lat2 - $lat1;
		$dlng = $lng2 - $lng1;

		$a = sin( $dlat / 2 ) * sin( $dlat / 2 ) +
			 cos( $lat1 ) * cos( $lat2 ) *
			 sin( $dlng / 2 ) * sin( $dlng / 2 );

		$c = 2 * atan2( sqrt( $a ), sqrt( 1 - $a ) );

		$distance = self::EARTH_RADIUS_KM * $c;

		// Convert to miles if requested.
		if ( 'mi' === $unit ) {
			$distance = $distance * 0.621371;
		}

		return round( $distance, 2 );
	}

	/**
	 * Calculate shipping cost based on distance.
	 *
	 * @param float $distance Distance in km.
	 * @return float Shipping cost.
	 */
	public static function calculate_shipping_cost( $distance ) {
		$base_price   = floatval( get_option( 'tukitask_ld_base_price', 5.00 ) );
		$price_per_km = floatval( get_option( 'tukitask_ld_price_per_km', 1.50 ) );

		$cost = $base_price + ( $distance * $price_per_km );

		return round( $cost, 2 );
	}

	/**
	 * Get distance between driver and order.
	 *
	 * @param int $driver_id Driver post ID.
	 * @param int $order_id  Order ID.
	 * @return float|false Distance in km or false on failure.
	 */
	public static function get_driver_to_order_distance( $driver_id, $order_id ) {
		// Get driver coordinates.
		$driver_lat = floatval( get_post_meta( $driver_id, '_driver_lat', true ) );
		$driver_lng = floatval( get_post_meta( $driver_id, '_driver_lng', true ) );

		if ( ! $driver_lat || ! $driver_lng ) {
			return false;
		}

		// Get order coordinates.
		$order_coords = \Tukitask\LocalDrivers\Helpers\Geo::get_order_coordinates( $order_id );

		if ( ! $order_coords ) {
			return false;
		}

		return self::haversine( $driver_lat, $driver_lng, $order_coords['lat'], $order_coords['lng'] );
	}

	/**
	 * Format distance for display.
	 *
	 * @param float  $distance Distance in km.
	 * @param string $unit     Unit to display (km or mi).
	 * @return string Formatted distance string.
	 */
	public static function format_distance( $distance, $unit = 'km' ) {
		if ( 'mi' === $unit ) {
			$distance = $distance * 0.621371;
			return round( $distance, 2 ) . ' mi';
		}

		return round( $distance, 2 ) . ' km';
	}

	/**
	 * Check if location is within radius.
	 *
	 * @param float $lat1   Latitude of center point.
	 * @param float $lng1   Longitude of center point.
	 * @param float $lat2   Latitude of point to check.
	 * @param float $lng2   Longitude of point to check.
	 * @param float $radius Radius in km.
	 * @return bool True if within radius.
	 */
	public static function is_within_radius( $lat1, $lng1, $lat2, $lng2, $radius ) {
		$distance = self::haversine( $lat1, $lng1, $lat2, $lng2 );
		return $distance <= $radius;
	}

	/**
	 * Get nearest driver to a location.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @return int|false Driver ID or false if none found.
	 */
	public static function get_nearest_driver( $lat, $lng ) {
		$available_drivers = \Tukitask\LocalDrivers\Drivers\Driver_Availability::get_available_drivers( $lat, $lng );

		if ( empty( $available_drivers ) ) {
			return false;
		}

		// Return the first one (already sorted by distance).
		return $available_drivers[0]['id'];
	}
}
