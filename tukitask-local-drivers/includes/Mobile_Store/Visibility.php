<?php
/**
 * Mobile Store Visibility Management.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

use Tukitask\LocalDrivers\Helpers\Proximity_Manager;
use Tukitask\LocalDrivers\Helpers\Geo;

/**
 * Visibility Class.
 *
 * Manages product visibility based on mobile store proximity.
 */
class Visibility {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		// Only add filters if enabled
		if ( 'yes' === get_option( 'tukitask_ld_mobile_store_enabled', 'yes' ) ) {
			$loader->add_filter( 'woocommerce_product_query', $this, 'filter_products_by_proximity', 10, 2 );
		}

		// AJAX for location
		$loader->add_action( 'wp_ajax_tukitask_set_customer_location', $this, 'ajax_set_customer_location' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_set_customer_location', $this, 'ajax_set_customer_location' );

		// Enqueue script
		$loader->add_action( 'wp_enqueue_scripts', $this, 'enqueue_customer_scripts' );
	}

	/**
	 * Enqueue customer location scripts.
	 */
	public function enqueue_customer_scripts() {
		if ( is_admin() ) return;

		wp_enqueue_script( 'tukitask-customer-location', TUKITASK_LD_URL . 'assets/js/customer-location.js', array('jquery'), TUKITASK_LD_VERSION, true );
		wp_localize_script( 'tukitask-customer-location', 'tukitaskLocation', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'tukitask_location_nonce' )
		));
	}

	/**
	 * AJAX handler to save customer location.
	 */
	public function ajax_set_customer_location() {
		check_ajax_referer( 'tukitask_location_nonce', 'security' );
		
		$lat = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : 0;
		$lng = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : 0;

		if ( $lat && $lng ) {
			if ( WC()->session ) {
				WC()->session->set( 'customer_lat', $lat );
				WC()->session->set( 'customer_lng', $lng );
				\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
				wp_send_json_success( array( 'message' => 'Location saved' ) );
			}
		}

		wp_send_json_error( array( 'message' => 'Invalid location' ) );
	}

	/**
	 * Filter products by proximity (Shop page filter).
	 */
	public function filter_products_by_proximity( $query, $wc_query ) {
		if ( is_admin() || ! $query->is_main_query() ) return;

		$location = Geo::get_current_customer_location();
		if ( ! $location ) return;

		// Get vendors near customer
		$nearby_drivers = Proximity_Manager::get_nearby_drivers( $location['lat'], $location['lng'] );
		$vendor_ids = array();

		foreach ( $nearby_drivers as $driver ) {
			$v_id = get_post_meta( $driver['id'], '_driver_user_id', true );
			if ( $v_id ) $vendor_ids[] = intval($v_id);
		}

		if ( ! empty( $vendor_ids ) ) {
			// This is optional: User might want to show ONLY nearby products.
			// Current implementation restricts shop to nearby vendors.
			$query->set( 'author__in', array_unique($vendor_ids) );
		}
	}
}
