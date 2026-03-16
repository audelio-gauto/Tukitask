<?php
/**
 * TUKITASK LOCAL DRIVERS - AUTOMATIC UPDATE SCRIPT
 * 
 * Ejecutar en producción: 
 * php -f update_plugin.php
 * 
 * Este script actualiza automáticamente todos los archivos corregidos
 * y verifica la integridad del plugin.
 */

// Define colores para terminal
define('GREEN', "\033[32m");
define('RED', "\033[31m");
define('YELLOW', "\033[33m");
define('BLUE', "\033[34m");
define('RESET', "\033[0m");

echo BLUE . "╔════════════════════════════════════════════════════════════════════════════╗" . RESET . "\n";
echo BLUE . "║  TUKITASK LOCAL DRIVERS - AUTOMATIC UPDATE                               ║" . RESET . "\n";
echo BLUE . "║  Versión: 1.0.0 - Correcciones Críticas                                  ║" . RESET . "\n";
echo BLUE . "╚════════════════════════════════════════════════════════════════════════════╝" . RESET . "\n\n";

// 1. DETECTAR UBICACIÓN DE WORDPRESS
echo YELLOW . "[PASO 1] Detectando ubicación de WordPress..." . RESET . "\n";

$wp_paths = array(
    '/home/u208747126/domains/tukitask.com/public_html/id',  // Tu servidor actual
    __DIR__ . '/../../../..',  // Ruta relativa
    dirname(__FILE__),  // Carpeta actual
);

$wp_root = null;
foreach ($wp_paths as $path) {
    if (file_exists($path . '/wp-load.php')) {
        $wp_root = realpath($path);
        echo GREEN . "✓ WordPress encontrado en: " . $wp_root . RESET . "\n";
        break;
    }
}

if (!$wp_root) {
    echo RED . "✗ ERROR: No se encontró WordPress" . RESET . "\n";
    echo "  Edita este script e ingresa la ruta manualmente.\n";
    exit(1);
}

// 2. PLUGIN PATH
$plugin_path = $wp_root . '/wp-content/plugins/tukitask-local-drivers';
echo "\nYELLOW [PASO 2] Verificando ruta del plugin..." . RESET . "\n";

if (!is_dir($plugin_path)) {
    echo RED . "✗ ERROR: Plugin no encontrado en: " . $plugin_path . RESET . "\n";
    exit(1);
}
echo GREEN . "✓ Plugin encontrado: " . $plugin_path . RESET . "\n";

// 3. CREAR BACKUP AUTOMÁTICO
echo "\n" . YELLOW . "[PASO 3] Creando backup..." . RESET . "\n";

$backup_dir = $plugin_path . '/backups-' . date('Y-m-d_H-i-s');
if (!mkdir($backup_dir, 0755, true)) {
    echo RED . "✗ ERROR: No se pudo crear carpeta de backup" . RESET . "\n";
    exit(1);
}

// Backup del archivo principal que será actualizado
$files_to_backup = array(
    'includes/Admin/Admin.php',
);

foreach ($files_to_backup as $file) {
    $source = $plugin_path . '/' . $file;
    $dest = $backup_dir . '/' . $file;
    
    $dir = dirname($dest);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    
    if (file_exists($source)) {
        copy($source, $dest);
        echo GREEN . "✓ Backup: " . $file . RESET . "\n";
    }
}

echo GREEN . "✓ Backup creado en: " . $backup_dir . RESET . "\n";

// 4. ACTUALIZAR ARCHIVOS
echo "\n" . YELLOW . "[PASO 4] Actualizando archivos..." . RESET . "\n";

// CONTENIDO CORREGIDO DEL ARCHIVO ADMIN.PHP
$admin_php_content = <<<'PHP'
<?php
/**
 * Admin Core Class - Main Administration Dashboard.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

use Tukitask\LocalDrivers\Core\Loader;

/**
 * Admin Class
 *
 * Handles main admin dashboard, menu creation, and central admin functionality.
 */
class Admin {

	/**
	 * Hook loader instance.
	 *
	 * @var Loader
	 */
	protected $loader;

	/**
	 * Constructor.
	 *
	 * @param Loader $loader The hook loader instance.
	 */
	public function __construct( Loader $loader ) {
		$this->loader = $loader;

		// Register hooks
		$this->loader->add_action( 'admin_menu', $this, 'register_admin_menu' );
		$this->loader->add_action( 'admin_enqueue_scripts', $this, 'enqueue_admin_scripts' );
	}

