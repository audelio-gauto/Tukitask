<?php
/**
 * Mobile Store Availability Service.
 *
 * Manages product availability based on driver proximity and mobile stock.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Drivers\Driver_Availability;

class AvailabilityService {

	/**
	 * Cache key prefix for product availability.
	 *
	 * @var string
	 */
	const CACHE_KEY_PREFIX = 'tukitask_product_availability_';

	/**
	 * Cache duration for product availability (5 minutes).
	 *
	 * @var int
	 */
	const CACHE_DURATION = 300; // 5 minutes

	/**
	 * Get customer location.
	 *
	 * @return array|false Location with lat/lng or false.
	 */
	public function get_customer_location() {
		return Geo::get_current_customer_location();
	}

	/**
	 * Get nearby drivers for a given location.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @param float $max_distance Maximum distance in km.
	 * @return array Array of driver IDs and their distances.
	 */
	private function get_nearby_drivers( $lat, $lng, $max_distance = null ) {
		// Re-using Driver_Availability's method, which now has correct caching.
		return Driver_Availability::get_available_drivers( $lat, $lng, $max_distance );
	}

	/**
	 * Determine the availability status of a product for a given customer location.
	 *
	 * @param int   $product_id Product ID.
	 * @param array $customer_location {
	 *     @type float $lat Latitude.
	 *     @type float $lng Longitude.
	 * }
	 * @return array|false {
	 *     @type string $status 'normal', 'llega_hoy', 'tienda_movil'.
	 *     @type int|null $driver_id The ID of the closest relevant driver.
	 *     @type float|null $distance Distance to the driver.
	 * } or false if no status found.
	 */
	public function get_product_availability_status( $product_id, $customer_location ) {
		if ( ! $customer_location || empty( $customer_location['lat'] ) || empty( $customer_location['lng'] ) ) {
			return false;
		}

		$cache_key = self::CACHE_KEY_PREFIX . md5( $product_id . $customer_location['lat'] . $customer_location['lng'] );
		$cached = get_transient( $cache_key );
		if ( false !== $cached ) {
			return $cached;
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return false;
		}

		$vendor_id = get_post_field( 'post_author', $product_id );
		if ( ! $vendor_id ) {
			return false;
		}

		$status_data = array(
			'status'   => 'normal',
			'driver_id' => null,
			'distance' => null,
		);

		// NEW: Check if "Llega Hoy" is already activated for this vendor's store
		// (Driver detected near the store by Store_Proximity_Service)
		$store_llega_hoy = Store_Proximity_Service::is_llega_hoy_active( $vendor_id );
		if ( $store_llega_hoy ) {
			$status_data = array(
				'status'    => 'llega_hoy',
				'driver_id' => $store_llega_hoy['driver_id'],
				'distance'  => $store_llega_hoy['distance'],
				'source'    => 'store_proximity', // Driver is near the STORE
			);
			set_transient( $cache_key, $status_data, self::CACHE_DURATION );
			return $status_data;
		}

		// NEW: Check if vendor is in Travel Mode and near the customer
		$vendor_travel_status = Vendor_Travel_Mode::get_vendor_travel_status( $vendor_id );
		if ( $vendor_travel_status['active'] && $vendor_travel_status['lat'] && $vendor_travel_status['lng'] ) {
			// Check if customer is within vendor's travel radius
			$vendor_to_customer_distance = Distance::haversine(
				$vendor_travel_status['lat'],
				$vendor_travel_status['lng'],
				$customer_location['lat'],
				$customer_location['lng']
			);
			
			if ( $vendor_to_customer_distance <= $vendor_travel_status['radius'] ) {
				// Vendor is traveling and customer is within their delivery radius!
				$status_data = array(
					'status'    => 'vendedor_viajando',
					'vendor_id' => $vendor_id,
					'distance'  => $vendor_to_customer_distance,
					'source'    => 'vendor_travel_mode',
				);
				set_transient( $cache_key, $status_data, 60 ); // Shorter cache for mobile vendors
				return $status_data;
			}
		}

		$max_distance = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );
		$mobile_store_radius = floatval( get_option( 'tukitask_ld_mobile_store_radius', 5 ) );

		$nearby_drivers = $this->get_nearby_drivers( $customer_location['lat'], $customer_location['lng'], $max_distance );

		if ( empty( $nearby_drivers ) ) {
			set_transient( $cache_key, $status_data, self::CACHE_DURATION );
			return $status_data; // No nearby drivers at all.
		}

		$closest_llega_hoy_driver = null;
		$closest_llega_hoy_distance = INF;

		$closest_tienda_movil_driver = null;
		$closest_tienda_movil_distance = INF;
		
		$product_is_mobile_stock = get_post_meta( $product_id, '_tukitask_is_mobile_stock', true ) === 'yes';

		foreach ( $nearby_drivers as $driver_data ) {
			$driver_id = $driver_data['id'];
			$distance  = $driver_data['distance'];

			// Check if this driver belongs to the product's vendor.
			$driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
			if ( (int) $driver_user_id !== (int) $vendor_id ) {
				continue;
			}
			
			// Check if the driver is a mobile store driver (profile).
			$driver_profile = get_post_meta( $driver_id, '_driver_profile', true );
			$is_mobile_store_profile = in_array( $driver_profile, array( 'autodriver_tienda', 'motodriver_tienda' ), true );

			// --- Check for 'Tienda Móvil' ---
			if ( $is_mobile_store_profile && $product_is_mobile_stock && $distance <= $mobile_store_radius ) {
				$driver_mobile_stock_products = get_post_meta( $driver_id, '_driver_mobile_stock_products', true );
				if ( is_array( $driver_mobile_stock_products ) && in_array( $product_id, $driver_mobile_stock_products, true ) ) {
					// This driver has the product in mobile stock and is within mobile store radius.
					if ( $distance < $closest_tienda_movil_distance ) {
						$closest_tienda_movil_driver = $driver_id;
						$closest_tienda_movil_distance = $distance;
					}
				}
			}

			// --- Check for 'Llega Hoy' (any available driver from vendor, within general max_distance) ---
			// If not already covered by Tienda Móvil or if Tienda Móvil is not the highest priority.
			if ( $distance < $closest_llega_hoy_distance ) {
				$closest_llega_hoy_driver = $driver_id;
				$closest_llega_hoy_distance = $distance;
			}
		}

		if ( null !== $closest_tienda_movil_driver ) {
			$status_data = array(
				'status'   => 'tienda_movil',
				'driver_id' => $closest_tienda_movil_driver,
				'distance' => $closest_tienda_movil_distance,
			);
		} elseif ( null !== $closest_llega_hoy_driver ) {
			$status_data = array(
				'status'   => 'llega_hoy',
				'driver_id' => $closest_llega_hoy_driver,
				'distance' => $closest_llega_hoy_distance,
			);
		}

		set_transient( $cache_key, $status_data, self::CACHE_DURATION );
		return $status_data;
	}

	/**
	 * Get products with 'Llega Hoy' status for a customer.
	 *
	 * @param array $customer_location Customer location array with lat/lng.
	 * @param int   $limit             Number of products to retrieve.
	 * @return array Array of product IDs.
	 */
	public function get_llega_hoy_products( $customer_location, $limit = -1 ) {
		if ( ! $customer_location || empty( $customer_location['lat'] ) || empty( $customer_location['lng'] ) ) {
			return array();
		}

		// Query all products and then filter by availability. This can be optimized later with a cron job.
		$args = array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => $limit,
			// Order by needs to be dynamic based on distance, so we'll sort after.
		);

		$query = new \WP_Query( $args );
		$llega_hoy_products = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$product_id = get_the_ID();
				
				$status = $this->get_product_availability_status( $product_id, $customer_location );

				if ( $status && ( 'llega_hoy' === $status['status'] || 'tienda_movil' === $status['status'] ) ) {
					$llega_hoy_products[ $product_id ] = $status['distance'];
				}
			}
			wp_reset_postdata();
		}

		// Sort by distance.
		asort( $llega_hoy_products );

		return array_keys( $llega_hoy_products );
	}

	/**
	 * Get products with 'Tienda Móvil' status for a customer.
	 *
	 * @param array $customer_location Customer location array with lat/lng.
	 * @param int   $limit             Number of products to retrieve.
	 * @return array Array of product IDs with distance.
	 */
	public function get_tienda_movil_products( $customer_location, $limit = -1 ) {
		if ( ! $customer_location || empty( $customer_location['lat'] ) || empty( $customer_location['lng'] ) ) {
			return array();
		}

		$args = array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => $limit,
		);

		$query = new \WP_Query( $args );
		$tienda_movil_products = array();

		if ( $query->have_posts() ) {
			while ( $query->have_posts() ) {
				$query->the_post();
				$product_id = get_the_ID();
				
				$status = $this->get_product_availability_status( $product_id, $customer_location );

				if ( $status && 'tienda_movil' === $status['status'] ) {
					$tienda_movil_products[ $product_id ] = $status['distance'];
				}
			}
			wp_reset_postdata();
		}

		// Sort by distance.
		asort( $tienda_movil_products );

		return $tienda_movil_products; // Return with distance for shortcode display.
	}

	/**
	 * Clear all product availability caches.
	 */
	public static function clear_product_availability_cache() {
		global $wpdb;
		$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_" . self::CACHE_KEY_PREFIX . "%'" );
		$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_" . self::CACHE_KEY_PREFIX . "%'" );
	}
}
