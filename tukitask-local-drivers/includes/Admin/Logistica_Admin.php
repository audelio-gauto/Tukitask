<?php
/**
 * Logistics Pro Admin Interface.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

/**
 * Logistica_Admin Class.
 *
 * Provides a real-time map for administrators to track drivers and orders.
 */
class Logistica_Admin {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_menu', $this, 'add_logistica_menu' );
		$loader->add_action( 'admin_enqueue_scripts', $this, 'enqueue_assets' );
	}

	/**
	 * Add "Logística Pro" menu item.
	 */
	public function add_logistica_menu() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Logística Pro', 'tukitask-local-drivers' ),
			__( 'Logística Pro', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-logistica-pro',
			array( $this, 'render_logistics_map' )
		);
	}

	/**
	 * Enqueue admin assets.
	 */
	public function enqueue_assets( $hook ) {
		if ( 'toplevel_page_tukitask-logistica-pro' !== $hook ) {
			return;
		}

		// Mapbox GL JS & CSS
		wp_enqueue_script( 'mapbox-gl', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js', array(), '2.15.0', true );
		wp_enqueue_style( 'mapbox-gl-css', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css', array(), '2.15.0' );

		// Admin Styles
		wp_add_inline_style( 'mapbox-gl-css', "
			#tukitask-admin-map { width: 100%; height: calc(100vh - 120px); border-radius: 8px; margin-top: 15px; }
			.map-overlay { position: absolute; top: 10px; left: 10px; background: rgba(255, 255, 255, 0.9); padding: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 100; max-width: 250px; }
			.driver-marker { background-size: cover; width: 40px; height: 40px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); cursor: pointer; }
			.order-marker { background: var(--primary); color: #fff; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid #fff; cursor: pointer; }
		" );

		wp_enqueue_script( 'tukitask-logistica-admin', TUKITASK_LD_URL . 'assets/js/admin-logistics.js', array( 'jquery', 'mapbox-gl' ), TUKITASK_LD_VERSION, true );

		wp_localize_script( 'tukitask-logistica-admin', 'tukitaskLogistica', array(
			'mapboxKey' => get_option( 'tukitask_ld_mapbox_api_key' ),
			'restUrl'   => get_rest_url( null, 'tukitask/v1/drivers' ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'defaultLat'=> ( get_option( 'tukitask_ld_default_lat' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lat' ))) : '-25.302466',
			'defaultLng'=> ( get_option( 'tukitask_ld_default_lng' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lng' ))) : '-57.681781',
			'strings'   => array(
				'status'      => __( 'Estado', 'tukitask-local-drivers' ),
				'vehicle'     => __( 'Vehículo', 'tukitask-local-drivers' ),
				'order'       => __( 'Pedido', 'tukitask-local-drivers' ),
				'total'       => __( 'Total', 'tukitask-local-drivers' ),
				'delivery'    => __( 'Entrega', 'tukitask-local-drivers' ),
				'driver_id'   => __( 'ID Conductor', 'tukitask-local-drivers' ),
				'unassigned'  => __( 'Sin asignar', 'tukitask-local-drivers' ),
			),
		));
	}

	/**
	 * Render the logistics map page.
	 */
	public function render_logistics_map() {
		$drivers_count = wp_count_posts( 'tukitask_driver' )->publish;
		$active_orders = count( wc_get_orders( array( 'status' => 'processing', 'limit' => -1 ) ) );
		?>
		<div class="wrap">
			<h1><?php _e( 'Panel de Logística Pro', 'tukitask-local-drivers' ); ?></h1>
			<p><?php _e( 'Monitoreo en tiempo real de conductores y pedidos activos.', 'tukitask-local-drivers' ); ?></p>

			<div style="position: relative;">
				<div class="map-overlay">
					<h3>Resumen en Vivo</h3>
					<p><strong>Conductores:</strong> <span id="count-drivers"><?php echo $drivers_count; ?></span></p>
					<p><strong>Pedidos Activos:</strong> <span id="count-orders"><?php echo $active_orders; ?></span></p>
					<hr>
					<small>Datos actualizados automáticamente cada 15s.</small>
				</div>
				<div id="tukitask-admin-map"></div>
			</div>
		</div>
		<?php
	}
}
