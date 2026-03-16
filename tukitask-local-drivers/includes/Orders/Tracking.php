<?php
/**
 * Order Tracking System.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

/**
 * Tracking Class.
 *
 * Manages order tracking and delivery status updates.
 */
class Tracking {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'wp_ajax_tukitask_update_delivery_status', $this, 'ajax_update_delivery_status' );
		$loader->add_action( 'wp_ajax_tukitask_get_order_tracking', $this, 'ajax_get_order_tracking' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_get_order_tracking', $this, 'ajax_get_order_tracking' );
		$loader->add_action( 'wp_ajax_tukitask_customer_send_message', $this, 'ajax_customer_send_message' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_customer_send_message', $this, 'ajax_customer_send_message' );
		$loader->add_action( 'wp_enqueue_scripts', $this, 'enqueue_assets' );
		$loader->add_shortcode( 'tukitask_track_order', $this, 'track_order_shortcode' );
	}

	/**
	 * Enqueue tracking assets.
	 */
	public function enqueue_assets() {
		global $post;
		if ( ! is_a( $post, 'WP_Post' ) || ! has_shortcode( $post->post_content, 'tukitask_track_order' ) ) {
			return;
		}

		// Mapbox GL JS & CSS
		wp_enqueue_script( 'mapbox-gl', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js', array(), '2.15.0', true );
		wp_enqueue_style( 'mapbox-gl-css', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css', array(), '2.15.0' );

		wp_enqueue_script( 'tukitask-tracking-js', TUKITASK_LD_URL . 'assets/js/tracking.js', array( 'jquery', 'mapbox-gl' ), TUKITASK_LD_VERSION, true );
		
		wp_localize_script( 'tukitask-tracking-js', 'tukitaskTracking', array(
			'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
			'mapboxKey' => get_option( 'tukitask_ld_mapbox_key' ),
			'basePrice' => floatval( get_option( 'tukitask_ld_base_price', 2.50 ) ),
			'pricePerKm'=> floatval( get_option( 'tukitask_ld_price_per_km', 0.80 ) ),
			'restUrl'   => get_rest_url( null, 'tukitask/v1/orders' ),
			'defaultLat'=> ( get_option( 'tukitask_ld_default_lat' ) ) ? floatval( str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lat' ))) ) : -25.302466,
			'defaultLng'=> ( get_option( 'tukitask_ld_default_lng' ) ) ? floatval( str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lng' ))) ) : -57.681781,
			'strings'   => array(
				'driver_nearby'    => __( '¡Tu conductor está cerca!', 'tukitask-local-drivers' ),
				'delivered'        => __( '¡Pedido entregado!', 'tukitask-local-drivers' ),
				'not_assigned'     => __( 'Conductor no asignado aún.', 'tukitask-local-drivers' ),
				'in_route_live'    => __( 'En camino • Actualizado en vivo', 'tukitask-local-drivers' ),
				'searching_driver' => __( 'Buscando conductor...', 'tukitask-local-drivers' ),
				'chat_with_driver' => __( 'Hablar con el conductor', 'tukitask-local-drivers' ),
				'type_message'     => __( 'Escribe un mensaje...', 'tukitask-local-drivers' ),
			),
		));
	}

	/**
	 * AJAX handler to update delivery status.
	 */
	public function ajax_update_delivery_status() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! current_user_can( 'tukitask_driver_access' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		$status   = isset( $_POST['status'] ) ? sanitize_text_field( $_POST['status'] ) : '';

		// Validate status against whitelist
		$allowed_statuses = array( 'picked_up', 'in_transit', 'nearby', 'out_for_delivery', 'delivered' );
		if ( ! in_array( $status, $allowed_statuses, true ) ) {
			wp_send_json_error( array( 'message' => __( 'Estado de entrega no válido.', 'tukitask-local-drivers' ) ) );
		}

		if ( ! $order_id || ! $status ) {
			wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		// Verify driver is assigned to this order.
		$assigned_driver = $order->get_meta( '_assigned_driver_id' );
		$user_id         = get_current_user_id();
		$driver_user_id  = get_post_meta( $assigned_driver, '_driver_user_id', true );

		if ( intval( $driver_user_id ) !== $user_id && ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para actualizar este pedido.', 'tukitask-local-drivers' ) ) );
		}

		// Update delivery status.
		$this->update_delivery_status( $order, $status );

		wp_send_json_success(
			array(
				'message' => __( 'Estado de entrega actualizado.', 'tukitask-local-drivers' ),
				'status'  => $status,
			)
		);
	}

	/**
	 * Update delivery status with tracking.
	 *
	 * @param \WC_Order $order  Order object.
	 * @param string    $status Status slug.
	 */
	private function update_delivery_status( $order, $status ) {
		Order_Manager::update_delivery_status( $order, $status );
	}

	/**
	 * AJAX handler to get order tracking information.
	 */
	public function ajax_get_order_tracking() {
		$order_id  = isset( $_GET['order_id'] ) ? intval( $_GET['order_id'] ) : 0;
		$order_key = isset( $_GET['order_key'] ) ? sanitize_text_field( $_GET['order_key'] ) : '';

		if ( ! $order_id || ! $order_key ) {
			wp_send_json_error( array( 'message' => __( 'Datos inválidos.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );

		if ( ! $order || $order->get_order_key() !== $order_key ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$tracking_data = $this->get_tracking_data( $order );

		wp_send_json_success( $tracking_data );
	}

	/**
	 * Get tracking data for an order.
	 *
	 * @param \WC_Order $order Order object.
	 * @return array Tracking data.
	 */
	private function get_tracking_data( $order ) {
		$driver_id       = $order->get_meta( '_assigned_driver_id' );
		$delivery_status = $order->get_meta( '_delivery_status' );
		$tracking_events = $order->get_meta( '_tracking_events' );

		$data = array(
			'order_id'        => $order->get_id(),
			'order_status'    => $order->get_status(),
			'delivery_status' => $delivery_status ? $delivery_status : 'pending',
			'tracking_events' => is_array( $tracking_events ) ? $tracking_events : array(),
			'driver'          => null,
		);

		if ( $driver_id ) {
			$driver_lat  = get_post_meta( $driver_id, '_driver_lat', true );
			$driver_lng  = get_post_meta( $driver_id, '_driver_lng', true );
			$driver_name = get_the_title( $driver_id );

			$data['driver'] = array(
				'id'       => $driver_id,
				'name'     => $driver_name,
				'lat'      => $driver_lat ? floatval( $driver_lat ) : null,
				'lng'      => $driver_lng ? floatval( $driver_lng ) : null,
				'vehicle'  => get_post_meta( $driver_id, '_driver_vehicle', true ),
			);
		}

		return $data;
	}

	/**
	 * Track order shortcode.
	 *
	 * Usage: [tukitask_track_order]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function track_order_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'order_id'  => 0,
				'order_key' => '',
			),
			$atts,
			'tukitask_track_order'
		);

		// Try to get from URL parameters.
		if ( ! $atts['order_id'] && isset( $_GET['order_id'] ) ) {
			$atts['order_id'] = intval( $_GET['order_id'] );
		}

		if ( ! $atts['order_key'] && isset( $_GET['order_key'] ) ) {
			$atts['order_key'] = sanitize_text_field( $_GET['order_key'] );
		}

		if ( ! $atts['order_id'] || ! $atts['order_key'] ) {
			return '<p>' . esc_html__( 'Información de seguimiento no disponible.', 'tukitask-local-drivers' ) . '</p>';
		}

		$order = wc_get_order( $atts['order_id'] );

		if ( ! $order || $order->get_order_key() !== $atts['order_key'] ) {
			return '<p>' . esc_html__( 'Pedido no encontrado.', 'tukitask-local-drivers' ) . '</p>';
		}

		$tracking_data = $this->get_tracking_data( $order );

		ob_start();
		?>
		<div class="tukitask-tracking-pro" 
			 data-order-id="<?php echo esc_attr( $atts['order_id'] ); ?>" 
			 data-order-key="<?php echo esc_attr( $atts['order_key'] ); ?>">
			
			<div class="tracking-header">
				<h2><?php echo sprintf( __( 'Pedido #%s', 'tukitask-local-drivers' ), $order->get_order_number() ); ?></h2>
				<span class="status-badge <?php echo esc_attr( $tracking_data['delivery_status'] ); ?>">
					<?php echo esc_html( wc_get_order_status_name( $order->get_status() ) ); ?>
				</span>
			</div>

			<div id="tukitask-tracking-map" style="width:100%; height:300px; border-radius:12px; margin-bottom:20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);"></div>

			<?php if ( $tracking_data['driver'] ) : ?>
			<div class="tracking-driver-card">
				<div class="driver-avatar" style="background-image: url('<?php echo esc_url( get_avatar_url( get_post_meta( $tracking_data['driver']['id'], '_driver_user_id', true ) ?: 0 ) ); ?>')"></div>
				<div class="driver-details">
					<h4><?php echo esc_html( $tracking_data['driver']['name'] ); ?></h4>
					<p><?php echo esc_html( $tracking_data['driver']['vehicle'] ); ?> • <span id="eta-display">Calculando llegada...</span></p>
				</div>
				<a href="tel:<?php echo esc_attr( get_post_meta( $tracking_data['driver']['id'], '_driver_phone', true ) ); ?>" class="call-driver-btn">
					<i class="fas fa-phone"></i>
				</a>
			</div>
			<?php endif; ?>

			<div class="tracking-timeline-modern">
				<?php 
				$milestones = array(
					'pending' => array( 'label' => __( 'Recibido', 'tukitask-local-drivers' ), 'icon' => 'fas fa-receipt' ),
					'picked_up' => array( 'label' => __( 'Recogido', 'tukitask-local-drivers' ), 'icon' => 'fas fa-box' ),
					'in_transit' => array( 'label' => __( 'En camino', 'tukitask-local-drivers' ), 'icon' => 'fas fa-truck' ),
					'delivered' => array( 'label' => __( 'Entregado', 'tukitask-local-drivers' ), 'icon' => 'fas fa-check-circle' ),
				);

				$current_status = $tracking_data['delivery_status'];
				$reached = true;

				foreach ( $milestones as $key => $ms ) : 
					$active_class = $reached ? 'active' : '';
					if ( $key === $current_status ) $reached = false;
				?>
				<div class="timeline-step <?php echo $active_class; ?>">
					<div class="step-icon"><i class="<?php echo $ms['icon']; ?>"></i></div>
					<div class="step-label"><?php echo $ms['label']; ?></div>
				</div>
				<?php endforeach; ?>
			</div>

			<!-- Customer Chat Entry -->
			<?php if ( $tracking_data['driver'] ) : ?>
			<button class="tuki-btn tuki-open-chat" id="customer-open-chat" data-recipient-id="<?php echo $tracking_data['driver']['id']; ?>" style="width:100%; margin-top:20px; background:#4F46E5; color:#fff; border-radius:12px; padding:12px; font-weight:600;">
				<i class="fas fa-comment-dots"></i> <?php _e( 'Chat con el conductor', 'tukitask-local-drivers' ); ?>
			</button>
			<?php endif; ?>
		</div>

		<?php $this->render_chat_overlay(); ?>

		<style>
			.tukitask-tracking-pro { font-family: 'Inter', system-ui, sans-serif; max-width: 500px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 16px; border: 1px solid #efefef; }
			.tracking-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
			.status-badge { padding: 4px 12px; border-radius: 99px; font-size: 0.85rem; font-weight: 600; background: #f3f4f6; }
			.tracking-driver-card { display: flex; align-items: center; gap: 15px; padding: 15px; background: #f8fafc; border-radius: 12px; margin-bottom: 20px; }
			.driver-avatar { width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-position: center; border: 2px solid #fff; }
			.driver-details h4 { margin: 0; font-size: 1rem; }
			.driver-details p { margin: 0; font-size: 0.85rem; color: #64748b; }
			.call-driver-btn { margin-left: auto; width: 40px; height: 40px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; text-decoration: none; }
			.tracking-timeline-modern { display: flex; justify-content: space-between; position: relative; padding-top: 20px; }
			.tracking-timeline-modern::before { content: ''; position: absolute; top: 35px; left: 0; right: 0; height: 2px; background: #e2e8f0; z-index: 1; }
			.timeline-step { position: relative; z-index: 2; text-align: center; flex: 1; }
			.step-icon { width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0; color: #94a3b8; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; border: 3px solid #fff; font-size: 0.8rem; }
			.timeline-step.active .step-icon { background: #4f46e5; color: #fff; }
			.timeline-step.active .step-label { color: #1e293b; font-weight: 600; }
			.step-label { font-size: 0.75rem; color: #94a3b8; }
		</style>
		<?php
		return ob_get_clean();
	}

	public function ajax_customer_send_message() {
		$order_id = intval( $_POST['order_id'] );
		$order_key = sanitize_text_field( $_POST['order_key'] );
		$recipient_id = intval( $_POST['recipient_id'] );
		$content = sanitize_textarea_field( $_POST['content'] );

		$order = wc_get_order( $order_id );
		if ( ! $order || $order->get_order_key() !== $order_key ) wp_send_json_error();

		// Customer sender ID could be User ID or 0 for guest.
		$sender_id = $order->get_customer_id();

		$message_id = \Tukitask\LocalDrivers\Helpers\Chat_Manager::send_message( array(
			'order_id'     => $order_id,
			'sender_id'    => $sender_id,
			'recipient_id' => $recipient_id,
			'content'      => $content
		) );

		if ( $message_id ) wp_send_json_success( array( 'id' => $message_id ) );
		else wp_send_json_error();
	}

	private function render_chat_overlay() {
		?>
		<div id="tuki-chat-overlay" class="tuki-chat-overlay">
			<div class="tuki-chat-window">
				<div class="tuki-chat-header">
					<span>Chat con el repartidor</span>
					<button id="tuki-close-chat"><i class="fas fa-times"></i></button>
				</div>
				<div id="tuki-chat-messages" class="tuki-chat-messages"></div>
				<div class="tuki-chat-input-area">
					<textarea id="tuki-chat-input" placeholder="Escribe tu mensaje..."></textarea>
					<button id="tuki-send-message"><i class="fas fa-paper-plane"></i></button>
				</div>
			</div>
		</div>
		<style>
		.tuki-chat-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: flex-end; }
		.tuki-chat-overlay.active { display: flex; }
		.tuki-chat-window { width: 100%; max-width: 500px; background: #fff; border-radius: 20px 20px 0 0; display: flex; flex-direction: column; height: 80vh; margin: 0 auto; box-shadow: 0 -5px 25px rgba(0,0,0,0.1); }
		.tuki-chat-header { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #4f46e5; color: #fff; border-radius: 20px 20px 0 0; }
		.tuki-chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }
		.chat-msg { max-width: 80%; padding: 10px 15px; border-radius: 15px; font-size: 0.9rem; }
		.chat-msg.sent { align-self: flex-end; background: #4f46e5; color: #fff; border-bottom-right-radius: 2px; }
		.chat-msg.received { align-self: flex-start; background: #e2e8f0; color: #1e293b; border-bottom-left-radius: 2px; }
		.tuki-chat-input-area { padding: 15px; border-top: 1px solid #eee; display: flex; gap: 10px; }
		#tuki-chat-input { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; resize: none; font-family: inherit; height: 45px; }
		#tuki-send-message { background: #4f46e5; color: #fff; border: none; width: 45px; height: 45px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
		</style>
		<?php
	}
}
