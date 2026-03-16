<?php
/**
 * Real-time Messenger Service.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Chat_Manager Class.
 *
 * Manages saving and retrieving chat messages for orders.
 */
class Chat_Manager {

	/**
	 * Save a new chat message.
	 *
	 * @param array $data Message data (order_id, sender_id, recipient_id, content).
	 * @return int|bool Message ID or false on failure.
	 */
	public static function send_message( $data ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_messages';

		$inserted = $wpdb->insert(
			$table_name,
			array(
				'order_id'     => intval( $data['order_id'] ),
				'sender_id'    => intval( $data['sender_id'] ),
				'recipient_id' => intval( $data['recipient_id'] ),
				'content'      => sanitize_textarea_field( $data['content'] ),
				'created_at'   => current_time( 'mysql' ),
			),
			array( '%d', '%d', '%d', '%s', '%s' )
		);

		return $inserted ? $wpdb->insert_id : false;
	}

	/**
	 * Get messages for an order.
	 *
	 * @param int $order_id Order ID.
	 * @param int $last_id  Last seen message ID for polling.
	 * @return array Array of message objects.
	 */
	public static function get_messages( $order_id, $last_id = 0 ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_messages';

		return $wpdb->get_results( $wpdb->prepare(
			"SELECT * FROM $table_name WHERE order_id = %d AND id > %d ORDER BY id ASC",
			$order_id,
			$last_id
		) );
	}

	/**
	 * Mark messages as read for a recipient in an order.
	 */
	public static function mark_as_read( $order_id, $recipient_id ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_messages';

		$wpdb->update(
			$table_name,
			array( 'is_read' => 1 ),
			array( 'order_id' => $order_id, 'recipient_id' => $recipient_id, 'is_read' => 0 ),
			array( '%d' ),
			array( '%d', '%d', '%d' )
		);
	}

	/**
	 * Get unread count for a user across all orders.
	 */
	public static function get_unread_count( $user_id ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_messages';

		return intval( $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(id) FROM $table_name WHERE recipient_id = %d AND is_read = 0",
			$user_id
		) ) );
	}
}
