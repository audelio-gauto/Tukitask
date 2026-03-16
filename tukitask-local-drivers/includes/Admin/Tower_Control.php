<?php
/**
 * Admin Tower of Control Dashboard.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

use Tukitask\LocalDrivers\Helpers\Commission_Manager;

/**
 * Tower_Control Class.
 *
 * Provides high-level operational tools for the marketplace administrator.
 */
class Tower_Control {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_menu', $this, 'add_control_menu' );
		$loader->add_action( 'admin_enqueue_scripts', $this, 'enqueue_assets' );
	}

	/**
	 * Add menu item.
	 */
	public function add_control_menu() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Torre de Control', 'tukitask-local-drivers' ),
			__( 'Torre de Control', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-tower',
			array( $this, 'render_tower_page' )
		);
	}

	/**
	 * Enqueue assets.
	 */
	public function enqueue_assets( $hook ) {
		if ( strpos( $hook, 'tukitask-tower' ) === false ) return;

		wp_enqueue_script( 'mapbox-gl', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js', array(), '2.15.0', true );
		wp_enqueue_style( 'mapbox-gl-css', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css', array(), '2.15.0' );

		wp_enqueue_script( 'tukitask-tower-js', TUKITASK_LD_URL . 'assets/js/admin-tower.js', array( 'jquery', 'mapbox-gl' ), TUKITASK_LD_VERSION, true );
		
		wp_localize_script( 'tukitask-tower-js', 'tukiTower', array(
			'mapboxKey' => get_option( 'tukitask_ld_mapbox_api_key' ),
			'defaultLat'=> get_option( 'tukitask_ld_default_lat', '-25.302466' ),
			'defaultLng'=> get_option( 'tukitask_ld_default_lng', '-57.681781' ),
			'basePrice' => get_option( 'tukitask_ld_base_price', 5.00 ),
			'pricePerKm'=> get_option( 'tukitask_ld_price_per_km', 1.50 )
		));
	}

	/**
	 * Render Tower page.
	 */
	public function render_tower_page() {
		$disputed_orders = $this->get_disputed_orders();
		?>
		<div class="wrap tukitask-tower">
			<h1 class="wp-heading-inline"><?php _e( 'Torre de Control Operativa', 'tukitask-local-drivers' ); ?></h1>
			<p><?php _e( 'Herramientas de alta precisión para la gestión del marketplace.', 'tukitask-local-drivers' ); ?></p>

			<div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; margin-top:20px;">
				
				<!-- Simulator & Disputes -->
				<div style="display:flex; flex-direction:column; gap:20px;">
					
					<!-- Route Simulator -->
					<div class="card" style="max-width:100%; margin:0; padding:20px;">
						<h3><i class="dashicons dashicons-location-alt"></i> <?php _e( 'Simulador de Tarifas Pro', 'tukitask-local-drivers' ); ?></h3>
						<p><?php _e( 'Haz clic en dos puntos del mapa para calcular la distancia y el costo real que vería un cliente.', 'tukitask-local-drivers' ); ?></p>
						<div id="tower-simulator-map" style="width:100%; height:400px; border-radius:12px; background:#f0f0f0;"></div>
						<div id="simulator-results" style="margin-top:15px; background:#f8fafc; padding:15px; border-radius:8px; display:none;">
							<div style="display:flex; justify-content:space-between; align-items:center;">
								<div>
									<strong style="color:#64748b; font-size:11px; text-transform:uppercase;"><?php _e( 'Estimación de Ruta', 'tukitask-local-drivers' ); ?></strong>
									<div id="sim-dist" style="font-size:1.5rem; font-weight:800; color:#1e293b;">0 km</div>
								</div>
								<div style="text-align:right;">
									<strong style="color:#64748b; font-size:11px; text-transform:uppercase;"><?php _e( 'Costo Total', 'tukitask-local-drivers' ); ?></strong>
									<div id="sim-cost" style="font-size:1.5rem; font-weight:800; color:#4f46e5;">$0.00</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Disputed Orders -->
					<div class="card" style="max-width:100%; margin:0; padding:20px;">
						<h3><i class="dashicons dashicons-warning"></i> <?php _e( 'Alertas y Disputas Recientes', 'tukitask-local-drivers' ); ?></h3>
						<table class="wp-list-table widefat fixed striped">
							<thead>
								<tr>
									<th><?php _e( 'Pedido', 'tukitask-local-drivers' ); ?></th>
									<th><?php _e( 'Motivo', 'tukitask-local-drivers' ); ?></th>
									<th><?php _e( 'Fecha', 'tukitask-local-drivers' ); ?></th>
									<th><?php _e( 'Acciones', 'tukitask-local-drivers' ); ?></th>
								</tr>
							</thead>
							<tbody>
								<?php if(empty($disputed_orders)): ?>
									<tr><td colspan="4"><?php _e( 'No hay disputas activas. ¡Todo en orden!', 'tukitask-local-drivers' ); ?></td></tr>
								<?php else: foreach($disputed_orders as $order): ?>
									<tr>
										<td><strong>#<?php echo $order->get_order_number(); ?></strong></td>
										<td><span class="badge" style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:4px; font-size:11px;"><?php _e( 'Baja Calificación', 'tukitask-local-drivers' ); ?></span></td>
										<td><?php echo $order->get_date_created()->date('d/m/Y H:i'); ?></td>
										<td><a href="<?php echo $order->get_edit_order_url(); ?>" class="button button-small"><?php _e( 'Investigar', 'tukitask-local-drivers' ); ?></a></td>
									</tr>
								<?php endforeach; endif; ?>
							</tbody>
						</table>
					</div>

				</div>

				<!-- Operational Stats -->
				<div style="display:flex; flex-direction:column; gap:20px;">
					
					<div class="card" style="max-width:100%; margin:0; padding:20px; border-left:5px solid #f59e0b;">
						<h3 style="margin-top:0; color:#f59e0b;"><i class="dashicons dashicons-performance"></i> <?php _e( 'Estado Operativo', 'tukitask-local-drivers' ); ?></h3>
						<?php 
							$surge_multiplier = \Tukitask\LocalDrivers\Helpers\Surge_Pricing_Manager::get_multiplier( 
								get_option('tukitask_ld_default_lat'), 
								get_option('tukitask_ld_default_lng') 
							); 
						?>
						<div style="margin-bottom:15px;">
							<small style="color:#64748b; font-weight:700;"><?php _e( 'Surge Actual (Centro)', 'tukitask-local-drivers' ); ?></small>
							<div style="font-size:2rem; font-weight:800; color:<?php echo $surge_multiplier > 1 ? '#ef4444' : '#10b981'; ?>;">x<?php echo number_format($surge_multiplier, 1); ?></div>
						</div>
						<hr>
						<p style="font-size:12px; color:#64748b;"><?php _e( 'El surge se aplica automáticamente basa en la relación Pedidos/Conductores activos.', 'tukitask-local-drivers' ); ?></p>
					</div>

					<div class="card" style="max-width:100%; margin:0; padding:20px;">
						<h3 style="margin-top:0;"><i class="dashicons dashicons-media-text"></i> <?php _e( 'Auditoría Financiera', 'tukitask-local-drivers' ); ?></h3>
						<p><?php _e( 'Descarga el resumen de liquidaciones para todos tus conductores de esta semana.', 'tukitask-local-drivers' ); ?></p>
						<button class="button button-primary button-large" style="width:100%;">
							<i class="dashicons dashicons-download" style="margin-top:4px;"></i> <?php _e( 'Generar Reporte PDF', 'tukitask-local-drivers' ); ?>
						</button>
					</div>

				</div>

			</div>
		</div>
		<style>
			.tukitask-tower h3 { margin-bottom: 15px; display:flex; align-items:center; gap:8px; }
			.tukitask-tower .card { border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
			.tukitask-tower .widefat td, .tukitask-tower .widefat th { vertical-align: middle; }
		</style>
		<?php
	}

	private function get_disputed_orders() {
		// Mock query for orders with rating < 3 or specific meta 'needs_review'
		return wc_get_orders(array(
			'limit' => 5,
			'status' => 'completed',
			'orderby' => 'date',
			'order' => 'DESC'
		));
	}
}
