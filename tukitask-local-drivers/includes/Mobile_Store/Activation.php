<?php
/**
 * Mobile Store Activation Management.
 *
 * @package Tukitask\LocalDrivers\Mobile_Store
 */

namespace Tukitask\LocalDrivers\Mobile_Store;

/**
 * Activation Class.
 *
 * Manages mobile store activation during driver trips.
 */
class Activation {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'wp_ajax_tukitask_toggle_mobile_store', $this, 'ajax_toggle_mobile_store' );
		$loader->add_action( 'wp_ajax_tukitask_get_mobile_store_status', $this, 'ajax_get_mobile_store_status' );
	}

	/**
	 * AJAX handler to toggle mobile store.
	 */
	public function ajax_toggle_mobile_store() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! \Tukitask\LocalDrivers\Helpers\Security::can_access_driver_panel() ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		// Check if mobile store feature is enabled.
		if ( 'yes' !== get_option( 'tukitask_ld_mobile_store_enabled', 'yes' ) ) {
			wp_send_json_error( array( 'message' => __( 'La función de tienda móvil está deshabilitada.', 'tukitask-local-drivers' ) ) );
		}

		$driver_id = isset( $_POST['driver_id'] ) ? intval( $_POST['driver_id'] ) : 0;
		$activate  = isset( $_POST['activate'] ) && 'true' === $_POST['activate'];

		if ( ! $driver_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de conductor inválido.', 'tukitask-local-drivers' ) ) );
		}

		// Verify user owns this driver.
		$user_id        = get_current_user_id();
		$driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );

		if ( intval( $driver_user_id ) !== $user_id && ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para modificar este conductor.', 'tukitask-local-drivers' ) ) );
		}

		if ( $activate ) {
			// Activate mobile store.
			update_post_meta( $driver_id, '_mobile_store_active', 'yes' );
			update_post_meta( $driver_id, '_mobile_store_activated_at', current_time( 'timestamp' ) );

			// Get current location from driver tracking meta.
			$lat = get_post_meta( $driver_id, '_driver_lat', true );
			$lng = get_post_meta( $driver_id, '_driver_lng', true );

			if ( $lat && $lng ) {
				update_post_meta( $driver_id, '_mobile_store_lat', $lat );
				update_post_meta( $driver_id, '_mobile_store_lng', $lng );
			}

			wp_send_json_success(
				array(
					'message' => __( 'Tienda móvil activada correctamente.', 'tukitask-local-drivers' ),
					'active'  => true,
				)
			);
		} else {
			// Deactivate mobile store.
			delete_post_meta( $driver_id, '_mobile_store_active' );
			delete_post_meta( $driver_id, '_mobile_store_activated_at' );
			delete_post_meta( $driver_id, '_mobile_store_lat' );
			delete_post_meta( $driver_id, '_mobile_store_lng' );

			wp_send_json_success(
				array(
					'message' => __( 'Tienda móvil desactivada.', 'tukitask-local-drivers' ),
					'active'  => false,
				)
			);
		}
	}

	/**
	 * AJAX handler to get mobile store status.
	 */
	public function ajax_get_mobile_store_status() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! \Tukitask\LocalDrivers\Helpers\Security::can_access_driver_panel() ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$driver_id = isset( $_GET['driver_id'] ) ? intval( $_GET['driver_id'] ) : 0;

		if ( ! $driver_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de conductor inválido.', 'tukitask-local-drivers' ) ) );
		}

		$active       = get_post_meta( $driver_id, '_mobile_store_active', true );
		$activated_at = get_post_meta( $driver_id, '_mobile_store_activated_at', true );

		wp_send_json_success(
			array(
				'active'       => 'yes' === $active,
				'activated_at' => $activated_at ? $activated_at : null,
			)
		);
	}

	/**
	 * Update mobile store location if active.
	 *
	 * @param int   $driver_id Driver ID.
	 * @param float $lat       Latitude.
	 * @param float $lng       Longitude.
	 */
	public static function update_mobile_store_location( $driver_id, $lat, $lng ) {
		if ( self::is_mobile_store_active( $driver_id ) ) {
			update_post_meta( $driver_id, '_mobile_store_lat', $lat );
			update_post_meta( $driver_id, '_mobile_store_lng', $lng );
		}
	}
}
