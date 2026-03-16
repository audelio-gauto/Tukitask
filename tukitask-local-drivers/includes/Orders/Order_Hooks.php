<?php
/**
 * Order Hooks and Integration.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

/**
 * Order_Hooks Class.
 *
 * Manages WooCommerce order hooks and driver assignment metadata.
 */
class Order_Hooks {

	/**
	 * Notifica por push a driver y vendedor según evento y estado.
	 */
	private function notify_push_event($order, $event) {
		if (!$order) return;
		$order_id = $order->get_id();
		$driver_id = $order->get_meta('_assigned_driver_id');
		$vendor_id = $order->get_meta('_vendor_user_id');
		$order_number = $order->get_order_number();
		$order_url_driver = home_url('/driver-dashboard/?order_id=' . $order_id);
		$order_url_vendor = home_url('/vendedor-dashboard/?order_id=' . $order_id);

		// Mensajes personalizados por evento y rol
		$events = [
			'new_order' => [
				'vendor' => [
					'title' => '¡Tienes un nuevo pedido!',
					'body'  => 'Pedido #' . $order_number . ' recibido. Prepáralo para el conductor.',
					'url'   => $order_url_vendor
				],
				'driver' => [
					'title' => 'Nuevo pedido disponible',
					'body'  => 'Hay un nuevo pedido para asignar.',
					'url'   => $order_url_driver
				]
			],
			'assigned' => [
				'vendor' => [
					'title' => 'Conductor asignado',
					'body'  => 'Un conductor fue asignado al pedido #' . $order_number . '.',
					'url'   => $order_url_vendor
				],
				'driver' => [
					'title' => '¡Te asignaron un pedido!',
					'body'  => 'Revisa el pedido #' . $order_number . ' en tu panel.',
					'url'   => $order_url_driver
				]
			],
			'ready' => [
				'vendor' => [
					'title' => 'Pedido listo para retiro',
					'body'  => 'El pedido #' . $order_number . ' está listo para el conductor.',
					'url'   => $order_url_vendor
				],
				'driver' => [
					'title' => 'Pedido listo para retiro',
					'body'  => 'El pedido #' . $order_number . ' está listo para recoger.',
					'url'   => $order_url_driver
				]
			],
			'completed' => [
				'vendor' => [
					'title' => 'Pedido entregado',
					'body'  => 'El pedido #' . $order_number . ' fue entregado.',
					'url'   => $order_url_vendor
				],
				'driver' => [
					'title' => '¡Entrega completada!',
					'body'  => 'Entregaste el pedido #' . $order_number . '.',
					'url'   => $order_url_driver
				]
			],
			'cancelled' => [
				'vendor' => [
					'title' => 'Pedido cancelado',
					'body'  => 'El pedido #' . $order_number . ' fue cancelado.',
					'url'   => $order_url_vendor
				],
				'driver' => [
					'title' => 'Pedido cancelado',
					'body'  => 'El pedido #' . $order_number . ' fue cancelado.',
					'url'   => $order_url_driver
				]
			]
		];

		if (isset($events[$event]['vendor']) && $vendor_id) {
			\Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
				$vendor_id,
				$events[$event]['vendor']['title'],
				$events[$event]['vendor']['body'],
				$events[$event]['vendor']['url']
			);
		}
		if (isset($events[$event]['driver']) && $driver_id) {
			\Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
				$driver_id,
				$events[$event]['driver']['title'],
				$events[$event]['driver']['body'],
				$events[$event]['driver']['url']
			);
		}
	}

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'woocommerce_checkout_update_order_meta', $this, 'save_shipping_metadata', 10, 2 );
		$loader->add_action( 'woocommerce_admin_order_data_after_shipping_address', $this, 'display_driver_info_in_admin' );
		$loader->add_filter( 'woocommerce_order_details_after_order_table', $this, 'display_driver_info_frontend' );
		$loader->add_action( 'add_meta_boxes', $this, 'add_driver_assignment_meta_box' );
		$loader->add_action( 'save_post_shop_order', $this, 'save_driver_assignment', 10, 2 );
		$loader->add_action( 'woocommerce_process_shop_order_meta', $this, 'save_driver_assignment_hpos', 10, 2 );
		$loader->add_action( 'woocommerce_order_status_changed', $this, 'handle_order_status_change', 10, 4 );
		// Public hook for push notifications from other components (Auto_Assign, etc.)
		add_action( 'tukitask_notify_order_event', array( $this, 'public_notify_push_event' ), 10, 2 );
	}

	/**
	 * Public wrapper for push notifications accessible via action hook.
	 *
	 * @param \WC_Order $order Order object.
	 * @param string    $event Event name.
	 */
	public function public_notify_push_event( $order, $event ) {
		$this->notify_push_event( $order, $event );
	}

	/**
	 * Save shipping metadata when order is created.
	 *
	 * @param int   $order_id Order ID.
	 * @param array $data     Posted data.
	 */
	public function save_shipping_metadata( $order_id, $data ) {
		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return;
		}

		// Get coordinates for the shipping address.
		$coords = \Tukitask\LocalDrivers\Helpers\Geo::get_order_coordinates( $order );

		if ( $coords ) {
			$order->update_meta_data( '_shipping_lat', $coords['lat'] );
			$order->update_meta_data( '_shipping_lng', $coords['lng'] );
		}

		// Store vendor user ID from product author for push notifications.
		if ( ! $order->get_meta( '_vendor_user_id' ) ) {
			foreach ( $order->get_items() as $item ) {
				$product_id = $item->get_product_id();
				if ( $product_id ) {
					$vendor_user_id = get_post_field( 'post_author', $product_id );
					if ( $vendor_user_id ) {
						$order->update_meta_data( '_vendor_user_id', intval( $vendor_user_id ) );
						break;
					}
				}
			}
		}
		
		// Generate Validation Codes if they don't exist
		if ( ! $order->get_meta( '_codigo_vendedor' ) ) {
			$order->update_meta_data( '_codigo_vendedor', strtoupper( wp_generate_password( 6, false ) ) );
		}
		
		if ( ! $order->get_meta( '_codigo_cliente' ) ) {
			$order->update_meta_data( '_codigo_cliente', strtoupper( wp_generate_password( 6, false ) ) );
		}
		
		$order->save();
	}

	/**
	 * Display driver information in admin order page.
	 *
	 * @param \WC_Order $order Order object.
	 */
	public function display_driver_info_in_admin( $order ) {
		$driver_id = $order->get_meta( '_assigned_driver_id' );

		if ( ! $driver_id ) {
			echo '<p><strong>' . esc_html__( 'Conductor Asignado:', 'tukitask-local-drivers' ) . '</strong> ';
			echo '<span style="color:#999;">' . esc_html__( 'Sin asignar', 'tukitask-local-drivers' ) . '</span></p>';
			return;
		}

		$driver_name = get_the_title( $driver_id );
		$driver_link = get_edit_post_link( $driver_id );
		$driver_phone = get_post_meta( $driver_id, '_driver_phone', true );
		$driver_vehicle = get_post_meta( $driver_id, '_driver_vehicle', true );
		$assigned_at = $order->get_meta( '_driver_assigned_at' );

		echo '<div style="background:#f9f9f9;padding:10px;margin:10px 0;border-left:3px solid #46b450;">';
		echo '<p><strong>' . esc_html__( 'Conductor Asignado:', 'tukitask-local-drivers' ) . '</strong></p>';
		echo '<p><a href="' . esc_url( $driver_link ) . '" target="_blank">' . esc_html( $driver_name ) . '</a></p>';

		if ( $driver_vehicle ) {
			echo '<p><strong>' . esc_html__( 'Vehículo:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( $driver_vehicle ) . '</p>';
		}

		if ( $driver_phone ) {
			echo '<p><strong>' . esc_html__( 'Teléfono:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( $driver_phone ) . '</p>';
		}

		if ( $assigned_at ) {
			echo '<p><strong>' . esc_html__( 'Asignado:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( human_time_diff( $assigned_at, current_time( 'timestamp' ) ) ) . ' ' . esc_html__( 'atrás', 'tukitask-local-drivers' ) . '</p>';
		}

		echo '</div>';
	}

	/**
	 * Display driver information on frontend order details.
	 *
	 * @param \WC_Order $order Order object.
	 */
	public function display_driver_info_frontend( $order ) {
		$driver_id = $order->get_meta( '_assigned_driver_id' );

		if ( ! $driver_id ) {
			return;
		}

		$driver_name = get_the_title( $driver_id );
		$driver_phone = get_post_meta( $driver_id, '_driver_phone', true );
		$driver_vehicle = get_post_meta( $driver_id, '_driver_vehicle', true );

		echo '<section class="woocommerce-driver-info" style="margin-top:20px;padding:15px;background:#f9f9f9;border-left:3px solid #46b450;">';
		echo '<h2>' . esc_html__( 'Información del Conductor', 'tukitask-local-drivers' ) . '</h2>';
		echo '<p><strong>' . esc_html__( 'Conductor:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( $driver_name ) . '</p>';

		if ( $driver_vehicle ) {
			echo '<p><strong>' . esc_html__( 'Vehículo:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( $driver_vehicle ) . '</p>';
		}

		if ( $driver_phone ) {
			echo '<p><strong>' . esc_html__( 'Contacto:', 'tukitask-local-drivers' ) . '</strong> ' . esc_html( $driver_phone ) . '</p>';
		}

		echo '</section>';
	}

	/**
	 * Add driver assignment meta box to order edit screen.
	 */
	public function add_driver_assignment_meta_box() {
		add_meta_box(
			'tukitask_driver_assignment',
			__( 'Asignación de Conductor', 'tukitask-local-drivers' ),
			array( $this, 'render_driver_assignment_meta_box' ),
			'shop_order',
			'side',
			'high'
		);

		// HPOS compatibility.
		if ( class_exists( 'Automattic\WooCommerce\Utilities\OrderUtil' ) && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled() ) {
			add_meta_box(
				'tukitask_driver_assignment',
				__( 'Asignación de Conductor', 'tukitask-local-drivers' ),
				array( $this, 'render_driver_assignment_meta_box' ),
				'woocommerce_page_wc-orders',
				'side',
				'high'
			);
		}
	}

	/**
	 * Render driver assignment meta box.
	 *
	 * @param \WP_Post|\WC_Order $post_or_order Post or Order object.
	 */
	public function render_driver_assignment_meta_box( $post_or_order ) {
		$order = $post_or_order instanceof \WC_Order ? $post_or_order : wc_get_order( $post_or_order->ID );

		if ( ! $order ) {
			return;
		}

		wp_nonce_field( 'tukitask_driver_assignment', 'tukitask_driver_assignment_nonce' );

		$assigned_driver = $order->get_meta( '_assigned_driver_id' );

		// Get all drivers.
		$drivers = get_posts(
			array(
				'post_type'      => 'tukitask_driver',
				'posts_per_page' => -1,
				'post_status'    => 'publish',
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);

		?>
		<p>
			<label for="assigned_driver_id"><strong><?php esc_html_e( 'Seleccionar Conductor:', 'tukitask-local-drivers' ); ?></strong></label>
			<select name="assigned_driver_id" id="assigned_driver_id" style="width:100%;">
				<option value=""><?php esc_html_e( '— Sin asignar —', 'tukitask-local-drivers' ); ?></option>
				<?php foreach ( $drivers as $driver ) : ?>
					<option value="<?php echo esc_attr( $driver->ID ); ?>" <?php selected( $assigned_driver, $driver->ID ); ?>>
						<?php echo esc_html( $driver->post_title ); ?>
					</option>
				<?php endforeach; ?>
			</select>
		</p>
		<p class="description">
			<?php esc_html_e( 'Asignar manualmente un conductor a este pedido.', 'tukitask-local-drivers' ); ?>
		</p>
		<?php
	}

	/**
	 * Save driver assignment from meta box.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post object.
	 */
	public function save_driver_assignment( $post_id, $post ) {
		// Verify nonce.
		if ( ! isset( $_POST['tukitask_driver_assignment_nonce'] ) || ! wp_verify_nonce( $_POST['tukitask_driver_assignment_nonce'], 'tukitask_driver_assignment' ) ) {
			return;
		}

		// Check autosave.
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		// Check permissions.
		if ( ! current_user_can( 'edit_shop_orders', $post_id ) ) {
			return;
		}

		$order = wc_get_order( $post_id );

		if ( ! $order ) {
			return;
		}

		$new_driver_id = isset( $_POST['assigned_driver_id'] ) ? intval( $_POST['assigned_driver_id'] ) : 0;
		$old_driver_id = intval( $order->get_meta( '_assigned_driver_id' ) );

		if ( $new_driver_id === $old_driver_id ) {
			return;
		}

		// 1. Handle Old Driver (Unassign)
		if ( $old_driver_id ) {
			delete_post_meta( $old_driver_id, '_driver_active_trip' );
			$old_status = get_post_meta( $old_driver_id, '_driver_status', true );
			
			// Only set to available if they were 'en_viaje'. If they were 'offline', keep them offline.
			if ( 'en_viaje' === $old_status ) {
				update_post_meta( $old_driver_id, '_driver_status', 'available' );
			}
			
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
		}

		// 2. Handle New Driver (Assign)
		if ( $new_driver_id ) {
			// Update Order
			$order->update_meta_data( '_assigned_driver_id', $new_driver_id );
			$order->update_meta_data( '_driver_assigned_at', current_time( 'timestamp' ) );
			$order->update_meta_data( '_driver_assignment_method', 'manual' );
			
			// Update Driver Status
			update_post_meta( $new_driver_id, '_driver_active_trip', $order->get_id() );
			update_post_meta( $new_driver_id, '_driver_status', 'en_viaje' );
			
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
			
			// Fire Action (Notifications etc)
			do_action( 'tukitask_driver_assigned', $order->get_id(), $new_driver_id );
		} else {
			// No new driver selected (Unassign only)
			$order->delete_meta_data( '_assigned_driver_id' );
			$order->delete_meta_data( '_driver_assigned_at' );
			$order->delete_meta_data( '_driver_assignment_method' );
		}

		$order->save();
	}

	/**
	 * Save driver assignment from meta box (HPOS compatible).
	 *
	 * @param int             $order_id Order ID.
	 * @param WC_Order|object $order    Order object.
	 */
	public function save_driver_assignment_hpos( $order_id, $order ) {
		// Verify nonce.
		if ( ! isset( $_POST['tukitask_driver_assignment_nonce'] ) || ! wp_verify_nonce( $_POST['tukitask_driver_assignment_nonce'], 'tukitask_driver_assignment' ) ) {
			return;
		}

		// Check permissions.
		if ( ! current_user_can( 'edit_shop_orders', $order_id ) ) {
			return;
		}

		if ( ! $order instanceof \WC_Order ) {
			$order = wc_get_order( $order_id );
		}

		if ( ! $order ) {
			return;
		}

		$new_driver_id = isset( $_POST['assigned_driver_id'] ) ? intval( $_POST['assigned_driver_id'] ) : 0;
		$old_driver_id = intval( $order->get_meta( '_assigned_driver_id' ) );

		if ( $new_driver_id === $old_driver_id ) {
			return;
		}

		// 1. Handle Old Driver (Unassign)
		if ( $old_driver_id ) {
			delete_post_meta( $old_driver_id, '_driver_active_trip' );
			$old_status = get_post_meta( $old_driver_id, '_driver_status', true );
			
			// Only set to available if they were 'en_viaje'. If they were 'offline', keep them offline.
			if ( 'en_viaje' === $old_status ) {
				update_post_meta( $old_driver_id, '_driver_status', 'available' );
			}
			
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
		}

		// 2. Handle New Driver (Assign)
		if ( $new_driver_id ) {
			// Update Order
			$order->update_meta_data( '_assigned_driver_id', $new_driver_id );
			$order->update_meta_data( '_driver_assigned_at', current_time( 'timestamp' ) );
			$order->update_meta_data( '_driver_assignment_method', 'manual' );
			
			// Update Driver Status
			update_post_meta( $new_driver_id, '_driver_active_trip', $order->get_id() );
			update_post_meta( $new_driver_id, '_driver_status', 'en_viaje' );
			
			\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
			
			// Fire Action (Notifications etc)
			do_action( 'tukitask_driver_assigned', $order->get_id(), $new_driver_id );
		} else {
			// No new driver selected (Unassign only)
			$order->delete_meta_data( '_assigned_driver_id' );
			$order->delete_meta_data( '_driver_assigned_at' );
			$order->delete_meta_data( '_driver_assignment_method' );
		}

		$order->save();
	}

	/**
	 * Handle order status changes.
	 *
	 * @param int    $order_id   Order ID.
	 * @param string $old_status Old status.
	 * @param string $new_status New status.
	 * @param object $order      Order object.
	 */
	public function handle_order_status_change( $order_id, $old_status, $new_status, $order ) {
		// Notificar por push según evento de estado
		if ( 'processing' === $new_status ) {
			$this->notify_push_event($order, 'new_order');
		}
		if ( 'en-camino' === $new_status || 'listo-para-envio' === $new_status ) {
			$this->notify_push_event($order, 'ready');
		}
		if ( 'completed' === $new_status ) {
			$this->notify_push_event($order, 'completed');
			// Credit vendor earnings
			\Tukitask\LocalDrivers\Drivers\Wallet_Manager::add_vendor_earning( $order );
			$driver_id = $order->get_meta( '_assigned_driver_id' );
			if ( $driver_id ) {
				// ADD EARNING TO WALLET (PRO PRODUCTION FIX)
				\Tukitask\LocalDrivers\Drivers\Wallet_Manager::add_driver_earning( $order, $driver_id );
				$total_deliveries = get_post_meta( $driver_id, '_driver_total_deliveries', true );
				$total_deliveries = $total_deliveries ? intval( $total_deliveries ) : 0;
				update_post_meta( $driver_id, '_driver_total_deliveries', $total_deliveries + 1 );
				// Clear active trip.
				delete_post_meta( $driver_id, '_driver_active_trip' );
				// Set driver back to available and clear cache.
				update_post_meta( $driver_id, '_driver_status', 'available' );
				\Tukitask\LocalDrivers\Drivers\Driver_Availability::clear_available_drivers_cache();
			}
		}
		if ( 'cancelled' === $new_status ) {
			$this->notify_push_event($order, 'cancelled');
			$driver_id = $order->get_meta( '_assigned_driver_id' );
			if ( $driver_id ) {
				delete_post_meta( $driver_id, '_driver_active_trip' );
				$driver_status = get_post_meta( $driver_id, '_driver_status', true );
				if ( 'en_viaje' === $driver_status ) {
					update_post_meta( $driver_id, '_driver_status', 'available' );
				}
			}
		}
	}
}
