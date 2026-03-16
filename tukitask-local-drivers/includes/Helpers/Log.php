<?php
/**
 * Centralized Logging Utility.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

/**
 * Log Class.
 *
 * Provides static methods for logging errors and debug information.
 */
class Log {

	/**
	 * Log an error message.
	 *
	 * @param string $message Error message.
	 * @param mixed  $context Optional context data.
	 */
	public static function error( $message, $context = null ) {
		self::record( 'ERROR', $message, $context );
	}

	/**
	 * Log a warning message.
	 *
	 * @param string $message Warning message.
	 * @param mixed  $context Optional context data.
	 */
	public static function warn( $message, $context = null ) {
		self::record( 'WARNING', $message, $context );
	}

	/**
	 * Log an informational message.
	 *
	 * @param string $message Info message.
	 * @param mixed  $context Optional context data.
	 */
	public static function info( $message, $context = null ) {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			self::record( 'INFO', $message, $context );
		}
	}

	/**
	 * Record a log entry.
	 *
	 * @param string $level   Log level.
	 * @param string $message Message.
	 * @param mixed  $context Context.
	 */
	private static function record( $level, $message, $context = null ) {
		$log_entry = sprintf( '[Tukitask-Local-Drivers][%s] %s', $level, $message );
		
		if ( null !== $context ) {
			$log_entry .= ' | Context: ' . ( is_scalar( $context ) ? $context : wp_json_encode( $context ) );
		}

		error_log( $log_entry );
	}
}
