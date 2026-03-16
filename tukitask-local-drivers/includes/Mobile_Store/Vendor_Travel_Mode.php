<?php
/**
 * Vendor Travel Mode Service.
 *
 * Allows vendors to act as mobile sellers when traveling.
 * Customers nearby can see and purchase their products for quick delivery.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

use Tukitask\LocalDrivers\Helpers\Distance;

/**
 * Vendor_Travel_Mode Class.
 *
 * Handles vendor travel mode (mobile selling) functionality.
 */
class Vendor_Travel_Mode {

	/**
	 * Default travel radius in km.
	 */
	const DEFAULT_RADIUS = 3;

	/**
	 * Minimum travel radius in km.
	 */
	const MIN_RADIUS = 0.5;

	/**
	 * Maximum travel radius in km.
	 */
	const MAX_RADIUS = 20;

	/**
	 * Meta key for travel mode active status.
	 */
	const META_TRAVEL_ACTIVE = '_vendor_travel_mode_active';

	/**
	 * Meta key for travel latitude.
	 */
	const META_TRAVEL_LAT = '_vendor_travel_lat';

	/**
	 * Meta key for travel longitude.
	 */
	const META_TRAVEL_LNG = '_vendor_travel_lng';

	/**
	 * Meta key for travel radius.
	 */
	const META_TRAVEL_RADIUS = '_vendor_travel_radius';

	/**
	 * Meta key for last travel location update.
	 */
	const META_TRAVEL_UPDATED = '_vendor_travel_updated_at';

	/**
	 * Constructor - Register hooks.
	 *
	 * @param object|null $loader Hook loader instance.
	 */
	public function __construct( $loader = null ) {
		if ( $loader ) {
			// AJAX handlers for vendor dashboard
			$loader->add_action( 'wp_ajax_tukitask_vendor_toggle_travel_mode', $this, 'ajax_toggle_travel_mode' );
			$loader->add_action( 'wp_ajax_tukitask_vendor_update_location', $this, 'ajax_update_vendor_location' );
			$loader->add_action( 'wp_ajax_tukitask_vendor_set_travel_radius', $this, 'ajax_set_travel_radius' );
			$loader->add_action( 'wp_ajax_tukitask_vendor_get_travel_status', $this, 'ajax_get_travel_status' );
		}
	}

	/**
	 * AJAX handler to toggle travel mode on/off.
	 */
	public function ajax_toggle_travel_mode() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		$active = isset( $_POST['active'] ) && '1' === $_POST['active'];

		if ( $active ) {
			// Activating - require location
			$lat = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : 0;
			$lng = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : 0;

			if ( ! $lat || ! $lng ) {
				wp_send_json_error( array( 'message' => __( 'Se requiere ubicación para activar el modo viaje.', 'tukitask-local-drivers' ) ) );
			}

			update_user_meta( $user_id, self::META_TRAVEL_ACTIVE, 'yes' );
			update_user_meta( $user_id, self::META_TRAVEL_LAT, $lat );
			update_user_meta( $user_id, self::META_TRAVEL_LNG, $lng );
			update_user_meta( $user_id, self::META_TRAVEL_UPDATED, current_time( 'timestamp' ) );

			// Set default radius if not set
			$current_radius = get_user_meta( $user_id, self::META_TRAVEL_RADIUS, true );
			if ( ! $current_radius ) {
				update_user_meta( $user_id, self::META_TRAVEL_RADIUS, self::DEFAULT_RADIUS );
			}

			// Clear product caches for this vendor's products
			$this->clear_vendor_availability_cache( $user_id );

			// Log activation
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( sprintf( '[TukiTask] Vendor %d activated Travel Mode at %f, %f', $user_id, $lat, $lng ) );
			}

