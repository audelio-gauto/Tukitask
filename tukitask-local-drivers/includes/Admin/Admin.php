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
		$this->loader->add_action( 'admin_menu', $this, 'register_help_menu', 99 );
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
	 * Register help submenu last (priority 99).
	 */
	public function register_help_menu() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Ayuda y Soporte', 'tukitask-local-drivers' ),
			__( 'Ayuda y Soporte', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-help',
			array( $this, 'render_help' )
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
