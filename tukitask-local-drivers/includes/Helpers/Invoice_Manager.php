<?php
/**
 * Invoice and Receipt Management Service.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Invoice_Manager Class.
 *
 * Automates the generation of delivery receipts and commission invoices.
 */
class Invoice_Manager {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'wp_ajax_tukitask_download_invoice', $this, 'ajax_download_invoice' );
	}

	/**
	 * AJAX handler to download/view invoice.
	 */
	public function ajax_download_invoice() {
		$type = isset( $_GET['type'] ) ? sanitize_text_field( $_GET['type'] ) : 'receipt';
		$id   = isset( $_GET['id'] ) ? intval( $_GET['id'] ) : 0;

		if ( ! $id ) wp_die( 'ID inválido.' );

		if ( 'receipt' === $type ) {
			$this->render_delivery_receipt( $id );
		} else {
			$this->render_payout_invoice( $id );
		}
		exit;
	}

	/**
	 * Render a printable Delivery Receipt for customers.
	 */
	private function render_delivery_receipt( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) wp_die( 'Pedido no encontrado.' );

		$business = $this->get_business_info();
		include TUKITASK_LD_PATH . 'includes/Templates/invoice-receipt.php';
	}

	/**
	 * Render a printable Commission Invoice for vendors.
	 */
	private function render_payout_invoice( $payout_id ) {
		// Logic to fetch payout data from the ledger
		global $wpdb;
		$payout = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}tukitask_payouts WHERE id = %d", $payout_id ) );
		
		if ( ! $payout ) wp_die( 'Registro de pago no encontrado.' );

		$business = $this->get_business_info();
		include TUKITASK_LD_PATH . 'includes/Templates/invoice-payout.php';
	}

	/**
	 * Get business info from settings.
	 */
	private function get_business_info() {
		return array(
			'name'    => get_option( 'tukitask_ld_billing_name', get_bloginfo( 'name' ) ),
			'address' => get_option( 'tukitask_ld_billing_address', '' ),
			'tax_id'  => get_option( 'tukitask_ld_billing_tax_id', '' ),
			'email'   => get_option( 'admin_email' ),
			'logo'    => get_option( 'tukitask_ld_billing_logo', '' )
		);
	}
}