			wp_send_json_success( array(
				'message' => __( 'Modo viaje activado. Los clientes cercanos verán tus productos.', 'tukitask-local-drivers' ),
				'lat'     => $lat,
				'lng'     => $lng,
			) );
		} else {
			// Deactivating
			update_user_meta( $user_id, self::META_TRAVEL_ACTIVE, 'no' );
			delete_user_meta( $user_id, self::META_TRAVEL_LAT );
			delete_user_meta( $user_id, self::META_TRAVEL_LNG );
			delete_user_meta( $user_id, self::META_TRAVEL_UPDATED );

			// Clear product caches
			$this->clear_vendor_availability_cache( $user_id );

			wp_send_json_success( array(
				'message' => __( 'Modo viaje desactivado.', 'tukitask-local-drivers' ),
			) );
		}
	}

	/**
	 * AJAX handler to update vendor location while traveling.
	 */
	public function ajax_update_vendor_location() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();

		// Check if travel mode is active
		$is_active = get_user_meta( $user_id, self::META_TRAVEL_ACTIVE, true );
		if ( 'yes' !== $is_active ) {
			wp_send_json_error( array( 'message' => __( 'El modo viaje no está activo.', 'tukitask-local-drivers' ) ) );
		}

		$lat = isset( $_POST['lat'] ) ? floatval( $_POST['lat'] ) : 0;
		$lng = isset( $_POST['lng'] ) ? floatval( $_POST['lng'] ) : 0;

		if ( ! $lat || ! $lng ) {
			wp_send_json_error( array( 'message' => __( 'Coordenadas inválidas.', 'tukitask-local-drivers' ) ) );
		}

		update_user_meta( $user_id, self::META_TRAVEL_LAT, $lat );
		update_user_meta( $user_id, self::META_TRAVEL_LNG, $lng );
		update_user_meta( $user_id, self::META_TRAVEL_UPDATED, current_time( 'timestamp' ) );

		// Fire action for other systems to react
		do_action( 'tukitask_vendor_location_updated', $user_id, $lat, $lng );

		wp_send_json_success( array(
			'message' => __( 'Ubicación actualizada.', 'tukitask-local-drivers' ),
			'lat'     => $lat,
			'lng'     => $lng,
			'updated' => current_time( 'mysql' ),
		) );
	}

	/**
	 * AJAX handler to set travel radius.
	 */
	public function ajax_set_travel_radius() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		$radius = isset( $_POST['radius'] ) ? floatval( $_POST['radius'] ) : self::DEFAULT_RADIUS;

		// Clamp radius to valid range
		$radius = max( self::MIN_RADIUS, min( self::MAX_RADIUS, $radius ) );

		update_user_meta( $user_id, self::META_TRAVEL_RADIUS, $radius );

		wp_send_json_success( array(
			'message' => sprintf( __( 'Radio de entrega actualizado a %s km.', 'tukitask-local-drivers' ), $radius ),
			'radius'  => $radius,
		) );
	}

	/**
	 * AJAX handler to get current travel status.
	 */
	public function ajax_get_travel_status() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		$status = self::get_vendor_travel_status( $user_id );

		wp_send_json_success( $status );
	}

	/**
	 * Get vendor travel status.
	 *
	 * @param int $vendor_id Vendor user ID.
	 * @return array Travel status data.
	 */
	public static function get_vendor_travel_status( $vendor_id ) {
		$is_active = get_user_meta( $vendor_id, self::META_TRAVEL_ACTIVE, true );
		$lat = get_user_meta( $vendor_id, self::META_TRAVEL_LAT, true );
		$lng = get_user_meta( $vendor_id, self::META_TRAVEL_LNG, true );
		$radius = get_user_meta( $vendor_id, self::META_TRAVEL_RADIUS, true );
		$updated = get_user_meta( $vendor_id, self::META_TRAVEL_UPDATED, true );

		return array(
			'active'  => 'yes' === $is_active,
			'lat'     => $lat ? floatval( $lat ) : null,
			'lng'     => $lng ? floatval( $lng ) : null,
			'radius'  => $radius ? floatval( $radius ) : self::DEFAULT_RADIUS,
			'updated' => $updated ? intval( $updated ) : null,
		);
	}

	/**
	 * Check if vendor is near a customer location.
	 *
	 * @param int   $vendor_id         Vendor user ID.
	 * @param float $customer_lat      Customer latitude.
	 * @param float $customer_lng      Customer longitude.
	 * @return array|false Distance data or false if not in range.
	 */
	public static function is_vendor_near_customer( $vendor_id, $customer_lat, $customer_lng ) {
		$status = self::get_vendor_travel_status( $vendor_id );

		if ( ! $status['active'] || ! $status['lat'] || ! $status['lng'] ) {
			return false;
		}

		$distance = Distance::haversine(
			$status['lat'],
			$status['lng'],
			$customer_lat,
			$customer_lng
		);

		if ( $distance <= $status['radius'] ) {
			return array(
				'vendor_id' => $vendor_id,
				'distance'  => $distance,
				'radius'    => $status['radius'],
			);
		}

		return false;
	}

	/**
	 * Get all vendors currently in travel mode.
	 *
	 * @return array Array of vendor data with travel info.
	 */
	public static function get_all_traveling_vendors() {
		global $wpdb;

		$results = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT u.ID, u.display_name,
						lat.meta_value as lat,
						lng.meta_value as lng,
						radius.meta_value as radius
				 FROM {$wpdb->users} u
				 INNER JOIN {$wpdb->usermeta} active ON u.ID = active.user_id 
				     AND active.meta_key = %s AND active.meta_value = 'yes'
				 INNER JOIN {$wpdb->usermeta} lat ON u.ID = lat.user_id 
				     AND lat.meta_key = %s
				 INNER JOIN {$wpdb->usermeta} lng ON u.ID = lng.user_id 
				     AND lng.meta_key = %s
				 LEFT JOIN {$wpdb->usermeta} radius ON u.ID = radius.user_id 
				     AND radius.meta_key = %s",
				self::META_TRAVEL_ACTIVE,
				self::META_TRAVEL_LAT,
				self::META_TRAVEL_LNG,
				self::META_TRAVEL_RADIUS
			),
			ARRAY_A
		);

		$vendors = array();
		foreach ( $results as $row ) {
			$vendors[] = array(
				'vendor_id' => intval( $row['ID'] ),
				'name'      => $row['display_name'],
				'lat'       => floatval( $row['lat'] ),
				'lng'       => floatval( $row['lng'] ),
				'radius'    => $row['radius'] ? floatval( $row['radius'] ) : self::DEFAULT_RADIUS,
			);
		}

		return $vendors;
	}

	/**
	 * Find traveling vendors near a customer location.
	 *
	 * @param float $customer_lat Customer latitude.
	 * @param float $customer_lng Customer longitude.
	 * @return array Array of nearby vendor data.
	 */
	public static function find_nearby_traveling_vendors( $customer_lat, $customer_lng ) {
		$all_vendors = self::get_all_traveling_vendors();
		$nearby = array();

		foreach ( $all_vendors as $vendor ) {
			$distance = Distance::haversine(
				$vendor['lat'],
				$vendor['lng'],
				$customer_lat,
				$customer_lng
			);

			if ( $distance <= $vendor['radius'] ) {
				$vendor['distance'] = $distance;
				$nearby[] = $vendor;
			}
		}

		// Sort by distance
		usort( $nearby, function( $a, $b ) {
			return $a['distance'] <=> $b['distance'];
		} );

		return $nearby;
	}

	/**
	 * Clear availability cache for a vendor's products.
	 *
	 * @param int $vendor_id Vendor user ID.
	 */
	private function clear_vendor_availability_cache( $vendor_id ) {
		global $wpdb;

		// Get all products by this vendor
		$product_ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT ID FROM {$wpdb->posts} WHERE post_type = 'product' AND post_author = %d",
				$vendor_id
			)
		);

		// Delete transients for each product (all possible customer location combinations)
		// Since we can't know all locations, we'll use a broader approach
		$wpdb->query(
			"DELETE FROM {$wpdb->options} 
			 WHERE option_name LIKE '_transient_tukitask_product_availability_%'"
		);
	}
}
