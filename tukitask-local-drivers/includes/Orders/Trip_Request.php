<?php
/**
 * Trip Request System (Bolt Style).
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;
use Tukitask\LocalDrivers\Helpers\Distance;
use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Helpers\Push_Manager;

/**
 * Trip_Request Class.
 *
 * Manages on-demand trip requests with broadcast and first-come-first-served assignment.
 */
class Trip_Request {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'init', $this, 'register_trip_request_cpt' );
		$loader->add_action( 'wp_ajax_tukitask_create_trip_request', $this, 'ajax_create_trip_request' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_create_trip_request', $this, 'ajax_create_trip_request' );
		$loader->add_action( 'wp_ajax_tukitask_accept_trip_request', $this, 'ajax_accept_trip_request' );
		$loader->add_action( 'wp_ajax_tukitask_get_active_requests', $this, 'ajax_get_active_requests' );
		$loader->add_action( 'wp_enqueue_scripts', $this, 'enqueue_assets' );
		$loader->add_shortcode( 'tukitask_demand_trip', $this, 'demand_trip_shortcode' );
	}

	/**
	 * Enqueue assets for trip request UI.
	 */
	public function enqueue_assets() {
		global $post;
		if ( ! is_a( $post, 'WP_Post' ) || ! has_shortcode( $post->post_content, 'tukitask_demand_trip' ) ) {
			return;
		}

		wp_enqueue_script( 'mapbox-gl', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js', array(), '2.15.0', true );
		wp_enqueue_style( 'mapbox-gl-css', 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css', array(), '2.15.0' );

		wp_enqueue_script( 'tukitask-demand-js', TUKITASK_LD_URL . 'assets/js/demand.js', array( 'jquery', 'mapbox-gl' ), TUKITASK_LD_VERSION, true );
		
		wp_localize_script( 'tukitask-demand-js', 'tukitaskDemand', array(
			'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
			'nonce'     => wp_create_nonce( 'tukitask_trip_nonce' ),
			'mapboxKey' => get_option( 'tukitask_ld_mapbox_key' ),
			'basePrice' => floatval( get_option( 'tukitask_ld_base_price', 2.50 ) ),
			'pricePerKm'=> floatval( get_option( 'tukitask_ld_price_per_km', 0.80 ) ),
			'defaultLat'=> ( get_option( 'tukitask_ld_default_lat' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lat' ))) : '-25.302466',
			'defaultLng'=> ( get_option( 'tukitask_ld_default_lng' ) ) ? str_replace(',', '.', trim(get_option( 'tukitask_ld_default_lng' ))) : '-57.681781',
			'strings'   => array(
				'req_addresses' => __( 'Por favor ingresa origen y destino.', 'tukitask-local-drivers' ),
				'searching'     => __( 'Buscando Repartidor...', 'tukitask-local-drivers' ),
				'request_sent'  => __( 'Solicitud Enviada ✓', 'tukitask-local-drivers' ),
				'request_btn'   => __( 'Solicitar Repartidor Ahora', 'tukitask-local-drivers' ),
			),
		));
	}

	/**
	 * Render [tukitask_demand_trip] shortcode.
	 */
	public function demand_trip_shortcode() {
		ob_start();
		?>
		<div class="tukitask-demand-widget glass">
			<h3><?php _e( 'Pedir un Repartidor', 'tukitask-local-drivers' ); ?></h3>
			<div class="demand-form">
				<div class="input-group">
					<label><?php _e( 'Punto de Recogida', 'tukitask-local-drivers' ); ?></label>
					<input type="text" id="demand-origin" placeholder="<?php _e( '¿Dónde recogemos?', 'tukitask-local-drivers' ); ?>">
				</div>
				<div class="input-group" style="margin-top:10px;">
					<label><?php _e( 'Punto de Entrega', 'tukitask-local-drivers' ); ?></label>
					<input type="text" id="demand-destination" placeholder="<?php _e( '¿Dónde entregamos?', 'tukitask-local-drivers' ); ?>">
				</div>
				
				<div id="demand-preview-map" style="width:100%; height:200px; margin-top:15px; border-radius:8px;"></div>
				
				<div class="pricing-preview" id="demand-pricing" style="display:none; margin-top:15px; padding:10px; background:#f0f9ff; border-radius:8px; text-align:center;">
					<span style="font-size:0.9rem; color:#0369a1;"><?php _e( 'Precio Estimado:', 'tukitask-local-drivers' ); ?></span>
					<strong id="estimated-price" style="display:block; font-size:1.4rem;">$0.00</strong>
				</div>

				<button id="book-driver-btn" class="tukitask-btn accent" style="width:100%; margin-top:15px; padding:12px;">
					<?php _e( 'Solicitar Repartidor Ahora', 'tukitask-local-drivers' ); ?>
				</button>
			</div>
		</div>
		<style>
			.tukitask-demand-widget { max-width: 400px; margin: 20px auto; padding: 25px; border-radius: 16px; border: 1px solid #efefef; }
			.input-group label { display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 5px; color: #64748b; }
			.input-group input { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; }
		</style>
		<?php
		return ob_get_clean();
	}

	/**
	 * Register the Trip Request Custom Post Type.
	 */
	public function register_trip_request_cpt() {
		$args = array(
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => true,
			'show_in_menu'       => 'tukitask-drivers',
			'query_var'          => true,
			'capability_type'    => 'post',
			'has_archive'        => false,
			'hierarchical'       => false,
			'supports'           => array( 'title' ),
			'labels'             => array(
				'name'          => __( 'Trip Requests', 'tukitask-local-drivers' ),
				'singular_name' => __( 'Trip Request', 'tukitask-local-drivers' ),
			),
		);
		register_post_type( 'tukitask_trip_req', $args );
	}

	/**
	 * AJAX handler to create a new trip request.
	 */
	public function ajax_create_trip_request() {
		check_ajax_referer( 'tukitask_trip_nonce', 'security' );

		$origin_address  = sanitize_text_field( $_POST['origin_address'] );
		$dest_address    = sanitize_text_field( $_POST['dest_address'] );
		$origin_lat      = floatval( $_POST['origin_lat'] );
		$origin_lng      = floatval( $_POST['origin_lng'] );
		$dest_lat        = floatval( $_POST['dest_lat'] );
		$dest_lng        = floatval( $_POST['dest_lng'] );
		$price           = floatval( $_POST['price'] );

		if ( ! $origin_lat || ! $origin_lng || ! $dest_lat || ! $dest_lng ) {
			wp_send_json_error( array( 'message' => __( 'Coordenadas de origen o destino faltantes.', 'tukitask-local-drivers' ) ) );
		}

		// Create the Trip Request.
		$request_id = wp_insert_post( array(
			'post_type'   => 'tukitask_trip_req',
			'post_title'  => sprintf( __( 'Viaje de %s a %s', 'tukitask-local-drivers' ), $origin_address, $dest_address ),
			'post_status' => 'publish',
		) );

		if ( is_wp_error( $request_id ) ) {
			wp_send_json_error( array( 'message' => __( 'Error al crear la solicitud.', 'tukitask-local-drivers' ) ) );
		}

		update_post_meta( $request_id, '_trip_status', 'pending' );
		update_post_meta( $request_id, '_trip_origin_address', $origin_address );
		update_post_meta( $request_id, '_trip_dest_address', $dest_address );
		update_post_meta( $request_id, '_trip_origin_lat', $origin_lat );
		update_post_meta( $request_id, '_trip_origin_lng', $origin_lng );
		update_post_meta( $request_id, '_trip_dest_lat', $dest_lat );
		update_post_meta( $request_id, '_trip_dest_lng', $dest_lng );
		update_post_meta( $request_id, '_trip_price', $price );
		update_post_meta( $request_id, '_trip_created_at', current_time( 'timestamp' ) );

		// Find the nearest drivers based on limit.
		$drivers = Driver_Availability::get_available_drivers( $origin_lat, $origin_lng );
		
		$broadcast_limit = intval( get_option( 'tukitask_ld_broadcast_limit', 50 ) );
		$broadcast_drivers = array_slice( $drivers, 0, $broadcast_limit );
		foreach ( $broadcast_drivers as $driver_data ) {
			add_post_meta( $request_id, '_notified_driver_id', $driver_data['id'] );
			
			// Send Push Notification
			$driver_user_id = get_post_meta( $driver_data['id'], '_driver_user_id', true );
			if ( $driver_user_id ) {
				Push_Manager::send_notification(
					$driver_user_id,
					__( '¡Nuevo Viaje Disponible!', 'tukitask-local-drivers' ),
					sprintf( __( 'Viaje de %s por %s', 'tukitask-local-drivers' ), $origin_address, wc_price( $price ) ),
					home_url( '/driver-dashboard/?screen=assigned' ) // Assuming a path or dashboard URL
				);
			}
		}

		wp_send_json_success( array(
			'request_id' => $request_id,
			'message'    => __( 'Solicitud enviada a conductores cercanos.', 'tukitask-local-drivers' )
		) );
	}

	/**
	 * AJAX handler for drivers to get active requests notified to them.
	 */
	public function ajax_get_active_requests() {
		if ( ! current_user_can( 'tukitask_driver_access' ) ) {
			wp_send_json_error( array( 'message' => 'Unauthorized' ) );
		}

		$user_id = get_current_user_id();
		$driver_id = $this->get_driver_id_by_user( $user_id );

		if ( ! $driver_id ) {
			wp_send_json_error( array( 'message' => 'Driver not found' ) );
		}

		$now = current_time( 'timestamp' );

		// Query pending trip requests created in the last 60 seconds that notified this driver.
		$args = array(
			'post_type'   => 'tukitask_trip_req',
			'post_status' => 'publish',
			'meta_query'  => array(
				'relation' => 'AND',
				array(
					'key'     => '_trip_status',
					'value'   => 'pending',
					'compare' => '='
				),
				array(
					'key'     => '_notified_driver_id',
					'value'   => $driver_id,
					'compare' => '='
				),
				array(
					'key'     => '_trip_created_at',
					'value'   => $now - 60,
					'compare' => '>='
				)
			)
		);

		// Note: Serialized meta 'LIKE' is tricky. Let's reconsider. 
		// If we store each notified driver in a separate meta key '_notified_driver_ID', it's better.
		// But let's refine the query.

		$requests_query = new \WP_Query( $args );
		$active_requests = array();

		if ( $requests_query->have_posts() ) {
			while ( $requests_query->have_posts() ) {
				$requests_query->the_post();
				$id = get_the_ID();
				
				$active_requests[] = array(
					'id'             => $id,
					'title'          => get_the_title(),
					'price'          => get_post_meta( $id, '_trip_price', true ),
					'origin_address' => get_post_meta( $id, '_trip_origin_address', true ),
					'dest_address'   => get_post_meta( $id, '_trip_dest_address', true ),
					'created_at'     => get_post_meta( $id, '_trip_created_at', true ),
					'expires_in'     => 60 - ($now - get_post_meta( $id, '_trip_created_at', true ))
				);
			}
			wp_reset_postdata();
		}

		wp_send_json_success( $active_requests );
	}

	/**
	 * AJAX handler for a driver to accept a request.
	 */
	public function ajax_accept_trip_request() {
		check_ajax_referer( 'tukitask_driver_action', 'nonce' );

		if ( ! current_user_can( 'tukitask_driver_access' ) ) {
			wp_send_json_error( array( 'message' => 'Unauthorized' ) );
		}

		$request_id = isset( $_POST['request_id'] ) ? intval( $_POST['request_id'] ) : 0;
		$user_id = get_current_user_id();

		// Find driver ID
		$driver_id = $this->get_driver_id_by_user( $user_id );
		if ( ! $driver_id ) {
			wp_send_json_error( array( 'message' => __( 'No se encontró perfil de conductor.', 'tukitask-local-drivers' ) ) );
		}

		if ( ! $request_id || 'tukitask_trip_req' !== get_post_type( $request_id ) ) {
			wp_send_json_error( array( 'message' => __( 'Solicitud inválida.', 'tukitask-local-drivers' ) ) );
		}

		// Check if still pending and not expired.
		$status = get_post_meta( $request_id, '_trip_status', true );
		$created_at = get_post_meta( $request_id, '_trip_created_at', true );
		$now = current_time( 'timestamp' );

		if ( 'pending' !== $status ) {
			wp_send_json_error( array( 'message' => __( 'Este viaje ya ha sido aceptado por otro conductor.', 'tukitask-local-drivers' ) ) );
		}

		// ATOMIC LOCKING: Use add_post_meta with 'unique' flag as a mutex.
		// Successful only for the first driver to reach the DB.
		$lock_key = '_trip_acceptance_lock';
		$lock_success = add_post_meta( $request_id, $lock_key, $driver_id, true );

		if ( ! $lock_success ) {
			wp_send_json_error( array( 'message' => __( 'Este viaje ya ha sido aceptado por otro conductor (Race Condition).', 'tukitask-local-drivers' ) ) );
		}

		// Capacity Check for Batching
		if ( \Tukitask\LocalDrivers\Drivers\Driver_Manager::is_at_capacity( $driver_id ) ) {
			wp_send_json_error( array( 'message' => __( 'Has alcanzado tu capacidad máxima de 3 pedidos simultáneos.', 'tukitask-local-drivers' ) ) );
		}

		// Double Check Status after locking (belt and suspenders)
		$status = get_post_meta( $request_id, '_trip_status', true );
		if ( 'pending' !== $status ) {
			wp_send_json_error( array( 'message' => __( 'Este viaje ya no está disponible.', 'tukitask-local-drivers' ) ) );
		}

		// Finalize update
		update_post_meta( $request_id, '_trip_status', 'accepted' );
		update_post_meta( $request_id, '_trip_accepted_driver', $driver_id );
		update_post_meta( $request_id, '_trip_accepted_at', $now );

		// Update driver status to en_viaje if they were available
		Driver_Availability::update_driver_status( $driver_id, 'en_viaje' );

		wp_send_json_success( array(
			'message'    => __( '¡Viaje aceptado! Dirígete al origen.', 'tukitask-local-drivers' ),
			'request_id' => $request_id
		) );
	}

	/**
	 * Get driver ID by user ID.
	 */
	private function get_driver_id_by_user( $user_id ) {
		$driver_query = new \WP_Query( array(
			'post_type'      => 'tukitask_driver',
			'posts_per_page' => 1,
			'meta_key'       => '_driver_user_id',
			'meta_value'     => $user_id,
			'fields'         => 'ids'
		) );
		return ! empty( $driver_query->posts ) ? $driver_query->posts[0] : false;
	}
}
