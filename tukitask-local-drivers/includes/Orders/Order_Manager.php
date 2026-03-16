<?php
/**
 * Order Management Service.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;
use Tukitask\LocalDrivers\Drivers\Wallet_Manager;

/**
 * Order_Manager Class.
 *
 * Centralizes logic for order status updates and delivery workflow events.
 */
class Order_Manager {

	/**
	 * Update delivery status with tracking and metadata.
	 *
	 * @param int|\WC_Order $order_id Order ID or object.
	 * @param string        $status   Status slug (picked_up, in_transit, nearby, delivered, etc).
	 * @return bool|\WP_Error True on success, WP_Error on failure.
	 */
	public static function update_delivery_status( $order_id, $status ) {
		$order = is_numeric( $order_id ) ? wc_get_order( $order_id ) : $order_id;
		if ( ! $order ) {
			return new \WP_Error( 'invalid_order', __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) );
		}

		$statuses = array(
			'picked_up'  => __( 'Pedido recogido', 'tukitask-local-drivers' ),
			'in_transit' => __( 'En camino', 'tukitask-local-drivers' ),
			'nearby'     => __( 'Cerca del destino', 'tukitask-local-drivers' ),
			'delivered'  => __( 'Entregado', 'tukitask-local-drivers' ),
			'out_for_delivery' => __( 'En ruta para entrega', 'tukitask-local-drivers' ),
		);

		if ( ! isset( $statuses[ $status ] ) ) {
			return new \WP_Error( 'invalid_status', __( 'Estado de entrega no válido.', 'tukitask-local-drivers' ) );
		}

		// Update order meta.
		$order->update_meta_data( '_delivery_status', $status );
		$order->update_meta_data( '_delivery_status_updated_at', current_time( 'timestamp' ) );

		// Add tracking event.
		$tracking_events = $order->get_meta( '_tracking_events' );
		$tracking_events = is_array( $tracking_events ) ? $tracking_events : array();

		$tracking_events[] = array(
			'status'    => $status,
			'label'     => $statuses[ $status ],
			'timestamp' => current_time( 'timestamp' ),
		);

		$order->update_meta_data( '_tracking_events', $tracking_events );
		$order->add_order_note( $statuses[ $status ] );

		// If delivered, mark order as completed.
		if ( 'delivered' === $status ) {
			$order->update_status( 'completed', __( 'Pedido marcado como entregado por el conductor.', 'tukitask-local-drivers' ) );
		}

		$order->save();

		// Clear availability cache.
		Driver_Availability::clear_available_drivers_cache();

		// Fire action hook.
		do_action( 'tukitask_delivery_status_updated', $order->get_id(), $status );

		return true;
	}
}
