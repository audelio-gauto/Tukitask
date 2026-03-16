<?php
/**
 * Marketplace Review Management Service.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Review_Manager Class.
 *
 * Centralizes logic for saving, retrieving, and calculating ratings.
 */
class Review_Manager {

	/**
	 * Save a new review.
	 *
	 * @param array $data Review data (item_id, customer_id, target_id, target_type, rating, comment).
	 * @return int|bool Review ID or false on failure.
	 */
	public static function add_review( $data ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_reviews';

		$inserted = $wpdb->insert(
			$table_name,
			array(
				'item_id'     => intval( $data['item_id'] ),
				'customer_id' => intval( $data['customer_id'] ),
				'target_id'   => intval( $data['target_id'] ),
				'target_type' => sanitize_text_field( $data['target_type'] ),
				'rating'      => floatval( $data['rating'] ),
				'comment'     => sanitize_textarea_field( $data['comment'] ),
				'created_at'  => current_time( 'mysql' ),
			),
			array( '%d', '%d', '%d', '%s', '%f', '%s', '%s' )
		);

		return $inserted ? $wpdb->insert_id : false;
	}

	/**
	 * Get average rating for a target.
	 *
	 * @param int    $target_id   Target Post/User ID.
	 * @param string $target_type 'driver' or 'vendor'.
	 * @return array {rating: float, count: int}
	 */
	public static function get_average_rating( $target_id, $target_type ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_reviews';

		$stats = $wpdb->get_row( $wpdb->prepare(
			"SELECT AVG(rating) as avg_rating, COUNT(id) as total_reviews FROM $table_name WHERE target_id = %d AND target_type = %s",
			$target_id,
			$target_type
		) );

		return array(
			'rating' => ( $stats && $stats->avg_rating ) ? round( floatval( $stats->avg_rating ), 1 ) : 0.0,
			'count'  => ( $stats && $stats->total_reviews ) ? intval( $stats->total_reviews ) : 0,
		);
	}

	/**
	 * Get reviews for a specific target.
	 */
	public static function get_reviews_by_target( $target_id, $target_type, $limit = 10 ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_reviews';

		return $wpdb->get_results( $wpdb->prepare(
			"SELECT * FROM $table_name WHERE target_id = %d AND target_type = %s ORDER BY created_at DESC LIMIT %d",
			$target_id,
			$target_type,
			$limit
		) );
	}
}
