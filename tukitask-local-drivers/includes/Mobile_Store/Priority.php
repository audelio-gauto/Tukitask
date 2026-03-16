<?php
/**
 * Mobile Store Priority Management.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

use Tukitask\LocalDrivers\Helpers\Proximity_Manager;
use Tukitask\LocalDrivers\Helpers\Geo;

/**
 * Priority Class.
 *
 * Manages priority of mobile stores over fixed stores.
 */
class Priority {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_filter( 'posts_orderby', $this, 'prioritize_mobile_store_products', 10, 2 );
	}

	/**
	 * Prioritize mobile store products in results.
	 *
	 * @param string    $orderby Order by clause.
	 * @param \WP_Query $query   Query object.
	 * @return string Modified order by clause.
	 */
	public function prioritize_mobile_store_products( $orderby, $query ) {
		global $wpdb;

		if ( ! isset( $query->query_vars['post_type'] ) || 'product' !== $query->query_vars['post_type'] || is_admin() || ! $query->is_main_query() ) {
			return $orderby;
		}

		if ( 'yes' !== get_option( 'tukitask_ld_mobile_store_enabled', 'yes' ) ) {
			return $orderby;
		}

		$location = Geo::get_current_customer_location();
		if ( ! $location ) return $orderby;

		$nearby_drivers = Proximity_Manager::get_nearby_drivers( $location['lat'], $location['lng'] );
		if ( empty( $nearby_drivers ) ) return $orderby;

		$vendor_ids = array();
		foreach ( $nearby_drivers as $driver ) {
			$v_id = get_post_meta( $driver['id'], '_driver_user_id', true );
			if ( $v_id ) $vendor_ids[] = intval($v_id);
		}

		if ( empty( $vendor_ids ) ) return $orderby;

		$vendor_ids_string = implode( ',', array_unique( $vendor_ids ) );

		// Prepend custom ordering: nearby vendor products first.
		$custom_orderby = "FIELD({$wpdb->posts}.post_author, {$vendor_ids_string}) DESC";

		return ! empty( $orderby ) ? $custom_orderby . ', ' . $orderby : $custom_orderby;
	}
}
