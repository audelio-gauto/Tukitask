<?php
/**
 * Simple Ride Logger stored in wp_options for telemetry.
 * Functions:
 *  - tuki_ride_log_event( $ride_id, $action, $user_id = 0, $meta = array() )
 *  - tuki_get_ride_logs( $limit = 200 )
 */

if ( ! defined( 'TUKITASK_RIDE_LOG_TABLE' ) ) {
	define( 'TUKITASK_RIDE_LOG_TABLE', '' );
}

if ( ! function_exists( 'tuki_ride_logger_install' ) ) {
	function tuki_ride_logger_install() {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_ride_logs';
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$table_name} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			time INT UNSIGNED NOT NULL,
			ride_id VARCHAR(191) NOT NULL,
			action VARCHAR(60) NOT NULL,
			user_id BIGINT UNSIGNED DEFAULT 0,
			meta LONGTEXT,
			PRIMARY KEY  (id),
			KEY ride_id (ride_id),
			KEY time_idx (time)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
		return $table_name;
	}
}

if ( ! function_exists( 'tuki_migrate_ride_logs_option_to_table' ) ) {
	function tuki_migrate_ride_logs_option_to_table() {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ride_logs';
		$logs = get_option( 'tukitask_ride_logs', array() );
		if ( empty( $logs ) || ! is_array( $logs ) ) return 0;
		foreach ( $logs as $l ) {
			$wpdb->insert( $table, array(
				'time' => isset( $l['time'] ) ? intval( $l['time'] ) : time(),
				'ride_id' => isset( $l['ride_id'] ) ? substr( sanitize_text_field( $l['ride_id'] ), 0, 191 ) : '',
				'action' => isset( $l['action'] ) ? substr( sanitize_text_field( $l['action'] ), 0, 60 ) : '',
				'user_id' => isset( $l['user_id'] ) ? intval( $l['user_id'] ) : 0,
				'meta' => isset( $l['meta'] ) ? wp_json_encode( $l['meta'] ) : null,
			), array( '%d', '%s', '%s', '%d', '%s' ) );
		}
		// Remove old option
		delete_option( 'tukitask_ride_logs' );
		return true;
	}
}

if ( ! function_exists( 'tuki_ride_log_event' ) ) {
	function tuki_ride_log_event( $ride_id, $action, $user_id = 0, $meta = array() ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ride_logs';
		// If table doesn't exist, fallback to option storage
		$has_table = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $wpdb->esc_like( $table ) ) );
		if ( $has_table ) {
			$wpdb->insert( $table, array(
				'time' => time(),
				'ride_id' => substr( sanitize_text_field( $ride_id ), 0, 191 ),
				'action' => substr( sanitize_text_field( $action ), 0, 60 ),
				'user_id' => intval( $user_id ),
				'meta' => wp_json_encode( is_array( $meta ) ? $meta : array() ),
			), array( '%d', '%s', '%s', '%d', '%s' ) );
			return true;
		}

		// Fallback: option
		$logs = get_option( 'tukitask_ride_logs', array() );
		if ( ! is_array( $logs ) ) $logs = array();
		$logs[] = array(
			'time' => time(),
			'ride_id' => $ride_id,
			'action' => $action,
			'user_id' => intval( $user_id ),
			'meta' => is_array( $meta ) ? $meta : array(),
		);
		if ( count( $logs ) > 1000 ) $logs = array_slice( $logs, -1000 );
		update_option( 'tukitask_ride_logs', $logs );
		return true;
	}
}

if ( ! function_exists( 'tuki_get_ride_logs' ) ) {
	function tuki_get_ride_logs( $limit = 200 ) {
		global $wpdb;
		$table = $wpdb->prefix . 'tukitask_ride_logs';
		$has_table = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $wpdb->esc_like( $table ) ) );
		if ( $has_table ) {
			$limit = intval( $limit );
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT time, ride_id, action, user_id, meta FROM {$table} ORDER BY time DESC LIMIT %d", $limit ), ARRAY_A );
			if ( empty( $rows ) ) return array();
			// Normalize meta
			foreach ( $rows as &$r ) {
				$r['meta'] = $r['meta'] ? json_decode( $r['meta'], true ) : array();
			}
			return $rows;
		}
		// Fallback to option
		$logs = get_option( 'tukitask_ride_logs', array() );
		if ( ! is_array( $logs ) ) return array();
		$logs = array_reverse( $logs );
		if ( $limit > 0 ) $logs = array_slice( $logs, 0, $limit );
		return $logs;
	}
}
