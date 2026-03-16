<?php
/**
 * Driver Metadata management.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Driver_Meta Class.
 *
 * Manages meta boxes and metadata for driver CPT.
 */
class Driver_Meta {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'add_meta_boxes', $this, 'add_driver_meta_boxes' );
		$loader->add_action( 'save_post_tukitask_driver', $this, 'save_driver_meta', 10, 2 );
	}

	/**
	 * Add meta boxes for driver information.
	 */
	public function add_driver_meta_boxes() {
		add_meta_box(
			'tukitask_driver_info',
			__( 'Información del Conductor', 'tukitask-local-drivers' ),
			array( $this, 'render_driver_info_meta_box' ),
			'tukitask_driver',
			'normal',
			'high'
		);

		add_meta_box(
			'tukitask_driver_location',
			__( 'Ubicación y Cobertura', 'tukitask-local-drivers' ),
			array( $this, 'render_location_meta_box' ),
			'tukitask_driver',
			'side',
			'default'
		);

		add_meta_box(
			'tukitask_driver_stats',
			__( 'Estadísticas', 'tukitask-local-drivers' ),
			array( $this, 'render_stats_meta_box' ),
			'tukitask_driver',
			'side',
			'default'
		);

		add_meta_box(
			'tukitask_driver_mobile_stock',
			__( 'Stock Móvil del Conductor', 'tukitask-local-drivers' ),
			array( $this, 'render_mobile_stock_meta_box' ),
			'tukitask_driver',
			'normal',
			'high'
		);

		add_meta_box(
			'tukitask_driver_service_config',
			__( 'Configuración de Servicio', 'tukitask-local-drivers' ),
			array( $this, 'render_service_config_meta_box' ),
			'tukitask_driver',
			'normal',
			'high'
		);
	}

	/**
	 * Render service configuration meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 */
	public function render_service_config_meta_box( $post ) {
		$pickup_range    = get_post_meta( $post->ID, '_driver_pickup_range', true ) ?: 10;
		$delivery_range  = get_post_meta( $post->ID, '_driver_delivery_range', true ) ?: 15;
		$accepts_woo     = get_post_meta( $post->ID, '_driver_accepts_woo_orders', true );
		$accepts_packages = get_post_meta( $post->ID, '_driver_accepts_packages', true );
		$vehicle_type    = get_post_meta( $post->ID, '_driver_vehicle_type', true );
		$max_concurrent  = get_post_meta( $post->ID, '_driver_max_concurrent', true ) ?: 3;

		?>
		<table class="form-table">
			<tr>
				<th colspan="2" style="padding-bottom:5px;border-bottom:1px solid #ddd;">
					<strong style="font-size:14px;">📍 <?php esc_html_e( 'Rangos de Operación', 'tukitask-local-drivers' ); ?></strong>
				</th>
			</tr>
			<tr>
				<th><label for="driver_pickup_range"><?php esc_html_e( 'Rango de Recogida (km)', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="number" name="driver_pickup_range" id="driver_pickup_range" 
					       value="<?php echo esc_attr( $pickup_range ); ?>" class="small-text" min="1" max="100" step="0.5">
					<p class="description"><?php esc_html_e( 'Distancia máxima que el conductor está dispuesto a recorrer para recoger un pedido.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th><label for="driver_delivery_range"><?php esc_html_e( 'Rango de Entrega (km)', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="number" name="driver_delivery_range" id="driver_delivery_range" 
					       value="<?php echo esc_attr( $delivery_range ); ?>" class="small-text" min="1" max="100" step="0.5">
					<p class="description"><?php esc_html_e( 'Distancia máxima de entrega que el conductor acepta (desde tienda a cliente).', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th colspan="2" style="padding-top:15px;padding-bottom:5px;border-bottom:1px solid #ddd;">
					<strong style="font-size:14px;">📦 <?php esc_html_e( 'Tipos de Pedidos que Acepta', 'tukitask-local-drivers' ); ?></strong>
				</th>
			</tr>
			<tr>
				<th><label><?php esc_html_e( 'Pedidos WooCommerce', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<label>
						<input type="checkbox" name="driver_accepts_woo_orders" value="yes" <?php checked( $accepts_woo !== 'no', true ); ?>>
						<?php esc_html_e( 'Aceptar pedidos de tiendas (compras WooCommerce)', 'tukitask-local-drivers' ); ?>
					</label>
					<p class="description"><?php esc_html_e( 'Compras normales, Llega Hoy y Tienda Móvil de vendedores.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th><label><?php esc_html_e( 'Envíos de Paquetes', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<label>
						<input type="checkbox" name="driver_accepts_packages" value="yes" <?php checked( $accepts_packages, 'yes' ); ?>>
						<?php esc_html_e( 'Aceptar envíos de paquetes (tipo Bolt/mensajería)', 'tukitask-local-drivers' ); ?>
					</label>
					<p class="description"><?php esc_html_e( 'Solicitudes de envío punto a punto sin compra en tienda.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th colspan="2" style="padding-top:15px;padding-bottom:5px;border-bottom:1px solid #ddd;">
					<strong style="font-size:14px;">🚗 <?php esc_html_e( 'Configuración de Vehículo', 'tukitask-local-drivers' ); ?></strong>
				</th>
			</tr>
			<tr>
				<th><label for="driver_vehicle_type"><?php esc_html_e( 'Tipo de Vehículo', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<select name="driver_vehicle_type" id="driver_vehicle_type" style="width:100%;max-width:300px;">
						<option value="motorcycle" <?php selected( $vehicle_type, 'motorcycle' ); ?>><?php esc_html_e( '🏍️ Motocicleta', 'tukitask-local-drivers' ); ?></option>
						<option value="car" <?php selected( $vehicle_type, 'car' ); ?>><?php esc_html_e( '🚗 Automóvil', 'tukitask-local-drivers' ); ?></option>
						<option value="motocarro" <?php selected( $vehicle_type, 'motocarro' ); ?>><?php esc_html_e( '🛵 Moto Carro', 'tukitask-local-drivers' ); ?></option>
						<option value="truck_3000" <?php selected( $vehicle_type, 'truck_3000' ); ?>><?php esc_html_e( '🚛 Camión 3000 kg', 'tukitask-local-drivers' ); ?></option>
						<option value="truck_5000" <?php selected( $vehicle_type, 'truck_5000' ); ?>><?php esc_html_e( '🚚 Camión 5000 kg', 'tukitask-local-drivers' ); ?></option>
						<option value="bicycle" <?php selected( $vehicle_type, 'bicycle' ); ?>><?php esc_html_e( '🚲 Bicicleta', 'tukitask-local-drivers' ); ?></option>
						<option value="van" <?php selected( $vehicle_type, 'van' ); ?>><?php esc_html_e( '🚐 Van/Camioneta', 'tukitask-local-drivers' ); ?></option>
					</select>
				</td>
			</tr>
			<tr>
				<th><label for="driver_max_concurrent"><?php esc_html_e( 'Pedidos Simultáneos', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="number" name="driver_max_concurrent" id="driver_max_concurrent" 
					       value="<?php echo esc_attr( $max_concurrent ); ?>" class="small-text" min="1" max="10">
					<p class="description"><?php esc_html_e( 'Máximo de pedidos que puede llevar al mismo tiempo.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
		</table>
		<?php
	}

	/**
	 * Render driver information meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 */
	public function render_driver_info_meta_box( $post ) {
		wp_nonce_field( 'tukitask_driver_meta_save', 'tukitask_driver_meta_nonce' );

		$user_id  = get_post_meta( $post->ID, '_driver_user_id', true );
		$status   = get_post_meta( $post->ID, '_driver_status', true );
		$vehicle  = get_post_meta( $post->ID, '_driver_vehicle', true );
		$capacity = get_post_meta( $post->ID, '_driver_capacity', true );
		$trunk    = get_post_meta( $post->ID, '_driver_trunk_available', true );
		$phone    = get_post_meta( $post->ID, '_driver_phone', true );
		$license  = get_post_meta( $post->ID, '_driver_license', true );
		$profile  = get_post_meta( $post->ID, '_driver_profile', true );

		?>
		<table class="form-table">
			<tr>
				<th><label for="driver_user_id"><?php esc_html_e( 'Usuario WordPress', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<?php
					wp_dropdown_users(
						array(
							'name'             => 'driver_user_id',
							'id'               => 'driver_user_id',
							'selected'         => $user_id,
							'show_option_none' => __( '— Seleccione un usuario —', 'tukitask-local-drivers' ),
							'role__in'         => array( 'tukitask_driver', 'administrator' ),
						)
					);
					?>
					<p class="description"><?php esc_html_e( 'Usuario asociado a este conductor.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th><label for="driver_profile"><?php esc_html_e( 'Perfil del Conductor', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<select name="driver_profile" id="driver_profile" style="width:100%;max-width:300px;">
						<option value=""><?php esc_html_e( '— Seleccione un perfil —', 'tukitask-local-drivers' ); ?></option>
						<option value="autodriver_auto" <?php selected( $profile, 'autodriver_auto' ); ?>><?php esc_html_e( 'AutoDriver Auto (Transporte)', 'tukitask-local-drivers' ); ?></option>
						<option value="autodriver_tienda" <?php selected( $profile, 'autodriver_tienda' ); ?>><?php esc_html_e( 'AutoDriver Tienda (Tienda Móvil)', 'tukitask-local-drivers' ); ?></option>
						<option value="motodriver_moto" <?php selected( $profile, 'motodriver_moto' ); ?>><?php esc_html_e( 'MotoDriver Moto (Transporte)', 'tukitask-local-drivers' ); ?></option>
						<option value="motodriver_tienda" <?php selected( $profile, 'motodriver_tienda' ); ?>><?php esc_html_e( 'MotoDriver Tienda (Tienda Móvil)', 'tukitask-local-drivers' ); ?></option>
					</select>
					<p class="description"><?php esc_html_e( 'Define el tipo de vehículo y servicio del conductor.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th><label for="driver_status"><?php esc_html_e( 'Estado Actual', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<select name="driver_status" id="driver_status" style="width:100%;max-width:300px;">
						<option value="available" <?php selected( $status, 'available' ); ?>><?php esc_html_e( 'Disponible', 'tukitask-local-drivers' ); ?></option>
						<option value="en_viaje" <?php selected( $status, 'en_viaje' ); ?>><?php esc_html_e( 'En Viaje', 'tukitask-local-drivers' ); ?></option>
						<option value="ocupado" <?php selected( $status, 'ocupado' ); ?>><?php esc_html_e( 'Ocupado', 'tukitask-local-drivers' ); ?></option>
						<option value="offline" <?php selected( $status, 'offline' ); ?>><?php esc_html_e( 'Offline', 'tukitask-local-drivers' ); ?></option>
					</select>
				</td>
			</tr>
			<tr>
				<th><label for="driver_vehicle"><?php esc_html_e( 'Vehículo', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="text" name="driver_vehicle" id="driver_vehicle" value="<?php echo esc_attr( $vehicle ); ?>" class="regular-text" placeholder="<?php esc_attr_e( 'Ej: Toyota Corolla 2020', 'tukitask-local-drivers' ); ?>">
				</td>
			</tr>
			<tr>
				<th><label for="driver_capacity"><?php esc_html_e( 'Capacidad de Carga (Kg)', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="number" name="driver_capacity" id="driver_capacity" value="<?php echo esc_attr( $capacity ); ?>" class="small-text" min="0" step="0.1">
					<p class="description"><?php esc_html_e( 'Capacidad máxima de carga en kilogramos.', 'tukitask-local-drivers' ); ?></p>
				</td>
			</tr>
			<tr>
				<th><label for="driver_trunk_available"><?php esc_html_e( 'Baúl Disponible', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<label>
						<input type="checkbox" name="driver_trunk_available" id="driver_trunk_available" value="yes" <?php checked( $trunk, 'yes' ); ?>>
						<?php esc_html_e( 'Sí, tiene baúl disponible', 'tukitask-local-drivers' ); ?>
					</label>
				</td>
			</tr>
			<tr>
				<th><label for="driver_phone"><?php esc_html_e( 'Teléfono', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="tel" name="driver_phone" id="driver_phone" value="<?php echo esc_attr( $phone ); ?>" class="regular-text">
				</td>
			</tr>
			<tr>
				<th><label for="driver_license"><?php esc_html_e( 'Licencia de Conducir', 'tukitask-local-drivers' ); ?></label></th>
				<td>
					<input type="text" name="driver_license" id="driver_license" value="<?php echo esc_attr( $license ); ?>" class="regular-text">
				</td>
			</tr>
		</table>
		<?php
	}

	/**
	 * Render location meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 */
	public function render_location_meta_box( $post ) {
		$lat    = get_post_meta( $post->ID, '_driver_lat', true );
		$lng    = get_post_meta( $post->ID, '_driver_lng', true );
		$radius = get_post_meta( $post->ID, '_driver_radius', true );
		$radius = $radius ? $radius : get_option( 'tukitask_ld_default_driver_radius', '10' );

		?>
		<p>
			<label for="driver_lat"><strong><?php esc_html_e( 'Latitud', 'tukitask-local-drivers' ); ?></strong></label><br>
			<input type="text" name="driver_lat" id="driver_lat" value="<?php echo esc_attr( $lat ); ?>" class="widefat" placeholder="-34.603722">
		</p>
		<p>
			<label for="driver_lng"><strong><?php esc_html_e( 'Longitud', 'tukitask-local-drivers' ); ?></strong></label><br>
			<input type="text" name="driver_lng" id="driver_lng" value="<?php echo esc_attr( $lng ); ?>" class="widefat" placeholder="-58.381592">
		</p>
		<p>
			<label for="driver_radius"><strong><?php esc_html_e( 'Radio de Cobertura (km)', 'tukitask-local-drivers' ); ?></strong></label><br>
			<input type="number" name="driver_radius" id="driver_radius" value="<?php echo esc_attr( $radius ); ?>" class="widefat" min="1" step="0.1">
		</p>
		<p class="description">
			<?php esc_html_e( 'La ubicación se actualiza automáticamente desde la app móvil.', 'tukitask-local-drivers' ); ?>
		</p>
		<?php
	}

	/**
	 * Render statistics meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 */
	public function render_stats_meta_box( $post ) {
		$total_deliveries = get_post_meta( $post->ID, '_driver_total_deliveries', true );
		$total_deliveries = $total_deliveries ? $total_deliveries : 0;

		$active_trip = get_post_meta( $post->ID, '_driver_active_trip', true );
		$last_update = get_post_meta( $post->ID, '_driver_last_location_update', true );

		?>
		<p>
			<strong><?php esc_html_e( 'Total de Entregas:', 'tukitask-local-drivers' ); ?></strong><br>
			<?php echo esc_html( $total_deliveries ); ?>
		</p>
		<p>
			<strong><?php esc_html_e( 'Viaje Activo:', 'tukitask-local-drivers' ); ?></strong><br>
			<?php
			if ( $active_trip ) {
				echo '<a href="' . esc_url( get_edit_post_link( $active_trip ) ) . '">#' . esc_html( $active_trip ) . '</a>';
			} else {
				esc_html_e( 'Ninguno', 'tukitask-local-drivers' );
			}
			?>
		</p>
		<?php if ( $last_update ) : ?>
		<p>
			<strong><?php esc_html_e( 'Última Actualización:', 'tukitask-local-drivers' ); ?></strong><br>
			<?php echo esc_html( human_time_diff( $last_update, current_time( 'timestamp' ) ) ); ?> <?php esc_html_e( 'atrás', 'tukitask-local-drivers' ); ?>
		</p>
		<?php endif; ?>
		<?php
	}

	/**
	 * Render mobile stock meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 */
	public function render_mobile_stock_meta_box( $post ) {
		wp_nonce_field( 'tukitask_driver_mobile_stock_save', 'tukitask_driver_mobile_stock_nonce' );

		$current_mobile_stock_products = get_post_meta( $post->ID, '_driver_mobile_stock_products', true );
		if ( ! is_array( $current_mobile_stock_products ) ) {
			$current_mobile_stock_products = array();
		}

		// Get all products marked as '_tukitask_is_mobile_stock'.
		$args = array(
			'post_type'      => 'product',
			'posts_per_page' => -1,
			'post_status'    => 'publish',
			'meta_query'     => array(
				array(
					'key'     => '_tukitask_is_mobile_stock',
					'value'   => 'yes',
					'compare' => '=',
				),
			),
			'fields'         => 'ids', // Only get post IDs for efficiency.
		);
		$mobile_stock_product_ids = get_posts( $args );

		if ( empty( $mobile_stock_product_ids ) ) {
			echo '<p>' . esc_html__( 'No hay productos marcados para stock móvil.', 'tukitask-local-drivers' ) . '</p>';
			return;
		}

		echo '<div style="max-height: 200px; overflow-y: scroll; border: 1px solid #ddd; padding: 10px;">';
		foreach ( $mobile_stock_product_ids as $product_id ) {
			$product = wc_get_product( $product_id );
			if ( ! $product ) {
				continue;
			}
			$checked = in_array( $product_id, $current_mobile_stock_products, true ) ? 'checked' : '';
			echo '<label style="display: block; margin-bottom: 5px;">';
			echo '<input type="checkbox" name="driver_mobile_stock_products[]" value="' . esc_attr( $product_id ) . '" ' . $checked . '> ';
			echo esc_html( $product->get_name() );
			echo '</label>';
		}
		echo '</div>';
		echo '<p class="description">' . esc_html__( 'Selecciona los productos que este conductor tiene actualmente en su stock móvil.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Save driver metadata.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post object.
	 */
	public function save_driver_meta( $post_id, $post ) {
		// Verify nonce.
		if ( ! isset( $_POST['tukitask_driver_meta_nonce'] ) || ! wp_verify_nonce( $_POST['tukitask_driver_meta_nonce'], 'tukitask_driver_meta_save' ) ) {
			return;
		}

		// Verify mobile stock nonce if present.
		if ( isset( $_POST['tukitask_driver_mobile_stock_nonce'] ) && ! wp_verify_nonce( $_POST['tukitask_driver_mobile_stock_nonce'], 'tukitask_driver_mobile_stock_save' ) ) {
			return;
		}

		// Check autosave.
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		// Check permissions.
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		// Save fields.
		$fields = array(
			'driver_user_id'          => 'intval',
			'driver_profile'          => 'sanitize_text_field', // New field
			'driver_status'           => 'sanitize_text_field',
			'driver_vehicle'          => 'sanitize_text_field',
			'driver_capacity'         => 'floatval',
			'driver_trunk_available'  => 'sanitize_text_field',
			'driver_phone'            => 'sanitize_text_field',
			'driver_license'          => 'sanitize_text_field',
			'driver_lat'              => 'floatval',
			'driver_lng'              => 'floatval',
			'driver_radius'           => 'floatval',
			'driver_pickup_range'     => 'floatval',
			'driver_delivery_range'   => 'floatval',
			'driver_vehicle_type'     => 'sanitize_text_field',
			'driver_max_concurrent'   => 'intval',
		);

		foreach ( $fields as $field => $sanitize_callback ) {
			if ( isset( $_POST[ $field ] ) ) {
				$value = call_user_func( $sanitize_callback, $_POST[ $field ] );
				update_post_meta( $post_id, '_' . $field, $value );
			} elseif ( 'driver_trunk_available' === $field ) {
				// Checkbox: if not set, save 'no'.
				update_post_meta( $post_id, '_driver_trunk_available', 'no' );
			}
		}

		// Save checkbox fields for service config
		$checkbox_fields = array( 'driver_accepts_woo_orders', 'driver_accepts_packages' );
		foreach ( $checkbox_fields as $checkbox ) {
			if ( isset( $_POST[ $checkbox ] ) ) {
				update_post_meta( $post_id, '_' . $checkbox, 'yes' );
			} else {
				update_post_meta( $post_id, '_' . $checkbox, 'no' );
			}
		}

		// Save mobile stock products.
		$mobile_stock_products = isset( $_POST['driver_mobile_stock_products'] ) ? array_map( 'intval', (array) $_POST['driver_mobile_stock_products'] ) : array();
		update_post_meta( $post_id, '_driver_mobile_stock_products', $mobile_stock_products );
	}
}