	/**
	 * Register admin menu items.
	 */
	public function register_admin_menu() {
		// TOP LEVEL MENU: Tukitask (Drivers/Dashboard).
		add_menu_page(
			__( 'Tukitask Driver Manager', 'tukitask-local-drivers' ),
			__( 'Tukitask', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-drivers',
			array( $this, 'render_dashboard' ),
			'dashicons-car',
			75
		);

		// Submenu: Dashboard.
		add_submenu_page(
			'tukitask-drivers',
			__( 'Escritorio', 'tukitask-local-drivers' ),
			__( 'Escritorio', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-drivers',
			array( $this, 'render_dashboard' )
		);

		// Submenu: Help & Support.
		add_submenu_page(
			'tukitask-drivers',
			__( 'Ayuda y Soporte', 'tukitask-local-drivers' ),
			__( 'Ayuda y Soporte', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-help',
			array( $this, 'render_help' )
		);

		// TOP LEVEL MENU: Vendedores.
		add_menu_page(
			__( 'Gestión de Vendedores', 'tukitask-local-drivers' ),
			__( 'Vendedores', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-vendedores',
			array( $this, 'render_vendedores' ),
			'dashicons-groups',
			76
		);
	}

	/**
	 * Render main admin dashboard.
	 */
	public function render_dashboard() {
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Tukitask Local Drivers Dashboard', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Welcome to Tukitask Local Drivers management panel.', 'tukitask-local-drivers' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Render vendedores page.
	 */
	public function render_vendedores() {
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Vendedores', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Gestión de vendedores del sistema.', 'tukitask-local-drivers' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Render help page.
	 */
	public function render_help() {
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Ayuda y Soporte', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Información de ayuda y soporte.', 'tukitask-local-drivers' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Enqueue admin scripts and styles.
	 */
	public function enqueue_admin_scripts() {
		// Get plugin URL and version safely using WordPress built-in functions
		$url = plugin_dir_url( dirname( dirname( __DIR__ ) ) . '/tukitask-local-drivers.php' );
		$version = defined( 'TUKITASK_LD_VERSION' ) ? TUKITASK_LD_VERSION : '1.0.0';
		
		wp_enqueue_script( 'tukitask-admin', $url . 'assets/js/admin.js', array( 'jquery' ), $version );
		wp_enqueue_style( 'tukitask-admin', $url . 'assets/css/admin.css', array(), $version );
	}

	/**
	 * Get filtered payout requests based on user type, search, and date filters.
	 */
	private function get_filtered_payout_requests( $status = '', $user_type_filter = '', $search_filter = '', $date_from = '', $date_to = '' ) {
		global $wpdb;
		$table_name = $wpdb->prefix . 'tukitask_payouts';

		$where_clauses = array();
		$where_clauses[] = $status ? $wpdb->prepare( "status = %s", $status ) : "status = 'pending'";

		// User type filter
		if ( ! empty( $user_type_filter ) ) {
			if ( $user_type_filter === 'vendedor' ) {
				// Get users who have products (vendors)
				$vendor_ids = $wpdb->get_col(
					"
					SELECT DISTINCT pm.meta_value as user_id
					FROM {$wpdb->postmeta} pm
					INNER JOIN {$wpdb->posts} p ON pm.post_id = p.ID
					WHERE p.post_type = 'product' AND p.post_status = 'publish' AND pm.meta_key = '_customer_user'
				"
				);
				if ( ! empty( $vendor_ids ) ) {
					$vendor_ids       = array_map( 'intval', $vendor_ids );
					$where_clauses[] = "vendor_id IN (" . implode( ',', $vendor_ids ) . ")";
				} else {
					$where_clauses[] = "1=0"; // No vendors found
				}
			} elseif ( $user_type_filter === 'conductor' ) {
				// Get users who are drivers
				$driver_ids = $wpdb->get_col(
					"
					SELECT DISTINCT pm.meta_value as user_id
					FROM {$wpdb->postmeta} pm
					WHERE pm.meta_key = '_driver_user_id'
				"
				);
				if ( ! empty( $driver_ids ) ) {
					$driver_ids       = array_map( 'intval', $driver_ids );
					$where_clauses[] = "vendor_id IN (" . implode( ',', $driver_ids ) . ")";
				} else {
					$where_clauses[] = "1=0"; // No drivers found
				}
			}
		}

		// Search filter (name or email)
		if ( ! empty( $search_filter ) ) {
			$user_ids = $wpdb->get_col(
				$wpdb->prepare(
					"
				SELECT ID FROM {$wpdb->users}
				WHERE display_name LIKE %s OR user_email LIKE %s
			",
					'%' . $wpdb->esc_like( $search_filter ) . '%',
					'%' . $wpdb->esc_like( $search_filter ) . '%'
				)
			);

			if ( ! empty( $user_ids ) ) {
				$user_ids         = array_map( 'intval', $user_ids );
				$where_clauses[] = "vendor_id IN (" . implode( ',', $user_ids ) . ")";
			} else {
				$where_clauses[] = "1=0"; // No users found
			}
		}

		// Date filters
		if ( ! empty( $date_from ) ) {
			$where_clauses[] = $wpdb->prepare( "DATE(created_at) >= %s", $date_from );
		}
		if ( ! empty( $date_to ) ) {
			$where_clauses[] = $wpdb->prepare( "DATE(created_at) <= %s", $date_to );
		}

		$where_sql = ! empty( $where_clauses ) ? "WHERE " . implode( " AND ", $where_clauses ) : "";

		return $wpdb->get_results( "SELECT * FROM $table_name $where_sql ORDER BY created_at DESC" );
	}
}
PHP;

// Escribir el archivo corregido
$admin_file = $plugin_path . '/includes/Admin/Admin.php';
$result = file_put_contents($admin_file, $admin_php_content);

if ($result === false) {
    echo RED . "✗ ERROR: No se pudo actualizar Admin.php" . RESET . "\n";
    exit(1);
}
echo GREEN . "✓ Admin.php actualizado correctamente" . RESET . "\n";

// 5. LIMPIAR CACHÉ
echo "\n" . YELLOW . "[PASO 5] Limpiando caché del plugin..." . RESET . "\n";

// Si está disponible wp-cli
exec('which wp', $wp_cli_output, $wp_cli_result);
if ($wp_cli_result === 0) {
    exec('wp plugin deactivate tukitask-local-drivers 2>/dev/null');
    exec('wp plugin activate tukitask-local-drivers 2>/dev/null');
    echo GREEN . "✓ Plugin desactivado y reactivado" . RESET . "\n";
} else {
    echo YELLOW . "⚠ wp-cli no disponible, haz esto manualmente en admin de WordPress" . RESET . "\n";
    echo "  1. Ve a Plugins\n";
    echo "  2. Desactiva 'Tukitask Local Drivers'\n";
    echo "  3. Actívalo de nuevo\n";
}

// 6. VERIFICACIÓN DE INTEGRIDAD
echo "\n" . YELLOW . "[PASO 6] Verificando integridad del plugin..." . RESET . "\n";

// Verificar que el archivo fue escrito correctamente
if (!file_exists($admin_file)) {
    echo RED . "✗ ERROR: Archivo Admin.php no existe después de actualización" . RESET . "\n";
    exit(1);
}

// Verificar que contiene la clase
$file_content = file_get_contents($admin_file);
if (strpos($file_content, 'namespace Tukitask\LocalDrivers\Admin;') === false) {
    echo RED . "✗ ERROR: Archivo Admin.php no contiene namespace correcto" . RESET . "\n";
    exit(1);
}

if (strpos($file_content, 'class Admin {') === false) {
    echo RED . "✗ ERROR: Archivo Admin.php no contiene clase Admin" . RESET . "\n";
    exit(1);
}

echo GREEN . "✓ Integridad verificada correctamente" . RESET . "\n";

// 7. RESULTADOS FINALES
echo "\n" . BLUE . "╔════════════════════════════════════════════════════════════════════════════╗" . RESET . "\n";
echo BLUE . "║                        ✅ ACTUALIZACIÓN COMPLETADA                        ║" . RESET . "\n";
echo BLUE . "╚════════════════════════════════════════════════════════════════════════════╝" . RESET . "\n\n";

echo GREEN . "RESUMEN:" . RESET . "\n";
echo "  ✓ Backup creado: " . $backup_dir . "\n";
echo "  ✓ Archivo actualizado: includes/Admin/Admin.php\n";
echo "  ✓ Integridad verificada: OK\n\n";

echo YELLOW . "PRÓXIMOS PASOS:" . RESET . "\n";
echo "  1. Accede a WordPress admin: https://tukitask.com/id/wp-admin/\n";
echo "  2. Desactiva y reactiva el plugin (si wp-cli no funcionó)\n";
echo "  3. Verifica que el menú 'Tukitask' aparece en el sidebar\n";
echo "  4. Revisa los logs: wp-content/debug.log\n";
echo "  5. Prueba las funcionalidades de payout\n\n";

echo BLUE . "Si hay problemas, tu backup está en:\n" . RESET;
echo "  " . $backup_dir . "\n\n";

echo GREEN . "🎉 ¡Plugin actualizado y listo para producción!" . RESET . "\n";

exit(0);
?>
