<?php
/**
 * Marketplace Commission Management Engine.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Commission_Manager Class.
 *
 * Manages marketplace earnings calculations based on categories and fixed rates.
 */
class Commission_Manager {

	/**
	 * Get the commission data for a specific product.
	 *
	 * @param int $product_id Product ID.
	 * @return array {type: string, value: float, fixed: float}
	 */
	public static function get_product_commission( $product_id ) {
		$vendor_id = get_post_field( 'post_author', $product_id );
		$global_type = get_option( 'tukitask_ld_commission_type', 'percentage' );
		
		// 1. Check for Category override
		$terms = get_the_terms( $product_id, 'product_cat' );
		if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) {
			foreach ( $terms as $term ) {
				$cat_comm = get_term_meta( $term->term_id, '_tukitask_cat_commission', true );
				if ( $cat_comm !== '' ) {
					return array(
						'type'  => 'percentage', // Categories currently only support %
						'value' => floatval( $cat_comm ),
						'fixed' => ( 'fixed' === $global_type || 'both' === $global_type ) ? self::get_global_fixed_fee() : 0
					);
				}
			}
		}

		// 2. Check for Vendor override
		if ( $vendor_id ) {
			$v_comm = get_user_meta( $vendor_id, '_tukitask_vendor_commission', true );
			if ( $v_comm !== '' ) {
				$v_fixed = get_user_meta( $vendor_id, '_tukitask_vendor_fixed_fee', true );
				return array(
					'type'  => ( $v_comm > 0 && $v_fixed > 0 ) ? 'both' : ( ($v_fixed > 0) ? 'fixed' : 'percentage' ),
					'value' => floatval( $v_comm ),
					'fixed' => floatval( $v_fixed )
				);
			}
		}

		// 3. Fallback to Global
		$val  = floatval( get_option( 'tukitask_ld_global_commission_val', 10 ) );
		$fix  = self::get_global_fixed_fee();

		if ( 'fixed' === $global_type ) {
			return array( 'type' => 'fixed', 'value' => 0, 'fixed' => $fix );
		} elseif ( 'both' === $global_type ) {
			return array( 'type' => 'both', 'value' => $val, 'fixed' => $fix );
		}

		return array(
			'type'  => 'percentage',
			'value' => $val,
			'fixed' => 0
		);
	}

	/**
	 * Calculate marketplace share for an order item.
	 *
	 * @param float $item_total Pre-tax item total.
	 * @param int   $product_id Product ID.
	 * @return float Commission amount.
	 */
	public static function calculate_commission( $item_total, $product_id ) {
		$data = self::get_product_commission( $product_id );
		
		$commission = 0;
		if ( $data['value'] > 0 ) {
			$commission += ( $item_total * ( $data['value'] / 100 ) );
		}
		
		if ( $data['fixed'] > 0 ) {
			$commission += $data['fixed'];
		}
		
		return $commission;
	}

	/**
	 * Get the commission fees for a specific driver based on transport mode.
	 *
	 * @param int $driver_id Driver Post ID.
	 * @return array {commission: float, fixed: float}
	 */
	public static function get_driver_fees( $driver_id ) {
		$transport_mode = get_post_meta( $driver_id, '_driver_transport_mode', true );
		$transport_mode = $transport_mode ? $transport_mode : 'moto'; // Default

		$prefix = 'tukitask_ld_' . $transport_mode;
		
		$commission = (float) get_option( $prefix . '_commission', 0 );
		$fixed_fee  = (float) get_option( $prefix . '_fixed_fee', 0 );

		return array(
			'commission' => $commission,
			'fixed'      => $fixed_fee
		);
	}

	/**
	 * Get global fixed fee from settings.
	 */
	private static function get_global_fixed_fee() {
		return floatval( get_option( 'tukitask_ld_global_fixed_fee', 0 ) );
	}
}
