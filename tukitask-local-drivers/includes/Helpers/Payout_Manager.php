<?php
/**
 * Marketplace Payout Management Service.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Payout_Manager Class.
 *
 * Manages vendor withdrawal requests, status transitions, and ledger history.
 */
class Payout_Manager {

	/**
	 * Create a new payout request.
	 *
	 * @param array $data {vendor_id: int, amount: float, payment_method: string}.
	 * @return int|bool Request ID or false on failure.
	 */
	public static function create_request( $data ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		$inserted = $wpdb->insert(
			$table_name,
			array(
				'vendor_id'      => intval( $data['vendor_id'] ),
				'amount'         => floatval( $data['amount'] ),
				'payment_method' => sanitize_text_field( $data['payment_method'] ),
				'status'         => 'pending',
				'created_at'     => current_time( 'mysql' ),
			),
			array( '%d', '%f', '%s', '%s', '%s' )
		);

		if ( $inserted ) {
			// Notify Admin
			$admin_email = get_option( 'admin_email' );
			$subject = sprintf( __( '[%s] Nueva Solicitud de Retiro', 'tukitask-local-drivers' ), get_bloginfo( 'name' ) );
			$vendor = get_userdata( $data['vendor_id'] );
			$message = sprintf( 
				__( 'Hola, el vendedor %s ha solicitado un retiro de %s. Por favor, revisa el panel de administración.', 'tukitask-local-drivers' ),
				$vendor ? $vendor->display_name : 'N/A',
				wc_price( $data['amount'] )
			);
			wp_mail( $admin_email, $subject, $message );

			return $wpdb->insert_id;
		}

		return false;
	}

	/**
	 * Get payout requests for a vendor.
	 */
	public static function get_vendor_payouts( $vendor_id, $limit = 20 ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		return $wpdb->get_results( $wpdb->prepare(
			"SELECT * FROM $table_name WHERE vendor_id = %d ORDER BY created_at DESC LIMIT %d",
			$vendor_id,
			$limit
		) );
	}

	/**
	 * Get all active requests (for Admin).
	 */
	public static function get_all_requests( $status = '' ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		$where = $status ? $wpdb->prepare( "WHERE status = %s", $status ) : "";
		return $wpdb->get_results( "SELECT * FROM $table_name $where ORDER BY created_at DESC" );
	}

	/**
	 * Get status counts for tabs.
	 */
	public static function get_status_counts() {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';
		
		$results = $wpdb->get_results( "SELECT status, COUNT(*) as count FROM $table_name GROUP BY status" );
		$counts = array( 'pending' => 0, 'processing' => 0, 'paid' => 0, 'rejected' => 0, 'all' => 0 );
		
		foreach ( $results as $row ) {
			if ( isset( $counts[$row->status] ) ) {
				$counts[$row->status] = (int) $row->count;
			}
			$counts['all'] += (int) $row->count;
		}
		
		return $counts;
	}

	/**
	 * Update payout status.
	 */
	public static function update_status( $id, $status, $admin_note = '', $transaction_id = '' ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		return $wpdb->update(
			$table_name,
			array(
				'status'         => sanitize_text_field( $status ),
				'admin_note'     => sanitize_textarea_field( $admin_note ),
				'transaction_id' => sanitize_text_field( $transaction_id ),
				'updated_at'     => current_time( 'mysql' ),
			),
			array( 'id' => $id ),
			array( '%s', '%s', '%s', '%s' ),
			array( '%d' )
		);
	}

	/**
	 * Get total pending/processing payout amount for a vendor.
	 */
	public static function get_locked_balance( $vendor_id ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		return floatval( $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM $table_name WHERE vendor_id = %d AND status IN ('pending', 'processing')",
			$vendor_id
		) ) );
	}
}
