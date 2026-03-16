<?php
/**
 * Frontend Location Badges.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

/**
 * Location_Badges Class.
 *
 * Handles the display of "Llega Hoy" and "Tienda Móvil" badges in the WC loop.
 */
class Location_Badges {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'wp_enqueue_scripts', $this, 'enqueue_badge_styles' );
		$loader->add_action( 'woocommerce_before_shop_loop_item_title', $this, 'render_location_badge', 15 );
		$loader->add_action( 'woocommerce_single_product_summary', $this, 'render_delivery_info_widget', 25 );
	}

	/**
	 * Enqueue badge styles.
	 */
	public function enqueue_badge_styles() {
		wp_add_inline_style( 'woocommerce-general', "
			/* Product Loop Badges */
			.tukitask-badge {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				padding: 4px 10px;
				border-radius: 6px;
				font-size: 11px;
				font-weight: 800;
				text-transform: uppercase;
				letter-spacing: 0.5px;
				margin-bottom: 8px;
				box-shadow: 0 2px 4px rgba(0,0,0,0.1);
				z-index: 10;
				position: relative;
			}
			.badge-mobile {
				background: #10B981;
				color: #fff;
				animation: pulse-green 2s infinite;
			}
			.badge-llega-hoy {
				background: #F59E0B;
				color: #fff;
			}
			.badge-vendor-nearby {
				background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
				color: #fff;
				animation: pulse-purple 2s infinite;
			}
			.tukitask-badge svg {
				width: 12px;
				height: 12px;
			}
			@keyframes pulse-green {
				0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
				70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
				100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
			}
			@keyframes pulse-purple {
				0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
				70% { box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
				100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
			}

			/* Single Product Delivery Widgets */
			.tuki-delivery-widget {
				margin: 15px 0;
				padding: 15px;
				border-radius: 12px;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			}
			.tuki-delivery-widget.standard {
				background: #f8fafc;
				border: 1px solid #e2e8f0;
				display: flex;
				align-items: center;
				gap: 12px;
			}
			.tuki-delivery-widget.location-prompt {
				background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
				border: 2px dashed #cbd5e1;
				display: flex;
				align-items: center;
				gap: 12px;
			}
			.tuki-delivery-widget.vendor-traveling {
				background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
				color: white;
			}
			.tuki-delivery-widget.llega-hoy {
				background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
				color: white;
			}
			.tuki-delivery-widget.tienda-movil {
				background: linear-gradient(135deg, #10B981 0%, #059669 100%);
				color: white;
			}
			.tuki-delivery-header {
				display: flex;
				align-items: center;
				gap: 6px;
				margin-bottom: 10px;
				font-size: 10px;
				font-weight: 800;
				text-transform: uppercase;
				letter-spacing: 1px;
			}
			.live-indicator {
				width: 8px;
				height: 8px;
				background: #fff;
				border-radius: 50%;
				animation: blink 1s infinite;
			}
			.mobile-indicator {
				width: 8px;
				height: 8px;
				background: #fff;
				border-radius: 50%;
				animation: blink 1.5s infinite;
			}
			@keyframes blink {
				0%, 100% { opacity: 1; }
				50% { opacity: 0.3; }
			}
			.tuki-delivery-body {
				display: flex;
				align-items: center;
				gap: 12px;
			}
			.tuki-delivery-icon {
				font-size: 28px;
				flex-shrink: 0;
			}
			.tuki-delivery-icon.pulse-icon {
				animation: icon-pulse 2s infinite;
			}
			@keyframes icon-pulse {
				0%, 100% { transform: scale(1); }
				50% { transform: scale(1.1); }
			}
			.tuki-delivery-content {
				flex: 1;
			}
			.tuki-delivery-content strong {
				display: block;
				font-size: 15px;
				font-weight: 700;
				margin-bottom: 2px;
			}
			.tuki-delivery-content span {
				display: block;
				font-size: 12px;
				opacity: 0.9;
			}
			.tuki-delivery-content small {
				display: block;
				font-size: 11px;
				opacity: 0.7;
				margin-top: 2px;
			}
			.distance-badge {
				display: inline-block;
				background: rgba(255,255,255,0.2);
				padding: 2px 8px;
				border-radius: 10px;
				font-size: 11px !important;
				font-weight: 600;
				margin-top: 4px;
			}
			.tuki-delivery-cta {
				margin-top: 10px;
				padding-top: 10px;
				border-top: 1px solid rgba(255,255,255,0.2);
			}
			.tuki-delivery-cta .eta {
				font-size: 13px;
				font-weight: 600;
			}
			.tuki-enable-loc-btn {
				padding: 8px 16px;
				background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
				color: white;
				border: none;
				border-radius: 8px;
				font-size: 12px;
				font-weight: 600;
				cursor: pointer;
				transition: all 0.2s;
				flex-shrink: 0;
			}
			.tuki-enable-loc-btn:hover {
				transform: scale(1.05);
				box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
			}
		" );
	}

	/**
	 * Render the badge if applicable.
	 */
	public function render_location_badge() {
		global $product;

		if ( ! $product ) return;

		$location = \Tukitask\LocalDrivers\Helpers\Geo::get_current_customer_location();
		if ( ! $location ) return;

		// First try the new AvailabilityService approach
		$availability_service = new \Tukitask\LocalDrivers\Mobile_Store\AvailabilityService();
		$status_data = $availability_service->get_product_availability_status( $product->get_id(), $location );

		if ( $status_data && isset( $status_data['status'] ) ) {
			$status = $status_data['status'];
			$distance_text = isset( $status_data['distance'] ) ? number_format( $status_data['distance'], 1 ) . ' km' : '';

			// NEW: Vendor Travel Mode badge
			if ( 'vendedor_viajando' === $status ) {
				echo '<div class="tukitask-badge badge-vendor-nearby">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
					' . esc_html__( 'Vendedor Cerca', 'tukitask-local-drivers' ) . ( $distance_text ? ' (' . $distance_text . ')' : '' ) . '
				</div>';
				return;
			}

			if ( 'tienda_movil' === $status ) {
				echo '<div class="tukitask-badge badge-mobile">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
					' . esc_html__( 'En Movimiento', 'tukitask-local-drivers' ) . '
				</div>';
				echo '<div class="tukitask-badge badge-llega-hoy">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
					' . esc_html__( 'Llega Hoy', 'tukitask-local-drivers' ) . '
				</div>';
				return;
			}

			if ( 'llega_hoy' === $status ) {
				echo '<div class="tukitask-badge badge-llega-hoy">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
					' . esc_html__( 'Llega Hoy', 'tukitask-local-drivers' ) . ( $distance_text ? ' (' . $distance_text . ')' : '' ) . '
				</div>';
				return;
			}
		}

		// Fallback to old Proximity_Manager if exists
		if ( class_exists( '\Tukitask\LocalDrivers\Helpers\Proximity_Manager' ) ) {
			$status = \Tukitask\LocalDrivers\Helpers\Proximity_Manager::get_product_status( $product->get_id(), $location );

			if ( $status && 'mobile_store' === $status ) {
				echo '<div class="tukitask-badge badge-mobile">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
					' . esc_html__( 'En Movimiento', 'tukitask-local-drivers' ) . '
				</div>';
				echo '<div class="tukitask-badge badge-llega-hoy">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
					' . esc_html__( 'Llega Hoy', 'tukitask-local-drivers' ) . '
				</div>';
			}
		}

		// Phase 22: Surge Badge
		if ( class_exists( '\Tukitask\LocalDrivers\Helpers\Surge_Pricing_Manager' ) ) {
			$multiplier = \Tukitask\LocalDrivers\Helpers\Surge_Pricing_Manager::get_multiplier( $location['lat'], $location['lng'] );
			if ( $multiplier > 1.0 ) {
				echo '<div class="tukitask-badge" style="background:#EF4444; color:#fff;">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:4px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
					' . esc_html__( 'Alta Demanda', 'tukitask-local-drivers' ) . '
				</div>';
			}
		}
	}

	/**
	 * Render delivery info widget on single product page.
	 */
	public function render_delivery_info_widget() {
		global $product;
		
		if ( ! $product ) return;
		
		$location = \Tukitask\LocalDrivers\Helpers\Geo::get_current_customer_location();
		
		// If no location, show prompt to enable location
		if ( ! $location ) {
			$this->render_location_prompt_widget();
			return;
		}
		
		// Get availability status
		$availability_service = new \Tukitask\LocalDrivers\Mobile_Store\AvailabilityService();
		$status_data = $availability_service->get_product_availability_status( $product->get_id(), $location );
		
		if ( ! $status_data || $status_data['status'] === 'normal' ) {
			// Standard delivery
			echo '<div class="tuki-delivery-widget standard">';
			echo '<div class="tuki-delivery-icon">🚚</div>';
			echo '<div class="tuki-delivery-content">';
			echo '<strong>' . esc_html__( 'Entrega Estándar', 'tukitask-local-drivers' ) . '</strong>';
			echo '<span>' . esc_html__( 'Recibe tu pedido en 1-3 días', 'tukitask-local-drivers' ) . '</span>';
			echo '</div></div>';
			return;
		}
		
		$distance_m = isset( $status_data['distance'] ) ? round( $status_data['distance'] * 1000 ) : 0;
		$distance_text = $distance_m < 1000 
			? sprintf( __( '%d metros', 'tukitask-local-drivers' ), $distance_m )
			: sprintf( __( '%.1f km', 'tukitask-local-drivers' ), $status_data['distance'] );
		
		switch ( $status_data['status'] ) {
			case 'vendedor_viajando':
				$this->render_vendor_traveling_widget( $status_data, $distance_text );
				break;
			case 'llega_hoy':
				$this->render_llega_hoy_widget( $status_data, $distance_text );
				break;
			case 'tienda_movil':
				$this->render_tienda_movil_widget( $status_data, $distance_text );
				break;
		}
	}

	/**
	 * Render location prompt widget.
	 */
	private function render_location_prompt_widget() {
		global $product;
		$product_id = $product ? $product->get_id() : 0;
		?>
		<div class="tuki-delivery-widget location-prompt">
			<div class="tuki-delivery-icon">📍</div>
			<div class="tuki-delivery-content">
				<strong><?php esc_html_e( '¿Hay entrega rápida cerca?', 'tukitask-local-drivers' ); ?></strong>
				<span><?php esc_html_e( 'Activa tu ubicación para ver opciones de entrega inmediata.', 'tukitask-local-drivers' ); ?></span>
			</div>
			<button type="button" class="tuki-enable-loc-btn" onclick="tukiEnableProductLocation()">
				<?php esc_html_e( 'Activar', 'tukitask-local-drivers' ); ?>
			</button>
		</div>
		<?php if ( $product_id && is_user_logged_in() ) : ?>
		<div style="margin-top: 10px;">
			<?php echo do_shortcode( '[tukitask_notify_button type="product" id="' . $product_id . '"]' ); ?>
		</div>
		<?php endif; ?>
		<script>
		function tukiEnableProductLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(function(pos) {
					document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
					document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
					location.reload();
				});
			}
		}
		</script>
		<?php
	}

	/**
	 * Render vendor traveling widget.
	 */
	private function render_vendor_traveling_widget( $status_data, $distance_text ) {
		$vendor_name = isset( $status_data['vendor_id'] ) ? get_userdata( $status_data['vendor_id'] )->display_name : '';
		?>
		<div class="tuki-delivery-widget vendor-traveling">
			<div class="tuki-delivery-header">
				<span class="live-indicator"></span>
				<span class="live-text"><?php esc_html_e( 'EN VIVO', 'tukitask-local-drivers' ); ?></span>
			</div>
			<div class="tuki-delivery-body">
				<div class="tuki-delivery-icon pulse-icon">🚗</div>
				<div class="tuki-delivery-content">
					<strong><?php esc_html_e( '¡Vendedor Cerca de Ti!', 'tukitask-local-drivers' ); ?></strong>
					<span class="distance-badge">📍 <?php echo esc_html( $distance_text ); ?></span>
					<?php if ( $vendor_name ) : ?>
					<small><?php echo esc_html( $vendor_name ); ?></small>
					<?php endif; ?>
				</div>
			</div>
			<div class="tuki-delivery-cta">
				<span class="eta">⚡ <?php esc_html_e( 'Entrega en minutos', 'tukitask-local-drivers' ); ?></span>
			</div>
		</div>
		<?php
	}

	/**
	 * Render "Llega Hoy" widget.
	 */
	private function render_llega_hoy_widget( $status_data, $distance_text ) {
		?>
		<div class="tuki-delivery-widget llega-hoy">
			<div class="tuki-delivery-body">
				<div class="tuki-delivery-icon">⚡</div>
				<div class="tuki-delivery-content">
					<strong><?php esc_html_e( 'Llega Hoy', 'tukitask-local-drivers' ); ?></strong>
					<span><?php esc_html_e( 'Repartidor cerca de la tienda', 'tukitask-local-drivers' ); ?></span>
					<span class="distance-badge">🏪 <?php echo esc_html( $distance_text ); ?> <?php esc_html_e( 'a la tienda', 'tukitask-local-drivers' ); ?></span>
				</div>
			</div>
			<div class="tuki-delivery-cta">
				<span class="eta">📦 <?php esc_html_e( 'Recíbelo hoy mismo', 'tukitask-local-drivers' ); ?></span>
			</div>
		</div>
		<?php
	}

	/**
	 * Render "Tienda Móvil" widget.
	 */
	private function render_tienda_movil_widget( $status_data, $distance_text ) {
		?>
		<div class="tuki-delivery-widget tienda-movil">
			<div class="tuki-delivery-header">
				<span class="mobile-indicator"></span>
				<span class="mobile-text"><?php esc_html_e( 'EN RUTA', 'tukitask-local-drivers' ); ?></span>
			</div>
			<div class="tuki-delivery-body">
				<div class="tuki-delivery-icon pulse-icon">📦</div>
				<div class="tuki-delivery-content">
					<strong><?php esc_html_e( 'Tienda Móvil Cerca', 'tukitask-local-drivers' ); ?></strong>
					<span class="distance-badge">📍 <?php echo esc_html( $distance_text ); ?></span>
					<span><?php esc_html_e( 'Producto disponible en vehículo', 'tukitask-local-drivers' ); ?></span>
				</div>
			</div>
			<div class="tuki-delivery-cta">
				<span class="eta">🚀 <?php esc_html_e( 'Entrega inmediata', 'tukitask-local-drivers' ); ?></span>
			</div>
		</div>
		<?php
	}
}
