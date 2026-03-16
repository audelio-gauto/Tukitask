<?php
/**
 * Advanced Business Intelligence Dashboard for Admin.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

/**
 * Admin_Intelligence Class.
 *
 * Provides specialized marketplace analytics and heatmaps for the administrator.
 */
class Admin_Intelligence {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_menu', $this, 'add_intelligence_menu' );
		$loader->add_action( 'admin_enqueue_scripts', $this, 'enqueue_assets' );
		$loader->add_action( 'wp_ajax_tukitask_export_financials', $this, 'ajax_export_financials' );
	}

	/**
	 * Add submenu under Tukitask.
	 */
	public function add_intelligence_menu() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Estadísticas Pro', 'tukitask-local-drivers' ),
			__( 'Estadísticas Pro', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-intelligence',
			array( $this, 'render_bi_dashboard' )
		);
	}

	/**
	 * Enqueue assets for the BI dashboard.
	 */
	public function enqueue_assets( $hook ) {
		if ( strpos( $hook, 'tukitask-intelligence' ) === false ) {
			return;
		}

		// Chart.js
		wp_enqueue_script( 'chart-js', 'https://cdn.jsdelivr.net/npm/chart.js', array(), '4.4.0', true );
		
		// Mapbox Heatmap dependencies (reuse from logistics if needed)
		wp_enqueue_script( 'mapbox-gl', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js', array(), '2.15.0', true );
		wp_enqueue_style( 'mapbox-gl-css', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css', array(), '2.15.0' );

		wp_enqueue_script( 'tukitask-admin-bi', TUKITASK_LD_URL . 'assets/js/admin-intelligence.js', array( 'jquery', 'chart-js', 'mapbox-gl' ), TUKITASK_LD_VERSION, true );

		wp_localize_script( 'tukitask-admin-bi', 'tukitaskBI', array(
			'restUrl'   => get_rest_url( null, 'tukitask/v1/orders/heatmap' ),
			'driversRestUrl' => get_rest_url( null, 'tukitask/v1/drivers' ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'mapboxKey' => get_option( 'tukitask_ld_mapbox_api_key', get_option( 'tukitask_ld_mapbox_key' ) ),
			'defaultLat'=> ( get_option( 'tukitask_ld_default_lat' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lat' ))) : '-25.302466',
			'defaultLng'=> ( get_option( 'tukitask_ld_default_lng' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lng' ))) : '-57.681781',
		));

		// Premium Map Styles
		wp_add_inline_style( 'mapbox-gl-css', "
			.bi-driver-marker { cursor: pointer; transition: all 0.3s ease; }
			.bi-dot { transition: transform 0.2s ease; }
			.bi-dot:hover { transform: scale(1.5); }
			.mapboxgl-popup-content { border-radius: 12px; padding: 15px; font-family: 'Inter', sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
			.tuki-map-legend div { font-family: 'Inter', sans-serif; }
		" );
	}

	/**
	 * Render the BI Dashboard page.
	 */
	public function render_bi_dashboard() {
		$gmv_total = $this->get_total_gmv();
		$commission_total = $this->get_total_commissions();
		?>
		<div class="wrap tukitask-bi">
			<div style="display:flex; justify-content:space-between; align-items:center;">
				<h1><?php _e( 'Inteligencia de Negocio y Mapas de Calor', 'tukitask-local-drivers' ); ?></h1>
				<a href="<?php echo admin_url( 'admin-ajax.php?action=tukitask_export_financials&security=' . wp_create_nonce('tukitask_export_nonce') ); ?>" class="button button-primary">
					<i class="dashicons dashicons-download" style="margin-top:4px;"></i> <?php _e( 'Exportar Historial (CSV)', 'tukitask-local-drivers' ); ?>
				</a>
			</div>
			<p><?php _e( 'Analiza el rendimiento global de tu marketplace y localiza puntos críticos de demanda.', 'tukitask-local-drivers' ); ?></p>

			<div class="tukitask-bi-header-stats" style="display:flex; gap:20px; margin-bottom: 30px;">
				<div class="glass-card" style="flex:1; background:#fff; padding:25px; border-radius:12px; border-left:5px solid #4f46e5; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
					<small style="color:#64748b; font-weight:700; text-transform:uppercase;"><?php _e( 'Volúmen Total (GMV)', 'tukitask-local-drivers' ); ?></small>
					<div style="font-size:2rem; font-weight:800; color:#1e293b; margin-top:5px;"><?php echo wc_price($gmv_total); ?></div>
				</div>
				<div class="glass-card" style="flex:1; background:#fff; padding:25px; border-radius:12px; border-left:5px solid #10b981; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
					<small style="color:#64748b; font-weight:700; text-transform:uppercase;"><?php _e( 'Ingresos Plataforma', 'tukitask-local-drivers' ); ?></small>
					<div style="font-size:2rem; font-weight:800; color:#1e293b; margin-top:5px;"><?php echo wc_price($commission_total); ?></div>
				</div>
			</div>

			<div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; align-items: stretch;">
				<div class="glass-card" style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.05); display:flex; flex-direction:column;">
					<h3 style="margin-top:0;"><?php _e( 'Mapa de Calor (Densidad de Pedidos)', 'tukitask-local-drivers' ); ?></h3>
					<div id="tukitask-heatmap" style="width:100%; height:450px; background:#f1f5f9; border-radius:8px; flex-grow:1;"></div>
				</div>
				<div class="glass-card" style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.05); display:flex; flex-direction:column;">
					<h3 style="margin-top:0;"><?php _e( 'Crecimiento Mensual', 'tukitask-local-drivers' ); ?></h3>
					<div style="flex-grow:1; position:relative; min-height:400px;">
						<canvas id="growthChart"></canvas>
					</div>
				</div>
			</div>
		</div>
		<?php
	}

	private function get_total_gmv() {
		global $wpdb;
		return (float) $wpdb->get_var( "SELECT SUM(meta_value) FROM {$wpdb->postmeta} WHERE meta_key = '_order_total' AND post_id IN (SELECT ID FROM {$wpdb->posts} WHERE post_type = 'shop_order' AND post_status = 'wc-completed')" );
	}

	private function get_total_commissions() {
		global $wpdb;
		return (float) $wpdb->get_var( "SELECT SUM(amount) FROM {$wpdb->prefix}tukitask_ledger WHERE type = 'marketplace_commission'" );
	}

	/**
	 * AJAX handler for financial export.
	 */
	public function ajax_export_financials() {
		check_ajax_referer( 'tukitask_export_nonce', 'security' );
		\Tukitask\LocalDrivers\Helpers\Report_Exporter::export_financial_report();
	}
}
