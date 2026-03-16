<?php
/**
 * Vendor Shortcodes.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

/**
 * Vendedor_Shortcodes Class.
 *
 * Registers shortcodes for vendor panel.
 */
class Vendedor_Shortcodes {

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
		$loader->add_shortcode( 'tukitask_vendedor_panel', $this, 'vendedor_panel_shortcode' );
		$loader->add_shortcode( 'tukitask_vendor_register', $this, 'vendor_register_shortcode' );
		$loader->add_shortcode( 'tukitask_vendor_store', $this, 'vendor_store_shortcode' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_vendor_register', $this, 'ajax_vendor_register' );
		$loader->add_action( 'wp_ajax_tukitask_vendor_register', $this, 'ajax_vendor_register' );
	}

	/**
	 * Vendor panel shortcode.
	 *
	 * Usage: [tukitask_vendedor_panel]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function vendedor_panel_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(),
			$atts,
			'tukitask_vendedor_panel'
		);

		$dashboard = new Vendedor_Dashboard( $this->loader );
		return $dashboard->render_dashboard( $atts );
	}

	/**
	 * Public vendor store page shortcode.
	 *
	 * Usage: [tukitask_vendor_store] — uses ?vendor_id= query parameter
	 */
	public function vendor_store_shortcode( $atts ) {
		$atts = shortcode_atts( array( 'vendor_id' => 0 ), $atts, 'tukitask_vendor_store' );
		$vendor_id = $atts['vendor_id'] ? intval( $atts['vendor_id'] ) : ( isset( $_GET['vendor_id'] ) ? intval( $_GET['vendor_id'] ) : 0 );

		if ( ! $vendor_id ) {
			return '<div class="tukitask-error" style="padding:30px; text-align:center;">' . __( 'Tienda no encontrada.', 'tukitask-local-drivers' ) . '</div>';
		}

		$vendor = get_userdata( $vendor_id );
		if ( ! $vendor ) {
			return '<div class="tukitask-error" style="padding:30px; text-align:center;">' . __( 'Vendedor no encontrado.', 'tukitask-local-drivers' ) . '</div>';
		}

		$status = get_user_meta( $vendor_id, '_tukitask_vendor_status', true );
		if ( $status && 'active' !== $status ) {
			return '<div class="tukitask-error" style="padding:30px; text-align:center;">' . __( 'Esta tienda no está disponible actualmente.', 'tukitask-local-drivers' ) . '</div>';
		}

		$store_name  = $vendor->display_name;
		$description = get_user_meta( $vendor_id, '_vendedor_store_description', true );
		$logo_id     = get_user_meta( $vendor_id, '_vendedor_store_logo', true );
		$banner_id   = get_user_meta( $vendor_id, '_vendedor_store_banner', true );
		$phone       = get_user_meta( $vendor_id, 'billing_phone', true );
		$address     = get_user_meta( $vendor_id, 'billing_address_1', true );
		$city        = get_user_meta( $vendor_id, 'billing_city', true );

		$logo_url   = $logo_id ? wp_get_attachment_image_url( $logo_id, 'thumbnail' ) : '';
		$banner_url = $banner_id ? wp_get_attachment_image_url( $banner_id, 'large' ) : '';

		// Get vendor rating
		$avg_rating = 0;
		$review_count = 0;
		if ( class_exists( '\Tukitask\LocalDrivers\Helpers\Review_Manager' ) ) {
			$avg_rating = \Tukitask\LocalDrivers\Helpers\Review_Manager::get_average_rating( $vendor_id, 'vendor' );
			$reviews = \Tukitask\LocalDrivers\Helpers\Review_Manager::get_reviews_by_target( $vendor_id, 'vendor' );
			$review_count = is_array( $reviews ) ? count( $reviews ) : 0;
		}

		// Get vendor products
		$products = get_posts( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'author'         => $vendor_id,
			'posts_per_page' => -1,
		) );

