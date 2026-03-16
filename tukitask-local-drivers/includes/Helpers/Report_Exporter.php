<?php
/**
 * Marketplace Financial Report Exporter.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Report_Exporter Class.
 *
 * Handles the generation and download of CSV financial reports.
 */
class Report_Exporter {

	/**
	 * Export completed orders report as CSV.
	 */
	public static function export_financial_report() {
		if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Sin permisos.' );

		global $wpdb;
		$results = $wpdb->get_results( "
			SELECT p.ID, p.post_date, m1.meta_value as total, 
			       (SELECT amount FROM {$wpdb->prefix}tukitask_ledger l WHERE l.order_id = p.ID AND l.type = 'marketplace_commission' LIMIT 1) as commission
			FROM {$wpdb->posts} p
			JOIN {$wpdb->postmeta} m1 ON p.ID = m1.post_id
			WHERE p.post_type = 'shop_order' AND p.post_status = 'wc-completed'
			AND m1.meta_key = '_order_total'
			ORDER BY p.post_date DESC
		" );

		$filename = 'tukitask-financial-report-' . date( 'Y-m-d' ) . '.csv';

		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );

		$output = fopen( 'php://output', 'w' );
		fputcsv( $output, array( 'Pedido ID', 'Fecha', 'Total ($)', 'Comisión ($)', 'Neto Vendor ($)' ) );

		foreach ( $results as $row ) {
			$total = (float) $row->total;
			$comm = (float) $row->commission;
			$net = $total - $comm;

			fputcsv( $output, array(
				$row->ID,
				$row->post_date,
				number_format( $total, 2 ),
				number_format( $comm, 2 ),
				number_format( $net, 2 )
			) );
		}

		fclose( $output );
		exit;
	}
}
