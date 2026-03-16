<?php
/**
 * Plugin Name: Tukitask Local Drivers Pro
 * Plugin URI: https://tukitask.com
 * Description: Sistema profesional de asignación automática de conductores locales, envíos WooCommerce por distancia y tienda móvil en movimiento.
 * Version: 1.0.0
 * Author: Tukitask Developer
 * Author URI: https://tukitask.com
 * Text Domain: tukitask-local-drivers
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 8.5
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package Tukitask\LocalDrivers
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

// Define plugin constants.
define( 'TUKITASK_LD_VERSION', '1.2.0' );
define( 'TUKITASK_LD_PATH', plugin_dir_path( __FILE__ ) );
define( 'TUKITASK_LD_URL', plugin_dir_url( __FILE__ ) );
define( 'TUKITASK_LD_BASENAME', plugin_basename( __FILE__ ) );
define( 'TUKITASK_LD_FILE', __FILE__ );

/**
 * Check if WooCommerce is active before initializing.
 */
function tukitask_ld_check_woocommerce() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', 'tukitask_ld_woocommerce_missing_notice' );
		return false;
	}
	return true;
}

/**
 * Display admin notice if WooCommerce is not active.
 */
function tukitask_ld_woocommerce_missing_notice() {
	?>
	<div class="notice notice-error">
		<p>
			<strong><?php esc_html_e( 'Tukitask Local Drivers Pro', 'tukitask-local-drivers' ); ?></strong>
			<?php esc_html_e( 'requiere que WooCommerce esté instalado y activado.', 'tukitask-local-drivers' ); ?>
		</p>
	</div>
	<?php
}

/**
 * PSR-4 Autoloader for plugin classes.
 *
 * @param string $class The fully-qualified class name.
 */
spl_autoload_register(
	function ( $class ) {
		$prefix   = 'Tukitask\\LocalDrivers\\';
		$base_dir = TUKITASK_LD_PATH . 'includes/';

		$len = strlen( $prefix );
		if ( strncmp( $prefix, $class, $len ) !== 0 ) {
			return;
		}

		$relative_class = substr( $class, $len );
		$file           = $base_dir . str_replace( '\\', '/', $relative_class ) . '.php';

		if ( file_exists( $file ) ) {
			require $file;
		}
	}
);

/**
 * Initialize the plugin on 'init' hook.
 * This ensures WooCommerce and other dependencies have loaded their translations.
 */
function tukitask_local_drivers_init() {
		// Custom Post Type para rides
		require_once __DIR__ . '/includes/Custom_PostTypes/Ride.php';
		// Ride logger helper
		require_once __DIR__ . '/includes/Helpers/Ride_Logger.php';
	// Initialize even without WooCommerce to allow admin menu access.
	tukitask_ld_check_woocommerce();

	// Load text domain for translations.
	load_plugin_textdomain(
		'tukitask-local-drivers',
		false,
		dirname( TUKITASK_LD_BASENAME ) . '/languages'
	);
	// Registrar dashboard cliente (shortcode)
	require_once __DIR__ . '/includes/Frontend/Cliente_Dashboard.php';
	// Registrar shortcodes de páginas individuales de tarjetas
	require_once __DIR__ . '/includes/Frontend/Cliente_CardPages.php';

	// Initialize the main plugin class.
	return \Tukitask\LocalDrivers\Core\Plugin::get_instance();
}
add_action( 'init', 'tukitask_local_drivers_init', 1 );

/**
 * Declare HPOS compatibility.
 */
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
				'custom_order_tables',
				TUKITASK_LD_FILE,
				true
			);
		}
	}
);

/**
 * Activation hook.
 */
register_activation_hook(
	__FILE__,
	function () {
		// Just notify if WooCommerce is missing, but allow activation for settings access.
		tukitask_ld_check_woocommerce();

		// Require the Plugin class for activation.
		require_once TUKITASK_LD_PATH . 'includes/Core/Plugin.php';
		require_once TUKITASK_LD_PATH . 'includes/Drivers/Driver_CPT.php';
		require_once TUKITASK_LD_PATH . 'includes/Drivers/Driver_Capabilities.php';

		\Tukitask\LocalDrivers\Core\Plugin::activate();
	}
);

// Activation: ensure ride logger table exists and migrate option logs
register_activation_hook( __FILE__, function() {
    if ( file_exists( TUKITASK_LD_PATH . 'includes/Helpers/Ride_Logger.php' ) ) {
        require_once TUKITASK_LD_PATH . 'includes/Helpers/Ride_Logger.php';
        if ( function_exists( 'tuki_ride_logger_install' ) ) {
            tuki_ride_logger_install();
        }
        if ( function_exists( 'tuki_migrate_ride_logs_option_to_table' ) ) {
            tuki_migrate_ride_logs_option_to_table();
        }
    }
} );

/**
 * Deactivation hook.
 */
register_deactivation_hook(
	__FILE__,
	function () {
		require_once TUKITASK_LD_PATH . 'includes/Core/Plugin.php';
		\Tukitask\LocalDrivers\Core\Plugin::deactivate();
	}
);
