<?php
/**
 * Plugin Verification Script
 * 
 * Verify all classes are properly defined and autoloading works.
 */

// Define plugin constants (same as in main plugin file).
define( 'TUKITASK_LD_VERSION', '1.0.0' );
define( 'TUKITASK_LD_PATH', __DIR__ . '/' );
define( 'TUKITASK_LD_URL', 'https://example.com/wp-content/plugins/tukitask-local-drivers/' );
define( 'TUKITASK_LD_BASENAME', 'tukitask-local-drivers/tukitask-local-drivers.php' );
define( 'TUKITASK_LD_FILE', __FILE__ );

// Register PSR-4 Autoloader.
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

echo "=== TUKITASK LOCAL DRIVERS - PLUGIN VERIFICATION ===\n\n";

// Test classes that should exist
$test_classes = array(
	'Tukitask\LocalDrivers\Core\Loader',
	'Tukitask\LocalDrivers\Core\Plugin',
	'Tukitask\LocalDrivers\Admin\Admin',
	'Tukitask\LocalDrivers\Admin\Settings',
	'Tukitask\LocalDrivers\Admin\Logistica_Admin',
	'Tukitask\LocalDrivers\Admin\Vendedores_Admin',
	'Tukitask\LocalDrivers\Admin\Admin_Intelligence',
	'Tukitask\LocalDrivers\Admin\Tower_Control',
	'Tukitask\LocalDrivers\Admin\Payouts_Admin',
	'Tukitask\LocalDrivers\Drivers\Driver_CPT',
	'Tukitask\LocalDrivers\Drivers\Driver_Meta',
	'Tukitask\LocalDrivers\Drivers\Driver_Capabilities',
	'Tukitask\LocalDrivers\Drivers\Driver_Availability',
	'Tukitask\LocalDrivers\Drivers\Wallet_Manager',
	'Tukitask\LocalDrivers\Frontend\Driver_Dashboard',
	'Tukitask\LocalDrivers\Frontend\Driver_Shortcodes',
	'Tukitask\LocalDrivers\Frontend\Vendedor_Dashboard',
	'Tukitask\LocalDrivers\Helpers\Security',
	'Tukitask\LocalDrivers\Helpers\Geo',
	'Tukitask\LocalDrivers\Helpers\Distance',
);

$errors   = array();
$warnings = array();
$success  = array();

foreach ( $test_classes as $class ) {
	if ( class_exists( $class ) ) {
		$success[] = "✅ $class";
	} else {
		$errors[] = "❌ $class NOT FOUND";
	}
}

// Display results
echo "CLASS VERIFICATION:\n";
echo str_repeat( "-", 70 ) . "\n";

foreach ( $success as $msg ) {
	echo $msg . "\n";
}

if ( ! empty( $errors ) ) {
	echo "\nERRORS:\n";
	echo str_repeat( "-", 70 ) . "\n";
	foreach ( $errors as $msg ) {
		echo $msg . "\n";
	}
}

echo "\n";
echo "SUMMARY:\n";
echo str_repeat( "-", 70 ) . "\n";
echo "✅ Classes Found: " . count( $success ) . "\n";
echo "❌ Classes Missing: " . count( $errors ) . "\n";
echo "Total: " . count( $test_classes ) . "\n";

if ( empty( $errors ) ) {
	echo "\n🎉 All classes loaded successfully!\n";
	exit( 0 );
} else {
	echo "\n⚠️  Some classes are missing!\n";
	exit( 1 );
}
?>
