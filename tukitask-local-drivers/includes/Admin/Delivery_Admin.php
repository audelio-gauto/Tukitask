<?php
/**
 * Delivery Administration - Limits, Reports, and Driver Trips.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

use Tukitask\LocalDrivers\Core\Loader;

class Delivery_Admin {

	protected $loader;

	public function __construct( Loader $loader ) {
		$this->loader = $loader;
		$this->loader->add_action( 'admin_menu', $this, 'register_menus' );
		$this->loader->add_action( 'admin_post_tukitask_save_driver_limits', $this, 'save_driver_limits' );
		$this->loader->add_action( 'admin_post_tukitask_reset_driver_deliveries', $this, 'reset_driver_deliveries' );
	}

	public function register_menus() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Límites de Entrega', 'tukitask-local-drivers' ),
			__( 'Límites de Entrega', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-delivery-limits',
			array( $this, 'render_limits_page' )
		);

		add_submenu_page(
			'tukitask-drivers',
			__( 'Reporte de Viajes', 'tukitask-local-drivers' ),
			__( 'Reporte de Viajes', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-driver-reports',
			array( $this, 'render_reports_page' )
		);
	}

	/**
	 * Get driver's monthly delivery count.
	 */
	private function get_monthly_delivery_count( $driver_post_id ) {
		$month_start = gmdate( 'Y-m-01 00:00:00' );
		$deliveries = get_posts( array(
			'post_type'      => 'tukitask_delivery',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'date_query'     => array(
				array( 'after' => $month_start ),
			),
			'meta_query'     => array(
				array(
					'key'   => '_assigned_driver_id',
					'value' => $driver_post_id,
				),
				array(
					'key'     => '_delivery_status',
					'value'   => 'delivered',
					'compare' => '=',
				),
			),
		) );
		return count( $deliveries );
	}

	/**
	 * Render Delivery Limits page (like the screenshot).
	 */
	public function render_limits_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Acceso denegado.', 'tukitask-local-drivers' ) );
		}

		$search  = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
		$from    = isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '';
		$to      = isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : '';

		$vehicle_labels = array(
			'motorcycle' => '🏍️ Moto',
			'car'        => '🚗 Auto',
			'motocarro'  => '🛺 Moto carro',
			'truck_3000' => '🚛 Camión 3000',
			'truck_5000' => '🚛 Camión 5000',
		);

		// Get all drivers
		$driver_args = array(
			'post_type'      => 'tukitask_driver',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
		);
		$drivers = get_posts( $driver_args );

		// Filter by search
		if ( $search ) {
			$drivers = array_filter( $drivers, function( $d ) use ( $search ) {
				$user_id = get_post_meta( $d->ID, '_driver_user_id', true );
				$user = $user_id ? get_user_by( 'id', $user_id ) : null;
				$name = $d->post_title;
				$email = $user ? $user->user_email : '';
				return stripos( $name, $search ) !== false || stripos( $email, $search ) !== false;
			} );
		}

		?>
		<div class="wrap">
			<h1><span class="dashicons dashicons-car" style="font-size:1.3em;margin-right:5px;color:#e53935;"></span> <?php esc_html_e( 'Límites Mensuales de Entrega', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Configure el número máximo de entregas que cada repartidor puede realizar. Los límites se configuran por tipo de vehículo en Configuración.', 'tukitask-local-drivers' ); ?></p>

			<!-- Filters -->
			<div style="background:#fff;border:1px solid #ccd0d4;border-radius:6px;padding:16px;margin:16px 0;">
				<form method="get" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
					<input type="hidden" name="page" value="tukitask-delivery-limits">
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><span class="dashicons dashicons-search"></span> <?php esc_html_e( 'Buscar Driver', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="<?php esc_attr_e( 'Nombre o correo...', 'tukitask-local-drivers' ); ?>" style="min-width:280px;">
					</div>
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><span class="dashicons dashicons-calendar-alt"></span> <?php esc_html_e( 'Desde', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="from" value="<?php echo esc_attr( $from ); ?>">
					</div>
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><span class="dashicons dashicons-calendar-alt"></span> <?php esc_html_e( 'Hasta', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="to" value="<?php echo esc_attr( $to ); ?>">
					</div>
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Filtrar', 'tukitask-local-drivers' ); ?></button>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=tukitask-delivery-limits' ) ); ?>" class="button"><?php esc_html_e( 'Limpiar', 'tukitask-local-drivers' ); ?></a>
				</form>
			</div>

			<p style="color:#666;"><?php printf( esc_html__( 'Mostrando %d de %d drivers', 'tukitask-local-drivers' ), count( $drivers ), count( $drivers ) ); ?></p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'tukitask_save_limits', 'limits_nonce' ); ?>
				<input type="hidden" name="action" value="tukitask_save_driver_limits">

				<table class="widefat striped" style="border-collapse:collapse;">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Repartidor', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Vehículo', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Entregas', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Límite', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Uso (%)', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Saldo Wallet', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Modo Límite', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></th>
							<th style="text-align:center;"><?php esc_html_e( 'Acciones', 'tukitask-local-drivers' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $drivers as $driver ) :
							$user_id  = get_post_meta( $driver->ID, '_driver_user_id', true );
							$user     = $user_id ? get_user_by( 'id', $user_id ) : null;
							$email    = $user ? $user->user_email : '-';
							$d_vehicle = get_post_meta( $driver->ID, '_driver_vehicle_type', true ) ?: 'motorcycle';
							$d_vehicle_label = isset( $vehicle_labels[ $d_vehicle ] ) ? $vehicle_labels[ $d_vehicle ] : $d_vehicle;
							$v_limit_mode = get_option( 'tukitask_ld_' . $d_vehicle . '_limit_mode', 'none' );
							$default_limit = intval( get_option( 'tukitask_ld_' . $d_vehicle . '_delivery_limit', 0 ) );
							$limit    = get_post_meta( $driver->ID, '_driver_delivery_limit', true );
							$limit    = $limit !== '' && intval( $limit ) > 0 ? intval( $limit ) : $default_limit;
							$count    = $this->get_monthly_delivery_count( $driver->ID );
							$pct      = $limit > 0 ? min( round( ( $count / $limit ) * 100 ), 100 ) : 0;
							$is_available = get_post_meta( $driver->ID, '_driver_available', true );
							$limit_label = array( 'none' => __( 'Sin límite', 'tukitask-local-drivers' ), 'quantity' => __( 'Cantidad', 'tukitask-local-drivers' ), 'balance' => __( 'Saldo', 'tukitask-local-drivers' ) );

							// Wallet balance
							$balance = 0;
							if ( $user_id && class_exists( '\\Tukitask\\LocalDrivers\\Drivers\\Wallet_Manager' ) ) {
								$balance = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $user_id );
							}

							$bar_color = $pct < 50 ? '#10b981' : ( $pct < 80 ? '#f59e0b' : '#ef4444' );
						?>
						<tr>
							<td>
								<strong><?php echo esc_html( $driver->post_title ); ?></strong><br>
								<small style="color:#666;"><?php echo esc_html( $email ); ?></small>
							</td>
							<td style="text-align:center;"><?php echo esc_html( $d_vehicle_label ); ?></td>
							<td style="text-align:center;font-size:1.1em;font-weight:600;"><?php echo intval( $count ); ?></td>
							<td style="text-align:center;">
								<input type="number" name="limits[<?php echo intval( $driver->ID ); ?>]" value="<?php echo intval( $limit ); ?>" min="1" style="width:70px;text-align:center;">
							</td>
							<td style="text-align:center;">
								<div style="display:flex;align-items:center;gap:8px;justify-content:center;">
									<div style="flex:1;max-width:120px;background:#e5e7eb;border-radius:10px;height:12px;overflow:hidden;">
										<div style="width:<?php echo intval( $pct ); ?>%;height:100%;background:<?php echo esc_attr( $bar_color ); ?>;border-radius:10px;transition:width .3s;"></div>
									</div>
									<span style="font-size:0.85em;font-weight:600;"><?php echo intval( $pct ); ?>%</span>
								</div>
							</td>
							<td style="text-align:center;">
								<?php echo wp_kses_post( function_exists( 'wc_price' ) ? wc_price( $balance ) : '₲' . number_format( $balance, 2 ) ); ?>
							</td>
							<td style="text-align:center;">
								<span style="font-size:0.85em;"><?php echo esc_html( isset( $limit_label[ $v_limit_mode ] ) ? $limit_label[ $v_limit_mode ] : $v_limit_mode ); ?></span>
							</td>
							<td style="text-align:center;">
								<?php if ( $is_available === 'yes' ) : ?>
									<span style="color:#10b981;font-weight:600;">✅ <?php esc_html_e( 'Disponible', 'tukitask-local-drivers' ); ?></span>
								<?php else : ?>
									<span style="color:#94a3b8;">⏸️ <?php esc_html_e( 'Inactivo', 'tukitask-local-drivers' ); ?></span>
								<?php endif; ?>
							</td>
							<td style="text-align:center;">
								<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=tukitask_reset_driver_deliveries&driver_id=' . $driver->ID ), 'tukitask_reset_' . $driver->ID ) ); ?>" class="button button-small" onclick="return confirm('<?php esc_attr_e( '¿Reiniciar contador de entregas?', 'tukitask-local-drivers' ); ?>')">
									<span class="dashicons dashicons-image-rotate" style="vertical-align:middle;"></span> <?php esc_html_e( 'Reiniciar', 'tukitask-local-drivers' ); ?>
								</a>
							</td>
						</tr>
						<?php endforeach; ?>
					</tbody>
				</table>

				<p style="margin-top:16px;">
					<button type="submit" class="button button-primary button-large">
						<span class="dashicons dashicons-saved" style="vertical-align:middle;margin-right:4px;"></span> <?php esc_html_e( 'Guardar Límites', 'tukitask-local-drivers' ); ?>
					</button>
				</p>
			</form>
		</div>
		<?php
	}

	/**
	 * Save driver delivery limits.
	 */
	public function save_driver_limits() {
		if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'tukitask_save_limits', 'limits_nonce' ) ) {
			wp_die( 'Unauthorized' );
		}

		if ( isset( $_POST['limits'] ) && is_array( $_POST['limits'] ) ) {
			foreach ( $_POST['limits'] as $driver_id => $limit ) {
				$driver_id = intval( $driver_id );
				$limit     = max( 1, intval( $limit ) );
				update_post_meta( $driver_id, '_driver_delivery_limit', $limit );
			}
		}

		wp_safe_redirect( add_query_arg( 'updated', '1', admin_url( 'admin.php?page=tukitask-delivery-limits' ) ) );
		exit;
	}

	/**
	 * Reset driver monthly delivery counter.
	 */
	public function reset_driver_deliveries() {
		$driver_id = isset( $_GET['driver_id'] ) ? intval( $_GET['driver_id'] ) : 0;
		if ( ! current_user_can( 'manage_options' ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ?? '' ) ), 'tukitask_reset_' . $driver_id ) ) {
			wp_die( 'Unauthorized' );
		}

		// Store a manual reset timestamp — deliveries after this date count as 0
		update_post_meta( $driver_id, '_driver_deliveries_reset_at', current_time( 'mysql' ) );

		wp_safe_redirect( add_query_arg( 'reset', '1', admin_url( 'admin.php?page=tukitask-delivery-limits' ) ) );
		exit;
	}

	/**
	 * Render Driver Reports page.
	 */
	public function render_reports_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Acceso denegado.', 'tukitask-local-drivers' ) );
		}

		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
		$from   = isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : gmdate( 'Y-m-01' );
		$to     = isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : gmdate( 'Y-m-d' );

		$drivers = get_posts( array(
			'post_type'      => 'tukitask_driver',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
		) );

		if ( $search ) {
			$drivers = array_filter( $drivers, function( $d ) use ( $search ) {
				$user_id = get_post_meta( $d->ID, '_driver_user_id', true );
				$user = $user_id ? get_user_by( 'id', $user_id ) : null;
				return stripos( $d->post_title, $search ) !== false || ( $user && stripos( $user->user_email, $search ) !== false );
			} );
		}

		?>
		<div class="wrap">
			<h1><span class="dashicons dashicons-chart-bar" style="font-size:1.3em;margin-right:5px;color:#3b82f6;"></span> <?php esc_html_e( 'Reporte de Viajes por Conductor', 'tukitask-local-drivers' ); ?></h1>

			<!-- Filters -->
			<div style="background:#fff;border:1px solid #ccd0d4;border-radius:6px;padding:16px;margin:16px 0;">
				<form method="get" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
					<input type="hidden" name="page" value="tukitask-driver-reports">
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Buscar', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="<?php esc_attr_e( 'Nombre o correo...', 'tukitask-local-drivers' ); ?>" style="min-width:200px;">
					</div>
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Desde', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="from" value="<?php echo esc_attr( $from ); ?>">
					</div>
					<div>
						<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Hasta', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="to" value="<?php echo esc_attr( $to ); ?>">
					</div>
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Filtrar', 'tukitask-local-drivers' ); ?></button>
				</form>
			</div>

			<table class="widefat striped">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Conductor', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Tipo Vehículo', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Viajes Totales', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Entregados', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Cancelados', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Ganancia Total', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:center;"><?php esc_html_e( 'Saldo Wallet', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php
					$grand_total_trips = 0;
					$grand_total_earnings = 0;

					foreach ( $drivers as $driver ) :
						$user_id  = get_post_meta( $driver->ID, '_driver_user_id', true );
						$user     = $user_id ? get_user_by( 'id', $user_id ) : null;
						$email    = $user ? $user->user_email : '-';
						$vehicle  = get_post_meta( $driver->ID, '_driver_vehicle_type', true ) ?: '-';

						// Query all deliveries for this driver in date range
						$date_query = array();
						if ( $from ) {
							$date_query[] = array( 'after' => $from . ' 00:00:00', 'inclusive' => true );
						}
						if ( $to ) {
							$date_query[] = array( 'before' => $to . ' 23:59:59', 'inclusive' => true );
						}

						$all_deliveries = get_posts( array(
							'post_type'      => 'tukitask_delivery',
							'post_status'    => 'publish',
							'posts_per_page' => -1,
							'fields'         => 'ids',
							'date_query'     => $date_query,
							'meta_query'     => array(
								array(
									'key'   => '_assigned_driver_id',
									'value' => $driver->ID,
								),
							),
						) );

						$delivered = 0;
						$cancelled = 0;
						$earning   = 0;

						foreach ( $all_deliveries as $del_id ) {
							$status = get_post_meta( $del_id, '_delivery_status', true );
							if ( $status === 'delivered' ) {
								$delivered++;
								$earning += floatval( get_post_meta( $del_id, '_driver_earning', true ) );
							} elseif ( $status === 'cancelled' ) {
								$cancelled++;
							}
						}

						$total_trips = count( $all_deliveries );
						$grand_total_trips += $total_trips;
						$grand_total_earnings += $earning;

						$balance = 0;
						if ( $user_id && class_exists( '\\Tukitask\\LocalDrivers\\Drivers\\Wallet_Manager' ) ) {
							$balance = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $user_id );
						}

						$vehicle_labels = array(
							'motorcycle' => '🏍️ Moto',
							'car'        => '🚙 Auto',
							'motocarro'  => '🛵 Moto carro',
							'truck_3000' => '🚛 Camión 3T',
							'truck_5000' => '🚚 Camión 5T',
						);
						$vehicle_display = isset( $vehicle_labels[ $vehicle ] ) ? $vehicle_labels[ $vehicle ] : esc_html( $vehicle );
					?>
					<tr>
						<td>
							<strong><?php echo esc_html( $driver->post_title ); ?></strong><br>
							<small style="color:#666;"><?php echo esc_html( $email ); ?></small>
						</td>
						<td style="text-align:center;"><?php echo wp_kses_post( $vehicle_display ); ?></td>
						<td style="text-align:center;font-weight:600;"><?php echo intval( $total_trips ); ?></td>
						<td style="text-align:center;color:#10b981;font-weight:600;"><?php echo intval( $delivered ); ?></td>
						<td style="text-align:center;color:#ef4444;font-weight:600;"><?php echo intval( $cancelled ); ?></td>
						<td style="text-align:center;font-weight:600;">
							<?php echo wp_kses_post( function_exists( 'wc_price' ) ? wc_price( $earning ) : '₲' . number_format( $earning, 2 ) ); ?>
						</td>
						<td style="text-align:center;">
							<?php echo wp_kses_post( function_exists( 'wc_price' ) ? wc_price( $balance ) : '₲' . number_format( $balance, 2 ) ); ?>
						</td>
					</tr>
					<?php endforeach; ?>
				</tbody>
				<tfoot>
					<tr style="background:#f8fafc;font-weight:700;">
						<td colspan="2" style="text-align:right;"><?php esc_html_e( 'TOTALES', 'tukitask-local-drivers' ); ?></td>
						<td style="text-align:center;"><?php echo intval( $grand_total_trips ); ?></td>
						<td colspan="2"></td>
						<td style="text-align:center;">
							<?php echo wp_kses_post( function_exists( 'wc_price' ) ? wc_price( $grand_total_earnings ) : '₲' . number_format( $grand_total_earnings, 2 ) ); ?>
						</td>
						<td></td>
					</tr>
				</tfoot>
			</table>
		</div>
		<?php
	}
}
