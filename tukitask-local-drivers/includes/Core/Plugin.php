<?php
/**
 * Main Plugin Orchestrator.
 *
 * @package Tukitask\LocalDrivers\Core
 */

namespace Tukitask\LocalDrivers\Core;

/**
 * Main Plugin Class - Singleton Pattern.
 *
 * Orchestrates all plugin components, manages initialization,
 * and handles activation/deactivation logic.
 */
class Plugin {

	/**
	 * Single instance of this class.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Hook loader instance.
	 *
	 * @var Loader
	 */
	protected $loader;

	/**
	 * Admin components.
	 */
	protected $admin_core;
	protected $vendedores_admin;
	protected $logistica_admin;
	protected $settings_admin;

	/**
	 * Get singleton instance.
	 *
	 * @return Plugin
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor to enforce singleton pattern.
	 */
	private function __construct() {
		$this->loader = new Loader();
		
		// Register custom cron intervals
		add_filter( 'cron_schedules', array( $this, 'add_cron_intervals' ) );

		// Purge expired broadcasts every 5 minutes
		add_action( 'tukitask_purge_expired_broadcasts', array( $this, 'purge_expired_broadcasts' ) );
		if ( ! wp_next_scheduled( 'tukitask_purge_expired_broadcasts' ) ) {
			wp_schedule_event( time(), 'every_five_minutes', 'tukitask_purge_expired_broadcasts' );
		}
		
		$this->initialize_components();
		$this->run();

		// Register custom order statuses
		$this->loader->add_action( 'init', $this, 'register_custom_order_statuses' );
		$this->loader->add_filter( 'wc_order_statuses', $this, 'add_custom_order_statuses' );
		$this->loader->add_filter( 'wc_order_statuses_editable', $this, 'add_custom_order_statuses' );

		// Generate vendor code on new order
		$this->loader->add_action( 'woocommerce_new_order', $this, 'generate_vendor_code' );

		// Auto assign driver on status change
		$this->loader->add_action( 'woocommerce_order_status_changed', $this, 'auto_assign_driver', 10, 4 );
	}

	/**
	 * Add custom cron intervals.
	 *
	 * @param array $schedules Existing schedules.
	 * @return array Modified schedules.
	 */
	public function add_cron_intervals( $schedules ) {
		$schedules['every_five_minutes'] = array(
			'interval' => 300,
			'display'  => __( 'Cada 5 minutos', 'tukitask-local-drivers' ),
		);
		$schedules['every_two_minutes'] = array(
			'interval' => 120,
			'display'  => __( 'Cada 2 minutos', 'tukitask-local-drivers' ),
		);
		return $schedules;
	}

	/**
	 * Purge expired broadcast rows (cron callback).
	 */
	public function purge_expired_broadcasts() {
		\Tukitask\LocalDrivers\Helpers\Broadcast_Store::purge_expired( 500 );
	}

