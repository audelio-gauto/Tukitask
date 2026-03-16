<?php
/**
 * Uninstall script for Tukitask Local Drivers Pro.
 *
 * Fired when the plugin is uninstalled.
 *
 * @package Tukitask\LocalDrivers
 */

// If uninstall not called from WordPress, exit.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Remove plugin data on uninstall.
 */
function tukitask_ld_uninstall() {
	global $wpdb;

	// Remove custom roles.
	require_once plugin_dir_path( __FILE__ ) . 'includes/Drivers/Driver_Capabilities.php';
	\Tukitask\LocalDrivers\Drivers\Driver_Capabilities::remove_roles();

	// Delete all driver posts.
	$drivers = get_posts(
		array(
			'post_type'      => 'tukitask_driver',
			'posts_per_page' => -1,
			'post_status'    => 'any',
		)
	);

	foreach ( $drivers as $driver ) {
		wp_delete_post( $driver->ID, true );
	}

	// Delete plugin options.
	$options = array(
		'tukitask_ld_auto_assign_enabled',
		'tukitask_ld_base_price',
		'tukitask_ld_price_per_km',
		'tukitask_ld_max_distance',
		'tukitask_ld_default_driver_radius',
		'tukitask_ld_mobile_store_enabled',
		'tukitask_ld_mobile_store_radius',
		'tukitask_ld_google_maps_api_key',
		'tukitask_ld_cache_duration',
		'tukitask_ld_activated_at',
	);

	foreach ( $options as $option ) {
		delete_option( $option );
	}

	// Clear all transients.
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_tukitask_%'" );
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_tukitask_%'" );

	// Delete order metadata.
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE '_assigned_driver_%'" );
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE '_driver_assigned_%'" );
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE '_delivery_status%'" );
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE '_tracking_events%'" );
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE '_mobile_store_%'" );

	// Flush rewrite rules.
	flush_rewrite_rules();
}

tukitask_ld_uninstall();
