<?php
/**
 * Geolocation helper utilities.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

use Tukitask\LocalDrivers\Helpers\Log;

/**
 * Geo Class.
 *
 * Provides geolocation utilities.
 */
class Geo {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		// No hooks needed - this class only provides static utility methods.
	}

	/**
	 * Get coordinates from address using Mapbox Geocoding API.
	 *
	 * @param string $address Address to geocode.
	 * @return array|false Array with lat/lng or false on failure.
	 */
	public static function geocode_address( $address ) {
		$api_key = get_option( 'tukitask_ld_mapbox_api_key', '' );

		if ( empty( $api_key ) ) {
			return false;
		}

		// Check cache first.
		$cache_key = 'tukitask_geocode_' . md5( $address );
		$cached    = get_transient( $cache_key );

		if ( false !== $cached ) {
			return $cached;
		}

		// Make Mapbox API request.
		$url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' . rawurlencode( $address ) . '.json';
		$url = add_query_arg(
			array(
				'access_token' => $api_key,
				'limit'        => 1,
			),
			$url
		);

		$response = wp_remote_get( $url );

		if ( is_wp_error( $response ) ) {
			Log::error( 'Mapbox Geocoding request failed: ' . $response->get_error_message(), array( 'address' => $address ) );
			return false;
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( empty( $data['features'][0]['center'] ) ) {
			Log::warn( 'Mapbox Geocoding returned no results for address: ' . $address );
			return false;
		}

		// Mapbox returns [longitude, latitude].
		$coords = array(
			'lng' => floatval( $data['features'][0]['center'][0] ),
			'lat' => floatval( $data['features'][0]['center'][1] ),
		);

		// Cache for 30 days.
		set_transient( $cache_key, $coords, 30 * DAY_IN_SECONDS );

		return $coords;
	}

	/**
	 * Get address from coordinates using Mapbox Reverse Geocoding API.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @return string|false Address or false on failure.
	 */
	public static function reverse_geocode( $lat, $lng ) {
		$api_key = get_option( 'tukitask_ld_mapbox_api_key', '' );

		if ( empty( $api_key ) ) {
			return false;
		}

		// Check cache first.
		$cache_key = 'tukitask_reverse_geocode_' . md5( $lat . $lng );
		$cached    = get_transient( $cache_key );

		if ( false !== $cached ) {
			return $cached;
		}

		// Make Mapbox API request.
		$url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' . $lng . ',' . $lat . '.json';
		$url = add_query_arg(
			array(
				'access_token' => $api_key,
				'limit'        => 1,
			),
			$url
		);

		$response = wp_remote_get( $url );

		if ( is_wp_error( $response ) ) {
			Log::error( 'Mapbox Reverse Geocoding request failed: ' . $response->get_error_message(), array( 'lat' => $lat, 'lng' => $lng ) );
			return false;
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( empty( $data['features'][0]['place_name'] ) ) {
			Log::warn( 'Mapbox Reverse Geocoding returned no results.', array( 'lat' => $lat, 'lng' => $lng ) );
			return false;
		}

		$address = sanitize_text_field( $data['features'][0]['place_name'] );

		// Cache for 30 days.
		set_transient( $cache_key, $address, 30 * DAY_IN_SECONDS );

		return $address;
	}

	/**
	 * Get coordinates from WooCommerce order.
	 *
	 * @param int|\WC_Order $order Order ID or object.
	 * @return array|false Array with lat/lng or false on failure.
	 */
	public static function get_order_coordinates( $order ) {
		if ( is_numeric( $order ) ) {
			$order = wc_get_order( $order );
		}

		if ( ! $order ) {
			return false;
		}

		// Check if coordinates are already stored.
		$lat = $order->get_meta( '_shipping_lat' );
		$lng = $order->get_meta( '_shipping_lng' );

		if ( $lat && $lng ) {
			return array(
				'lat' => floatval( $lat ),
				'lng' => floatval( $lng ),
			);
		}

		// Try to geocode shipping address.
		$address = $order->get_shipping_address_1() . ', ' .
				   $order->get_shipping_city() . ', ' .
				   $order->get_shipping_state() . ', ' .
				   $order->get_shipping_postcode() . ', ' .
				   $order->get_shipping_country();

		$coords = self::geocode_address( $address );

		if ( $coords ) {
			// Store for future use.
			$order->update_meta_data( '_shipping_lat', $coords['lat'] );
			$order->update_meta_data( '_shipping_lng', $coords['lng'] );
			$order->save();
		}

		return $coords;
	}

	public static function get_current_customer_location() {
		// 1. Try to get from cookies (set by JavaScript geolocation)
		if ( isset( $_COOKIE['tukitask_customer_lat'] ) && isset( $_COOKIE['tukitask_customer_lng'] ) ) {
			$lat = floatval( $_COOKIE['tukitask_customer_lat'] );
			$lng = floatval( $_COOKIE['tukitask_customer_lng'] );
			
			if ( self::validate_coordinates( $lat, $lng ) ) {
				return array(
					'lat' => $lat,
					'lng' => $lng,
				);
			}
		}
		
		// 2. Try to get from WooCommerce session.
		if ( function_exists( 'WC' ) && WC()->session ) {
			$lat = WC()->session->get( 'customer_lat' );
			$lng = WC()->session->get( 'customer_lng' );

			if ( $lat && $lng ) {
				return array(
					'lat' => floatval( $lat ),
					'lng' => floatval( $lng ),
				);
			}
		}

		// 3. Try to get from customer address.
		if ( is_user_logged_in() && function_exists( 'WC' ) ) {
			$customer = WC()->customer;
			if ( $customer ) {
				$address = $customer->get_shipping_address() . ', ' .
						   $customer->get_shipping_city() . ', ' .
						   $customer->get_shipping_state() . ', ' .
						   $customer->get_shipping_postcode();

				// We avoid expensive geocoding here if possible, but for initial load it's fine.
				return self::geocode_address( $address );
			}
		}

		return false;
	}

	/**
	 * Validate coordinates.
	 *
	 * @param float $lat Latitude.
	 * @param float $lng Longitude.
	 * @return bool True if valid.
	 */
	public static function validate_coordinates( $lat, $lng ) {
		return ( $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180 );
	}
}
