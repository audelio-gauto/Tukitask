<?php
/**
 * Dynamic Surge Pricing Engine.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Surge_Pricing_Manager Class.
 *
 * Calculates real-time price multipliers based on marketplace demand.
 */
class Surge_Pricing_Manager {

	/**
	 * Get the current surge multiplier for a specific location.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @return float Multiplier (e.g., 1.2).
	 */
	public static function get_multiplier( $lat, $lng ) {
		if ( 'yes' !== get_option( 'tukitask_ld_surge_enabled', 'no' ) ) {
			return 1.0;
		}

		// 1. Get recent active orders in the area (last 30 mins)
		$active_orders = self::count_active_orders_near( $lat, $lng );
		
		// 2. Get available drivers in the area
		$available_drivers = count( Driver_Availability::get_available_drivers_near( $lat, $lng ) );

		if ( $available_drivers === 0 && $active_orders > 0 ) {
			return floatval( get_option( 'tukitask_ld_surge_max', 2.0 ) );
		}

		if ( $available_drivers === 0 ) return 1.0;

		$ratio = $active_orders / $available_drivers;
		$sensitivity = floatval( get_option( 'tukitask_ld_surge_sensitivity', 0.5 ) );

		// Surge starts if ratio > 1
		if ( $ratio > 1 ) {
			$multiplier = 1 + ( ( $ratio - 1 ) * $sensitivity );
			$max = floatval( get_option( 'tukitask_ld_surge_max', 2.0 ) );
			return min( $multiplier, $max );
		}

		return 1.0;
	}

	/**
	 * Count active orders within a 5km radius.
	 */
	private static function count_active_orders_near( $lat, $lng ) {
		global $wpdb;
		$radius = 5; // km
		
		// This is a simplified query for performance
		// In production, we should use a spatial index or cached results
		$results = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(post_id) FROM {$wpdb->postmeta} m1
			 JOIN {$wpdb->postmeta} m2 ON m1.post_id = m2.post_id
			 JOIN {$wpdb->posts} p ON m1.post_id = p.ID
			 WHERE m1.meta_key = '_shipping_lat' AND m2.meta_key = '_shipping_lng'
			 AND p.post_type = 'shop_order' AND p.post_status IN ('wc-processing', 'wc-on-hold')
			 AND ( 6371 * acos( cos( radians(%f) ) * cos( radians( m1.meta_value ) ) * cos( radians( m2.meta_value ) - radians(%f) ) + sin( radians(%f) ) * sin( radians( m1.meta_value ) ) ) ) <= %d",
			$lat, $lng, $lat, $radius
		) );

		return intval( $results );
	}
}
