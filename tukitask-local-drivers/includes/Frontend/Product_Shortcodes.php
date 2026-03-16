<?php
/**
 * Frontend Product Shortcodes.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Proximity_Manager;
use Tukitask\LocalDrivers\Helpers\Geo;
use Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode;
use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Product_Shortcodes Class.
 *
 * Implements [llega_hoy_productos] and [tienda_movil_cerca] shortcodes.
 */
class Product_Shortcodes {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_shortcode( 'llega_hoy_productos', $this, 'render_llega_hoy_products' );
		$loader->add_shortcode( 'tienda_movil_cerca', $this, 'render_tienda_movil_cerca' );
		$loader->add_shortcode( 'productos_cercanos', $this, 'render_productos_cercanos' );
		
		// AJAX handler for quick add to cart
		$loader->add_action( 'wp_ajax_tukitask_quick_add_to_cart', $this, 'ajax_quick_add_to_cart' );
		$loader->add_action( 'wp_ajax_nopriv_tukitask_quick_add_to_cart', $this, 'ajax_quick_add_to_cart' );
	}

	/**
	 * AJAX handler for quick add to cart.
	 */
	public function ajax_quick_add_to_cart() {
		check_ajax_referer( 'tukitask_quick_cart', 'security' );
		
		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		
		if ( ! $product_id ) {
			wp_send_json_error( array( 'message' => __( 'Producto no válido.', 'tukitask-local-drivers' ) ) );
		}
		
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado.', 'tukitask-local-drivers' ) ) );
		}
		
		$added = WC()->cart->add_to_cart( $product_id );
		
		if ( $added ) {
			wp_send_json_success( array(
				'message'    => __( 'Producto agregado al carrito.', 'tukitask-local-drivers' ),
				'cart_url'   => wc_get_cart_url(),
				'cart_count' => WC()->cart->get_cart_contents_count(),
			) );
		} else {
			wp_send_json_error( array( 'message' => __( 'No se pudo agregar el producto.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * Render [llega_hoy_productos] shortcode.
	 */
	public function render_llega_hoy_products( $atts ) {
		$location = Geo::get_current_customer_location();
		if ( ! $location ) {
			return '<p>' . __( 'Por favor, activa tu ubicación para ver productos con entrega hoy.', 'tukitask-local-drivers' ) . '</p>';
		}

		$nearby_drivers = Proximity_Manager::get_nearby_drivers( $location['lat'], $location['lng'] );
		if ( empty( $nearby_drivers ) ) {
			return '<p>' . __( 'No hay conductores disponibles cerca de tu ubicación actualmente.', 'tukitask-local-drivers' ) . '</p>';
		}

		// Query all products (simplified: showing those that could be delivered)
		$args = array(
			'post_type'      => 'product',
			'posts_per_page' => 8,
			'post_status'    => 'publish',
		);

		$query = new \WP_Query( $args );
		
		if ( ! $query->have_posts() ) {
			return '';
		}

		ob_start();
		echo '<div class="tukitask-shortcode-products llega-hoy-grid">';
		echo '<h3>' . __( 'Productos con Entrega Hoy', 'tukitask-local-drivers' ) . '</h3>';
		woocommerce_product_loop_start();
		while ( $query->have_posts() ) {
			$query->the_post();
			wc_get_template_part( 'content', 'product' );
		}
		woocommerce_product_loop_end();
		echo '</div>';
		wp_reset_postdata();

		return ob_get_clean();
	}

	/**
	 * Render [tienda_movil_cerca] shortcode.
	 */
	public function render_tienda_movil_cerca( $atts ) {
		$location = Geo::get_current_customer_location();
		if ( ! $location ) {
			return '';
		}

		$nearby_drivers = Proximity_Manager::get_nearby_drivers( $location['lat'], $location['lng'] );
		if ( empty( $nearby_drivers ) ) {
			return '';
		}

		$mobile_product_ids = array();
		
		foreach ( $nearby_drivers as $driver_data ) {
			$driver_id = $driver_data['id'];
			$is_mobile_active = get_post_meta( $driver_id, '_mobile_store_active', true ) === 'yes';
			
			if ( $is_mobile_active ) {
				$stock = get_post_meta( $driver_id, '_driver_mobile_stock_products', true );
				if ( is_array( $stock ) ) {
					$mobile_product_ids = array_merge( $mobile_product_ids, $stock );
				}
			}
		}

		$mobile_product_ids = array_unique( array_map( 'intval', $mobile_product_ids ) );

		if ( empty( $mobile_product_ids ) ) {
			return '';
		}

		$args = array(
			'post_type'      => 'product',
			'posts_per_page' => 8,
			'post_status'    => 'publish',
			'post__in'       => $mobile_product_ids,
			'orderby'        => 'post__in'
		);

		$query = new \WP_Query( $args );
		
		if ( ! $query->have_posts() ) {
			return '';
		}

		ob_start();
		echo '<div class="tukitask-shortcode-products tienda-movil-grid">';
		echo '<h3>' . __( 'Tiendas Móviles Cerca de Ti', 'tukitask-local-drivers' ) . '</h3>';
		
		woocommerce_product_loop_start();
		while ( $query->have_posts() ) {
			$query->the_post();
			$id = get_the_ID();
			
			// Custom distance display for this shortcode
			$dist_text = '';
			foreach ( $nearby_drivers as $driver_data ) {
				$d_stock = get_post_meta( $driver_data['id'], '_driver_mobile_stock_products', true );
				if ( is_array($d_stock) && in_array($id, $d_stock) ) {
					$dist_text = sprintf( __( 'a %s metros de ti', 'tukitask-local-drivers' ), round($driver_data['distance'] * 1000) );
					break;
				}
			}

			echo '<div class="tienda-movil-item">';
			wc_get_template_part( 'content', 'product' );
			if ( $dist_text ) {
				echo '<span class="mobile-distance-tag">' . esc_html( $dist_text ) . '</span>';
			}
			echo '</div>';
		}
		woocommerce_product_loop_end();
		echo '</div>';
		wp_reset_postdata();

		return ob_get_clean();
	}

	/**
	 * Render [productos_cercanos] shortcode - Shows products from traveling vendors and nearby drivers.
	 * 
	 * Usage: [productos_cercanos limit="12" show_distance="yes"]
	 */
	public function render_productos_cercanos( $atts ) {
		$atts = shortcode_atts( array(
			'limit'         => 12,
			'show_distance' => 'yes',
		), $atts );

		$location = Geo::get_current_customer_location();
		
		ob_start();
		$this->output_productos_cercanos_styles();
		
		if ( ! $location ) {
			echo $this->render_location_request_ui();
			return ob_get_clean();
		}

		$products_data = $this->get_nearby_products_with_details( $location, intval( $atts['limit'] ) );

		if ( empty( $products_data ) ) {
			echo '<div class="tuki-no-products">
				<div class="tuki-no-products-icon">📍</div>
				<h3>' . esc_html__( 'No hay productos disponibles cerca', 'tukitask-local-drivers' ) . '</h3>
				<p>' . esc_html__( 'No encontramos vendedores o drivers cerca de tu ubicación en este momento.', 'tukitask-local-drivers' ) . '</p>
			</div>';
			return ob_get_clean();
		}

		echo '<div class="tuki-productos-cercanos">';
		
		// Section: Vendors traveling nearby (highest priority - immediate delivery)
		$vendor_products = array_filter( $products_data, function( $p ) {
			return $p['source'] === 'vendor_traveling';
		});
		
		if ( ! empty( $vendor_products ) ) {
			echo '<div class="tuki-section vendor-traveling">';
			echo '<div class="tuki-section-header">';
			echo '<h2><span class="pulse-dot"></span>' . esc_html__( '🚗 Vendedores Cerca de Ti', 'tukitask-local-drivers' ) . '</h2>';
			echo '<span class="section-badge live">' . esc_html__( 'EN VIVO', 'tukitask-local-drivers' ) . '</span>';
			echo '</div>';
			echo '<div class="tuki-products-grid">';
			foreach ( $vendor_products as $product_data ) {
				$this->render_product_card( $product_data, 'vendor_traveling' );
			}
			echo '</div></div>';
		}

		// Section: Llega Hoy (driver near store)
		$llega_hoy_products = array_filter( $products_data, function( $p ) {
			return $p['source'] === 'llega_hoy';
		});
		
		if ( ! empty( $llega_hoy_products ) ) {
			echo '<div class="tuki-section llega-hoy">';
			echo '<div class="tuki-section-header">';
			echo '<h2>⚡ ' . esc_html__( 'Llega Hoy', 'tukitask-local-drivers' ) . '</h2>';
			echo '<span class="section-badge fast">' . esc_html__( 'RÁPIDO', 'tukitask-local-drivers' ) . '</span>';
			echo '</div>';
			echo '<div class="tuki-products-grid">';
			foreach ( $llega_hoy_products as $product_data ) {
				$this->render_product_card( $product_data, 'llega_hoy' );
			}
			echo '</div></div>';
		}

		// Section: Mobile store products
		$mobile_products = array_filter( $products_data, function( $p ) {
			return $p['source'] === 'tienda_movil';
		});
		
		if ( ! empty( $mobile_products ) ) {
			echo '<div class="tuki-section tienda-movil">';
			echo '<div class="tuki-section-header">';
			echo '<h2>📦 ' . esc_html__( 'Tiendas Móviles', 'tukitask-local-drivers' ) . '</h2>';
			echo '<span class="section-badge mobile">' . esc_html__( 'EN RUTA', 'tukitask-local-drivers' ) . '</span>';
			echo '</div>';
			echo '<div class="tuki-products-grid">';
			foreach ( $mobile_products as $product_data ) {
				$this->render_product_card( $product_data, 'tienda_movil' );
			}
			echo '</div></div>';
		}

		echo '</div>';
		
		// JavaScript for real-time updates
		$this->output_productos_cercanos_js( $location );

		return ob_get_clean();
	}

	/**
	 * Get nearby products with full details.
	 */
	private function get_nearby_products_with_details( $location, $limit ) {
		$products = array();
		
		// 1. Get products from traveling vendors
		$traveling_vendors = \Tukitask\LocalDrivers\Mobile_Store\Vendor_Travel_Mode::find_nearby_traveling_vendors( 
			$location['lat'], 
			$location['lng'] 
		);
		
		foreach ( $traveling_vendors as $vendor ) {
			$vendor_products = get_posts( array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'author'         => $vendor['vendor_id'],
				'posts_per_page' => 4,
				'meta_query'     => array(
					array(
						'key'     => '_tukitask_is_mobile_stock',
						'value'   => 'yes',
						'compare' => '='
					)
				)
			));
			
			foreach ( $vendor_products as $p ) {
				$_product = wc_get_product( $p->ID );
				if ( ! $_product ) continue;
				
				$products[] = array(
					'id'           => $p->ID,
					'title'        => $p->post_title,
					'price'        => $_product->get_price(),
					'price_html'   => $_product->get_price_html(),
					'image'        => wp_get_attachment_url( $_product->get_image_id() ),
					'permalink'    => get_permalink( $p->ID ),
					'distance'     => $vendor['distance'],
					'distance_m'   => round( $vendor['distance'] * 1000 ),
					'source'       => 'vendor_traveling',
					'vendor_name'  => $vendor['name'],
					'vendor_id'    => $vendor['vendor_id'],
				);
			}
		}
		
		// 2. Get products with "Llega Hoy" status (driver near store)
		$llega_hoy_vendors = $this->get_vendors_with_llega_hoy_active();
		
		foreach ( $llega_hoy_vendors as $vendor_data ) {
			$vendor_products = get_posts( array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'author'         => $vendor_data['vendor_id'],
				'posts_per_page' => 4,
			));
			
			foreach ( $vendor_products as $p ) {
				// Skip if already added from traveling vendor
				if ( in_array( $p->ID, array_column( $products, 'id' ) ) ) continue;
				
				$_product = wc_get_product( $p->ID );
				if ( ! $_product ) continue;
				
				$products[] = array(
					'id'           => $p->ID,
					'title'        => $p->post_title,
					'price'        => $_product->get_price(),
					'price_html'   => $_product->get_price_html(),
					'image'        => wp_get_attachment_url( $_product->get_image_id() ),
					'permalink'    => get_permalink( $p->ID ),
					'distance'     => $vendor_data['driver_distance'],
					'distance_m'   => round( $vendor_data['driver_distance'] * 1000 ),
					'source'       => 'llega_hoy',
					'vendor_name'  => get_userdata( $vendor_data['vendor_id'] )->display_name,
					'vendor_id'    => $vendor_data['vendor_id'],
					'driver_id'    => $vendor_data['driver_id'],
				);
			}
		}
		
		// 3. Get mobile store products from drivers
		$nearby_drivers = \Tukitask\LocalDrivers\Drivers\Driver_Availability::get_available_drivers( 
			$location['lat'], 
			$location['lng'],
			floatval( get_option( 'tukitask_ld_mobile_store_radius', 5 ) )
		);
		
		foreach ( $nearby_drivers as $driver_data ) {
			$driver_id = $driver_data['id'];
			$is_mobile_active = get_post_meta( $driver_id, '_mobile_store_active', true ) === 'yes';
			
			if ( ! $is_mobile_active ) continue;
			
			$mobile_stock = get_post_meta( $driver_id, '_driver_mobile_stock_products', true );
			if ( ! is_array( $mobile_stock ) ) continue;
			
			foreach ( $mobile_stock as $product_id ) {
				// Skip if already added
				if ( in_array( $product_id, array_column( $products, 'id' ) ) ) continue;
				
				$_product = wc_get_product( $product_id );
				if ( ! $_product ) continue;
				
				$products[] = array(
					'id'           => $product_id,
					'title'        => $_product->get_name(),
					'price'        => $_product->get_price(),
					'price_html'   => $_product->get_price_html(),
					'image'        => wp_get_attachment_url( $_product->get_image_id() ),
					'permalink'    => get_permalink( $product_id ),
					'distance'     => $driver_data['distance'],
					'distance_m'   => round( $driver_data['distance'] * 1000 ),
					'source'       => 'tienda_movil',
					'driver_name'  => get_the_title( $driver_id ),
					'driver_id'    => $driver_id,
				);
			}
		}
		
		// Sort by distance
		usort( $products, function( $a, $b ) {
			return $a['distance'] <=> $b['distance'];
		});
		
		return array_slice( $products, 0, $limit );
	}

	/**
	 * Get vendors with "Llega Hoy" active (driver near their store).
	 */
	private function get_vendors_with_llega_hoy_active() {
		global $wpdb;
		
		$vendors = array();
		
		// Get all transients for llega_hoy
		$results = $wpdb->get_results(
			"SELECT option_name, option_value FROM {$wpdb->options} 
			 WHERE option_name LIKE '_transient_tukitask_store_proximity_llega_hoy_%'",
			ARRAY_A
		);
		
		foreach ( $results as $row ) {
			$data = maybe_unserialize( $row['option_value'] );
			if ( ! empty( $data['active'] ) ) {
				// Extract vendor_id from option name
				$vendor_id = intval( str_replace( '_transient_tukitask_store_proximity_llega_hoy_', '', $row['option_name'] ) );
				if ( $vendor_id > 0 ) {
					$vendors[] = array(
						'vendor_id'       => $vendor_id,
						'driver_id'       => $data['driver_id'] ?? 0,
						'driver_distance' => $data['distance'] ?? 0,
					);
				}
			}
		}
		
		return $vendors;
	}

	/**
	 * Render a product card.
	 */
	private function render_product_card( $product_data, $type ) {
		$badge_class = '';
		$badge_text = '';
		$badge_icon = '';
		
		switch ( $type ) {
			case 'vendor_traveling':
				$badge_class = 'badge-vendor-near';
				$badge_text = __( 'VENDEDOR CERCA', 'tukitask-local-drivers' );
				$badge_icon = '🚗';
				break;
			case 'llega_hoy':
				$badge_class = 'badge-llega-hoy';
				$badge_text = __( 'LLEGA HOY', 'tukitask-local-drivers' );
				$badge_icon = '⚡';
				break;
			case 'tienda_movil':
				$badge_class = 'badge-mobile';
				$badge_text = __( 'EN MOVIMIENTO', 'tukitask-local-drivers' );
				$badge_icon = '📦';
				break;
		}
		
		$distance_text = $product_data['distance_m'] < 1000 
			? sprintf( __( '%d metros', 'tukitask-local-drivers' ), $product_data['distance_m'] )
			: sprintf( __( '%.1f km', 'tukitask-local-drivers' ), $product_data['distance'] );
		
		$image_url = $product_data['image'] ?: wc_placeholder_img_src();
		?>
		<div class="tuki-product-card" data-product-id="<?php echo esc_attr( $product_data['id'] ); ?>">
			<div class="tuki-card-image">
				<img src="<?php echo esc_url( $image_url ); ?>" alt="<?php echo esc_attr( $product_data['title'] ); ?>">
				<div class="tuki-card-badge <?php echo esc_attr( $badge_class ); ?>">
					<span class="badge-icon"><?php echo $badge_icon; ?></span>
					<span class="badge-text"><?php echo esc_html( $badge_text ); ?></span>
				</div>
			</div>
			
			<div class="tuki-card-content">
				<h3 class="tuki-card-title"><?php echo esc_html( $product_data['title'] ); ?></h3>
				
				<div class="tuki-card-meta">
					<span class="tuki-price"><?php echo wp_kses_post( $product_data['price_html'] ); ?></span>
					<span class="tuki-distance">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
							<circle cx="12" cy="10" r="3"></circle>
						</svg>
						<?php echo esc_html( $distance_text ); ?>
					</span>
				</div>
				
				<?php if ( ! empty( $product_data['vendor_name'] ) ) : ?>
				<div class="tuki-card-vendor">
					<small><?php echo esc_html( $product_data['vendor_name'] ); ?></small>
				</div>
				<?php endif; ?>
				
				<a href="<?php echo esc_url( add_query_arg( 'add-to-cart', $product_data['id'], wc_get_cart_url() ) ); ?>" 
				   class="tuki-buy-now-btn" 
				   data-product-id="<?php echo esc_attr( $product_data['id'] ); ?>">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="9" cy="21" r="1"></circle>
						<circle cx="20" cy="21" r="1"></circle>
						<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
					</svg>
					<?php esc_html_e( 'Comprar Ahora', 'tukitask-local-drivers' ); ?>
				</a>
			</div>
		</div>
		<?php
	}

	/**
	 * Render location request UI.
	 */
	private function render_location_request_ui() {
		return '
		<div class="tuki-location-request">
			<div class="tuki-location-icon">📍</div>
			<h3>' . esc_html__( '¿Qué hay cerca de ti?', 'tukitask-local-drivers' ) . '</h3>
			<p>' . esc_html__( 'Activa tu ubicación para ver productos de vendedores y drivers cerca de ti con entrega inmediata.', 'tukitask-local-drivers' ) . '</p>
			<button type="button" class="tuki-enable-location-btn" onclick="tukiRequestLocation()">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
					<circle cx="12" cy="10" r="3"></circle>
				</svg>
				' . esc_html__( 'Activar Ubicación', 'tukitask-local-drivers' ) . '
			</button>
		</div>
		<script>
		function tukiRequestLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(function(pos) {
					// Store in cookie/localStorage and reload
					document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
					document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
					location.reload();
				}, function(err) {
					alert("' . esc_js( __( 'No pudimos obtener tu ubicación. Por favor activa los permisos de ubicación.', 'tukitask-local-drivers' ) ) . '");
				});
			}
		}
		</script>';
	}

	/**
	 * Output CSS for productos_cercanos.
	 */
	private function output_productos_cercanos_styles() {
		?>
		<style>
		.tuki-productos-cercanos {
			--tuki-primary: #8B5CF6;
			--tuki-secondary: #10B981;
			--tuki-warning: #F59E0B;
			--tuki-danger: #EF4444;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
		}
		.tuki-section {
			margin-bottom: 30px;
		}
		.tuki-section-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 15px;
			padding-bottom: 10px;
			border-bottom: 2px solid #f0f0f0;
		}
		.tuki-section-header h2 {
			margin: 0;
			font-size: 1.3rem;
			font-weight: 700;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.pulse-dot {
			width: 10px;
			height: 10px;
			background: #EF4444;
			border-radius: 50%;
			animation: pulse-red 1.5s infinite;
		}
		@keyframes pulse-red {
			0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
			70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
			100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
		}
		.section-badge {
			padding: 4px 10px;
			border-radius: 20px;
			font-size: 10px;
			font-weight: 800;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.section-badge.live {
			background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
			color: white;
			animation: pulse-badge 2s infinite;
		}
		.section-badge.fast {
			background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
			color: white;
		}
		.section-badge.mobile {
			background: linear-gradient(135deg, #10B981 0%, #059669 100%);
			color: white;
		}
		@keyframes pulse-badge {
			0%, 100% { transform: scale(1); }
			50% { transform: scale(1.05); }
		}
		.tuki-products-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 15px;
		}
		@media (min-width: 768px) {
			.tuki-products-grid {
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			}
		}
		.tuki-product-card {
			background: white;
			border-radius: 16px;
			overflow: hidden;
			box-shadow: 0 4px 15px rgba(0,0,0,0.08);
			transition: all 0.3s ease;
			border: 1px solid #f0f0f0;
		}
		.tuki-product-card:hover {
			transform: translateY(-5px);
			box-shadow: 0 12px 30px rgba(0,0,0,0.15);
		}
		.tuki-card-image {
			position: relative;
			padding-top: 100%;
			background: #f8f8f8;
		}
		.tuki-card-image img {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
		.tuki-card-badge {
			position: absolute;
			top: 10px;
			left: 10px;
			padding: 5px 10px;
			border-radius: 8px;
			font-size: 9px;
			font-weight: 800;
			text-transform: uppercase;
			display: flex;
			align-items: center;
			gap: 4px;
			color: white;
		}
		.badge-vendor-near {
			background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
			animation: pulse-purple 2s infinite;
		}
		.badge-llega-hoy {
			background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
		}
		.badge-mobile {
			background: linear-gradient(135deg, #10B981 0%, #059669 100%);
			animation: pulse-green 2s infinite;
		}
		@keyframes pulse-purple {
			0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
			70% { box-shadow: 0 0 0 8px rgba(139, 92, 246, 0); }
			100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
		}
		@keyframes pulse-green {
			0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
			70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
			100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
		}
		.tuki-card-content {
			padding: 12px;
		}
		.tuki-card-title {
			margin: 0 0 8px;
			font-size: 14px;
			font-weight: 600;
			line-height: 1.3;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
			color: #1f2937;
		}
		.tuki-card-meta {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		}
		.tuki-price {
			font-size: 16px;
			font-weight: 800;
			color: #1f2937;
		}
		.tuki-price del {
			font-size: 12px;
			color: #9ca3af;
			font-weight: 400;
		}
		.tuki-price ins {
			text-decoration: none;
			color: #EF4444;
		}
		.tuki-distance {
			display: flex;
			align-items: center;
			gap: 4px;
			font-size: 11px;
			color: #6b7280;
			background: #f3f4f6;
			padding: 3px 8px;
			border-radius: 12px;
		}
		.tuki-distance svg {
			color: var(--tuki-primary);
		}
		.tuki-card-vendor {
			margin-bottom: 10px;
		}
		.tuki-card-vendor small {
			font-size: 11px;
			color: #9ca3af;
		}
		.tuki-buy-now-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			width: 100%;
			padding: 10px 15px;
			background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
			color: white !important;
			border: none;
			border-radius: 10px;
			font-size: 13px;
			font-weight: 700;
			text-decoration: none !important;
			cursor: pointer;
			transition: all 0.2s;
		}
		.tuki-buy-now-btn:hover {
			transform: scale(1.02);
			box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
		}
		.tuki-buy-now-btn:active {
			transform: scale(0.98);
		}
		/* Location request UI */
		.tuki-location-request, .tuki-no-products {
			text-align: center;
			padding: 50px 20px;
			background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
			border-radius: 20px;
			border: 2px dashed #e2e8f0;
		}
		.tuki-location-icon, .tuki-no-products-icon {
			font-size: 50px;
			margin-bottom: 15px;
		}
		.tuki-location-request h3, .tuki-no-products h3 {
			margin: 0 0 10px;
			font-size: 1.3rem;
			color: #1f2937;
		}
		.tuki-location-request p, .tuki-no-products p {
			margin: 0 0 20px;
			color: #6b7280;
		}
		.tuki-enable-location-btn {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 12px 25px;
			background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
			color: white;
			border: none;
			border-radius: 12px;
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s;
		}
		.tuki-enable-location-btn:hover {
			transform: translateY(-2px);
			box-shadow: 0 8px 20px rgba(139, 92, 246, 0.3);
		}
		</style>
		<?php
	}

	/**
	 * Output JavaScript for real-time updates.
	 */
	private function output_productos_cercanos_js( $location ) {
		?>
		<script>
		(function() {
			// Auto-refresh products every 30 seconds
			setInterval(function() {
				if (navigator.geolocation) {
					navigator.geolocation.getCurrentPosition(function(pos) {
						// Update cookies with latest location
						document.cookie = "tukitask_customer_lat=" + pos.coords.latitude + ";path=/;max-age=3600";
						document.cookie = "tukitask_customer_lng=" + pos.coords.longitude + ";path=/;max-age=3600";
					});
				}
			}, 30000);

			// Add to cart via AJAX
			document.querySelectorAll('.tuki-buy-now-btn').forEach(function(btn) {
				btn.addEventListener('click', function(e) {
					e.preventDefault();
					const productId = this.dataset.productId;
					const originalText = this.innerHTML;
					
					this.innerHTML = '<svg class="tuki-spinner" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg> Agregando...';
					
					fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: 'action=tukitask_quick_add_to_cart&product_id=' + productId + '&security=<?php echo wp_create_nonce( 'tukitask_quick_cart' ); ?>'
					})
					.then(r => r.json())
					.then(data => {
						if (data.success) {
							this.innerHTML = '✓ ' + '<?php esc_html_e( 'Agregado', 'tukitask-local-drivers' ); ?>';
							this.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
							
							// Redirect to cart after 1 second
							setTimeout(function() {
								window.location.href = '<?php echo wc_get_cart_url(); ?>';
							}, 1000);
						} else {
							this.innerHTML = originalText;
							alert(data.data?.message || 'Error');
						}
					})
					.catch(function() {
						this.innerHTML = originalText;
					});
				});
			});
		})();
		</script>
		<?php
	}
}

