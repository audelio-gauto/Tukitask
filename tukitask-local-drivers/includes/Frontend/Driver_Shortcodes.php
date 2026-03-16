<?php
/**
 * Driver Shortcodes.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

/**
 * Driver_Shortcodes Class.
 *
 * Registers shortcodes for driver panel and tracking.
 */
class Driver_Shortcodes {

	/**
	 * Loader instance.
	 *
	 * @var object
	 */
	protected $loader;

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$this->loader = $loader;
		$loader->add_shortcode( 'tukitask_driver_panel', $this, 'driver_panel_shortcode' );
		$loader->add_shortcode( 'panel_logistica_pro', $this, 'logistica_panel_shortcode' );
		$loader->add_shortcode( 'tukitask_driver_status', $this, 'driver_status_shortcode' );
	}

	/**
	 * Driver panel shortcode.
	 *
	 * Usage: [tukitask_driver_panel]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function driver_panel_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(),
			$atts,
			'tukitask_driver_panel'
		);

		// Use the new dashboard renderer
		$dashboard = new Driver_Dashboard( $this->loader );
		return $dashboard->render_dashboard( $atts );
	}

	/**
	 * Logistics panel shortcode.
	 *
	 * Usage: [panel_logistica_pro]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function logistica_panel_shortcode( $atts ) {
		if ( ! is_user_logged_in() || ! \Tukitask\LocalDrivers\Helpers\Security::can_access_driver_panel() ) {
			return '';
		}

		ob_start();
		?>
		<div class="tuki-logistics-panel" style="background:#fff; padding:15px; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
			<h3 style="margin-top:0;"><i class="fas fa-map-marked-alt"></i> <?php _e( 'Logística en Tiempo Real', 'tukitask-local-drivers' ); ?></h3>
			<div id="tukitask-driver-map" style="width:100%; height:300px; border-radius:8px; background:#f0f0f0;"></div>
			<p style="font-size:12px; color:#64748b; margin-top:10px;">
				<i class="fas fa-info-circle"></i> <?php _e( 'Visualiza tu ubicación y pedidos cercanos.', 'tukitask-local-drivers' ); ?>
			</p>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Driver status shortcode.
	 *
	 * Usage: [tukitask_driver_status]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function driver_status_shortcode( $atts ) {
		if ( ! is_user_logged_in() || ! \Tukitask\LocalDrivers\Helpers\Security::can_access_driver_panel() ) {
			return '';
		}

		$user_id = get_current_user_id();

		// Find driver post for this user.
		$driver_query = new \WP_Query(
			array(
				'post_type'      => 'tukitask_driver',
				'posts_per_page' => 1,
				'meta_query'     => array(
					array(
						'key'     => '_driver_user_id',
						'value'   => $user_id,
						'compare' => '=',
					),
				),
			)
		);

		if ( ! $driver_query->have_posts() ) {
			return '';
		}

		$driver_id          = $driver_query->posts[0]->ID;
		$driver_status      = get_post_meta( $driver_id, '_driver_status', true );
		$total_deliveries   = get_post_meta( $driver_id, '_driver_total_deliveries', true );
		$active_trip        = get_post_meta( $driver_id, '_driver_active_trip', true );

		$status_labels = array(
			'available' => __( 'Disponible', 'tukitask-local-drivers' ),
			'en_viaje'  => __( 'En Viaje', 'tukitask-local-drivers' ),
			'ocupado'   => __( 'Ocupado', 'tukitask-local-drivers' ),
			'offline'   => __( 'Offline', 'tukitask-local-drivers' ),
		);

		$status_colors = array(
			'available' => '#46b450',
			'en_viaje'  => '#00a0d2',
			'ocupado'   => '#ffb900',
			'offline'   => '#dc3232',
		);

		$current_status = $driver_status ? $driver_status : 'offline';
		$status_label   = isset( $status_labels[ $current_status ] ) ? $status_labels[ $current_status ] : $status_labels['offline'];
		$status_color   = isset( $status_colors[ $current_status ] ) ? $status_colors[ $current_status ] : $status_colors['offline'];

		ob_start();
		?>
		<div class="tukitask-driver-status-widget" style="background:#fff;padding:15px;border-left:4px solid <?php echo esc_attr( $status_color ); ?>;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
			<p style="margin:0 0 10px 0;">
				<strong><?php esc_html_e( 'Estado:', 'tukitask-local-drivers' ); ?></strong>
				<span style="color:<?php echo esc_attr( $status_color ); ?>;font-weight:bold;"><?php echo esc_html( $status_label ); ?></span>
			</p>
			<p style="margin:0 0 10px 0;">
				<strong><?php esc_html_e( 'Total Entregas:', 'tukitask-local-drivers' ); ?></strong>
				<?php echo esc_html( $total_deliveries ? $total_deliveries : '0' ); ?>
			</p>
			<?php if ( $active_trip ) : ?>
			<p style="margin:0;">
				<strong><?php esc_html_e( 'Viaje Activo:', 'tukitask-local-drivers' ); ?></strong>
				<a href="<?php echo esc_url( wc_get_order( $active_trip )->get_view_order_url() ); ?>">#<?php echo esc_html( $active_trip ); ?></a>
			</p>
			<?php endif; ?>
		</div>
		<?php
		return ob_get_clean();
	}
}
