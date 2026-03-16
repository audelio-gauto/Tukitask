<?php
/**
 * Push Notification Management Service (FCM).
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Push_Manager Class.
 *
 * Handles Firebase Cloud Messaging registration and notification delivery.
 */
class Push_Manager {

	/**
	 * Register an FCM token for a user.
	 */
	public static function register_token( $user_id, $token ) {
		$tokens = get_user_meta( $user_id, '_tukitask_fcm_tokens', true );
		$tokens = is_array( $tokens ) ? $tokens : array();

		if ( ! in_array( $token, $tokens, true ) ) {
			$tokens[] = $token;
			// Keep only last 3 devices per user
			if ( count( $tokens ) > 3 ) array_shift( $tokens );
			update_user_meta( $user_id, '_tukitask_fcm_tokens', $tokens );
		}

		return true;
	}

	/**
	 * Send a Push Notification to a user.
	 *
	 * @param int    $user_id Recipient User ID.
	 * @param string $title   Notification title.
	 * @param string $body    Notification message.
	 * @param string $url     Deep link URL.
	 */
	public static function send_notification( $user_id, $title, $body, $url = '', $data = array() ) {
		$tokens = get_user_meta( $user_id, '_tukitask_fcm_tokens', true );
		if ( empty( $tokens ) || ! is_array( $tokens ) ) return false;

		$server_key = get_option( 'tukitask_ld_fcm_server_key' );
		if ( ! $server_key ) return false;

		$payload = array(
			'registration_ids' => $tokens,
			'notification'     => array(
				'title' => $title,
				'body'  => $body,
				'sound' => 'default',
				'click_action' => $url,
			),
			'data' => array_merge( array( 'url' => $url ), is_array( $data ) ? $data : array() ),
			'priority' => 'high'
		);

		return self::dispatch_fcm( $payload, $server_key );
	}

	/**
	 * Dispatch payload to FCM API.
	 */
	private static function dispatch_fcm( $payload, $server_key ) {
		$response = wp_remote_post( 'https://fcm.googleapis.com/fcm/send', array(
			'method'  => 'POST',
			'headers' => array(
				'Authorization' => 'key=' . $server_key,
				'Content-Type'  => 'application/json',
			),
			'body'    => wp_json_encode( $payload ),
			'timeout' => 15
		) );

		if ( is_wp_error( $response ) ) return false;

		$status = wp_remote_retrieve_response_code( $response );
		return ( 200 === $status );
	}
}
