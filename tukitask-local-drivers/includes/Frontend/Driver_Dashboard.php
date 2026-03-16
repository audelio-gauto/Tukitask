<?php
/**
 * Driver Dashboard Frontend.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Security;

/**
 * Driver_Dashboard Class.
 *
 * Manages the driver frontend dashboard interface.
 */
class Driver_Dashboard {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'wp_enqueue_scripts', $this, 'enqueue_assets' );
		$loader->add_action( 'wp_ajax_tukitask_get_driver_orders', $this, 'ajax_get_driver_orders' );
		$loader->add_action( 'wp_ajax_tukitask_accept_order', $this, 'ajax_accept_order' );
		$loader->add_action( 'wp_ajax_tukitask_reject_order', $this, 'ajax_reject_order' );
		$loader->add_action( 'wp_ajax_tukitask_toggle_availability', $this, 'ajax_toggle_availability' );
		$loader->add_action( 'wp_ajax_tukitask_toggle_tracking', $this, 'ajax_toggle_tracking' );
		$loader->add_action( 'wp_ajax_tukitask_save_driver_profile', $this, 'ajax_save_driver_profile' );
		$loader->add_action( 'wp_ajax_tukitask_validate_pickup', $this, 'ajax_validate_pickup' );
		$loader->add_action( 'wp_ajax_tukitask_validate_delivery', $this, 'ajax_validate_delivery' );
		// Order action handlers (Bolt-style simple flow)
		$loader->add_action( 'wp_ajax_tukitask_order_confirm_pickup', $this, 'ajax_order_confirm_pickup' );
		$loader->add_action( 'wp_ajax_tukitask_order_confirm_delivery', $this, 'ajax_order_confirm_delivery' );
		$loader->add_action( 'wp_ajax_tukitask_order_mark_failed', $this, 'ajax_order_mark_failed' );
		$loader->add_action( 'wp_ajax_tukitask_get_assigned_orders', $this, 'ajax_get_assigned_orders' );
		// Chat AJAX handlers (used by driver, vendor, and customer panels)
		$loader->add_action( 'wp_ajax_tukitask_send_chat_message', $this, 'ajax_send_chat_message' );
		$loader->add_action( 'wp_ajax_tukitask_get_chat_messages', $this, 'ajax_get_chat_messages' );
	}

	/**
	 * Render Settings Screen.
	 */
	private function render_screen_settings() {
		$user = wp_get_current_user();
		$driver_id = $user->ID;
		
		// Custom Avatar Logic
		$custom_avatar_id = get_user_meta( $driver_id, '_tukitask_driver_avatar_id', true );
		$avatar_url = $custom_avatar_id ? wp_get_attachment_image_url( $custom_avatar_id, 'thumbnail' ) : get_avatar_url( $user->ID );
		
		// Get meta values
		$phone = get_user_meta( $driver_id, 'billing_phone', true );
		$company = get_user_meta( $driver_id, 'billing_company', true );
		$address_1 = get_user_meta( $driver_id, 'billing_address_1', true );
		$city = get_user_meta( $driver_id, 'billing_city', true );
		
		$vehicle = get_user_meta( $driver_id, '_driver_vehicle_type', true );
		$plate = get_user_meta( $driver_id, '_driver_license_plate', true );
		$nav_app = get_user_meta( $driver_id, '_driver_nav_app', true );
		$theme_mode = get_user_meta( $driver_id, '_driver_theme_mode', true );
		$transport_mode = get_user_meta( $driver_id, '_driver_transport_mode', true );
		
		$pickup_range = get_user_meta( $driver_id, '_driver_pickup_range', true );
		$delivery_range = get_user_meta( $driver_id, '_driver_delivery_range', true );
		$max_weight = get_user_meta( $driver_id, '_driver_max_weight', true );
		
		?>
		<h1 class="tuki-heading" style="margin-top: 1.5rem;"><?php esc_html_e( 'Configuración', 'tukitask-local-drivers' ); ?></h1>
		
		<div class="tuki-order-card">
			<div class="tuki-order-body">
				<form id="tuki-driver-profile-form" enctype="multipart/form-data">
					
					<!-- Panel Theme -->
					<h3 class="tuki-heading" style="font-size:1.1rem; margin-bottom:1rem;"><?php esc_html_e( 'Apariencia del Panel', 'tukitask-local-drivers' ); ?></h3>
					<div style="margin-bottom:1.5rem;">
						<label class="tuki-label"><?php esc_html_e( 'Tema', 'tukitask-local-drivers' ); ?></label>
						<select name="theme_mode" class="tuki-input">
							<option value="light" <?php selected( $theme_mode, 'light' ); ?>><?php esc_html_e( 'Light Mode', 'tukitask-local-drivers' ); ?></option>
							<option value="dark" <?php selected( $theme_mode, 'dark' ); ?>><?php esc_html_e( 'Dark Mode', 'tukitask-local-drivers' ); ?></option>
						</select>
					</div>

					<hr style="border:0; border-top:1px solid var(--border); margin: 1.5rem 0;">

					<!-- Transport & Vehicle -->
					<h3 class="tuki-heading" style="font-size:1.1rem; margin-bottom:1rem;"><?php esc_html_e( 'Transporte y Vehículo', 'tukitask-local-drivers' ); ?></h3>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'Modo de Transporte (Categoría)', 'tukitask-local-drivers' ); ?></label>
						<select name="transport_mode" class="tuki-input">
							<option value="bici" <?php selected( $transport_mode, 'bici' ); ?>><?php esc_html_e( 'Bici', 'tukitask-local-drivers' ); ?></option>
							<option value="moto" <?php selected( $transport_mode, 'moto' ); ?>><?php esc_html_e( 'Moto', 'tukitask-local-drivers' ); ?></option>
							<option value="auto" <?php selected( $transport_mode, 'auto' ); ?>><?php esc_html_e( 'Auto', 'tukitask-local-drivers' ); ?></option>
						</select>
					</div>

					<div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; margin-bottom:1rem;">
						<div>
							<label class="tuki-label"><?php esc_html_e( 'Tipo de Vehículo / Modelo', 'tukitask-local-drivers' ); ?></label>
							<input type="text" name="vehicle_type" value="<?php echo esc_attr( $vehicle ); ?>" class="tuki-input" placeholder="Ej. Toyota Yaris">
						</div>
						<div>
							<label class="tuki-label"><?php esc_html_e( 'Matrícula', 'tukitask-local-drivers' ); ?></label>
							<input type="text" name="license_plate" value="<?php echo esc_attr( $plate ); ?>" class="tuki-input">
						</div>
					</div>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'APP de Navegación', 'tukitask-local-drivers' ); ?></label>
						<select name="nav_app" class="tuki-input">
							<option value="google_maps" <?php selected( $nav_app, 'google_maps' ); ?>>Google Maps</option>
							<option value="waze" <?php selected( $nav_app, 'waze' ); ?>>Waze</option>
						</select>
					</div>

					<hr style="border:0; border-top:1px solid var(--border); margin: 1.5rem 0;">

					<!-- Contact Info -->
					<h3 class="tuki-heading" style="font-size:1.1rem; margin-bottom:1rem;"><?php esc_html_e( 'Datos de Contacto', 'tukitask-local-drivers' ); ?></h3>
					
					<div style="display: grid; gap: 1rem; grid-template-columns: 100px 1fr; margin-bottom:1rem; align-items:center;">
						<div style="text-align:center; position:relative;">
							<div id="tuki-profile-preview" style="width:80px; height:80px; border-radius:50%; background:#e5e7eb; background-image:url('<?php echo esc_url( $avatar_url ); ?>'); background-size:cover; background-position:center; margin:0 auto; border:2px solid var(--border);"></div>
							<label for="profile_photo_input" style="display:block; margin-top:0.5rem; cursor:pointer; color:var(--primary); font-size:0.85rem; font-weight:600;">
								<i class="fas fa-camera"></i> <?php esc_html_e( 'Cambiar', 'tukitask-local-drivers' ); ?>
							</label>
							<input type="file" name="profile_photo" id="profile_photo_input" accept="image/*" style="display:none;" onchange="document.getElementById('tuki-profile-preview').style.backgroundImage = 'url(' + window.URL.createObjectURL(this.files[0]) + ')'">
						</div>
						<div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
							<div>
								<label class="tuki-label"><?php esc_html_e( 'Nombre', 'tukitask-local-drivers' ); ?></label>
								<input type="text" name="first_name" value="<?php echo esc_attr( $user->first_name ); ?>" class="tuki-input">
							</div>
							<div>
								<label class="tuki-label"><?php esc_html_e( 'Apellido', 'tukitask-local-drivers' ); ?></label>
								<input type="text" name="last_name" value="<?php echo esc_attr( $user->last_name ); ?>" class="tuki-input">
							</div>
						</div>
					</div>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'Empresa (Opcional)', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="billing_company" value="<?php echo esc_attr( $company ); ?>" class="tuki-input">
					</div>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'Ubicación (Dirección)', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="billing_address_1" value="<?php echo esc_attr( $address_1 ); ?>" class="tuki-input" placeholder="Dirección">
						<input type="text" name="billing_city" value="<?php echo esc_attr( $city ); ?>" class="tuki-input" style="margin-top:0.5rem;" placeholder="Ciudad">
					</div>

					<hr style="border:0; border-top:1px solid var(--border); margin: 1.5rem 0;">

					<!-- Ranges -->
					<h3 class="tuki-heading" style="font-size:1.1rem; margin-bottom:1rem;"><?php esc_html_e( 'Capacidad y Rangos', 'tukitask-local-drivers' ); ?></h3>
					
					<div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr 1fr; margin-bottom:1rem;">
						<div>
							<label class="tuki-label"><?php esc_html_e( 'Rango Recogida (km)', 'tukitask-local-drivers' ); ?></label>
							<input type="number" name="pickup_range" value="<?php echo esc_attr( $pickup_range ); ?>" class="tuki-input" step="0.1">
						</div>
						<div>
							<label class="tuki-label"><?php esc_html_e( 'Rango Entrega (km)', 'tukitask-local-drivers' ); ?></label>
							<input type="number" name="delivery_range" value="<?php echo esc_attr( $delivery_range ); ?>" class="tuki-input" step="0.1">
						</div>
						<div>
							<label class="tuki-label"><?php esc_html_e( 'Peso Máximo (kg)', 'tukitask-local-drivers' ); ?></label>
							<input type="number" name="max_weight" value="<?php echo esc_attr( $max_weight ); ?>" class="tuki-input" step="0.1">
						</div>
					</div>

					<div style="margin-top:1rem;">
						<label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
							<input type="checkbox" name="accepts_packages" value="yes" <?php checked( get_user_meta( $driver_id, '_driver_accepts_packages', true ), 'yes' ); ?>>
							<span class="tuki-label" style="margin:0;"><?php esc_html_e( '📦 Acepto envíos de paquetes (tipo Bolt)', 'tukitask-local-drivers' ); ?></span>
						</label>
						<small class="tuki-text-secondary"><?php esc_html_e( 'Recibirás notificaciones de solicitudes de envío de paquetes cercanas.', 'tukitask-local-drivers' ); ?></small>
					</div>

					<hr style="border:0; border-top:1px solid var(--border); margin: 1.5rem 0;">

					<!-- Account -->
					<h3 class="tuki-heading" style="font-size:1.1rem; margin-bottom:1rem;"><?php esc_html_e( 'Cuenta', 'tukitask-local-drivers' ); ?></h3>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'Número de teléfono', 'tukitask-local-drivers' ); ?></label>
						<input type="tel" name="billing_phone" value="<?php echo esc_attr( $phone ); ?>" class="tuki-input">
						<small class="tuki-text-secondary"><?php esc_html_e( 'Que aparece en su cuenta', 'tukitask-local-drivers' ); ?></small>
					</div>

					<div style="margin-bottom:1rem;">
						<label class="tuki-label"><?php esc_html_e( 'Dirección de correo electrónico', 'tukitask-local-drivers' ); ?></label>
						<input type="email" value="<?php echo esc_attr( $user->user_email ); ?>" readonly class="tuki-input" style="background:#f3f4f6;">
					</div>
					
					<div style="margin-bottom:1.5rem;">
						<label class="tuki-label"><?php esc_html_e( 'Contraseña', 'tukitask-local-drivers' ); ?></label>
						<a href="<?php echo esc_url( wp_lostpassword_url() ); ?>" class="tuki-btn tuki-btn-sm" style="background:#e5e7eb; color:#374151; border:none;">
							<?php esc_html_e( 'Restablecer contraseña', 'tukitask-local-drivers' ); ?>
						</a>
					</div>

					<div style="margin-top:2rem; display:flex; gap:1rem;">
						<button type="submit" class="tuki-btn tuki-btn-success" id="save-profile-btn" style="flex:1;">
							<i class="fas fa-save"></i> <?php esc_html_e( 'Guardar Cambios', 'tukitask-local-drivers' ); ?>
						</button>
						
						<a href="<?php echo esc_url( wp_logout_url( home_url() ) ); ?>" class="tuki-btn tuki-btn-primary" style="background:var(--danger); border-color:var(--danger);">
							<i class="fas fa-sign-out-alt"></i>
						</a>
					</div>
				</form>
			</div>
		</div>
		
		<style>
			.tuki-label { display:block; margin-bottom:0.5rem; font-weight:500; font-size:0.9rem; color:var(--text-secondary); }
			.tuki-input { width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:1rem; transition:border 0.2s; }
			.tuki-input:focus { border-color:var(--primary); outline:none; }
			.tuki-btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; display:inline-block; border-radius: 4px; text-decoration:none;}
		</style>
		<?php
	}

	/**
	 * AJAX handler to save driver profile.
	 */
	public function ajax_save_driver_profile() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );
		
		if ( ! is_user_logged_in() ) {
			wp_send_json_error( array( 'message' => __( 'Debes iniciar sesión.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		
		// Sanitize inputs
		$first_name = isset( $_POST['first_name'] ) ? sanitize_text_field( $_POST['first_name'] ) : '';
		$last_name  = isset( $_POST['last_name'] ) ? sanitize_text_field( $_POST['last_name'] ) : '';
		$phone      = isset( $_POST['billing_phone'] ) ? sanitize_text_field( $_POST['billing_phone'] ) : '';
		
		$company     = isset( $_POST['billing_company'] ) ? sanitize_text_field( $_POST['billing_company'] ) : '';
		$address_1   = isset( $_POST['billing_address_1'] ) ? sanitize_text_field( $_POST['billing_address_1'] ) : '';
		$city        = isset( $_POST['billing_city'] ) ? sanitize_text_field( $_POST['billing_city'] ) : '';

		$vehicle    = isset( $_POST['vehicle_type'] ) ? sanitize_text_field( $_POST['vehicle_type'] ) : '';
		$plate      = isset( $_POST['license_plate'] ) ? sanitize_text_field( $_POST['license_plate'] ) : '';
		$nav_app    = isset( $_POST['nav_app'] ) ? sanitize_text_field( $_POST['nav_app'] ) : '';
		$theme_mode = isset( $_POST['theme_mode'] ) ? sanitize_text_field( $_POST['theme_mode'] ) : 'light';
		$transport_mode = isset( $_POST['transport_mode'] ) ? sanitize_text_field( $_POST['transport_mode'] ) : 'moto';
		
		$pickup_range = isset( $_POST['pickup_range'] ) ? sanitize_text_field( $_POST['pickup_range'] ) : '';
		$delivery_range = isset( $_POST['delivery_range'] ) ? sanitize_text_field( $_POST['delivery_range'] ) : '';
		$max_weight = isset( $_POST['max_weight'] ) ? sanitize_text_field( $_POST['max_weight'] ) : '';

		// Handle Profile Photo Upload
		if ( ! empty( $_FILES['profile_photo']['name'] ) ) {
			require_once( ABSPATH . 'wp-admin/includes/image.php' );
			require_once( ABSPATH . 'wp-admin/includes/file.php' );
			require_once( ABSPATH . 'wp-admin/includes/media.php' );

			$attachment_id = media_handle_upload( 'profile_photo', 0 );

			if ( ! is_wp_error( $attachment_id ) ) {
				update_user_meta( $user_id, '_tukitask_driver_avatar_id', $attachment_id );
			}
		}

		// Update User Data
		wp_update_user( array(
			'ID'         => $user_id,
			'first_name' => $first_name,
			'last_name'  => $last_name,
			'display_name' => $first_name . ' ' . $last_name
		) );

		// Update Meta
		update_user_meta( $user_id, 'billing_phone', $phone );
		update_user_meta( $user_id, 'billing_company', $company );
		update_user_meta( $user_id, 'billing_address_1', $address_1 );
		update_user_meta( $user_id, 'billing_city', $city );
		
		update_user_meta( $user_id, '_driver_vehicle_type', $vehicle );
		update_user_meta( $user_id, '_driver_license_plate', $plate );
		update_user_meta( $user_id, '_driver_nav_app', $nav_app );
		update_user_meta( $user_id, '_driver_theme_mode', $theme_mode );
		update_user_meta( $user_id, '_driver_transport_mode', $transport_mode );
		
		update_user_meta( $user_id, '_driver_pickup_range', $pickup_range );
		update_user_meta( $user_id, '_driver_delivery_range', $delivery_range );
		update_user_meta( $user_id, '_driver_max_weight', $max_weight );

		// Sync ranges to driver CPT post meta for availability queries.
		$driver_post_id = $this->get_driver_post_id( $user_id );
		if ( $driver_post_id ) {
			if ( $pickup_range ) {
				update_post_meta( $driver_post_id, '_driver_radius', floatval( $pickup_range ) );
			}
			if ( $delivery_range ) {
				update_post_meta( $driver_post_id, '_driver_delivery_radius', floatval( $delivery_range ) );
			}
			if ( $max_weight ) {
				update_post_meta( $driver_post_id, '_driver_capacity', floatval( $max_weight ) );
			}

			// Sync accepts_packages to driver CPT for delivery broadcast queries
			$accepts_packages = isset( $_POST['accepts_packages'] ) ? 'yes' : 'no';
			update_post_meta( $driver_post_id, '_driver_accepts_packages', $accepts_packages );
			update_user_meta( $user_id, '_driver_accepts_packages', $accepts_packages );
		}

		wp_send_json_success( array( 
			'message' => __( 'Perfil actualizado correctamente.', 'tukitask-local-drivers' ),
			'theme'   => $theme_mode
		) );
	}

	/**
	 * Enqueue frontend assets.
	 */
	public function enqueue_assets() {
		if ( ! is_user_logged_in() || ! Security::can_access_driver_panel() ) {
			return;
		}

		// Leaflet CSS & JS
		wp_enqueue_style( 'leaflet-css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', array(), '1.9.4' );
		wp_enqueue_script( 'leaflet-js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', array(), '1.9.4', true );

		// Enqueue modern CSS
		wp_enqueue_style(
			'tukitask-driver-modern-css',
			TUKITASK_LD_URL . 'assets/css/driver-modern.css',
			array( 'leaflet-css' ),
			TUKITASK_LD_VERSION . '.22'
		);

		// Font Awesome
		wp_enqueue_style( 'font-awesome', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', array(), '6.4.0' );

		wp_enqueue_script(
			'tukitask-driver-js',
			TUKITASK_LD_URL . 'assets/js/driver.js',
			array( 'jquery', 'leaflet-js' ),
			TUKITASK_LD_VERSION . '.22',
			true
		);

		$user_id = get_current_user_id();
		$driver_id = $this->get_driver_post_id( $user_id );

		// Driver location for map
		$driver_lat = get_post_meta( $driver_id, '_driver_lat', true );
		$driver_lng = get_post_meta( $driver_id, '_driver_lng', true );

		wp_localize_script(
			'tukitask-driver-js',
			'tukitaskDriver',
			array(
				'ajaxUrl'  => admin_url( 'admin-ajax.php' ),
				'restUrl'  => get_rest_url( null, 'tukitask/v1/drivers/' . $driver_id ),
				'restNonce'=> wp_create_nonce( 'wp_rest' ),
				'nonce'    => wp_create_nonce( 'tukitask_driver_action' ),
				'driverId' => $driver_id,
				'userId'   => $user_id,
				'driverLat' => $driver_lat ? floatval( $driver_lat ) : -25.2637,
				'driverLng' => $driver_lng ? floatval( $driver_lng ) : -57.5759,
				'pwaRoot'  => TUKITASK_LD_URL,
				'fcmSenderId' => get_option( 'tukitask_ld_fcm_sender_id', '' ),
				'strings' => array(
					'error'          => 'Error',
					'success'        => 'Éxito',
					'available'      => 'Disponible',
					'unavailable'    => 'No Disponible',
					'confirm_accept' => __( '¿Aceptar este pedido?', 'tukitask-local-drivers' ),
					'confirm_reject' => __( '¿Rechazar este pedido?', 'tukitask-local-drivers' ),
					'validating'     => __( 'Validando...', 'tukitask-local-drivers' ),
					'saving'         => __( 'Guardando...', 'tukitask-local-drivers' ),
					'new_trip'       => __( 'Nuevo viaje disponible', 'tukitask-local-drivers' ),
					'price'          => __( 'Precio:', 'tukitask-local-drivers' ),
					'origin'         => __( 'Origen:', 'tukitask-local-drivers' ),
					'destination'    => __( 'Destino:', 'tukitask-local-drivers' ),
					'accept_trip'    => __( 'Aceptar', 'tukitask-local-drivers' ),
					'ignore'         => __( 'Ignorar', 'tukitask-local-drivers' ),
					'accepting'      => __( 'Aceptando...', 'tukitask-local-drivers' ),
					'update_status'  => __( 'Ingresa el nuevo estado:', 'tukitask-local-drivers' ),
				),
			)
		);
	}

	/**
	 * Render the main dashboard wrapper.
	 * 
	 * @param array $atts Shortcode attributes.
	 * @return string HTML content.
	 */
	public function render_dashboard( $atts ) {
		if ( ! is_user_logged_in() ) {
			return wp_login_form( array( 'echo' => false ) );
		}

		if ( ! Security::can_access_driver_panel() ) {
			return '<div class="tuki-alert tuki-alert-danger">' . __( 'No tienes permisos para acceder al panel de conductor.', 'tukitask-local-drivers' ) . '</div>';
		}

		$screen = isset( $_GET['screen'] ) ? sanitize_text_field( $_GET['screen'] ) : 'dashboard';

		ob_start();
		?>
		<div class="tuki-driver-app-ui" id="tuki-driver-app-ui" data-screen="<?php echo esc_attr( $screen ); ?>">

		<?php if ( $screen === 'dashboard' ) : ?>
			<!-- Fullscreen Map Background (only on Dashboard) -->
			<div id="tuki-driver-map" class="tuki-driver-map"></div>

			<!-- Floating hamburger button -->
			<button class="tuki-driver-menu-btn" id="tuki-driver-menu-btn">
				<i class="fas fa-bars"></i>
			</button>

			<!-- Floating locate-me button -->
			<button class="tuki-driver-locate-btn" id="tuki-driver-locate-btn">
				<i class="fas fa-crosshairs"></i>
			</button>

			<?php $this->render_sidebar( $screen ); ?>

			<!-- Bottom Sheet -->
			<div class="tuki-driver-sheet" id="tuki-driver-sheet">
				<div class="tuki-driver-sheet-handle" id="tuki-driver-sheet-handle">
					<span class="tuki-driver-sheet-bar"></span>
				</div>
				<div class="tuki-driver-sheet-content" id="tuki-driver-sheet-content">
					<?php $this->render_screen_dashboard(); ?>
				</div>
			</div>

			<!-- Drawer overlay -->
			<div class="tuki-driver-overlay" id="tuki-driver-overlay"></div>

		<?php else : ?>
			<!-- Normal layout (no map, no sheet) for other screens -->
			<div class="tuki-driver-normal-header">
				<button class="tuki-driver-menu-btn tuki-driver-menu-btn-inline" id="tuki-driver-menu-btn">
					<i class="fas fa-bars"></i>
				</button>
				<span class="tuki-driver-screen-title"><?php
					$titles = array(
						'deliveries'       => __( 'Envíos', 'tukitask-local-drivers' ),
						'assigned'         => __( 'Asignados', 'tukitask-local-drivers' ),
						'out-for-delivery' => __( 'En Ruta', 'tukitask-local-drivers' ),
						'delivered'        => __( 'Entregados', 'tukitask-local-drivers' ),
						'failed'           => __( 'Fallidos', 'tukitask-local-drivers' ),
						'settings'         => __( 'Configuración', 'tukitask-local-drivers' ),
					);
					echo esc_html( $titles[ $screen ] ?? ucfirst( $screen ) );
				?></span>
				<a href="<?php echo esc_url( remove_query_arg( 'screen' ) ); ?>" class="tuki-driver-back-btn">
					<i class="fas fa-map"></i>
				</a>
			</div>

			<?php $this->render_sidebar( $screen ); ?>

			<div class="tuki-driver-normal-content">
				<?php 
				switch ( $screen ) {
					case 'deliveries':
						$this->render_screen_deliveries();
						break;
					case 'assigned':
						$this->render_screen_assigned();
						break;
					case 'out-for-delivery':
						$this->render_screen_shipping();
						break;
					case 'delivered':
						$this->render_screen_delivered();
						break;
					case 'failed':
						$this->render_screen_failed();
						break;
					case 'settings':
						$this->render_screen_settings();
						break;
					default:
						$this->render_screen_dashboard();
						break;
				}
				?>
			</div>

			<!-- Drawer overlay -->
			<div class="tuki-driver-overlay" id="tuki-driver-overlay"></div>
		<?php endif; ?>

			<!-- Compatibility Dummy for external implementation -->
			<div id="lddfw_order" style="display:none;"></div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Render Sidebar (App Drawer).
	 * 
	 * @param string $current_screen Current screen slug.
	 */
	private function render_sidebar( $current_screen ) {
		$user = wp_get_current_user();
		$custom_avatar_id = get_user_meta( $user->ID, '_tukitask_driver_avatar_id', true );
		$avatar_url = $custom_avatar_id ? wp_get_attachment_image_url( $custom_avatar_id, 'thumbnail' ) : get_avatar_url( $user->ID );
		?>
		<nav class="tuki-driver-drawer" id="tuki-driver-drawer">
			<div class="tuki-driver-drawer-header">
				<div class="tuki-profile-img" style="background-image: url('<?php echo esc_url( $avatar_url ); ?>');"></div>
				<div class="tuki-profile-info">
					<h3 class="tuki-heading" style="font-size: 1.1rem; margin:0; color:#fff;"><?php echo esc_html( $user->display_name ); ?></h3>
					<span style="color: rgba(255,255,255,0.7); font-size:0.85rem;"><?php echo esc_html( $user->user_email ); ?></span>
				</div>
			</div>
			<div class="tuki-driver-drawer-body">
				<?php
				$menu_items = array(
					'dashboard'        => array( 'icon' => 'fas fa-home', 'label' => __( 'Dashboard', 'tukitask-local-drivers' ) ),
					'deliveries'       => array( 'icon' => 'fas fa-box', 'label' => __( 'Envíos', 'tukitask-local-drivers' ) ),
					'assigned'         => array( 'icon' => 'fas fa-clipboard-list', 'label' => __( 'Asignados', 'tukitask-local-drivers' ) ),
					'out-for-delivery' => array( 'icon' => 'fas fa-truck', 'label' => __( 'En Ruta', 'tukitask-local-drivers' ) ),
					'delivered'        => array( 'icon' => 'fas fa-check-circle', 'label' => __( 'Entregados hoy', 'tukitask-local-drivers' ) ),
					'failed'           => array( 'icon' => 'fas fa-times-circle', 'label' => __( 'Fallidos hoy', 'tukitask-local-drivers' ) ),
					'settings'         => array( 'icon' => 'fas fa-cog', 'label' => __( 'Configuración', 'tukitask-local-drivers' ) ),
				);

				foreach ( $menu_items as $slug => $item ) {
					$active_class = ( $current_screen === $slug ) ? 'active' : '';
					$url = add_query_arg( 'screen', $slug );
					echo '<a href="' . esc_url( $url ) . '" class="tuki-driver-drawer-link ' . esc_attr( $active_class ) . '">';
					echo '<i class="' . esc_attr( $item['icon'] ) . '"></i> ' . esc_html( $item['label'] );
					echo '</a>';
				}
				?>
			</div>
			<div class="tuki-driver-drawer-footer">
				<a href="<?php echo esc_url( wp_logout_url( home_url() ) ); ?>" class="tuki-driver-drawer-link">
					<i class="fas fa-sign-out-alt"></i> <?php esc_html_e( 'Cerrar Sesión', 'tukitask-local-drivers' ); ?>
				</a>
			</div>
		</nav>
		<?php
	}

	/**
	 * Render Dashboard Screen.
	 */
	private function render_screen_dashboard() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );
		$is_available = get_post_meta( $driver_post_id, '_driver_status', true ) === 'available';
		
		// Counts
		$counts = $this->get_order_counts( $driver_id );
		?>
		<div class="tuki-dashboard-content">
			<!-- Availability Toggle -->
			<div class="tuki-availability-wrapper">
				<div>
					<h3 class="tuki-heading" style="font-size: 1rem; margin:0;"><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></h3>
					<span id="tuki-availability-label" class="tuki-status-badge <?php echo $is_available ? 'tuki-status-online' : 'tuki-status-offline'; ?>">
						<?php echo $is_available ? __( 'Disponible', 'tukitask-local-drivers' ) : __( 'No Disponible', 'tukitask-local-drivers' ); ?>
					</span>
				</div>
				<label class="tuki-toggle-switch">
					<input type="checkbox" id="tuki-availability-toggle" <?php checked( $is_available ); ?>>
					<span class="tuki-slider"></span>
				</label>
			</div>

			<!-- Mobile Store Toggle -->
			<?php if ( 'yes' === get_option( 'tukitask_ld_mobile_store_enabled', 'yes' ) ) : 
				$is_mobile_active = get_post_meta( $driver_post_id, '_mobile_store_active', true ) === 'yes';
			?>
			<div class="tuki-availability-wrapper" style="margin-top: 1rem; border-left: 4px solid var(--primary);">
				<div>
					<h3 class="tuki-heading" style="font-size: 1rem; margin:0;"><?php esc_html_e( 'Tienda Móvil', 'tukitask-local-drivers' ); ?></h3>
					<span id="tuki-mobile-label" class="tuki-text-secondary" style="font-size: 0.85rem;">
						<?php echo $is_mobile_active ? __( 'Activa y visible', 'tukitask-local-drivers' ) : __( 'Inactiva', 'tukitask-local-drivers' ); ?>
					</span>
				</div>
				<label class="tuki-toggle-switch">
					<input type="checkbox" id="tuki-mobile-toggle" data-driver-id="<?php echo $driver_post_id; ?>" <?php checked( $is_mobile_active ); ?>>
					<span class="tuki-slider"></span>
				</label>
			</div>
			<?php endif; ?>

			<!-- Stats Grid -->
			<div class="tuki-dashboard-grid">
				<a href="<?php echo esc_url( add_query_arg( 'screen', 'deliveries' ) ); ?>" class="tuki-stat-card" style="border-left:3px solid #3b82f6;">
					<i class="tuki-stat-icon fas fa-box" style="color:#3b82f6;"></i>
					<?php 
					$pending_deliveries = \Tukitask\LocalDrivers\Orders\Delivery_Request::get_pending_deliveries_for_driver( $driver_post_id );
					?>
					<div class="tuki-stat-value"><?php echo count( $pending_deliveries ); ?></div>
					<div class="tuki-stat-label"><?php esc_html_e( 'Envíos', 'tukitask-local-drivers' ); ?></div>
				</a>

				<a href="<?php echo esc_url( add_query_arg( 'screen', 'assigned' ) ); ?>" class="tuki-stat-card">
					<i class="tuki-stat-icon fas fa-clipboard-list"></i>
					<?php
					$broadcast_count = count( \Tukitask\LocalDrivers\Orders\Order_Broadcast::get_pending_broadcasts_for_driver( $driver_post_id ) );
					$assigned_total = intval( $counts['assigned'] ) + $broadcast_count;
					?>
					<div class="tuki-stat-value"><?php echo $assigned_total; ?></div>
					<div class="tuki-stat-label"><?php esc_html_e( 'Pedidos', 'tukitask-local-drivers' ); ?></div>
				</a>
				
				<a href="<?php echo esc_url( add_query_arg( 'screen', 'out-for-delivery' ) ); ?>" class="tuki-stat-card">
					<i class="tuki-stat-icon fas fa-truck"></i>
					<div class="tuki-stat-value"><?php echo intval( $counts['active'] ); ?></div>
					<div class="tuki-stat-label"><?php esc_html_e( 'En Ruta', 'tukitask-local-drivers' ); ?></div>
				</a>

				<a href="<?php echo esc_url( add_query_arg( 'screen', 'delivered' ) ); ?>" class="tuki-stat-card">
					<i class="tuki-stat-icon fas fa-check-circle"></i>
					<div class="tuki-stat-value"><?php echo intval( $counts['completed'] ); ?></div>
					<div class="tuki-stat-label"><?php esc_html_e( 'Entregados hoy', 'tukitask-local-drivers' ); ?></div>
				</a>
				
				<a href="<?php echo esc_url( add_query_arg( 'screen', 'failed' ) ); ?>" class="tuki-stat-card">
					<i class="tuki-stat-icon fas fa-times-circle"></i>
					<div class="tuki-stat-value"><?php echo intval( $counts['failed'] ); ?></div>
					<div class="tuki-stat-label"><?php esc_html_e( 'Fallidos hoy', 'tukitask-local-drivers' ); ?></div>
				</a>
			</div>

			<?php
			// --- Delivery Limit Progress Bar (per-vehicle) ---
			$driver_vehicle = get_post_meta( $driver_post_id, '_driver_vehicle_type', true ) ?: 'motorcycle';
			$limit_mode = get_option( 'tukitask_ld_' . $driver_vehicle . '_limit_mode', 'none' );
			if ( 'quantity' === $limit_mode ) :
				$default_limit = absint( get_option( 'tukitask_ld_' . $driver_vehicle . '_delivery_limit', 0 ) );
				$driver_limit  = absint( get_post_meta( $driver_post_id, '_driver_delivery_limit', true ) );
				$limit         = $driver_limit > 0 ? $driver_limit : $default_limit;
				if ( $limit > 0 ) :
					$reset_at    = get_post_meta( $driver_post_id, '_driver_deliveries_reset_at', true );
					$month_start = gmdate( 'Y-m-01 00:00:00' );
					if ( $reset_at && $reset_at > $month_start ) {
						$month_start = $reset_at;
					}
					$month_count = (int) ( new \WP_Query( array(
						'post_type'      => 'tukitask_delivery',
						'post_status'    => 'publish',
						'posts_per_page' => -1,
						'fields'         => 'ids',
						'meta_query'     => array(
							'relation' => 'AND',
							array( 'key' => '_assigned_driver_id', 'value' => $driver_post_id ),
							array( 'key' => '_delivery_status', 'value' => 'delivered' ),
						),
						'date_query'     => array( array( 'after' => $month_start ) ),
					) ) )->found_posts;
					$pct   = min( 100, round( ( $month_count / $limit ) * 100 ) );
					$color = $pct >= 90 ? '#ef4444' : ( $pct >= 70 ? '#f59e0b' : '#22c55e' );
			?>
			<div style="margin-top: 1.5rem; background: #fff; border-radius: 12px; padding: 1rem 1.2rem; box-shadow: 0 1px 4px rgba(0,0,0,.08);">
				<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem;">
					<span style="font-weight: 600; font-size: .95rem;"><i class="fas fa-chart-bar" style="color: <?php echo $color; ?>; margin-right: .4rem;"></i><?php esc_html_e( 'Límite de Entregas', 'tukitask-local-drivers' ); ?></span>
					<span style="font-size: .85rem; color: #666;"><?php echo $month_count; ?> / <?php echo $limit; ?></span>
				</div>
				<div style="background: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden;">
					<div style="width: <?php echo $pct; ?>%; height: 100%; background: <?php echo $color; ?>; border-radius: 8px; transition: width .3s;"></div>
				</div>
				<?php if ( $pct >= 90 ) : ?>
				<p style="margin: .5rem 0 0; font-size: .8rem; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> <?php esc_html_e( 'Estás cerca de tu límite mensual.', 'tukitask-local-drivers' ); ?></p>
				<?php endif; ?>
			</div>
			<?php
				endif;
			endif;
			?>

			<div style="margin-top: 2rem;">
				<h2 class="tuki-heading" style="font-size: 1.2rem;"><?php esc_html_e( 'Acciones Rápidas', 'tukitask-local-drivers' ); ?></h2>
				<div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; margin-top: 1rem;">
					<a href="#" class="tuki-btn tuki-btn-primary tuki-btn-block">
						<i class="fas fa-qrcode"></i> <?php esc_html_e( 'Escanear QR', 'tukitask-local-drivers' ); ?>
					</a>
					<a href="<?php echo esc_url( add_query_arg( 'screen', 'assigned' ) ); ?>" class="tuki-btn tuki-btn-success tuki-btn-block">
						<i class="fas fa-play"></i> <?php esc_html_e( 'Ver Pedidos', 'tukitask-local-drivers' ); ?>
					</a>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * Render Deliveries (Package Bolt) Screen.
	 */
	private function render_screen_deliveries() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );

		$accepts_packages = get_post_meta( $driver_post_id, '_driver_accepts_packages', true );
		$active_delivery_id = get_post_meta( $driver_post_id, '_driver_active_delivery', true );
		$pending = \Tukitask\LocalDrivers\Orders\Delivery_Request::get_pending_deliveries_for_driver( $driver_post_id );
		?>
		<div class="tuki-deliveries-screen">

			<?php if ( $accepts_packages !== 'yes' ) : ?>
				<div class="tuki-alert" style="background:#e0f2fe; border-left:4px solid #0ea5e9; padding:1rem; border-radius:8px; margin-bottom:1.5rem;">
					<p style="margin:0;"><i class="fas fa-info-circle" style="color:#0ea5e9;"></i> 
						<?php esc_html_e( 'Tip: Activa "Acepto envíos de paquetes" en Configuración para priorizar solicitudes de envío.', 'tukitask-local-drivers' ); ?>
					</p>
				</div>
			<?php endif; ?>

			<?php if ( $active_delivery_id ) : 
				$d_status = get_post_meta( $active_delivery_id, '_delivery_status', true );
				if ( ! in_array( $d_status, array( 'delivered', 'cancelled' ), true ) ) :
					$tracking = get_post_meta( $active_delivery_id, '_tracking_code', true );
					$pickup_addr = get_post_meta( $active_delivery_id, '_pickup_address', true );
					$pickup_contact = get_post_meta( $active_delivery_id, '_pickup_contact', true );
					$pickup_phone = get_post_meta( $active_delivery_id, '_pickup_phone', true );
					$del_addr = get_post_meta( $active_delivery_id, '_delivery_address', true );
					$del_contact = get_post_meta( $active_delivery_id, '_delivery_contact', true );
					$del_phone = get_post_meta( $active_delivery_id, '_delivery_phone', true );
					$pkg_type = get_post_meta( $active_delivery_id, '_package_type', true );
					$price = floatval( get_post_meta( $active_delivery_id, '_delivery_price', true ) );
					$d_vehicle = get_post_meta( $active_delivery_id, '_vehicle_type', true ) ?: 'motorcycle';
					$active_distance_km = floatval( get_post_meta( $active_delivery_id, '_distance_km', true ) );
			?>
				<div class="tuki-order-card" style="border-left:4px solid #10b981; margin-bottom:1.5rem;">
					<div class="tuki-order-body">
						<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
							<h3 style="margin:0; font-size:1.1rem;">
								<i class="fas fa-shipping-fast" style="color:#10b981;"></i>
								<?php esc_html_e( 'Envío Activo', 'tukitask-local-drivers' ); ?> #<?php echo esc_html( $tracking ); ?>
							</h3>
							<?php 
							$pickup_lat_nav = get_post_meta( $active_delivery_id, '_pickup_lat', true );
							$pickup_lng_nav = get_post_meta( $active_delivery_id, '_pickup_lng', true );
							$del_lat_nav = get_post_meta( $active_delivery_id, '_delivery_lat', true );
							$del_lng_nav = get_post_meta( $active_delivery_id, '_delivery_lng', true );
							$nav_lat = ( $d_status === 'in_transit' ) ? $del_lat_nav : $pickup_lat_nav;
							$nav_lng = ( $d_status === 'in_transit' ) ? $del_lng_nav : $pickup_lng_nav;
							$nav_url = 'https://www.google.com/maps/dir/?api=1&destination=' . $nav_lat . ',' . $nav_lng . '&travelmode=driving';
							$labels = array( 'assigned' => '📍 Ir a recoger', 'pickup' => '📦 En recogida', 'in_transit' => '🚀 Ir a entregar' );
							?>
							<a href="<?php echo esc_url( $nav_url ); ?>" target="_blank" rel="noopener"
							   class="tuki-status-badge" style="background:#10b981; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem; text-decoration:none;">
								<?php echo esc_html( $labels[ $d_status ] ?? $d_status ); ?>
							</a>
						</div>

						<div style="background:#f0fdf4; padding:1rem; border-radius:8px; margin-bottom:1rem;">
							<div style="display:flex; align-items:flex-start; gap:0.5rem; margin-bottom:0.75rem;">
								<i class="fas fa-circle" style="color:#10b981; font-size:0.6rem; margin-top:5px;"></i>
								<div>
									<strong><?php esc_html_e( 'Recoger en:', 'tukitask-local-drivers' ); ?></strong><br>
									<?php echo esc_html( $pickup_addr ); ?><br>
									<small><?php echo esc_html( $pickup_contact ); ?> — 
										<a href="tel:<?php echo esc_attr( $pickup_phone ); ?>"><?php echo esc_html( $pickup_phone ); ?></a>
									</small>
								</div>
							</div>
							<div style="border-left:2px dashed #10b981; height:20px; margin-left:4px;"></div>
							<div style="display:flex; align-items:flex-start; gap:0.5rem;">
								<i class="fas fa-map-marker-alt" style="color:#ef4444; font-size:0.8rem; margin-top:3px;"></i>
								<div>
									<strong><?php esc_html_e( 'Entregar en:', 'tukitask-local-drivers' ); ?></strong><br>
									<?php echo esc_html( $del_addr ); ?><br>
									<small><?php echo esc_html( $del_contact ); ?> — 
										<a href="tel:<?php echo esc_attr( $del_phone ); ?>"><?php echo esc_html( $del_phone ); ?></a>
									</small>
								</div>
							</div>
						</div>

						<?php
						$payment_method = get_post_meta( $active_delivery_id, '_payment_method', true ) ?: 'cash';
						$pm_label = $payment_method === 'transfer' ? __( 'Transferencia', 'tukitask-local-drivers' ) : __( 'Efectivo', 'tukitask-local-drivers' );
						$pm_icon = $payment_method === 'transfer' ? '🏦' : '💵';
						$pm_bg = $payment_method === 'transfer' ? '#eff6ff' : '#f0fdf4';
						$pm_color = $payment_method === 'transfer' ? '#1d4ed8' : '#15803d';
						?>
						<div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; padding:0.6rem 0.75rem; background:<?php echo esc_attr( $pm_bg ); ?>; border-radius:8px;">
							<span style="font-size:1.2rem;"><?php echo esc_html( $pm_icon ); ?></span>
							<span style="font-weight:600; color:<?php echo esc_attr( $pm_color ); ?>; font-size:0.9rem;"><?php esc_html_e( 'Cobro:', 'tukitask-local-drivers' ); ?> <?php echo esc_html( $pm_label ); ?></span>
						</div>

						<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
							<span><i class="fas fa-box"></i> <?php echo esc_html( ucfirst( $pkg_type ) ); ?></span>
							<span><i class="fas fa-road" style="color:#3b82f6;"></i> <?php echo esc_html( $active_distance_km ); ?> km</span>
							<strong style="color:#10b981; font-size:1.2rem;"><?php echo wp_kses_post( wc_price( $price ) ); ?></strong>
						</div>

						<div style="display:flex; gap:0.5rem;">
							<?php if ( $d_status === 'assigned' || $d_status === 'pickup' ) : ?>
								<button class="tuki-btn tuki-btn-success tuki-delivery-action" 
										data-action="pickup" data-delivery-id="<?php echo esc_attr( $active_delivery_id ); ?>"
										data-driver-id="<?php echo esc_attr( $driver_post_id ); ?>" style="flex:1;">
									<i class="fas fa-box"></i> <?php esc_html_e( 'Confirmar Recogida', 'tukitask-local-drivers' ); ?>
								</button>
							<?php endif; ?>
							<?php if ( $d_status === 'in_transit' ) : ?>
								<button class="tuki-btn tuki-btn-success tuki-delivery-action" 
										data-action="complete" data-delivery-id="<?php echo esc_attr( $active_delivery_id ); ?>"
										data-driver-id="<?php echo esc_attr( $driver_post_id ); ?>" style="flex:1;">
									<i class="fas fa-check-circle"></i> <?php esc_html_e( 'Confirmar Entrega', 'tukitask-local-drivers' ); ?>
								</button>
							<?php endif; ?>
						</div>
					</div>
				</div>
			<?php 
				endif;
			endif; 
			?>

			<!-- Pending delivery requests -->
			<div id="tuki-pending-deliveries">
				<?php if ( empty( $pending ) ) : ?>
					<div class="tuki-text-secondary" style="text-align:center; padding:2rem 0;">
						<i class="fas fa-inbox" style="font-size:2rem; margin-bottom:0.5rem; opacity:0.5;"></i>
						<p><?php esc_html_e( 'No hay solicitudes de envío disponibles.', 'tukitask-local-drivers' ); ?></p>
					</div>
				<?php else : ?>
					<?php foreach ( $pending as $delivery_id => $data ) : 
						$est_pickup_min = max( 1, round( ( $data['distance_to_pickup'] ?? 0 ) * 2.5 ) );
						$est_delivery_min = max( 1, round( ( $data['distance_km'] ?? 0 ) * 2.5 ) );
					?>
						<div class="tuki-order-card tuki-broadcast-card" data-delivery-id="<?php echo esc_attr( $delivery_id ); ?>" style="border-left:4px solid #3b82f6; margin-bottom:1rem;">
							<div class="tuki-order-body">
								<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
									<span style="font-weight:600;">#<?php echo esc_html( $data['tracking_code'] ?? '' ); ?></span>
									<strong style="color:#10b981; font-size:1.15rem;">
										<?php echo wp_kses_post( wc_price( $data['price'] ?? 0 ) ); ?>
									</strong>
								</div>
								<!-- Bolt-style route info -->
								<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem;">
									<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">
										<i class="fas fa-circle" style="color:#10b981; font-size:0.55rem;"></i>
										<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>
										<i class="fas fa-circle" style="color:#ef4444; font-size:0.55rem;"></i>
									</div>
									<div style="flex:1; font-size:0.88rem;">
										<div style="margin-bottom:0.6rem;">
											<strong style="color:#1e293b;"><?php echo esc_html( $est_pickup_min ); ?> min &bull; <?php echo esc_html( round( $data['distance_to_pickup'] ?? 0, 1 ) ); ?> km</strong>
											<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $data['pickup_address'] ?? '' ); ?></div>
										</div>
										<div>
											<strong style="color:#1e293b;"><?php echo esc_html( $est_delivery_min ); ?> min &bull; <?php echo esc_html( round( $data['distance_km'] ?? 0, 1 ) ); ?> km</strong>
											<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $data['delivery_address'] ?? '' ); ?></div>
										</div>
									</div>
								</div>
								<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.82rem; color:#64748b;">
									<span><i class="fas fa-box"></i> <?php echo esc_html( ucfirst( $data['package_type'] ?? 'small' ) ); ?></span>
									<?php if ( ! empty( $data['customer_name'] ) ) : ?>
										<span><i class="fas fa-user"></i> <?php echo esc_html( $data['customer_name'] ); ?></span>
									<?php endif; ?>
								</div>
								</div>
								<div style="display:flex; gap:0.5rem;">
									<button class="tuki-btn tuki-btn-success tuki-accept-broadcast" data-type="bolt" data-delivery-id="<?php echo esc_attr( $delivery_id ); ?>" style="flex:1;">
										<i class="fas fa-check"></i> <?php esc_html_e( 'Aceptar', 'tukitask-local-drivers' ); ?>
									</button>
									<button class="tuki-btn tuki-reject-broadcast" data-type="bolt" data-delivery-id="<?php echo esc_attr( $delivery_id ); ?>" style="background:#e5e7eb; color:#374151; border:none;">
										<i class="fas fa-times"></i>
									</button>
								</div>
							</div>
						</div>
					<?php endforeach; ?>
				<?php endif; ?>
			</div>

			<!-- Delivery History -->
			<?php
			$history = get_posts( array(
				'post_type'      => 'tukitask_delivery',
				'posts_per_page' => 10,
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
				'orderby' => 'date',
				'order'   => 'DESC',
			) );

			if ( ! empty( $history ) ) : ?>
				<h2 class="tuki-heading" style="font-size:1.1rem; margin-top:2rem; margin-bottom:1rem;">
					<?php esc_html_e( 'Historial de Envíos', 'tukitask-local-drivers' ); ?>
				</h2>
				<?php foreach ( $history as $del ) : 
					$t_code = get_post_meta( $del->ID, '_tracking_code', true );
					$t_raw_price = floatval( get_post_meta( $del->ID, '_delivery_price', true ) );
					$t_vehicle = get_post_meta( $del->ID, '_vehicle_type', true ) ?: 'motorcycle';
					$t_pickup = get_post_meta( $del->ID, '_pickup_address', true );
					$t_dest = get_post_meta( $del->ID, '_delivery_address', true );
				?>
					<div class="tuki-order-card" style="margin-bottom:0.75rem; opacity:0.85;">
						<div class="tuki-order-body" style="padding:0.75rem;">
							<div style="display:flex; justify-content:space-between; align-items:center;">
								<span style="font-weight:600; font-size:0.9rem;">#<?php echo esc_html( $t_code ); ?></span>
								<span style="color:#10b981; font-size:0.85rem;"><i class="fas fa-check-circle"></i> <?php esc_html_e( 'Entregado', 'tukitask-local-drivers' ); ?></span>
							</div>
							<div style="font-size:0.8rem; color:#6b7280; margin-top:4px;">
								<?php echo esc_html( mb_strimwidth( $t_pickup, 0, 40, '...' ) ); ?> → <?php echo esc_html( mb_strimwidth( $t_dest, 0, 40, '...' ) ); ?>
							</div>
							<div style="text-align:right; font-size:0.85rem; font-weight:600; color:#374151; margin-top:4px;">
								<?php echo wp_kses_post( wc_price( $t_raw_price ) ); ?> — <?php echo esc_html( get_the_date( 'd/m H:i', $del ) ); ?>
							</div>
						</div>
					</div>
				<?php endforeach; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render Assigned Orders Screen.
	 */
	private function render_screen_assigned() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );

		// Orders already assigned to this driver
		$orders = wc_get_orders( array(
			'limit'      => 20,
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => array( 'wc-processing', 'wc-listo-para-envio' ),
			'orderby'    => 'date',
			'order'      => 'DESC',
		) );

		// Broadcast orders available (not yet assigned to anyone)
		$broadcast_orders = \Tukitask\LocalDrivers\Orders\Order_Broadcast::get_pending_broadcasts_for_driver( $driver_post_id );
		?>
		<div class="tuki-assigned-screen">

			<?php if ( ! empty( $broadcast_orders ) ) : ?>
			<!-- Broadcast orders: available for anyone to accept -->
			<h1 class="tuki-heading" style="margin-top:1.5rem; margin-bottom:1rem; font-size:1.1rem;">
				<i class="fas fa-bell" style="color:#f59e0b;"></i>
				<?php esc_html_e( 'Pedidos Disponibles', 'tukitask-local-drivers' ); ?>
				<span style="background:#f59e0b; color:white; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-left:0.5rem;"><?php echo count( $broadcast_orders ); ?></span>
			</h1>

			<div id="tuki-broadcast-orders">
				<?php foreach ( $broadcast_orders as $order_id => $bcast ) :
					$bcast_order = wc_get_order( $order_id );
					if ( ! $bcast_order ) continue;
					$this->render_broadcast_order_card( $bcast_order, $bcast, $driver_post_id );
				endforeach; ?>
			</div>
			<?php endif; ?>

			<!-- Already assigned orders -->
			<h1 class="tuki-heading" style="margin-top:1.5rem; margin-bottom:1rem; font-size:1.1rem;">
				<i class="fas fa-clipboard-list" style="color:#3b82f6;"></i>
				<?php esc_html_e( 'Pedidos Asignados', 'tukitask-local-drivers' ); ?>
				<?php if ( ! empty( $orders ) ) : ?>
				<span style="background:#3b82f6; color:white; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-left:0.5rem;"><?php echo count( $orders ); ?></span>
				<?php endif; ?>
			</h1>

			<div id="tuki-assigned-orders">
			<?php if ( empty( $orders ) && empty( $broadcast_orders ) ) : ?>
				<div class="tuki-text-secondary" style="text-align:center; padding:3rem 0;">
					<i class="fas fa-clipboard-list" style="font-size:2rem; margin-bottom:0.5rem; opacity:0.5;"></i>
					<p><?php esc_html_e( 'No tienes pedidos asignados actualmente.', 'tukitask-local-drivers' ); ?></p>
				</div>
			<?php elseif ( empty( $orders ) ) : ?>
				<div class="tuki-text-secondary" style="text-align:center; padding:2rem 0;">
					<p><?php esc_html_e( 'Acepta un pedido disponible arriba para comenzar.', 'tukitask-local-drivers' ); ?></p>
				</div>
			<?php else : ?>
				<?php foreach ( $orders as $order ) {
					$this->render_order_card( $order, 'assigned' );
				} ?>
			<?php endif; ?>
			</div>
		</div>
		<?php
	}

	/**
	 * Render Broadcast Order Card (Aceptar/Rechazar - first to accept wins).
	 * 
	 * @param WC_Order $order          Order object.
	 * @param array    $broadcast_data Broadcast data for this driver.
	 * @param int      $driver_post_id Driver post ID.
	 */
	private function render_broadcast_order_card( $order, $broadcast_data, $driver_post_id ) {
		$delivery_address = $order->get_shipping_address_1() . ', ' . $order->get_shipping_city();
		$total = $order->get_total();
		$items_count = $order->get_item_count();
		$customer_name = $order->get_formatted_billing_full_name();

		// Get vendor/pickup info
		$items = $order->get_items();
		$pickup_address = '';
		$vendor_name = '';
		if ( ! empty( $items ) ) {
			$first_item = reset( $items );
			$product_id = $first_item->get_product_id();
			$vendor_id = get_post_field( 'post_author', $product_id );
			$pickup_address = trim( get_user_meta( $vendor_id, 'billing_address_1', true ) . ', ' . get_user_meta( $vendor_id, 'billing_city', true ), ', ' );
			$vendor_user = get_userdata( $vendor_id );
			if ( $vendor_user ) {
				$vendor_name = $vendor_user->display_name;
			}
		}

		$pickup_km = round( $broadcast_data['pickup_distance'] ?? 0, 1 );
		$delivery_km = round( $broadcast_data['delivery_distance'] ?? 0, 1 );
		$pickup_min = max( 1, round( $pickup_km * 2.5 ) );
		$delivery_min = max( 1, round( $delivery_km * 2.5 ) );
		$wc_payment = $order->get_payment_method_title();

		$nav_url = 'https://www.google.com/maps/dir/?api=1&destination=' . urlencode( $pickup_address ) . '&travelmode=driving';
		?>
		<div class="tuki-order-card tuki-broadcast-order-card" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="background:white; border-radius:12px; padding:1rem; margin-bottom:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.1); border-left:4px solid #f59e0b;">
			<!-- Header: Order number + Price -->
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
				<span style="font-weight:600; font-size:0.95rem;">#<?php echo esc_html( $order->get_order_number() ); ?></span>
				<strong style="color:#10b981; font-size:1.15rem;"><?php echo wp_kses_post( wc_price( $total ) ); ?></strong>
			</div>

			<!-- Bolt-style route visualization with distances -->
			<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem; padding:0.75rem; background:#f8fafc; border-radius:10px;">
				<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">
					<i class="fas fa-circle" style="color:#10b981; font-size:0.55rem;"></i>
					<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>
					<i class="fas fa-circle" style="color:#ef4444; font-size:0.55rem;"></i>
				</div>
				<div style="flex:1; font-size:0.88rem;">
					<div style="margin-bottom:0.6rem;">
						<strong style="color:#1e293b;"><?php echo esc_html( $pickup_min ); ?> min &bull; <?php echo esc_html( $pickup_km ); ?> km</strong>
						<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $pickup_address ?: __( 'Dirección del vendedor', 'tukitask-local-drivers' ) ); ?></div>
						<?php if ( $vendor_name ) : ?>
						<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-store" style="font-size:0.7rem;"></i> <?php echo esc_html( $vendor_name ); ?></div>
						<?php endif; ?>
					</div>
					<div>
						<strong style="color:#1e293b;"><?php echo esc_html( $delivery_min ); ?> min &bull; <?php echo esc_html( $delivery_km ); ?> km</strong>
						<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $delivery_address ); ?></div>
						<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-user" style="font-size:0.7rem;"></i> <?php echo esc_html( $customer_name ); ?></div>
					</div>
				</div>
			</div>

			<!-- Payment + Items info -->
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.82rem; color:#64748b;">
				<span><i class="fas fa-box"></i> <?php printf( _n( '%s artículo', '%s artículos', $items_count, 'tukitask-local-drivers' ), $items_count ); ?></span>
				<?php if ( $wc_payment ) : ?>
				<span><i class="fas fa-credit-card"></i> <?php echo esc_html( $wc_payment ); ?></span>
				<?php endif; ?>
			</div>

			<!-- Aceptar / Rechazar buttons -->
			<div style="display:flex; gap:0.5rem;">
				<button class="tuki-accept-broadcast tuki-btn tuki-btn-success" data-type="woo" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="flex:1; padding:12px; border-radius:10px; border:none; background:#10b981; color:white; cursor:pointer; font-weight:600; font-size:0.95rem;">
					<i class="fas fa-check"></i> <?php esc_html_e( 'Aceptar', 'tukitask-local-drivers' ); ?>
				</button>
				<button class="tuki-reject-broadcast" data-type="woo" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="padding:12px 18px; border-radius:10px; background:#fee2e2; border:none; color:#ef4444; cursor:pointer; font-size:0.95rem;">
					<i class="fas fa-times"></i>
				</button>
				<a href="<?php echo esc_url( $nav_url ); ?>" target="_blank" rel="noopener" style="padding:12px 16px; border-radius:10px; background:#3b82f6; border:none; color:white; cursor:pointer; font-size:0.95rem; text-decoration:none; display:flex; align-items:center;">
					<i class="fas fa-location-arrow"></i>
				</a>
			</div>
		</div>
		<?php
	}

	/**
	 * Render Out For Delivery Screen.
	 */
	private function render_screen_shipping() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );

		$orders = wc_get_orders( array(
			'limit'      => 20,
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => array( 'wc-en-camino' ),
			'orderby'    => 'date',
			'order'      => 'DESC',
		) );
		?>
		<div class="tuki-shipping-screen">
			<h1 class="tuki-heading" style="margin-top:1.5rem; margin-bottom:1rem; font-size:1.1rem;">
				<i class="fas fa-truck" style="color:#10b981;"></i>
				<?php esc_html_e( 'En Ruta', 'tukitask-local-drivers' ); ?>
				<?php if ( ! empty( $orders ) ) : ?>
				<span style="background:#10b981; color:white; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-left:0.5rem;"><?php echo count( $orders ); ?></span>
				<?php endif; ?>
			</h1>

			<?php if ( empty( $orders ) ) : ?>
				<div class="tuki-text-secondary" style="text-align:center; padding:3rem 0;">
					<i class="fas fa-truck" style="font-size:2rem; margin-bottom:0.5rem; opacity:0.5;"></i>
					<p><?php esc_html_e( 'No tienes pedidos en ruta.', 'tukitask-local-drivers' ); ?></p>
				</div>
			<?php else : ?>
				<?php foreach ( $orders as $order ) {
					$this->render_order_card( $order, 'shipping' );
				} ?>
			<?php endif; ?>
		</div>
		<?php
	}
	
	/**
	 * Render Delivered Screen.
	 */
	private function render_screen_delivered() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );

		$orders = wc_get_orders( array(
			'limit'        => 30,
			'meta_key'     => '_assigned_driver_id',
			'meta_value'   => strval( $driver_post_id ),
			'status'       => 'wc-completed',
			'date_created' => '>=' . gmdate( 'Y-m-d', current_time( 'timestamp' ) ),
			'orderby'      => 'date',
			'order'        => 'DESC',
		) );

		$total_earned = 0;
		foreach ( $orders as $order ) {
			$total_earned += floatval( $order->get_total() );
		}
		?>
		<div class="tuki-delivered-screen">
			<h1 class="tuki-heading" style="margin-top:1.5rem; margin-bottom:1rem; font-size:1.1rem;">
				<i class="fas fa-check-circle" style="color:#22c55e;"></i>
				<?php esc_html_e( 'Entregados Hoy', 'tukitask-local-drivers' ); ?>
				<?php if ( ! empty( $orders ) ) : ?>
				<span style="background:#22c55e; color:white; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-left:0.5rem;"><?php echo count( $orders ); ?></span>
				<?php endif; ?>
			</h1>

			<?php if ( ! empty( $orders ) ) : ?>
			<div style="background:#f0fdf4; padding:1rem; border-radius:12px; margin-bottom:1rem; text-align:center;">
				<div style="font-size:0.85rem; color:#15803d;"><?php esc_html_e( 'Ganancia del día', 'tukitask-local-drivers' ); ?></div>
				<div style="font-size:1.5rem; font-weight:700; color:#15803d;"><?php echo wp_kses_post( wc_price( $total_earned ) ); ?></div>
			</div>
			<?php endif; ?>

			<?php if ( empty( $orders ) ) : ?>
				<div class="tuki-text-secondary" style="text-align:center; padding:3rem 0;">
					<i class="fas fa-check-circle" style="font-size:2rem; margin-bottom:0.5rem; opacity:0.5;"></i>
					<p><?php esc_html_e( 'No has realizado entregas hoy.', 'tukitask-local-drivers' ); ?></p>
				</div>
			<?php else : ?>
				<?php foreach ( $orders as $order ) {
					$this->render_order_card( $order, 'delivered' );
				} ?>
			<?php endif; ?>
		</div>
		<?php
	}
	
	/**
	 * Render Failed Deliveries Screen.
	 */
	private function render_screen_failed() {
		$driver_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $driver_id );

		$orders = wc_get_orders( array(
			'limit'        => 20,
			'meta_key'     => '_assigned_driver_id',
			'meta_value'   => strval( $driver_post_id ),
			'status'       => 'wc-entrega-fallida',
			'date_created' => '>=' . gmdate( 'Y-m-d', current_time( 'timestamp' ) ),
			'orderby'      => 'date',
			'order'        => 'DESC',
		) );
		?>
		<div class="tuki-failed-screen">
			<h1 class="tuki-heading" style="margin-top:1.5rem; margin-bottom:1rem; font-size:1.1rem;">
				<i class="fas fa-times-circle" style="color:#ef4444;"></i>
				<?php esc_html_e( 'Fallidos Hoy', 'tukitask-local-drivers' ); ?>
				<?php if ( ! empty( $orders ) ) : ?>
				<span style="background:#ef4444; color:white; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-left:0.5rem;"><?php echo count( $orders ); ?></span>
				<?php endif; ?>
			</h1>

			<?php if ( empty( $orders ) ) : ?>
				<div class="tuki-text-secondary" style="text-align:center; padding:3rem 0;">
					<i class="fas fa-check-double" style="font-size:2rem; margin-bottom:0.5rem; opacity:0.5;"></i>
					<p><?php esc_html_e( 'No tienes entregas fallidas hoy.', 'tukitask-local-drivers' ); ?></p>
				</div>
			<?php else : ?>
				<?php foreach ( $orders as $order ) {
					$this->render_order_card( $order, 'failed' );
				} ?>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render Order Card Component.
	 * 
	 * @param WC_Order $order Order object.
	 * @param string   $context Context (assigned, shipping, delivered, failed).
	 */
	private function render_order_card( $order, $context = 'assigned' ) {
		$delivery_address = $order->get_shipping_address_1() . ', ' . $order->get_shipping_city();
		$total = $order->get_total();
		$items_count = $order->get_item_count();
		$customer_name = $order->get_formatted_billing_full_name();
		$customer_phone = $order->get_billing_phone();

		// Get vendor/pickup address from first product
		$items = $order->get_items();
		$pickup_address = '';
		$vendor_name = '';
		$vendor_phone = '';
		if ( ! empty( $items ) ) {
			$first_item = reset( $items );
			$product_id = $first_item->get_product_id();
			$vendor_id = get_post_field( 'post_author', $product_id );
			$pickup_address = trim( get_user_meta( $vendor_id, 'billing_address_1', true ) . ', ' . get_user_meta( $vendor_id, 'billing_city', true ), ', ' );
			$vendor_user = get_userdata( $vendor_id );
			if ( $vendor_user ) {
				$vendor_name = $vendor_user->display_name;
				$vendor_phone = get_user_meta( $vendor_id, 'billing_phone', true );
			}
		}

		// Payment method from WC
		$wc_payment = $order->get_payment_method_title();

		// Status-based colors
		$border_colors = array( 'assigned' => '#3b82f6', 'shipping' => '#10b981', 'delivered' => '#22c55e', 'failed' => '#ef4444' );
		$border_color = $border_colors[ $context ] ?? '#3b82f6';

		// Navigation URL (pickup for assigned, delivery for shipping)
		$nav_dest = ( $context === 'shipping' ) ? $delivery_address : $pickup_address;
		$nav_url = 'https://www.google.com/maps/dir/?api=1&destination=' . urlencode( $nav_dest ) . '&travelmode=driving';
		?>
		<div class="tuki-order-card" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="background:white; border-radius:12px; padding:1rem; margin-bottom:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.1); border-left:4px solid <?php echo esc_attr( $border_color ); ?>;">
			<!-- Header: Order number + Price -->
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
				<span style="font-weight:600; font-size:0.95rem;">#<?php echo esc_html( $order->get_order_number() ); ?></span>
				<strong style="color:#10b981; font-size:1.15rem;"><?php echo wp_kses_post( wc_price( $total ) ); ?></strong>
			</div>

			<!-- Bolt-style route visualization -->
			<div style="display:flex; gap:0.75rem; margin-bottom:0.75rem; padding:0.75rem; background:#f8fafc; border-radius:10px;">
				<div style="display:flex; flex-direction:column; align-items:center; padding-top:4px;">
					<i class="fas fa-circle" style="color:#10b981; font-size:0.55rem;"></i>
					<div style="width:2px; flex:1; background:#d1d5db; margin:4px 0;"></div>
					<i class="fas fa-circle" style="color:#ef4444; font-size:0.55rem;"></i>
				</div>
				<div style="flex:1; font-size:0.88rem;">
					<div style="margin-bottom:0.6rem;">
						<strong style="color:#1e293b;"><?php esc_html_e( 'Recoger', 'tukitask-local-drivers' ); ?></strong>
						<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $pickup_address ?: __( 'Dirección del vendedor', 'tukitask-local-drivers' ) ); ?></div>
						<?php if ( $vendor_name ) : ?>
						<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-store" style="font-size:0.7rem;"></i> <?php echo esc_html( $vendor_name ); ?></div>
						<?php endif; ?>
					</div>
					<div>
						<strong style="color:#1e293b;"><?php esc_html_e( 'Entregar', 'tukitask-local-drivers' ); ?></strong>
						<div style="color:#6b7280; font-size:0.82rem; margin-top:1px;"><?php echo esc_html( $delivery_address ); ?></div>
						<div style="color:#94a3b8; font-size:0.78rem; margin-top:1px;"><i class="fas fa-user" style="font-size:0.7rem;"></i> <?php echo esc_html( $customer_name ); ?></div>
					</div>
				</div>
			</div>

			<!-- Payment method + Items -->
			<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.82rem; color:#64748b;">
				<span><i class="fas fa-box"></i> <?php printf( _n( '%s artículo', '%s artículos', $items_count, 'tukitask-local-drivers' ), $items_count ); ?></span>
				<?php if ( $wc_payment ) : ?>
				<span><i class="fas fa-credit-card"></i> <?php echo esc_html( $wc_payment ); ?></span>
				<?php endif; ?>
			</div>

			<?php if ( $order->get_customer_note() ) : ?>
			<div style="background:#fffbeb; padding:0.5rem 0.75rem; border-radius:8px; margin-bottom:0.75rem; font-size:0.82rem; color:#92400e;">
				<i class="fas fa-comment-alt"></i> "<?php echo esc_html( $order->get_customer_note() ); ?>"
			</div>
			<?php endif; ?>

			<!-- Action buttons -->
			<div style="display:flex; gap:0.5rem;">
				<?php if ( $context === 'assigned' ) : ?>
					<button class="tuki-btn tuki-btn-success tuki-order-action" data-action="pickup" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="flex:1; padding:12px; border-radius:10px; border:none; background:#10b981; color:white; cursor:pointer; font-weight:600; font-size:0.95rem;">
						<i class="fas fa-box"></i> <?php esc_html_e( 'Confirmar Recogida', 'tukitask-local-drivers' ); ?>
					</button>
					<a href="<?php echo esc_url( $nav_url ); ?>" target="_blank" rel="noopener" style="padding:12px 16px; border-radius:10px; background:#3b82f6; border:none; color:white; cursor:pointer; font-size:0.95rem; text-decoration:none; display:flex; align-items:center;">
						<i class="fas fa-location-arrow"></i>
					</a>
				<?php elseif ( $context === 'shipping' ) : ?>
					<button class="tuki-btn tuki-btn-success tuki-order-action" data-action="deliver" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="flex:1; padding:12px; border-radius:10px; border:none; background:#10b981; color:white; cursor:pointer; font-weight:600; font-size:0.95rem;">
						<i class="fas fa-check-circle"></i> <?php esc_html_e( 'Confirmar Entrega', 'tukitask-local-drivers' ); ?>
					</button>
					<button class="tuki-btn tuki-order-action" data-action="fail" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>" style="padding:12px 16px; border-radius:10px; background:#fee2e2; border:none; color:#ef4444; cursor:pointer; font-size:0.95rem;">
						<i class="fas fa-times"></i>
					</button>
					<a href="<?php echo esc_url( $nav_url ); ?>" target="_blank" rel="noopener" style="padding:12px 16px; border-radius:10px; background:#3b82f6; border:none; color:white; cursor:pointer; font-size:0.95rem; text-decoration:none; display:flex; align-items:center;">
						<i class="fas fa-location-arrow"></i>
					</a>
				<?php elseif ( $context === 'delivered' ) : ?>
					<div style="flex:1; text-align:center; padding:8px; background:#f0fdf4; border-radius:10px; color:#15803d; font-weight:600; font-size:0.85rem;">
						<i class="fas fa-check-circle"></i> <?php esc_html_e( 'Entregado', 'tukitask-local-drivers' ); ?>
						<?php if ( $order->get_date_completed() ) : ?>
						<span style="font-weight:400; color:#6b7280;"> — <?php echo esc_html( $order->get_date_completed()->date_i18n( 'H:i' ) ); ?></span>
						<?php endif; ?>
					</div>
				<?php elseif ( $context === 'failed' ) : ?>
					<div style="flex:1; text-align:center; padding:8px; background:#fef2f2; border-radius:10px; color:#dc2626; font-weight:600; font-size:0.85rem;">
						<i class="fas fa-times-circle"></i> <?php esc_html_e( 'Fallido', 'tukitask-local-drivers' ); ?>
					</div>
				<?php endif; ?>
			</div>

			<?php if ( $customer_phone && in_array( $context, array( 'assigned', 'shipping' ), true ) ) : ?>
			<div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
				<a href="tel:<?php echo esc_attr( $customer_phone ); ?>" style="flex:1; text-align:center; padding:10px; background:#f3f4f6; border-radius:10px; color:#374151; text-decoration:none; font-size:0.85rem; font-weight:500;">
					<i class="fas fa-phone"></i> <?php esc_html_e( 'Cliente', 'tukitask-local-drivers' ); ?>
				</a>
				<?php if ( $vendor_phone ) : ?>
				<a href="tel:<?php echo esc_attr( $vendor_phone ); ?>" style="flex:1; text-align:center; padding:10px; background:#f3f4f6; border-radius:10px; color:#374151; text-decoration:none; font-size:0.85rem; font-weight:500;">
					<i class="fas fa-phone"></i> <?php esc_html_e( 'Vendedor', 'tukitask-local-drivers' ); ?>
				</a>
				<?php endif; ?>
			</div>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Helper: Get Driver Post ID from User ID.
	 */
	private function get_driver_post_id( $user_id ) {
		$args = array(
			'post_type'  => 'tukitask_driver',
			'meta_key'   => '_driver_user_id',
			'meta_value' => $user_id,
			'fields'     => 'ids',
			'numberposts' => 1
		);
		$posts = get_posts($args);
		return !empty($posts) ? $posts[0] : 0;
	}

	/**
	 * Helper: Get order counts.
	 */
	private function get_order_counts( $user_id ) {
		$driver_post_id = $this->get_driver_post_id( $user_id );
		if ( ! $driver_post_id ) {
			return array( 'assigned' => 0, 'active' => 0, 'completed' => 0, 'failed' => 0 );
		}

		$assigned = count( wc_get_orders( array(
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => array( 'wc-processing', 'wc-listo-para-envio' ),
			'return'     => 'ids',
			'limit'      => -1,
		) ) );

		$active = count( wc_get_orders( array(
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => array( 'wc-en-camino' ),
			'return'     => 'ids',
			'limit'      => -1,
		) ) );

		$completed = count( wc_get_orders( array(
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => 'wc-completed',
			'return'     => 'ids',
			'limit'      => -1,
			'date_created' => '>=' . gmdate( 'Y-m-d', strtotime( '-30 days' ) ),
		) ) );

		$failed = count( wc_get_orders( array(
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => 'wc-entrega-fallida',
			'return'     => 'ids',
			'limit'      => -1,
		) ) );

		return array(
			'assigned'  => $assigned,
			'active'    => $active,
			'completed' => $completed,
			'failed'    => $failed,
		);
	}

	/**
	 * AJAX handler to get driver's assigned orders.
	 */
	public function ajax_get_driver_orders() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$user_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $user_id );

		if ( ! $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'Perfil de conductor no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$filter = isset( $_GET['status'] ) ? sanitize_text_field( $_GET['status'] ) : 'assigned';

		$args = array(
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'limit'      => 20,
			'orderby'    => 'date',
			'order'      => 'DESC',
		);

		switch ( $filter ) {
			case 'active':
				$args['status'] = array( 'wc-en-camino' );
				break;
			case 'completed':
				$args['status'] = 'wc-completed';
				$args['date_created'] = '>=' . gmdate( 'Y-m-d', strtotime( '-7 days' ) );
				break;
			case 'failed':
				$args['status'] = 'wc-entrega-fallida';
				break;
			default: // assigned
				$args['status'] = array( 'wc-processing', 'wc-listo-para-envio' );
				break;
		}

		$orders = wc_get_orders( $args );
		$data   = array();

		foreach ( $orders as $order ) {
			$data[] = array(
				'id'              => $order->get_id(),
				'number'          => $order->get_order_number(),
				'total'           => $order->get_formatted_order_total(),
				'customer'        => $order->get_formatted_billing_full_name(),
				'status'          => $order->get_status(),
				'delivery_status' => $order->get_meta( '_delivery_status' ),
				'date'            => $order->get_date_created() ? $order->get_date_created()->date_i18n( 'd/m/Y H:i' ) : '',
			);
		}

		wp_send_json_success( $data );
	}

	/**
	 * AJAX handler for rejecting an order.
	 */
	public function ajax_reject_order() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;

		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido inválido.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( intval( $order->get_meta( '_assigned_driver_id' ) ) !== $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para este pedido.', 'tukitask-local-drivers' ) ) );
		}

		// Unassign driver
		$order->delete_meta_data( '_assigned_driver_id' );
		$order->delete_meta_data( '_driver_assigned_at' );
		$order->delete_meta_data( '_driver_accepted' );
		$order->add_order_note( __( 'Conductor rechazó el pedido. Se reasignará automáticamente.', 'tukitask-local-drivers' ) );
		$order->save();

		// Clear driver active trip
		delete_post_meta( $driver_post_id, '_driver_active_trip' );

		// Trigger re-assignment via auto-assign
		do_action( 'tukitask_order_needs_reassignment', $order_id );

		wp_send_json_success( array( 'message' => __( 'Pedido rechazado.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX handler to toggle driver availability.
	 */
	public function ajax_toggle_availability() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );
		$user_id = get_current_user_id();
		$driver_post_id = $this->get_driver_post_id( $user_id );
		
		if ( ! $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'Perfil no encontrado', 'tukitask-local-drivers' ) ) );
		}

		$current_status = get_post_meta( $driver_post_id, '_driver_status', true );
		$new_status = ( $current_status === 'available' ) ? 'offline' : 'available';
		
		update_post_meta( $driver_post_id, '_driver_status', $new_status );
		
		wp_send_json_success( array( 
			'new_status' => $new_status,
			'message' => __( 'Estado actualizado', 'tukitask-local-drivers' )
		) );
	}

	public function ajax_toggle_tracking() {
		// Placeholder for tracking toggle
		wp_send_json_success();
	}

	/**
	 * AJAX handler for accepting an order.
	 */
	public function ajax_accept_order() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;

		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => 'ID de pedido inválido.' ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => 'Pedido no encontrado.' ) );
		}

		// Check if driver is assigned
		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( $order->get_meta( '_assigned_driver_id' ) != $driver_post_id ) {
			wp_send_json_error( array( 'message' => 'No tienes permiso para este pedido.' ) );
		}

		// Set accepted
		$order->update_meta_data( '_driver_accepted', 'yes' );
		$order->add_order_note( 'Conductor aceptó el pedido.' );
		$order->save();

		wp_send_json_success( array( 'message' => 'Pedido aceptado.' ) );
	}

	/**
	 * AJAX handler for validating pickup code.
	 */
	public function ajax_validate_pickup() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;

		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => 'Datos inválidos.' ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => 'Pedido no encontrado.' ) );
		}

		// Check if driver is assigned
		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( $order->get_meta( '_assigned_driver_id' ) != $driver_post_id ) {
			wp_send_json_error( array( 'message' => 'No tienes permiso para este pedido.' ) );
		}

		// Validate vendor code
		$code = isset( $_POST['code'] ) ? sanitize_text_field( $_POST['code'] ) : '';
		$expected_vendor = $order->get_meta( '_codigo_vendedor' );
		if ( $expected_vendor && strtoupper( $code ) !== strtoupper( $expected_vendor ) ) {
			wp_send_json_error( array( 'message' => 'Código de vendedor incorrecto.' ) );
		}

		// Generate delivery code
		$delivery_code = strtoupper( wp_generate_password( 6, false ) );
		$order->update_meta_data( '_codigo_entrega', $delivery_code );
		$order->update_meta_data( '_delivery_status', 'out_for_delivery' );
		$order->set_status( 'en-camino' );
		$order->add_order_note( 'Conductor salió a entregar. Código de entrega generado.' );
		$order->save();

		wp_send_json_success( array( 'message' => 'Saliste a entregar. Código de entrega generado.' ) );
	}

	/**
	 * AJAX handler for validating delivery (POD + delivery code).
	 */
	public function ajax_validate_delivery() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		$code = isset( $_POST['code'] ) ? sanitize_text_field( $_POST['code'] ) : '';

		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => 'Datos inválidos.' ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => 'Pedido no encontrado.' ) );
		}

		// Check if driver is assigned
		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( $order->get_meta( '_assigned_driver_id' ) != $driver_post_id ) {
			wp_send_json_error( array( 'message' => 'No tienes permiso para este pedido.' ) );
		}

		// Validate delivery code
		$expected = $order->get_meta( '_codigo_entrega' );
		if ( $expected && $code && strtoupper( $code ) !== strtoupper( $expected ) ) {
			wp_send_json_error( array( 'message' => 'Código de entrega incorrecto.' ) );
		}

		// Handle POD upload if exists
		if ( ! empty( $_FILES['pod_photo'] ) && ! empty( $_FILES['pod_photo']['name'] ) ) {
			require_once ABSPATH . 'wp-admin/includes/image.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';

			$attachment_id = media_handle_upload( 'pod_photo', 0 );
			if ( is_wp_error( $attachment_id ) ) {
				wp_send_json_error( array( 'message' => 'Error subiendo la prueba de entrega.' ) );
			}
			$order->update_meta_data( '_pod_photo_id', intval( $attachment_id ) );
		}

		// Mark delivered
		$order->update_meta_data( '_delivery_status', 'delivered' );
		$order->update_meta_data( '_driver_delivered_at', current_time( 'timestamp' ) );
		$order->add_order_note( 'Pedido marcado como entregado por conductor.' );
		$order->save();

		// Complete the order when delivery is validated
		$order->update_status( 'completed', __( 'Pedido completado por conductor con prueba de entrega.', 'tukitask-local-drivers' ) );

		// Clear active trip so driver becomes eligible for new assignments.
		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( $driver_post_id ) {
			delete_post_meta( $driver_post_id, '_driver_active_trip' );
			update_post_meta( $driver_post_id, '_driver_status', 'available' );
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
		}

		// Clear proximity meta.
		$order->delete_meta_data( '_driver_proximity' );
		$order->save();

		wp_send_json_success( array( 'message' => 'Entrega validada correctamente.' ) );
	}

	/**
	 * AJAX: Confirm order pickup (Bolt-style — moves to En Ruta).
	 */
	public function ajax_order_confirm_pickup() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido inválido.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( intval( $order->get_meta( '_assigned_driver_id' ) ) !== $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para este pedido.', 'tukitask-local-drivers' ) ) );
		}

		$order->update_meta_data( '_driver_accepted', 'yes' );
		$order->update_meta_data( '_delivery_status', 'out_for_delivery' );
		$order->update_meta_data( '_driver_pickup_at', current_time( 'timestamp' ) );
		$order->set_status( 'en-camino', __( 'Conductor confirmó recogida. En ruta hacia el cliente.', 'tukitask-local-drivers' ) );
		$order->save();

		wp_send_json_success( array( 'message' => __( 'Recogida confirmada. ¡En ruta!', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX: Confirm order delivery (Bolt-style — moves to Entregado).
	 */
	public function ajax_order_confirm_delivery() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido inválido.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( intval( $order->get_meta( '_assigned_driver_id' ) ) !== $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para este pedido.', 'tukitask-local-drivers' ) ) );
		}

		$order->update_meta_data( '_delivery_status', 'delivered' );
		$order->update_meta_data( '_driver_delivered_at', current_time( 'timestamp' ) );
		$order->set_status( 'completed', __( 'Pedido entregado por conductor.', 'tukitask-local-drivers' ) );
		$order->save();

		// Free driver for new assignments
		if ( $driver_post_id ) {
			delete_post_meta( $driver_post_id, '_driver_active_trip' );
			update_post_meta( $driver_post_id, '_driver_status', 'available' );
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
		}

		$order->delete_meta_data( '_driver_proximity' );
		$order->save();

		wp_send_json_success( array( 'message' => __( 'Entrega confirmada. ¡Bien hecho!', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX: Mark order as failed delivery.
	 */
	public function ajax_order_mark_failed() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido inválido.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( intval( $order->get_meta( '_assigned_driver_id' ) ) !== $driver_post_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para este pedido.', 'tukitask-local-drivers' ) ) );
		}

		$order->update_meta_data( '_delivery_status', 'failed' );
		$order->update_meta_data( '_driver_failed_at', current_time( 'timestamp' ) );
		$order->set_status( 'entrega-fallida', __( 'Entrega marcada como fallida por conductor.', 'tukitask-local-drivers' ) );
		$order->save();

		// Free driver for new assignments
		if ( $driver_post_id ) {
			delete_post_meta( $driver_post_id, '_driver_active_trip' );
			update_post_meta( $driver_post_id, '_driver_status', 'available' );
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
		}

		wp_send_json_success( array( 'message' => __( 'Entrega marcada como fallida.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX: Get assigned orders for polling (returns order IDs).
	 */
	public function ajax_get_assigned_orders() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$driver_post_id = $this->get_driver_post_id( get_current_user_id() );
		if ( ! $driver_post_id ) {
			wp_send_json_success( array( 'orders' => array() ) );
		}

		$orders = wc_get_orders( array(
			'limit'      => 20,
			'meta_key'   => '_assigned_driver_id',
			'meta_value' => strval( $driver_post_id ),
			'status'     => array( 'wc-processing', 'wc-listo-para-envio' ),
			'return'     => 'ids',
			'orderby'    => 'date',
			'order'      => 'DESC',
		) );

		$data = array();
		foreach ( $orders as $order_id ) {
			$order = wc_get_order( $order_id );
			if ( ! $order ) continue;

			$delivery_address = $order->get_shipping_address_1() . ', ' . $order->get_shipping_city();
			$items = $order->get_items();
			$pickup_address = '';
			$vendor_name = '';
			if ( ! empty( $items ) ) {
				$first_item = reset( $items );
				$product_id = $first_item->get_product_id();
				$vendor_id = get_post_field( 'post_author', $product_id );
				$pickup_address = trim( get_user_meta( $vendor_id, 'billing_address_1', true ) . ', ' . get_user_meta( $vendor_id, 'billing_city', true ), ', ' );
				$vendor_user = get_userdata( $vendor_id );
				if ( $vendor_user ) {
					$vendor_name = $vendor_user->display_name;
				}
			}

			$data[] = array(
				'order_id'         => $order_id,
				'order_number'     => $order->get_order_number(),
				'customer_name'    => $order->get_formatted_billing_full_name(),
				'pickup_address'   => $pickup_address,
				'delivery_address' => $delivery_address,
				'total'            => floatval( $order->get_total() ),
				'items_count'      => $order->get_item_count(),
				'vendor_name'      => $vendor_name,
				'payment_method'   => $order->get_payment_method_title(),
			);
		}

		wp_send_json_success( array( 'orders' => $data ) );
	}

	/**
	 * AJAX handler for sending a chat message.
	 */
	public function ajax_send_chat_message() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		$order_id     = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		$recipient_id = isset( $_POST['recipient_id'] ) ? intval( $_POST['recipient_id'] ) : 0;
		$content      = isset( $_POST['content'] ) ? sanitize_textarea_field( $_POST['content'] ) : '';
		$sender_id    = get_current_user_id();

		if ( ! $order_id || ! $recipient_id || empty( $content ) ) {
			wp_send_json_error( array( 'message' => __( 'Datos incompletos.', 'tukitask-local-drivers' ) ) );
		}

		// Verify the sender is involved in this order (driver, vendor, or customer)
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$msg_id = \Tukitask\LocalDrivers\Helpers\Chat_Manager::send_message( array(
			'order_id'     => $order_id,
			'sender_id'    => $sender_id,
			'recipient_id' => $recipient_id,
			'content'      => $content,
		) );

		if ( $msg_id ) {
			wp_send_json_success( array( 'id' => $msg_id ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al enviar mensaje.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * AJAX handler for getting chat messages.
	 */
	public function ajax_get_chat_messages() {
		$order_id = isset( $_GET['order_id'] ) ? intval( $_GET['order_id'] ) : 0;
		$last_id  = isset( $_GET['last_id'] ) ? intval( $_GET['last_id'] ) : 0;

		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido requerido.', 'tukitask-local-drivers' ) ) );
		}

		// Mark messages as read for current user
		$current_user = get_current_user_id();
		if ( $current_user ) {
			\Tukitask\LocalDrivers\Helpers\Chat_Manager::mark_as_read( $order_id, $current_user );
		}

		$messages = \Tukitask\LocalDrivers\Helpers\Chat_Manager::get_messages( $order_id, $last_id );
		wp_send_json_success( $messages );
	}
}
