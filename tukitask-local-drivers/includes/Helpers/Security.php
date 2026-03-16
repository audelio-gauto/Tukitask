<?php
/**
 * Security helper for sanitization and nonces.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Security Class.
 *
 * Provides security utilities for the plugin.
 */
class Security {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		// No hooks needed - this class only provides static utility methods.
	}

	/**
	 * Verify nonce with simple wrapper.
	 *
	 * @param string $nonce  Nonce value.
	 * @param string $action Action name.
	 * @return bool True if valid, false otherwise.
	 */
	public static function verify( $nonce, $action ) {
		return wp_verify_nonce( $nonce, $action );
	}

	/**
	 * Sanitize coordinates array.
	 *
	 * @param mixed $coords Coordinates data.
	 * @return array Sanitized coordinates with lat/lng.
	 */
	public static function sanitize_coords( $coords ) {
		if ( ! is_array( $coords ) ) {
			return array(
				'lat' => 0,
				'lng' => 0,
			);
		}
		return array(
			'lat' => isset( $coords['lat'] ) ? floatval( $coords['lat'] ) : 0,
			'lng' => isset( $coords['lng'] ) ? floatval( $coords['lng'] ) : 0,
		);
	}

	/**
	 * Check if current user can access driver panel.
	 *
	 * @return bool True if user has access.
	 */
	public static function can_access_driver_panel() {
		return current_user_can( 'tukitask_driver_access' ) || current_user_can( 'manage_options' );
	}

	/**
	 * Check if current user can access dispatcher panel.
	 *
	 * @return bool True if user has access.
	 */
	public static function can_access_dispatcher_panel() {
		return current_user_can( 'tukitask_dispatcher_access' ) || current_user_can( 'manage_options' );
	}

	/**
	 * Sanitize order ID.
	 *
	 * @param mixed $order_id Order ID.
	 * @return int Sanitized order ID.
	 */
	public static function sanitize_order_id( $order_id ) {
		return absint( $order_id );
	}

	/**
	 * Sanitize driver ID.
	 *
	 * @param mixed $driver_id Driver ID.
	 * @return int Sanitized driver ID.
	 */
	public static function sanitize_driver_id( $driver_id ) {
		$driver_id = absint( $driver_id );

		// Verify it's actually a driver post.
		if ( $driver_id && 'tukitask_driver' !== get_post_type( $driver_id ) ) {
			return 0;
		}

		return $driver_id;
	}

	/**
	 * Validate API request.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool|\WP_Error True if valid, WP_Error otherwise.
	 */
	public static function validate_api_request( $request ) {
		// Check if user is authenticated.
		if ( ! is_user_logged_in() ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'Debes estar autenticado para acceder a este recurso.', 'tukitask-local-drivers' ),
				array( 'status' => 401 )
			);
		}

		return true;
	}

	/**
	 * Sanitize status value.
	 *
	 * @param string $status Status value.
	 * @return string Sanitized status.
	 */
	public static function sanitize_status( $status ) {
		$allowed_statuses = array( 'available', 'en_viaje', 'ocupado', 'offline' );
		$status           = sanitize_text_field( $status );

		if ( ! in_array( $status, $allowed_statuses, true ) ) {
			return 'offline';
		}

		return $status;
	}
}
