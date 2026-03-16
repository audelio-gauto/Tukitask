<?php
/**
 * Wallet and Earnings Manager.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Wallet_Manager Class.
 *
 * Manages driver and vendor balances via the ledger system.
 */
class Wallet_Manager {

	/**
	 * Add an entry to the ledger.
	 *
	 * @param array $data Entry data (user_id, amount, type, description, order_id).
	 * @return int|bool Entry ID or false.
	 */
	public static function add_entry( $data ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ledger';

		$inserted = $wpdb->insert(
			$table,
			array(
				'user_id'     => $data['user_id'],
				'order_id'    => isset( $data['order_id'] ) ? $data['order_id'] : 0,
				'amount'      => $data['amount'],
				'type'        => $data['type'],
				'description' => $data['description'],
				'created_at'  => current_time( 'mysql' ),
			)
		);

		return $inserted ? $wpdb->insert_id : false;
	}

	/**
	 * Get current balance for a user.
	 *
	 * @param int $user_id User ID.
	 * @return float Balance.
	 */
	public static function get_balance( $user_id ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ledger';

		// Get total earnings from ledger
		$total_earned = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM $table WHERE user_id = %d",
			$user_id
		) );

		// Subtract paid and pending payouts
		$paid = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM {$wpdb->prefix}tukitask_payouts WHERE vendor_id = %d AND status = 'paid'",
			$user_id
		) );

		$pending = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM {$wpdb->prefix}tukitask_payouts WHERE vendor_id = %d AND status = 'pending'",
			$user_id
		) );

		return max(0, $total_earned - $paid - $pending);
	}

	/**
	 * Get total settled earnings for a user.
	 *
	 * @param int $user_id User ID.
	 * @return float Total.
	 */
	public static function get_total_earnings( $user_id ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ledger';

		return (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM $table WHERE user_id = %d AND type = 'earning'",
			$user_id
		) );
	}

	/**
	 * Get transaction history for a user.
	 *
	 * @param int $user_id User ID.
	 * @param int $limit   Limit.
	 * @return array History.
	 */
	public static function get_history( $user_id, $limit = 20 ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ledger';

		return $wpdb->get_results( $wpdb->prepare(
			"SELECT * FROM $table WHERE user_id = %d ORDER BY created_at DESC LIMIT %d",
			$user_id,
			$limit
		) );
	}

	/**
	 * Create a withdrawal request for drivers.
	 *
	 * @param array $data {driver_id: int, amount: float, payment_method: string}.
	 * @return int|bool Request ID or false on failure.
	 */
	public static function create_withdrawal_request( $data ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		// Get user ID from driver post ID
		$user_id = get_post_meta( $data['driver_id'], '_driver_user_id', true );
		if ( ! $user_id ) {
			return false; // Driver not properly linked to user
		}

		$inserted = $wpdb->insert(
			$table_name,
			array(
				'vendor_id'      => intval( $user_id ), // Use user ID for consistency
				'amount'         => floatval( $data['amount'] ),
				'payment_method' => sanitize_text_field( $data['payment_method'] ),
				'status'         => 'pending',
				'created_at'     => current_time( 'mysql' ),
			),
			array( '%d', '%f', '%s', '%s', '%s' )
		);

		return $inserted ? $wpdb->insert_id : false;
	}

	/**
	 * Process earning for a driver on order completion.
	 *
	 * @param \WC_Order $order    Order object.
	 * @param int       $driver_id Driver Post ID.
	 */
	public static function add_driver_earning( $order, $driver_id ) {
		$driver_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
		if ( ! $driver_user_id ) return;

		// Calculate driver's share (Total - Commission)
		// For now, let's assume Driver gets 100% of the shipping cost or a fixed rate.
		// Let's use the shipping total of the order.
		$shipping_amount = (float) $order->get_shipping_total();

		if ( $shipping_amount <= 0 ) return;

		// Check if already processed
		if ( $order->get_meta( '_driver_earning_processed' ) ) return;

		// Phase 27: Apply Category-based fees
		$fees = \Tukitask\LocalDrivers\Helpers\Commission_Manager::get_driver_fees( $driver_id );
		$deduction = ( $shipping_amount * ( $fees['commission'] / 100 ) ) + $fees['fixed'];
		$net_amount = max( 0, $shipping_amount - $deduction );

		self::add_entry( array(
			'user_id'     => $driver_user_id,
			'order_id'    => $order->get_id(),
			'amount'      => $net_amount,
			'type'        => 'earning',
			'description' => sprintf( __( 'Ganancia por pedido #%s (%s)', 'tukitask-local-drivers' ), $order->get_order_number(), wc_price($shipping_amount) ),
		) );

		$order->update_meta_data( '_driver_earning_processed', 'yes' );
		$order->save();
	}

	/**
	 * Process earnings for vendor(s) on order completion.
	 *
	 * Iterates order items, calculates net earnings (total - commission) per vendor,
	 * and credits each vendor via the ledger.
	 *
	 * @param \WC_Order $order Order object.
	 */
	public static function add_vendor_earning( $order ) {
		if ( $order->get_meta( '_vendor_earning_processed' ) ) return;

		$vendor_earnings = array();

		foreach ( $order->get_items() as $item ) {
			$product_id = $item->get_product_id();
			$vendor_id  = (int) get_post_field( 'post_author', $product_id );
			if ( ! $vendor_id ) continue;

			$item_total  = (float) $item->get_total();
			$commission  = \Tukitask\LocalDrivers\Helpers\Commission_Manager::calculate_commission( $item_total, $product_id );
			$net_earning = max( 0, $item_total - $commission );

			if ( ! isset( $vendor_earnings[ $vendor_id ] ) ) {
				$vendor_earnings[ $vendor_id ] = 0;
			}
			$vendor_earnings[ $vendor_id ] += $net_earning;
		}

		foreach ( $vendor_earnings as $vendor_id => $amount ) {
			if ( $amount <= 0 ) continue;

			self::add_entry( array(
				'user_id'     => $vendor_id,
				'order_id'    => $order->get_id(),
				'amount'      => $amount,
				'type'        => 'earning',
				'description' => sprintf( __( 'Ganancia por pedido #%s', 'tukitask-local-drivers' ), $order->get_order_number() ),
			) );
		}

		$order->update_meta_data( '_vendor_earning_processed', 'yes' );
		$order->save();

		// Clear balance cache for each vendor
		foreach ( array_keys( $vendor_earnings ) as $vendor_id ) {
			delete_transient( 'tukitask_vendor_balance_' . $vendor_id );
		}
	}
}