		ob_start();
		?>
		<div class="tukitask-vendor-store" style="max-width:1100px; margin:0 auto;">
			<!-- Banner -->
			<div style="position:relative; height:240px; border-radius:16px; overflow:hidden; margin-bottom:20px; background:linear-gradient(135deg, #6366f1, #8b5cf6);">
				<?php if ( $banner_url ) : ?>
					<img src="<?php echo esc_url( $banner_url ); ?>" alt="" style="width:100%; height:100%; object-fit:cover;">
				<?php endif; ?>
			</div>

			<!-- Store Info -->
			<div style="display:flex; align-items:flex-start; gap:20px; margin-bottom:30px; padding:0 10px;">
				<div style="flex-shrink:0; width:80px; height:80px; border-radius:50%; overflow:hidden; border:3px solid #fff; box-shadow:0 2px 12px rgba(0,0,0,0.1); margin-top:-50px; background:#f3f4f6; z-index:1;">
					<?php if ( $logo_url ) : ?>
						<img src="<?php echo esc_url( $logo_url ); ?>" alt="" style="width:100%; height:100%; object-fit:cover;">
					<?php else : ?>
						<?php echo get_avatar( $vendor_id, 80 ); ?>
					<?php endif; ?>
				</div>
				<div style="flex:1;">
					<h1 style="margin:0 0 4px; font-size:24px;"><?php echo esc_html( $store_name ); ?></h1>
					<?php if ( $avg_rating > 0 ) : ?>
						<div style="color:#f59e0b; margin-bottom:4px;">
							<?php for ( $i = 1; $i <= 5; $i++ ) : ?>
								<?php echo $i <= round( $avg_rating ) ? '&#9733;' : '&#9734;'; ?>
							<?php endfor; ?>
							<span style="color:#6b7280; font-size:13px;">(<?php echo $review_count; ?> <?php esc_html_e( 'reseñas', 'tukitask-local-drivers' ); ?>)</span>
						</div>
					<?php endif; ?>
					<?php if ( $description ) : ?>
						<p style="color:#6b7280; margin:0 0 6px;"><?php echo esc_html( $description ); ?></p>
					<?php endif; ?>
					<?php if ( $address || $city ) : ?>
						<p style="color:#9ca3af; font-size:13px; margin:0;">&#128205; <?php echo esc_html( trim( $address . ', ' . $city, ', ' ) ); ?></p>
					<?php endif; ?>
				</div>
			</div>