	/**
	 * Initialize all plugin components.
	 *
	 * Components are loaded in dependency order.
	 */
	private function initialize_components() {
		// Helpers (utility classes).
		new \Tukitask\LocalDrivers\Helpers\Security( $this->loader );
		new \Tukitask\LocalDrivers\Helpers\Geo( $this->loader );
		new \Tukitask\LocalDrivers\Helpers\Distance( $this->loader );
	new \Tukitask\LocalDrivers\Helpers\Invoice_Manager( $this->loader );

		// Driver management.
		new \Tukitask\LocalDrivers\Drivers\Driver_CPT( $this->loader );
		new \Tukitask\LocalDrivers\Drivers\Driver_Meta( $this->loader );
		new \Tukitask\LocalDrivers\Drivers\Driver_Capabilities( $this->loader );
		new \Tukitask\LocalDrivers\Drivers\Driver_Availability( $this->loader );

		// Order and shipping.
		new \Tukitask\LocalDrivers\Orders\Shipping_Method( $this->loader );
		new \Tukitask\LocalDrivers\Orders\Order_Hooks( $this->loader );
		new \Tukitask\LocalDrivers\Orders\Auto_Assign( $this->loader );
		new \Tukitask\LocalDrivers\Orders\Tracking( $this->loader );
		new \Tukitask\LocalDrivers\Orders\Trip_Request( $this->loader );

		// Delivery Request (Bolt-style package delivery) — Singleton, self-hooks.
		\Tukitask\LocalDrivers\Orders\Delivery_Request::instance();

		// Admin interface (only in admin context).
		if ( is_admin() ) {
			$this->admin_core = new \Tukitask\LocalDrivers\Admin\Admin( $this->loader );
			$this->settings_admin = new \Tukitask\LocalDrivers\Admin\Settings( $this->loader );
			new \Tukitask\LocalDrivers\Admin\Delivery_Admin( $this->loader );
			$this->logistica_admin = new \Tukitask\LocalDrivers\Admin\Logistica_Admin( $this->loader );
			new \Tukitask\LocalDrivers\Admin\Tower_Control( $this->loader );
			new \Tukitask\LocalDrivers\Admin\Admin_Intelligence( $this->loader );
			$this->vendedores_admin = new \Tukitask\LocalDrivers\Admin\Vendedores_Admin( $this->loader );
			new \Tukitask\LocalDrivers\Admin\Payouts_Admin( $this->loader );
		}

		// Frontend (driver and vendor panels).
		new \Tukitask\LocalDrivers\Frontend\Driver_Dashboard( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Driver_Shortcodes( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Vendedor_Dashboard( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Vendedor_Shortcodes( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Proveedor_Dashboard( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Location_Badges( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Product_Shortcodes( $this->loader );
		new \Tukitask\LocalDrivers\Frontend\Rating_UI( $this->loader );
		
		// Customer features.
		\Tukitask\LocalDrivers\Frontend\Customer_Favorites::instance();
		\Tukitask\LocalDrivers\Frontend\Interactive_Map::instance();
		\Tukitask\LocalDrivers\Frontend\Advanced_Filters::instance();
		
		// Load procedural shortcode files.
		require_once TUKITASK_LD_PATH . 'includes/Frontend/Cliente_Dashboard.php';
		require_once TUKITASK_LD_PATH . 'includes/Frontend/Cliente_CardPages.php';
		
		// Notifications system.
		\Tukitask\LocalDrivers\Notifications\Proximity_Notifications::instance();

		// REST API.
		new \Tukitask\LocalDrivers\Rest\Drivers_Controller( $this->loader );
		new \Tukitask\LocalDrivers\Rest\Orders_Controller( $this->loader );

		// Mobile Store feature.
		new \Tukitask\LocalDrivers\Mobile_Store\Activation( $this->loader );
		new \Tukitask\LocalDrivers\Mobile_Store\Visibility( $this->loader );
		new \Tukitask\LocalDrivers\Mobile_Store\Priority( $this->loader );
		new \Tukitask\LocalDrivers\Mobile_Store\Store_Proximity_Service( $this->loader );
	}

	/**
	 * Run the loader to register all hooks.
	 */
	private function run() {
		$this->loader->run();
		
		// Ensure tables exist on every load for reliability (dbDelta is efficient)
		if ( is_admin() && ! get_option( 'tukitask_ld_tables_created_v2' ) ) {
			self::create_tables();
			update_option( 'tukitask_ld_tables_created_v2', 1 );
		}
	}

	/**
	 * Get Vendedores Admin instance.
	 */
	public function get_vendedores_admin() {
		return $this->vendedores_admin;
	}

	/**
	 * Activation logic.
	 *
	 * Called when the plugin is activated.
	 */
	public static function activate() {
		// Register CPT and flush rewrite rules.
		\Tukitask\LocalDrivers\Drivers\Driver_CPT::register_cpt();

		// Initialize custom roles and capabilities.
		\Tukitask\LocalDrivers\Drivers\Driver_Capabilities::init_roles();

		// Flush rewrite rules to register CPT permalinks.
		flush_rewrite_rules();

		// Set default options if not already set.
		self::set_default_options();

		// Create tables.
		self::create_tables();

		// Create required pages (delivery, tracking, etc.)
		self::create_pages();

		// Set activation timestamp.
		update_option( 'tukitask_ld_activated_at', time() );
	}

	/**
	 * Create required plugin pages with shortcodes.
	 */
	private static function create_pages() {
		$pages = array(
			'solicitar-envio' => array(
				'title'     => __( 'Solicitar Envío', 'tukitask-local-drivers' ),
				'content'   => '[tukitask_solicitar_envio]',
				'option'    => 'tukitask_page_solicitar_envio',
			),
			'mis-envios' => array(
				'title'     => __( 'Mis Envíos', 'tukitask-local-drivers' ),
				'content'   => '[tukitask_mis_envios]',
				'option'    => 'tukitask_page_mis_envios',
			),
			'tracking-envio' => array(
				'title'     => __( 'Seguimiento de Envío', 'tukitask-local-drivers' ),
				'content'   => '[tukitask_tracking_envio]',
				'option'    => 'tukitask_page_tracking_envio',
			),
		);

		foreach ( $pages as $slug => $page_data ) {
			$existing_id = get_option( $page_data['option'] );

			// Skip if page already exists and is published
			if ( $existing_id && get_post_status( $existing_id ) === 'publish' ) {
				continue;
			}

			// Check if a page with this slug already exists
			$existing = get_page_by_path( $slug );
			if ( $existing ) {
				update_option( $page_data['option'], $existing->ID );
				continue;
			}

			$page_id = wp_insert_post( array(
				'post_title'   => $page_data['title'],
				'post_name'    => $slug,
				'post_content' => $page_data['content'],
				'post_status'  => 'publish',
				'post_type'    => 'page',
			) );

			if ( $page_id && ! is_wp_error( $page_id ) ) {
				update_option( $page_data['option'], $page_id );
			}
		}
	}

	/**
	 * Deactivation logic.
	 *
	 * Called when the plugin is deactivated.
	 */
	public static function deactivate() {
		// Flush rewrite rules to clean up CPT permalinks.
		flush_rewrite_rules();

		// Clear any scheduled cron jobs.
		wp_clear_scheduled_hook( 'tukitask_ld_cleanup_transients' );
	}

	/**
	 * Set default plugin options.
	 */
	private static function set_default_options() {
		$defaults = array(
			'tukitask_ld_auto_assign_enabled'    => 'yes',
			'tukitask_ld_base_price'             => '5.00',
			'tukitask_ld_price_per_km'           => '1.50',
			'tukitask_ld_max_distance'           => '50',
			'tukitask_ld_default_driver_radius'  => '10',
			'tukitask_ld_mobile_store_enabled'   => 'yes',
			'tukitask_ld_mobile_store_radius'    => '5',
			'tukitask_ld_mapbox_api_key'         => '',
			'tukitask_ld_cache_duration'         => '300',
			'tukitask_ld_global_commission_val'  => '10',
			'tukitask_ld_global_fixed_fee'       => '0',
			'tukitask_ld_fcm_sender_id'          => '', // FCM Sender ID.
			'tukitask_ld_billing_name'           => '',
			'tukitask_ld_billing_address'        => '',
			'tukitask_ld_billing_tax_id'         => '',
			'tukitask_ld_default_lat'            => '-25.302466',
			'tukitask_ld_default_lng'            => '-57.681781',
		);

		foreach ( $defaults as $key => $value ) {
			if ( false === get_option( $key ) ) {
				add_option( $key, $value );
			}
		}
	}

	/**
	 * Create custom database tables.
	 */
	public static function create_tables() {
		global $wpdb;
		$charset_collate = $wpdb->get_charset_collate();
		$table_name = $wpdb->prefix . 'tukitask_reviews';

		$sql = "CREATE TABLE $table_name (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			item_id bigint(20) NOT NULL,
			customer_id bigint(20) NOT NULL,
			target_id bigint(20) NOT NULL,
			target_type varchar(20) NOT NULL,
			rating decimal(2,1) NOT NULL,
			comment text NOT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
			PRIMARY KEY  (id),
			KEY item_id (item_id),
			KEY target_id (target_id)
		) $charset_collate;";

		$table_messages = $wpdb->prefix . 'tukitask_messages';
		$sql_messages = "CREATE TABLE $table_messages (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			order_id bigint(20) NOT NULL,
			sender_id bigint(20) NOT NULL,
			recipient_id bigint(20) NOT NULL,
			content text NOT NULL,
			is_read tinyint(1) DEFAULT 0 NOT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
			PRIMARY KEY  (id),
			KEY order_id (order_id),
			KEY recipient_id (recipient_id)
		) $charset_collate;";

		$table_payouts = $wpdb->prefix . 'tukitask_payouts';
		$sql_payouts = "CREATE TABLE $table_payouts (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			vendor_id bigint(20) NOT NULL,
			amount decimal(12,2) NOT NULL,
			status varchar(20) DEFAULT 'pending' NOT NULL,
			payment_method varchar(50) NOT NULL,
			transaction_id varchar(100) DEFAULT '' NOT NULL,
			admin_note text NOT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
			updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
			PRIMARY KEY  (id),
			KEY vendor_id (vendor_id)
		) $charset_collate;";

		$table_ledger = $wpdb->prefix . 'tukitask_ledger';
		$sql_ledger = "CREATE TABLE $table_ledger (
			id bigint(20) NOT NULL AUTO_INCREMENT,
			user_id bigint(20) NOT NULL,
			order_id bigint(20) DEFAULT 0 NOT NULL,
			amount decimal(12,2) NOT NULL,
			type varchar(50) NOT NULL, -- earning, withdrawal, commission, refund
			description text NOT NULL,
			created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
			PRIMARY KEY  (id),
			KEY user_id (user_id),
			KEY order_id (order_id),
			KEY type (type)
		) $charset_collate;";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
		dbDelta( $sql_messages );
		dbDelta( $sql_payouts );
		dbDelta( $sql_ledger );

		// Broadcasts table (replaces transients for scalability)
		\Tukitask\LocalDrivers\Helpers\Broadcast_Store::create_table();

		// Add indexes on postmeta for driver geolocation queries
		self::add_meta_indexes();
	}

	/**
	 * Add custom indexes on postmeta for high-performance driver queries.
	 * Safe to call multiple times (IF NOT EXISTS).
	 */
	private static function add_meta_indexes() {
		global $wpdb;
		$table = $wpdb->postmeta;

		// Index for driver status lookups
		$idx1 = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(1) FROM information_schema.STATISTICS WHERE table_schema = %s AND table_name = %s AND index_name = %s",
			DB_NAME, $table, 'idx_tuki_driver_status'
		) );
		if ( ! $idx1 ) {
			$wpdb->query( "ALTER TABLE {$table} ADD INDEX idx_tuki_driver_status (meta_key(40), meta_value(20))" );
		}

		// Index for driver user_id lookups
		$idx2 = $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(1) FROM information_schema.STATISTICS WHERE table_schema = %s AND table_name = %s AND index_name = %s",
			DB_NAME, $table, 'idx_tuki_meta_value_id'
		) );
		if ( ! $idx2 ) {
			$wpdb->query( "ALTER TABLE {$table} ADD INDEX idx_tuki_meta_value_id (meta_value(20), meta_key(40))" );
		}
	}

	/**
	 * Register custom order statuses.
	 */
	public function register_custom_order_statuses() {
		error_log('TukiTask: Registering custom order statuses');
		register_post_status( 'wc-listo-para-envio', array(
			'label'                     => _x( 'Listo para envío', 'Order status', 'tukitask-local-drivers' ),
			'public'                    => true,
			'exclude_from_search'       => false,
			'show_in_admin_all_list'    => true,
			'show_in_admin_status_list' => true,
			'label_count'               => _n_noop( 'Listo para envío <span class="count">(%s)</span>', 'Listo para envío <span class="count">(%s)</span>', 'tukitask-local-drivers' )
		) );
		register_post_status( 'wc-en-camino', array(
			'label'                     => _x( 'En camino', 'Order status', 'tukitask-local-drivers' ),
			'public'                    => true,
			'exclude_from_search'       => false,
			'show_in_admin_all_list'    => true,
			'show_in_admin_status_list' => true,
			'label_count'               => _n_noop( 'En camino <span class="count">(%s)</span>', 'En camino <span class="count">(%s)</span>', 'tukitask-local-drivers' )
		) );
		register_post_status( 'wc-entrega-fallida', array(
			'label'                     => _x( 'Entrega fallida', 'Order status', 'tukitask-local-drivers' ),
			'public'                    => true,
			'exclude_from_search'       => false,
			'show_in_admin_all_list'    => true,
			'show_in_admin_status_list' => true,
			'label_count'               => _n_noop( 'Entrega fallida <span class="count">(%s)</span>', 'Entrega fallida <span class="count">(%s)</span>', 'tukitask-local-drivers' )
		) );
	}

	/**
	 * Add custom order statuses to WooCommerce.
	 *
	 * @param array $order_statuses Existing order statuses.
	 * @return array Modified order statuses.
	 */
	public function add_custom_order_statuses( $order_statuses ) {
		$order_statuses['wc-listo-para-envio'] = _x( 'Listo para envío', 'Order status', 'tukitask-local-drivers' );
		$order_statuses['wc-en-camino'] = _x( 'En camino', 'Order status', 'tukitask-local-drivers' );
		$order_statuses['wc-entrega-fallida'] = _x( 'Entrega fallida', 'Order status', 'tukitask-local-drivers' );
		return $order_statuses;
	}

	/**
	 * Generate vendor code when order is created.
	 *
	 * @param int $order_id Order ID.
	 */
	public function generate_vendor_code( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		// Get vendor ID from first product
		$items = $order->get_items();
		if ( ! empty( $items ) ) {
			$first_item = reset( $items );
			$product_id = $first_item->get_product_id();
			$vendor_id = get_post_field( 'post_author', $product_id );

			// Generate code for vendor
			$vendor_code = strtoupper( wp_generate_password( 6, false ) );
			$order->update_meta_data( '_codigo_vendedor', $vendor_code );
			$order->save();
		}
	}

	/**
	 * Auto assign driver when order status changes to listo-para-envio.
	 *
	 * @param int    $order_id   Order ID.
	 * @param string $old_status Old status.
	 * @param string $new_status New status.
	 * @param object $order      Order object.
	 */
	public function auto_assign_driver( $order_id, $old_status, $new_status, $order ) {
		if ( $new_status !== 'listo-para-envio' ) {
			return;
		}

		// Get pickup location from vendor
		$items = $order->get_items();
		if ( empty( $items ) ) {
			return;
		}
		$first_item = reset( $items );
		$product_id = $first_item->get_product_id();
		$vendor_id = get_post_field( 'post_author', $product_id );

		$pickup_lat = get_user_meta( $vendor_id, '_pickup_lat', true );
		$pickup_lng = get_user_meta( $vendor_id, '_pickup_lng', true );

		if ( ! $pickup_lat || ! $pickup_lng ) {
			return;
		}

		// Get delivery location
		$delivery_lat = get_user_meta( $order->get_customer_id(), '_delivery_lat', true );
		$delivery_lng = get_user_meta( $order->get_customer_id(), '_delivery_lng', true );

		// Find nearest available driver
		$nearest_driver = $this->find_nearest_driver( $pickup_lat, $pickup_lng, $delivery_lat, $delivery_lng );

		if ( $nearest_driver ) {
			$order->update_meta_data( '_assigned_driver_id', $nearest_driver );
			$order->add_order_note( 'Conductor asignado automáticamente: ' . get_the_title( $nearest_driver ) );
			$order->save();
		}
	}

	/**
	 * Find nearest available driver based on ranges.
	 *
	 * @param float $pickup_lat  Pickup latitude.
	 * @param float $pickup_lng  Pickup longitude.
	 * @param float $delivery_lat Delivery latitude.
	 * @param float $delivery_lng Delivery longitude.
	 * @return int|null Driver post ID or null.
	 */
	private function find_nearest_driver( $pickup_lat, $pickup_lng, $delivery_lat, $delivery_lng ) {
		// This is a simplified version. In real implementation, calculate distances and check availability.
		// For now, return a random driver or the first one.

		$drivers = get_posts( array(
			'post_type' => 'driver',
			'numberposts' => 1,
			'meta_query' => array(
				array(
					'key' => '_driver_available',
					'value' => 'yes',
					'compare' => '='
				)
			)
		) );

		if ( ! empty( $drivers ) ) {
			return $drivers[0]->ID;
		}

		return null;
	}
}