			<!-- Products -->
			<h2 style="margin-bottom:15px;"><?php esc_html_e( 'Productos', 'tukitask-local-drivers' ); ?> (<?php echo count( $products ); ?>)</h2>
			<?php if ( ! empty( $products ) ) : ?>
				<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:20px;">
					<?php foreach ( $products as $post ) :
						$product = wc_get_product( $post->ID );
						if ( ! $product ) continue;
						$img = $product->get_image_id() ? wp_get_attachment_image_url( $product->get_image_id(), 'woocommerce_thumbnail' ) : wc_placeholder_img_src();
					?>
					<div style="background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06); transition:transform 0.2s;">
						<a href="<?php echo esc_url( get_permalink( $post->ID ) ); ?>" style="text-decoration:none; color:inherit;">
							<img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $product->get_name() ); ?>" style="width:100%; height:180px; object-fit:cover;">
							<div style="padding:12px;">
								<h3 style="margin:0 0 6px; font-size:15px;"><?php echo esc_html( $product->get_name() ); ?></h3>
								<span style="font-weight:700; color:#6366f1;"><?php echo $product->get_price_html(); ?></span>
							</div>
						</a>
					</div>
					<?php endforeach; ?>
				</div>
			<?php else : ?>
				<p style="text-align:center; color:#9ca3af; padding:40px;"><?php esc_html_e( 'Este vendedor aún no tiene productos publicados.', 'tukitask-local-drivers' ); ?></p>
			<?php endif; ?>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * Vendor registration shortcode.
	 *
	 * Usage: [tukitask_vendor_register]
	 */
	public function vendor_register_shortcode( $atts ) {
		if ( is_user_logged_in() ) {
			if ( current_user_can( 'edit_posts' ) ) {
				return '<div class="tukitask-info" style="padding:30px; text-align:center; background:#f0fdf4; border:1px solid #86efac; border-radius:12px; margin:20px 0;">
					<p>' . __( 'Ya tienes una cuenta de vendedor.', 'tukitask-local-drivers' ) . '</p>
					<a href="' . esc_url( get_permalink() ) . '?tab=overview" class="button">' . __( 'Ir al Panel de Vendedor', 'tukitask-local-drivers' ) . '</a>
				</div>';
			}
		}

		$nonce = wp_create_nonce( 'tukitask_vendor_register_nonce' );
		ob_start();
		?>
		<div class="tukitask-vendor-register" style="max-width:600px; margin:30px auto; background:#fff; border-radius:16px; padding:40px; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
			<h2 style="text-align:center; margin-bottom:8px;"><?php esc_html_e( 'Registro de Vendedor', 'tukitask-local-drivers' ); ?></h2>
			<p style="text-align:center; color:#6b7280; margin-bottom:30px;"><?php esc_html_e( 'Crea tu cuenta para vender en nuestro marketplace.', 'tukitask-local-drivers' ); ?></p>
			
			<form id="tukitask-vendor-register-form">
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
					<div>
						<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Nombre', 'tukitask-local-drivers' ); ?> *</label>
						<input type="text" name="first_name" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
					</div>
					<div>
						<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Apellido', 'tukitask-local-drivers' ); ?> *</label>
						<input type="text" name="last_name" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
					</div>
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Nombre de la Tienda', 'tukitask-local-drivers' ); ?> *</label>
					<input type="text" name="store_name" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Email', 'tukitask-local-drivers' ); ?> *</label>
					<input type="email" name="email" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Teléfono', 'tukitask-local-drivers' ); ?> *</label>
					<input type="tel" name="phone" required style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Contraseña', 'tukitask-local-drivers' ); ?> *</label>
					<input type="password" name="password" required minlength="8" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block; font-weight:600; margin-bottom:4px;"><?php esc_html_e( 'Dirección de la Tienda', 'tukitask-local-drivers' ); ?></label>
					<input type="text" name="address" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px;">
				</div>

				<div id="vendor-register-msg" style="display:none; padding:12px; border-radius:8px; margin-bottom:15px;"></div>

				<button type="submit" id="vendor-register-btn" style="width:100%; padding:14px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer;">
					<?php esc_html_e( 'Crear Cuenta de Vendedor', 'tukitask-local-drivers' ); ?>
				</button>
			</form>
		</div>
		<script>
		(function() {
			var form = document.getElementById('tukitask-vendor-register-form');
			if (!form) return;
			form.addEventListener('submit', function(e) {
				e.preventDefault();
				var btn = document.getElementById('vendor-register-btn');
				var msg = document.getElementById('vendor-register-msg');
				btn.disabled = true;
				btn.textContent = '<?php esc_attr_e( 'Registrando...', 'tukitask-local-drivers' ); ?>';

				var formData = new FormData(form);
				formData.append('action', 'tukitask_vendor_register');
				formData.append('security', '<?php echo esc_js( $nonce ); ?>');

				fetch('<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>', {
					method: 'POST',
					body: formData
				})
				.then(function(r) { return r.json(); })
				.then(function(data) {
					msg.style.display = 'block';
					if (data.success) {
						msg.style.background = '#f0fdf4';
						msg.style.border = '1px solid #86efac';
						msg.style.color = '#166534';
						msg.innerHTML = data.data.message;
						form.reset();
					} else {
						msg.style.background = '#fef2f2';
						msg.style.border = '1px solid #fca5a5';
						msg.style.color = '#991b1b';
						msg.innerHTML = data.data.message;
						btn.disabled = false;
						btn.textContent = '<?php esc_attr_e( 'Crear Cuenta de Vendedor', 'tukitask-local-drivers' ); ?>';
					}
				});
			});
		})();
		</script>
		<?php
		return ob_get_clean();
	}

	/**
	 * AJAX handler for vendor registration.
	 */
	public function ajax_vendor_register() {
		check_ajax_referer( 'tukitask_vendor_register_nonce', 'security' );

		$email      = isset( $_POST['email'] ) ? sanitize_email( $_POST['email'] ) : '';
		$first_name = isset( $_POST['first_name'] ) ? sanitize_text_field( $_POST['first_name'] ) : '';
		$last_name  = isset( $_POST['last_name'] ) ? sanitize_text_field( $_POST['last_name'] ) : '';
		$store_name = isset( $_POST['store_name'] ) ? sanitize_text_field( $_POST['store_name'] ) : '';
		$phone      = isset( $_POST['phone'] ) ? sanitize_text_field( $_POST['phone'] ) : '';
		$password   = isset( $_POST['password'] ) ? $_POST['password'] : '';
		$address    = isset( $_POST['address'] ) ? sanitize_text_field( $_POST['address'] ) : '';

		if ( empty( $email ) || empty( $first_name ) || empty( $last_name ) || empty( $store_name ) || empty( $phone ) || empty( $password ) ) {
			wp_send_json_error( array( 'message' => __( 'Todos los campos obligatorios deben ser completados.', 'tukitask-local-drivers' ) ) );
		}

		if ( ! is_email( $email ) ) {
			wp_send_json_error( array( 'message' => __( 'El email ingresado no es válido.', 'tukitask-local-drivers' ) ) );
		}

		if ( email_exists( $email ) ) {
			wp_send_json_error( array( 'message' => __( 'Ya existe una cuenta con ese email.', 'tukitask-local-drivers' ) ) );
		}

		if ( strlen( $password ) < 8 ) {
			wp_send_json_error( array( 'message' => __( 'La contraseña debe tener al menos 8 caracteres.', 'tukitask-local-drivers' ) ) );
		}

		// Create the user
		$username = sanitize_user( strtolower( $first_name . '.' . $last_name ), true );
		if ( username_exists( $username ) ) {
			$username = $username . '_' . wp_rand( 100, 999 );
		}

		$user_id = wp_create_user( $username, $password, $email );
		if ( is_wp_error( $user_id ) ) {
			wp_send_json_error( array( 'message' => $user_id->get_error_message() ) );
		}

		// Set user data
		wp_update_user( array(
			'ID'           => $user_id,
			'first_name'   => $first_name,
			'last_name'    => $last_name,
			'display_name' => $store_name,
			'role'         => 'tukitask_vendedor',
		) );

		// Set vendor meta
		update_user_meta( $user_id, '_tukitask_vendor_status', 'pending' );
		update_user_meta( $user_id, '_vendedor_store_description', '' );
		update_user_meta( $user_id, 'billing_phone', $phone );
		update_user_meta( $user_id, 'billing_address_1', $address );

		// Notify admin
		$admin_email = get_option( 'admin_email' );
		$subject = sprintf( __( '[%s] Nuevo Vendedor Registrado', 'tukitask-local-drivers' ), get_bloginfo( 'name' ) );
		$message = sprintf(
			__( "Un nuevo vendedor se ha registrado:\n\nTienda: %s\nNombre: %s %s\nEmail: %s\nTeléfono: %s\n\nPor favor aprueba la cuenta desde el panel de administración.", 'tukitask-local-drivers' ),
			$store_name, $first_name, $last_name, $email, $phone
		);
		wp_mail( $admin_email, $subject, $message );

		wp_send_json_success( array(
			'message' => __( 'Tu cuenta ha sido creada exitosamente. Un administrador revisará y aprobará tu tienda pronto. Recibirás un email de confirmación.', 'tukitask-local-drivers' ),
		) );
	}
}
