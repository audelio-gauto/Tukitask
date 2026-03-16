<?php
/**
 * Vendor Dashboard.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Commission_Manager;
use Tukitask\LocalDrivers\Helpers\Payout_Manager;

/**
 * Vendedor_Dashboard Class.
 *
 * Handles the comprehensive enterprise vendor dashboard UI and functionality.
 */
class Vendedor_Dashboard {

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
		$loader->add_action( 'wp_ajax_tukitask_add_product', $this, 'ajax_add_product' );
		$loader->add_action( 'wp_ajax_tukitask_upload_image', $this, 'ajax_upload_image' );
		$loader->add_action( 'wp_ajax_tukitask_upload_store_media', $this, 'ajax_upload_store_media' );
		$loader->add_action( 'wp_ajax_tukitask_update_profile', $this, 'ajax_update_profile' );
		$loader->add_action( 'wp_ajax_tukitask_mark_order_ready', $this, 'ajax_mark_order_ready' );
		$loader->add_action( 'wp_ajax_tukitask_toggle_mobile_stock', $this, 'ajax_toggle_mobile_stock' );
		$loader->add_action( 'wp_ajax_tukitask_get_stats', $this, 'ajax_get_stats' );
		$loader->add_action( 'wp_ajax_tukitask_delete_product', $this, 'ajax_delete_product' );
		$loader->add_action( 'wp_ajax_tukitask_get_product_details', $this, 'ajax_get_product_details' );
		$loader->add_action( 'wp_ajax_tukitask_update_product', $this, 'ajax_update_product' );
		$loader->add_action( 'wp_ajax_tukitask_request_withdrawal', $this, 'ajax_request_withdrawal' );
		$loader->add_action( 'wp_ajax_tukitask_get_states', $this, 'ajax_get_states' );
		$loader->add_action( 'wp_ajax_tukitask_bulk_delete_products', $this, 'ajax_bulk_delete_products' );
		$loader->add_action( 'wp_ajax_tukitask_poll_vendor_orders', $this, 'ajax_poll_vendor_orders' );
		
		// Scalability: Clear caches when data changes
		add_action( 'woocommerce_order_status_completed', array( $this, 'clear_vendor_caches' ), 10, 1 );
		add_action( 'woocommerce_order_status_processing', array( $this, 'clear_vendor_caches' ), 10, 1 );
		add_action( 'woocommerce_order_status_on-hold', array( $this, 'clear_vendor_caches' ), 10, 1 );
		add_action( 'woocommerce_order_status_cancelled', array( $this, 'clear_vendor_caches' ), 10, 1 );
		add_action( 'tukitask_driver_assigned', array( $this, 'clear_vendor_caches_from_driver_event' ), 10, 2 );
	}

	/**
	 * AJAX handler for adding a product with image support.
	 */
	public function ajax_add_product() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permisos.', 'tukitask-local-drivers' ) ) );
		}

		$title       = sanitize_text_field( $_POST['title'] );
		$price       = sanitize_text_field( $_POST['price'] );
		$desc        = sanitize_textarea_field( $_POST['description'] );
		$image_id    = isset( $_POST['image_id'] ) ? intval( $_POST['image_id'] ) : 0;
		$category_id = isset( $_POST['category'] ) ? intval( $_POST['category'] ) : 0;
		$stock       = isset( $_POST['stock'] ) ? intval( $_POST['stock'] ) : 0;
		$sale_price  = isset( $_POST['sale_price'] ) ? sanitize_text_field( $_POST['sale_price'] ) : '';
		$date_from   = isset( $_POST['date_on_sale_from'] ) ? sanitize_text_field( $_POST['date_on_sale_from'] ) : '';
		$date_to     = isset( $_POST['date_on_sale_to'] ) ? sanitize_text_field( $_POST['date_on_sale_to'] ) : '';
		$gallery_ids = isset( $_POST['gallery_ids'] ) ? explode( ',', $_POST['gallery_ids'] ) : array();
		$gallery_ids = array_filter( array_map( 'intval', $gallery_ids ) );

		if ( ! $category_id ) {
			wp_send_json_error( array( 'message' => __( 'Debes seleccionar una categoría para el producto.', 'tukitask-local-drivers' ) ) );
		}

		$product = new \WC_Product_Simple();
		$product->set_name( $title );
		$product->set_regular_price( $price );
		$product->set_description( $desc );
		$product->set_status( 'publish' );
		
		if ( $sale_price !== '' ) {
			$product->set_sale_price( $sale_price );
		}
		if ( $date_from !== '' ) {
			$product->set_date_on_sale_from( $date_from );
		}
		if ( $date_to !== '' ) {
			$product->set_date_on_sale_to( $date_to );
		}

		$product->set_gallery_image_ids( $gallery_ids );

		if ( $stock > 0 ) {
			$product->set_manage_stock( true );
			$product->set_stock_quantity( $stock );
			$product->set_stock_status( 'instock' );
		} else {
			$product->set_manage_stock( false );
			$product->set_stock_status( 'instock' );
		}

		if ( $image_id ) {
			$product->set_image_id( $image_id );
		}

		$product_id = $product->save();
		if ( $product_id ) {
			wp_update_post( array( 'ID' => $product_id, 'post_author' => get_current_user_id() ) );
			wp_set_object_terms( $product_id, $category_id, 'product_cat' );
			wp_send_json_success( array( 'message' => __( 'Producto guardado correctamente.', 'tukitask-local-drivers' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al guardar el producto.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * AJAX handler for image uploads.
	 */
	public function ajax_upload_image() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => 'Sin permisos.' ) );
		}

		if ( ! isset( $_FILES['product_image'] ) ) {
			wp_send_json_error( array( 'message' => 'No hay archivo.' ) );
		}

		require_once( ABSPATH . 'wp-admin/includes/image.php' );
		require_once( ABSPATH . 'wp-admin/includes/file.php' );
		require_once( ABSPATH . 'wp-admin/includes/media.php' );

		$attachment_id = media_handle_upload( 'product_image', 0 );

		if ( is_wp_error( $attachment_id ) ) {
			wp_send_json_error( array( 'message' => $attachment_id->get_error_message() ) );
		}

		wp_send_json_success( array(
			'id'  => $attachment_id,
			'url' => wp_get_attachment_url( $attachment_id )
		) );
	}

	/**
	 * AJAX handler for profile metadata updates.
	 */
	public function ajax_update_profile() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		$user_id = get_current_user_id();

		if ( isset( $_POST['store_name'] ) ) {
			wp_update_user( array(
				'ID'           => $user_id,
				'display_name' => sanitize_text_field( $_POST['store_name'] )
			) );
		}

		if ( isset( $_POST['store_description'] ) ) {
			update_user_meta( $user_id, '_vendedor_store_description', sanitize_textarea_field( $_POST['store_description'] ) );
		}

		// Billing meta mapping
		$fields = [
			'billing_address_1',
			'billing_address_2',
			'billing_city',
			'billing_postcode',
			'billing_country',
			'billing_state',
			'billing_phone'
		];

		foreach ( $fields as $field ) {
			if ( isset( $_POST[ $field ] ) ) {
				update_user_meta( $user_id, $field, sanitize_text_field( $_POST[ $field ] ) );
			}
		}

		if ( isset( $_POST['store_lat'] ) ) {
			update_user_meta( $user_id, '_vendedor_store_lat', floatval( $_POST['store_lat'] ) );
		}

		if ( isset( $_POST['store_lng'] ) ) {
			update_user_meta( $user_id, '_vendedor_store_lng', floatval( $_POST['store_lng'] ) );
		}

		wp_send_json_success( array( 'message' => __( 'Perfil actualizado correctamente.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX handler for Store Logo/Banner uploads.
	 */
	public function ajax_upload_store_media() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		$user_id = get_current_user_id();
		$type = sanitize_text_field( $_POST['media_type'] ); // 'logo' or 'banner'

		if ( ! isset( $_FILES['store_media'] ) ) {
			wp_send_json_error( array( 'message' => 'No files.' ) );
		}

		require_once( ABSPATH . 'wp-admin/includes/image.php' );
		require_once( ABSPATH . 'wp-admin/includes/file.php' );
		require_once( ABSPATH . 'wp-admin/includes/media.php' );

		$attachment_id = media_handle_upload( 'store_media', 0 );

		if ( is_wp_error( $attachment_id ) ) {
			wp_send_json_error( array( 'message' => $attachment_id->get_error_message() ) );
		}

		$meta_key = ( 'logo' === $type ) ? '_vendedor_store_logo' : '_vendedor_store_banner';
		update_user_meta( $user_id, $meta_key, $attachment_id );

		wp_send_json_success( array(
			'url' => wp_get_attachment_url( $attachment_id ),
			'message' => ( 'logo' === $type ) ? 'Logo actualizado.' : 'Banner actualizado.'
		) );
	}

	/**
	 * AJAX handler for fetching real stats.
	 */
	public function ajax_get_stats() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		
		$user_id = get_current_user_id();
		$cache_key = 'tukitask_vendor_stats_' . $user_id;
		$cached_data = get_transient( $cache_key );

		if ( false !== $cached_data ) {
			wp_send_json_success( $cached_data );
		}

		$days = 7;
		$labels = [];
		$sales_data = [];
		
		// Optimize by fetching all vendor products first to filter orders efficiently
		$vendor_product_ids = get_posts( array(
			'post_type' => 'product',
			'author'    => $user_id,
			'fields'    => 'ids',
			'posts_per_page' => -1
		) );

		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$date = date( 'Y-m-d', strtotime( "-$i days" ) );
			$labels[] = date( 'D', strtotime( $date ) );
			
			// Optimized query: Only orders containing vendor products
			$orders = wc_get_orders( array(
				'status'       => array( 'completed', 'processing' ),
				'date_created' => $date,
				'limit'        => 100, // Limit per day safety
			) );

			$daily_total = 0;
			foreach ( $orders as $order ) {
				foreach ( $order->get_items() as $item ) {
					$product_id = $item->get_product_id();
					if ( in_array( $product_id, $vendor_product_ids ) ) {
						$daily_total += $item->get_total();
					}
				}
			}
			$sales_data[] = $daily_total;
		}

		// Heavy analytics logic
		$top_product_name = __( 'Ninguno', 'tukitask-local-drivers' );
		$top_product_sales = 0;
		$product_sales_map = array();
		$total_vendor_sales = 0;
		$order_count = 0;

		// Fetch last 100 completed orders for deep analysis (scalable limit)
		$all_orders = wc_get_orders( array( 'limit' => 100, 'status' => 'completed' ) );
		foreach ( $all_orders as $order ) {
			$is_vendor_order = false;
			foreach ( $order->get_items() as $item ) {
				$pid = $item->get_product_id();
				if ( in_array( $pid, $vendor_product_ids ) ) {
					$total_vendor_sales += $item->get_total();
					$is_vendor_order = true;
					$product_sales_map[ $pid ] = isset( $product_sales_map[ $pid ] ) ? $product_sales_map[ $pid ] + $item->get_quantity() : $item->get_quantity();
				}
			}
			if ( $is_vendor_order ) $order_count++;
		}

		if ( ! empty( $product_sales_map ) ) {
			arsort( $product_sales_map );
			$top_pid = key( $product_sales_map );
			$top_product_name = get_the_title( $top_pid );
			$top_product_sales = current( $product_sales_map );
		}

		$avg_ticket = $order_count > 0 ? $total_vendor_sales / $order_count : 0;

		$response_data = array(
			'labels'       => $labels,
			'sales'        => $sales_data,
			'top_product'  => $top_product_name,
			'top_sales'    => $top_product_sales,
			'avg_ticket'   => wc_price( $avg_ticket ),
		);

		set_transient( $cache_key, $response_data, 5 * MINUTE_IN_SECONDS );
		wp_send_json_success( $response_data );
	}

	/**
	 * AJAX handler to mark an order as ready for pickup.
	 */
	public function ajax_mark_order_ready() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		if ( ! $order_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de pedido no proporcionado.', 'tukitask-local-drivers' ) ) );
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		// Verify that at least one product in the order belongs to this vendor
		$user_id = get_current_user_id();
		$is_owner = false;
		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			if ( $product ) {
				$author_id = (int) get_post_field( 'post_author', $product->get_id() );
				if ( $author_id === $user_id ) {
					$is_owner = true;
					break;
				}
			}
		}

		if ( ! $is_owner ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permisos sobre este pedido.', 'tukitask-local-drivers' ) ) );
		}

		// Generate secure 4-digit pickup code
		$pickup_code = str_pad( wp_rand( 0, 9999 ), 4, '0', STR_PAD_LEFT );
		$order->update_meta_data( '_vendor_pickup_code', $pickup_code );

		// Mark as ready
		$order->update_meta_data( '_tukitask_order_ready', 'yes' );
		$order->add_order_note( sprintf( __( 'Pedido marcado como listo. Código de recogida: %s', 'tukitask-local-drivers' ), $pickup_code ) );
		$order->save();

		// Trigger action for external systems or auto-assign logic
		do_action( 'tukitask_order_ready_for_pickup', $order_id, $user_id );

		wp_send_json_success( array( 
			'message' => __( 'Repartidor avisado. El pedido está listo.', 'tukitask-local-drivers' ) 
		) );
	}

	/**
	 * AJAX handler to toggle mobile stock status for a product.
	 */
	public function ajax_toggle_mobile_stock() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permisos insuficientes.', 'tukitask-local-drivers' ) ) );
		}

		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		$is_mobile  = isset( $_POST['is_mobile'] ) && 'true' === $_POST['is_mobile'];

		if ( ! $product_id ) {
			wp_send_json_error( array( 'message' => __( 'ID de producto no proporcionado.', 'tukitask-local-drivers' ) ) );
		}

		// Verify ownership
		$product = wc_get_product( $product_id );
		if ( ! $product || (int) get_post_field( 'post_author', $product_id ) !== get_current_user_id() ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permisos sobre este producto.', 'tukitask-local-drivers' ) ) );
		}

		update_post_meta( $product_id, '_tukitask_is_mobile_stock', $is_mobile ? 'yes' : 'no' );

		wp_send_json_success( array( 
			'message' => $is_mobile ? __( 'Producto añadido a la Tienda Móvil.', 'tukitask-local-drivers' ) : __( 'Producto removido de la Tienda Móvil.', 'tukitask-local-drivers' )
		) );
	}

	/**
	 * AJAX handler to delete a product.
	 */
	public function ajax_delete_product() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		
		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		$user_id = get_current_user_id();

		if ( ! $product_id || (int) get_post_field( 'post_author', $product_id ) !== $user_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para borrar este producto.', 'tukitask-local-drivers' ) ) );
		}

		if ( wp_trash_post( $product_id ) ) {
			wp_send_json_success( array( 'message' => __( 'Producto enviado a la papelera.', 'tukitask-local-drivers' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al borrar el producto.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * AJAX handler for bulk deleting products.
	 */
	public function ajax_bulk_delete_products() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permisos.', 'tukitask-local-drivers' ) ) );
		}

		$product_ids = isset( $_POST['product_ids'] ) ? explode( ',', $_POST['product_ids'] ) : array();
		$user_id = get_current_user_id();

		foreach ( $product_ids as $pid ) {
			$pid = intval( $pid );
			if ( (int) get_post_field( 'post_author', $pid ) === $user_id ) {
				wp_trash_post( $pid );
			}
		}

		wp_send_json_success( array( 'message' => __( 'Productos movidos a la papelera.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * AJAX handler for getting product details for editing.
	 */
	public function ajax_get_product_details() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		$product_id = isset( $_GET['product_id'] ) ? intval( $_GET['product_id'] ) : 0;
		$user_id = get_current_user_id();

		if ( ! $product_id || (int) get_post_field( 'post_author', $product_id ) !== $user_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para editar este producto.', 'tukitask-local-drivers' ) ) );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$gallery_ids = $product->get_gallery_image_ids();
		$gallery_data = array();
		if ( ! empty( $gallery_ids ) ) {
			foreach ( $gallery_ids as $id ) {
				$gallery_data[] = array(
					'id'  => $id,
					'url' => wp_get_attachment_url( $id ),
				);
			}
		}

		wp_send_json_success( array(
			'id'          => $product->get_id(),
			'title'       => $product->get_name(),
			'price'       => $product->get_regular_price(),
			'sale_price'  => $product->get_sale_price(),
			'date_from'   => $product->get_date_on_sale_from() ? $product->get_date_on_sale_from()->date('Y-m-d') : '',
			'date_to'     => $product->get_date_on_sale_to() ? $product->get_date_on_sale_to()->date('Y-m-d') : '',
			'description' => $product->get_description(),
			'image_id'    => $product->get_image_id(),
			'image_url'   => wp_get_attachment_url( $product->get_image_id() ),
			'category_id' => ! empty( $product->get_category_ids() ) ? current( $product->get_category_ids() ) : 0,
			'stock'       => $product->get_stock_quantity(),
			'gallery'     => $gallery_data,
		) );
	}

	/**
	 * AJAX handler for updating a product.
	 */
	public function ajax_update_product() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permisos.', 'tukitask-local-drivers' ) ) );
		}

		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		$user_id    = get_current_user_id();

		if ( ! $product_id || (int) get_post_field( 'post_author', $product_id ) !== $user_id ) {
			wp_send_json_error( array( 'message' => __( 'No tienes permiso para editar este producto.', 'tukitask-local-drivers' ) ) );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$title       = sanitize_text_field( $_POST['title'] );
		$price       = sanitize_text_field( $_POST['price'] );
		$desc        = sanitize_textarea_field( $_POST['description'] );
		$image_id    = isset( $_POST['image_id'] ) ? intval( $_POST['image_id'] ) : 0;
		$category_id = isset( $_POST['category'] ) ? intval( $_POST['category'] ) : 0;
		$stock       = isset( $_POST['stock'] ) ? intval( $_POST['stock'] ) : 0;
		$sale_price  = isset( $_POST['sale_price'] ) ? sanitize_text_field( $_POST['sale_price'] ) : '';
		$date_from   = isset( $_POST['date_on_sale_from'] ) ? sanitize_text_field( $_POST['date_on_sale_from'] ) : '';
		$date_to     = isset( $_POST['date_on_sale_to'] ) ? sanitize_text_field( $_POST['date_on_sale_to'] ) : '';
		$gallery_ids = isset( $_POST['gallery_ids'] ) ? explode( ',', $_POST['gallery_ids'] ) : array();
		$gallery_ids = array_filter( array_map( 'intval', $gallery_ids ) );

		if ( ! $category_id ) {
			wp_send_json_error( array( 'message' => __( 'Debes seleccionar una categoría para el producto.', 'tukitask-local-drivers' ) ) );
		}

		$product->set_name( $title );
		$product->set_regular_price( $price );
		
		if ( $sale_price !== '' ) {
			$product->set_sale_price( $sale_price );
		} else {
			$product->set_sale_price( '' );
		}
		
		if ( $date_from !== '' ) {
			$product->set_date_on_sale_from( $date_from );
		} else {
			$product->set_date_on_sale_from( '' );
		}
		
		if ( $date_to !== '' ) {
			$product->set_date_on_sale_to( $date_to );
		} else {
			$product->set_date_on_sale_to( '' );
		}

		$product->set_description( $desc );
		$product->set_gallery_image_ids( $gallery_ids );

		if ( $stock > 0 ) {
			$product->set_manage_stock( true );
			$product->set_stock_quantity( $stock );
			$product->set_stock_status( 'instock' );
		} else {
			$product->set_manage_stock( false );
			$product->set_stock_status( 'instock' );
		}

		if ( $image_id ) {
			$product->set_image_id( $image_id );
		}

		if ( $product->save() ) {
			wp_set_object_terms( $product_id, $category_id, 'product_cat' );
			wp_send_json_success( array( 'message' => __( 'Producto actualizado correctamente.', 'tukitask-local-drivers' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al actualizar el producto.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * AJAX handler for withdrawal requests.
	 */
	public function ajax_request_withdrawal() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		$user_id = get_current_user_id();
		$amount  = isset( $_POST['amount'] ) ? floatval( $_POST['amount'] ) : 0;

		// Recalculate fresh balance (bypass cache to prevent race conditions)
		delete_transient( 'tukitask_vendor_balance_' . $user_id );
		$balance = $this->get_vendor_balance( $user_id );

		$min_withdrawal = (float) get_option( 'tukitask_ld_min_withdrawal', 1000 );

		if ( $amount <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'El monto debe ser mayor a cero.', 'tukitask-local-drivers' ) ) );
		}

		if ( $amount < $min_withdrawal ) {
			wp_send_json_error( array( 'message' => sprintf( __( 'El monto mínimo de retiro es %s.', 'tukitask-local-drivers' ), wc_price( $min_withdrawal ) ) ) );
		}

		if ( $balance <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'No tienes saldo disponible para retirar.', 'tukitask-local-drivers' ) ) );
		}

		if ( $amount > $balance ) {
			wp_send_json_error( array( 'message' => sprintf( __( 'Saldo insuficiente. Tu saldo disponible es %s.', 'tukitask-local-drivers' ), wc_price( $balance ) ) ) );
		}

		$request_id = Payout_Manager::create_request( array(
			'vendor_id'      => $user_id,
			'amount'         => $amount,
			'payment_method' => __( 'Manual (Transferencia)', 'tukitask-local-drivers' )
		) );

		if ( $request_id ) {
			// Clear balance cache after creating request
			delete_transient( 'tukitask_vendor_balance_' . $user_id );
			wp_send_json_success( array( 'message' => __( 'Tu solicitud de retiro ha sido enviada y está en revisión.', 'tukitask-local-drivers' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al procesar la solicitud.', 'tukitask-local-drivers' ) ) );
		}
	}

	/**
	 * AJAX handler for fetching states based on country.
	 */
	public function ajax_get_states() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );
		$country = sanitize_text_field( $_GET['country'] );
		
		$countries_obj = new \WC_Countries();
		$states = $countries_obj->get_states( $country );

		wp_send_json_success( $states ? $states : [] );
	}

	/**
	 * Get real wallet balance for the vendor.
	 */
	private function get_vendor_balance( $user_id ) {
		$cache_key = 'tukitask_vendor_balance_' . $user_id;
		$cached_balance = get_transient( $cache_key );
		if ( false !== $cached_balance ) return (float) $cached_balance;

		// 1. Calculate Gross Earnings from completed orders (net of commission)
		// Logic already exists in current implementation but we need to subtract "Paid" and "Pending" payouts

		// Scalable strategy: Fetch products first, then use them as filter
		$vendor_product_ids = get_posts( array(
			'post_type' => 'product',
			'author'    => $user_id,
			'fields'    => 'ids',
			'posts_per_page' => -1
		) );

		if ( empty( $vendor_product_ids ) ) return 0.00;

		$total_earned = 0;
		$orders = wc_get_orders( array( 'limit' => 200, 'status' => 'completed' ) );
		foreach ( $orders as $order ) {
			foreach ( $order->get_items() as $item ) {
				if ( in_array( $item->get_product_id(), $vendor_product_ids ) ) {
					$total = (float) $item->get_total();
					$commission = Commission_Manager::calculate_commission( $total, $item->get_product_id() );
					$total_earned += ( $total - $commission );
				}
			}
		}

		// 2. Subtract locked/paid amounts
		$locked = Payout_Manager::get_locked_balance( $user_id );
		
		// Get total already paid
		global $wpdb;
		$paid = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT SUM(amount) FROM {$wpdb->prefix}tukitask_payouts WHERE vendor_id = %d AND status = 'paid'",
			$user_id
		) );

		$net_balance = max( 0, $total_earned - $locked - $paid );
		
		set_transient( $cache_key, $net_balance, 5 * MINUTE_IN_SECONDS );
		return $net_balance;
	}

	/**
	 * Get recent orders for this vendor.
	 */
	private function get_vendor_orders( $user_id, $limit = 5 ) {
		$vendor_product_ids = get_posts( array(
			'post_type' => 'product',
			'author'    => $user_id,
			'fields'    => 'ids',
			'posts_per_page' => -1
		) );

		if ( empty( $vendor_product_ids ) ) return [];

		// We fetch latest orders and filter until we hit the record limit or scan limit
		$all_orders = wc_get_orders( array( 'limit' => 100 ) ); 
		$vendor_orders = [];

		foreach ( $all_orders as $order ) {
			foreach ( $order->get_items() as $item ) {
				if ( in_array( $item->get_product_id(), $vendor_product_ids ) ) {
					$vendor_orders[] = $order;
					break; 
				}
			}
			if ( count( $vendor_orders ) >= $limit ) break;
		}
		return $vendor_orders;
	}

	/**
	 * Scalability: Clear all dashboard transients for relevant vendors.
	 */
	public function clear_vendor_caches( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) return;

		$vendors_to_clear = [];
		foreach ( $order->get_items() as $item ) {
			$author_id = (int) get_post_field( 'post_author', $item->get_product_id() );
			if ( $author_id ) {
				$vendors_to_clear[] = $author_id;
			}
		}

		foreach ( array_unique( $vendors_to_clear ) as $user_id ) {
			delete_transient( 'tukitask_vendor_stats_' . $user_id );
			delete_transient( 'tukitask_vendor_balance_' . $user_id );
		}
	}

	/**
	 * Clear vendor caches when a driver is assigned to an order.
	 *
	 * @param int $order_id  Order ID.
	 * @param int $driver_id Driver ID.
	 */
	public function clear_vendor_caches_from_driver_event( $order_id, $driver_id ) {
		$this->clear_vendor_caches( $order_id );
	}

	/**
	 * AJAX handler for vendor order polling (real-time sync).
	 */
	public function ajax_poll_vendor_orders() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( array( 'message' => 'Permisos insuficientes.' ) );
		}

		$user_id = get_current_user_id();
		$since_timestamp = isset( $_POST['since'] ) ? intval( $_POST['since'] ) : 0;

		// Get vendor's product IDs
		$vendor_product_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $user_id,
			'fields'         => 'ids',
			'posts_per_page' => -1,
		) );

		if ( empty( $vendor_product_ids ) ) {
			wp_send_json_success( array( 'orders' => array(), 'timestamp' => current_time( 'timestamp' ) ) );
		}

		// Fetch recent orders
		$query_args = array(
			'limit'  => 20,
			'status' => array( 'processing', 'on-hold', 'completed', 'en-camino', 'listo-para-envio' ),
		);

		if ( $since_timestamp > 0 ) {
			$query_args['date_modified'] = '>=' . date( 'Y-m-d H:i:s', $since_timestamp );
		}

		$orders = wc_get_orders( $query_args );
		$vendor_orders = array();

		foreach ( $orders as $order ) {
			$is_vendor_order = false;
			foreach ( $order->get_items() as $item ) {
				if ( in_array( $item->get_product_id(), $vendor_product_ids, true ) ) {
					$is_vendor_order = true;
					break;
				}
			}

			if ( ! $is_vendor_order ) {
				continue;
			}

			$driver_id = $order->get_meta( '_assigned_driver_id' );
			$driver_name = $driver_id ? get_the_title( $driver_id ) : '';
			$delivery_status = $order->get_meta( '_delivery_status' );

			$vendor_orders[] = array(
				'id'              => $order->get_id(),
				'status'          => $order->get_status(),
				'status_label'    => wc_get_order_status_name( $order->get_status() ),
				'driver_id'       => $driver_id ? intval( $driver_id ) : 0,
				'driver_name'     => $driver_name,
				'delivery_status' => $delivery_status ?: 'pending',
				'order_ready'     => $order->get_meta( '_tukitask_order_ready' ) === 'yes',
				'driver_accepted' => $order->get_meta( '_driver_accepted' ) === 'yes',
				'broadcast_status'=> $order->get_meta( '_broadcast_status' ) ?: '',
				'pickup_code'     => $order->get_meta( '_vendor_pickup_code' ) ?: '',
			);
		}

		wp_send_json_success( array(
			'orders'    => $vendor_orders,
			'timestamp' => current_time( 'timestamp' ),
		) );
	}

	/**
	 * Render the vendor dashboard.
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string HTML output.
	 */
	public function render_dashboard( $atts ) {
		if ( ! is_user_logged_in() || ! current_user_can( 'edit_posts' ) ) {
			return '<div class="tukitask-error">' . __( 'Debes ser un vendedor para acceder a este panel.', 'tukitask-local-drivers' ) . '</div>';
		}

		$user = wp_get_current_user();
		$status = get_user_meta( $user->ID, '_tukitask_vendor_status', true );
		if ( $status && 'active' !== $status ) {
			return '<div class="tukitask-error enterprise" style="padding:40px; text-align:center; background:#fff; border-radius:12px; border:1px solid #ef4444; margin:20px;">
				<h2 style="color:#ef4444;">' . __( 'Cuenta Suspendida', 'tukitask-local-drivers' ) . '</h2>
				<p>' . __( 'Tu acceso al marketplace ha sido temporalmente restringido por un administrador.', 'tukitask-local-drivers' ) . '</p>
				<p><small>' . __( 'Para más información, contacta al soporte técnico.', 'tukitask-local-drivers' ) . '</small></p>
			</div>';
		}

		ob_start();
		$this->output_dashboard_css();
		// Load Chart.js CDN for professional reporting
		echo '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>';
		
		$active_tab = isset( $_GET['tab'] ) ? sanitize_text_field( $_GET['tab'] ) : 'overview';
		?>
		<div class="tukitask-vendedor-pro enterprise" data-version="1.0.5">
			<!-- Sidebar -->
			<aside class="vendedor-sidebar">
				<div class="sidebar-logo">
					<h2>Tuki<span>Vendor</span></h2>
					<small>Enterprise Edition</small>
				</div>
				<nav class="sidebar-nav">
					<button class="nav-item <?php echo $active_tab === 'overview' ? 'active' : ''; ?>" data-tab="overview">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
						<span>Dashboard</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'products' ? 'active' : ''; ?>" data-tab="products">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
						<span>Productos</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'orders' ? 'active' : ''; ?>" data-tab="orders">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
						<span>Pedidos</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'analytics' ? 'active' : ''; ?>" data-tab="analytics">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
						<span>Análisis</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'wallet' ? 'active' : ''; ?>" data-tab="wallet">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
						<span>Billetera</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'dropship' ? 'active' : ''; ?>" data-tab="dropship">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
						<span>Catálogo Dropship</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'mobile-store' ? 'active' : ''; ?>" data-tab="mobile-store">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
						<span>Tienda Móvil</span>
					</button>
					<button class="nav-item <?php echo $active_tab === 'store-profile' ? 'active' : ''; ?>" data-tab="store-profile">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
						<span>Configuración</span>
					</button>
				</nav>
				<div class="sidebar-footer">
					<div class="user-pill">
						<?php echo get_avatar( $user->ID, 32 ); ?>
						<div class="user-meta">
							<span class="user-name"><?php echo esc_html( $user->display_name ); ?></span>
							<span class="user-role">Premium Seller</span>
						</div>
					</div>
					<a href="<?php echo wp_logout_url( get_permalink() ); ?>" class="logout-link">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
						<span>Cerrar Sesión</span>
					</a>
				</div>
			</aside>

			<!-- Main Content -->
			<main class="vendedor-content">
				<header class="content-top-bar">
					<div class="search-box">
						<!-- Removed global search as per request -->
					</div>
					<div class="top-bar-actions">
						<button class="icon-btn-rounded notification">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
							<span class="dot"></span>
						</button>
						<button class="tukitask-btn accent" onclick="document.getElementById('add-product-modal').style.display='flex'"><?php esc_html_e( 'Rápido: Producto+', 'tukitask-local-drivers' ); ?></button>
					</div>
				</header>

				<div class="tab-containers">
					<section id="tab-overview" class="tab-pane <?php echo $active_tab === 'overview' ? 'active' : ''; ?>">
						<?php $this->render_overview(); ?>
					</section>
					<section id="tab-products" class="tab-pane <?php echo $active_tab === 'products' ? 'active' : ''; ?>">
						<?php $this->render_products_tab(); ?>
					</section>
					<section id="tab-orders" class="tab-pane <?php echo $active_tab === 'orders' ? 'active' : ''; ?>">
						<?php $this->render_orders_tab(); ?>
					</section>
					<section id="tab-analytics" class="tab-pane <?php echo $active_tab === 'analytics' ? 'active' : ''; ?>">
						<?php $this->render_analytics_tab(); ?>
					</section>
					<section id="tab-wallet" class="tab-pane <?php echo $active_tab === 'wallet' ? 'active' : ''; ?>">
						<?php $this->render_wallet_tab(); ?>
					</section>
					<section id="tab-dropship" class="tab-pane <?php echo $active_tab === 'dropship' ? 'active' : ''; ?>">
						<?php $this->render_dropship_catalog_tab(); ?>
					</section>
					<section id="tab-mobile-store" class="tab-pane <?php echo $active_tab === 'mobile-store' ? 'active' : ''; ?>">
						<?php $this->render_mobile_store_tab(); ?>
					</section>
					<section id="tab-store-profile" class="tab-pane <?php echo $active_tab === 'store-profile' ? 'active' : ''; ?>">
						<?php $this->render_profile_tab(); ?>
					</section>
				</div>
			</main>
		</div>

		<!-- UI Modals -->
		<?php $this->render_modals(); ?>

		<script>
		// Enterprise Tab Logic
		document.querySelectorAll('.nav-item').forEach(button => {
			button.addEventListener('click', (e) => {
				const tab = button.dataset.tab;
				if(!tab) return;

				// Update URL without reloading
				const url = new URL(window.location);
				url.searchParams.set('tab', tab);
				window.history.pushState({}, '', url);

				// Destroy existing charts to prevent memory leaks and canvas errors
				if (window.myChart && typeof window.myChart.destroy === 'function') {
					window.myChart.destroy();
					window.myChart = null;
				}
				if (window.myOverviewChart && typeof window.myOverviewChart.destroy === 'function') {
					window.myOverviewChart.destroy();
					window.myOverviewChart = null;
				}

				document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
				document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

				button.classList.add('active');
				const target = document.getElementById('tab-' + tab);
				if(target) {
					target.classList.add('active');
					if(tab === 'analytics' && typeof initCharts === 'function') {
						// Small delay to ensure DOM is ready and previous chart is destroyed
						setTimeout(() => initCharts(), 150);
					}
					if(tab === 'overview' && typeof initOverviewChart === 'function') {
						setTimeout(() => initOverviewChart(), 150);
					}
					// Removed auto-toggle on click for PC/Tablet, handled by CSS now for better UX
					if(window.innerWidth <= 768) {
						document.querySelector('.vendedor-sidebar').classList.remove('expanded');
					}
				}
			});
		});

		function toggleSidebar() {
			document.querySelector('.vendedor-sidebar').classList.toggle('expanded');
		}

		function openWithdrawModal() {
			document.getElementById('withdraw-modal').style.display = 'flex';
		}

		document.querySelector('.notification').addEventListener('click', () => {
			alert('No tienes notificaciones nuevas.');
			document.querySelector('.dot').style.display = 'none';
		});

		// Mapbox Geocoding for Vendor
		const addressInput = document.getElementById('store_address_1');
		if(addressInput) {
			let timeout = null;
			addressInput.addEventListener('input', () => {
				clearTimeout(timeout);
				const query = addressInput.value;
				if(query.length < 5) return;

				timeout = setTimeout(() => {
					fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${window.mapboxgl?.accessToken || '<?php echo get_option('tukitask_ld_mapbox_api_key', get_option('tukitask_ld_mapbox_key')); ?>'}&limit=1`)
					.then(r => r.json())
					.then(data => {
						if(data.features?.length > 0) {
							const [lng, lat] = data.features[0].center;
							document.getElementById('store_lat').value = lat;
							document.getElementById('store_lng').value = lng;
							addressInput.style.borderColor = '#10B981';
						}
					});
				}, 800);
			});
		}

		// Country change -> Update States
		const countrySelect = document.getElementById('store_country');
		if(countrySelect) {
			countrySelect.addEventListener('change', function() {
				const country = this.value;
				const wrapper = document.getElementById('store_state_wrapper');
				wrapper.innerHTML = '<span class="loader"></span>';

				fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>?action=tukitask_get_states&country=' + country + '&security=<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>')
					.then(r => r.json())
					.then(response => {
						if(response.success && Object.keys(response.data).length > 0) {
							let html = '<select id="store_state" class="tuki-input">';
							for(const code in response.data) {
								html += `<option value="${code}">${response.data[code]}</option>`;
							}
							html += '</select>';
							wrapper.innerHTML = html;
						} else {
							wrapper.innerHTML = '<input type="text" id="store_state" class="tuki-input" placeholder="Estado/Provincia">';
						}
					});
			});
		}

		function handleBrandingUpload(input, type) {
			const file = input.files[0];
			if(!file) return;

			const formData = new FormData();
			formData.append('action', 'tukitask_upload_store_media');
			formData.append('store_media', file);
			formData.append('media_type', type);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			const previewBox = document.getElementById(type + '-preview-box');
			previewBox.innerHTML = '<span class="loader">...</span>';

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				if(data.success) {
					previewBox.innerHTML = '';
					previewBox.style.backgroundImage = `url('${data.data.url}')`;
				} else {
					alert(data.data.message);
				}
			});
		}

		const profileForm = document.getElementById('store-profile-form');
		if(profileForm) {
			profileForm.addEventListener('submit', (e) => {
				e.preventDefault();
				const btn = profileForm.querySelector('button[type="submit"]');
				const originalText = btn.innerHTML;
				btn.disabled = true;
				btn.innerHTML = '<span class="loader"></span>';

				const formData = new FormData();
				formData.append('action', 'tukitask_update_profile');
				formData.append('store_name', document.getElementById('store_name').value);
				formData.append('store_description', document.getElementById('store_description').value);
				formData.append('billing_address_1', document.getElementById('store_address_1').value);
				formData.append('billing_address_2', document.getElementById('store_address_2').value);
				formData.append('billing_city', document.getElementById('store_city').value);
				formData.append('billing_postcode', document.getElementById('store_postcode').value);
				formData.append('billing_country', document.getElementById('store_country').value);
				formData.append('billing_state', document.getElementById('store_state').value);
				formData.append('billing_phone', document.getElementById('store_phone').value);
				formData.append('store_lat', document.getElementById('store_lat').value);
				formData.append('store_lng', document.getElementById('store_lng').value);
				formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

				fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
					method: 'POST',
					body: formData
				})
				.then(response => response.json())
				.then(data => {
					btn.disabled = false;
					btn.innerHTML = originalText;
					if(data.success) {
						alert('✅ ' + data.data.message);
						location.reload(); // To update sidebars and user pills
					} else {
						alert('❌ ' + data.data.message);
					}
				});
			});
		}

		function initCharts() {
			const canvas = document.getElementById('salesChart');
			if (!canvas) return;
			const ctx = canvas.getContext('2d');

			// Destroy existing chart if it exists
			if (window.myChart && typeof window.myChart.destroy === 'function') {
				window.myChart.destroy();
			}

			// Fetch real data via AJAX
			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>?action=tukitask_get_stats&security=<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>')
				.then(response => response.json())
				.then(data => {
					if(!data.success) return;

					// Fill mini cards
					const topProd = document.getElementById('top-product-name');
					const topSales = document.getElementById('top-product-sales');
					const avgTicket = document.getElementById('avg-ticket-value');
					
					if(topProd) topProd.innerText = data.data.top_product;
					if(topSales) topSales.innerText = data.data.top_sales + ' <?php esc_html_e( 'ventas', 'tukitask-local-drivers' ); ?>';
					if(avgTicket) avgTicket.innerHTML = data.data.avg_ticket;

					window.myChart = new Chart(ctx, {
						type: 'line',
						data: {
							labels: data.data.labels,
							datasets: [{
								label: '<?php esc_html_e( 'Ventas Diarias', 'tukitask-local-drivers' ); ?>',
								data: data.data.sales,
								borderColor: '#4F46E5',
								backgroundColor: 'rgba(79, 70, 229, 0.1)',
								fill: true,
								tension: 0.4
							}]
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
							animation: {
								duration: 1000,
								easing: 'easeInOutQuart'
							},
							plugins: {
								legend: {
									position: 'bottom'
								}
							},
							scales: {
								y: {
									beginAtZero: true
								}
							}
						}
					});
				});
		}

		// AJAX Submission for Product
		const productForm = document.getElementById('tukitask-add-product-form');
		if(productForm) {
			productForm.addEventListener('submit', function(e) {
				e.preventDefault();
				const btn = this.querySelector('button[type="submit"]');
				btn.disabled = true;
				btn.innerHTML = '<?php esc_html_e( 'Sincronizando...', 'tukitask-local-drivers' ); ?>';

				const formData = new FormData(this);
				formData.append('action', 'tukitask_add_product');
				formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

				fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
					method: 'POST',
					body: formData
				})
				.then(response => response.json())
				.then(data => {
					alert(data.data.message);
					if(data.success) {
						if(document.location.search.includes('tab=products')) {
							location.reload();
						} else {
							window.location.href = '?tab=products';
						}
					}
					btn.disabled = false;
					btn.innerHTML = '<?php esc_html_e( 'Publicar Producto', 'tukitask-local-drivers' ); ?>';
				});
			});
		}

		// Drag & Drop Image Logic
		const dropzone = document.getElementById('dropzone');
		const imageInput = document.getElementById('image_input');
		const imagePreview = document.getElementById('image-preview');
		const uploadedIdField = document.getElementById('uploaded_image_id');

		if(dropzone) {
			dropzone.addEventListener('click', () => imageInput.click());
			dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
			dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
			dropzone.addEventListener('drop', (e) => {
				e.preventDefault();
				dropzone.classList.remove('dragging');
				const files = e.dataTransfer.files;
				if(files.length) handleImageUpload(files[0]);
			});
			imageInput.addEventListener('change', (e) => {
				if(e.target.files.length) handleImageUpload(e.target.files[0]);
			});
		}

		function handleImageUpload(file) {
			if(!file.type.startsWith('image/')) return alert('Por favor, selecciona una imagen.');

			const formData = new FormData();
			formData.append('action', 'tukitask_upload_image');
			formData.append('product_image', file);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			// Preview locally
			const reader = new FileReader();
			reader.onload = (e) => {
				imagePreview.innerHTML = `<img src="${e.target.result}">`;
				imagePreview.classList.add('active');
				dropzone.querySelector('.upload-placeholder').style.display = 'none';
			};
			reader.readAsDataURL(file);

			// Real upload
			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				if(data.success) {
					uploadedIdField.value = data.data.id;
				} else {
					alert('Error al subir imagen: ' + data.data.message);
				}
			});
		}

		// Gallery Upload Logic
		function setupGalleryHandler(inputId, listId, hiddenId) {
			const input = document.getElementById(inputId);
			const list = document.getElementById(listId);
			const hiddenField = document.getElementById(hiddenId);

			if (!input || !list || !hiddenField) return;

			input.addEventListener('change', function(e) {
				const files = e.target.files;
				if (!files.length) return;

				for (let i = 0; i < files.length; i++) {
					uploadGalleryImage(files[i], list, hiddenField);
				}
				input.value = ''; // Reset input to allow re-uploading the same file
			});
		}

		function uploadGalleryImage(file, list, hiddenField) {
			if(!file.type.startsWith('image/')) return alert('Por favor, selecciona una imagen.');

			const formData = new FormData();
			formData.append('action', 'tukitask_upload_image');
			formData.append('product_image', file);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(r => r.json())
			.then(data => {
				if(data.success) {
					addGalleryItemUI(data.data.id, data.data.url, list, hiddenField);
				} else {
					alert('Error en galería: ' + data.data.message);
				}
			});
		}

		function addGalleryItemUI(id, url, list, hiddenField) {
			const li = document.createElement('li');
			li.className = 'gallery-item';
			li.dataset.id = id;
			li.innerHTML = `
				<img src="${url}">
				<button type="button" class="remove-gallery-img">&times;</button>
			`;
			
			li.querySelector('.remove-gallery-img').addEventListener('click', function() {
				li.remove();
				updateGalleryHiddenField(list, hiddenField);
			});

			const addButton = list.querySelector('.add-gallery-item');
			list.insertBefore(li, addButton);

			updateGalleryHiddenField(list, hiddenField);
		}

		function updateGalleryHiddenField(list, hiddenField) {
			const ids = [];
			list.querySelectorAll('.gallery-item').forEach(item => {
				ids.push(item.dataset.id);
			});
			hiddenField.value = ids.join(',');
		}

		setupGalleryHandler('gallery_input', 'gallery-preview-list', 'product_gallery_ids');
		setupGalleryHandler('edit_gallery_input', 'edit_gallery-preview-list', 'edit_product_gallery_ids');

		// Edit Product Logic
		window.openEditProductModal = function(productId) {
			document.getElementById('edit-product-modal').style.display='flex';
			
			const securityNonce = '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>';

			// Fetch product details
			fetch(`<?php echo admin_url( 'admin-ajax.php' ); ?>?action=tukitask_get_product_details&product_id=${productId}&security=${securityNonce}`)
				.then(response => response.json())
				.then(data => {
					if(data.success) {
						const product = data.data;
						document.getElementById('edit_product_id').value = product.id;
						document.getElementById('edit_product_title').value = product.title;
						document.getElementById('edit_product_price').value = product.price;
						document.getElementById('edit_product_description').value = product.description;
						document.getElementById('edit_uploaded_image_id').value = product.image_id;
						
						const editImagePreview = document.getElementById('edit_image-preview');
						const editPlaceholder = document.getElementById('edit_dropzone').querySelector('.upload-placeholder');
						if (product.image_url) {
							editImagePreview.innerHTML = `<img src="${product.image_url}">`;
							editImagePreview.classList.add('active');
							editPlaceholder.style.display = 'none';
						} else {
							editImagePreview.innerHTML = '';
							editImagePreview.classList.remove('active');
							editPlaceholder.style.display = 'flex';
						}
						
						if(product.category_id) {
							document.getElementById('edit_product_category').value = product.category_id;
						}
						if(product.stock !== undefined) {
							document.getElementById('edit_product_stock').value = product.stock;
						}

						// Populate Gallery
						const galleryList = document.getElementById('edit_gallery-preview-list');
						const galleryHidden = document.getElementById('edit_product_gallery_ids');
						// Remove existing gallery items (leaving the 'add' button)
						galleryList.querySelectorAll('.gallery-item').forEach(item => item.remove());
						
						if (product.gallery && product.gallery.length > 0) {
							product.gallery.forEach(img => {
								addGalleryItemUI(img.id, img.url, galleryList, galleryHidden);
							});
						} else {
							galleryHidden.value = '';
						}
						
						// Sale Price & Schedule
						document.getElementById('edit_product_sale_price').value = product.sale_price || '';
						document.getElementById('edit_date_on_sale_from').value = product.date_from || '';
						document.getElementById('edit_date_on_sale_to').value = product.date_to || '';
						
						if(product.date_from || product.date_to) {
							document.getElementById('edit_schedule_dates').style.display = 'block';
							document.querySelector('#edit-product-modal .schedule-link').innerText = '<?php esc_html_e( 'Cancelar', 'tukitask-local-drivers' ); ?>';
						} else {
							document.getElementById('edit_schedule_dates').style.display = 'none';
							document.querySelector('#edit-product-modal .schedule-link').innerText = '<?php esc_html_e( 'Programar', 'tukitask-local-drivers' ); ?>';
						}
						
						// Calculate initial profit display
						calculateProfit('edit');
					} else {
						alert('Error al cargar datos del producto: ' + data.data.message);
						document.getElementById('edit-product-modal').style.display='none';
					}
				});
		}

		// Edit Image Upload Logic (similar to add product)
		const editDropzone = document.getElementById('edit_dropzone');
		const editImageInput = document.getElementById('edit_image_input');
		const editImagePreview = document.getElementById('edit_image-preview');
		const editUploadedIdField = document.getElementById('edit_uploaded_image_id');

		if(editDropzone) {
			editDropzone.addEventListener('click', () => editImageInput.click());
			editDropzone.addEventListener('dragover', (e) => { e.preventDefault(); editDropzone.classList.add('dragging'); });
			editDropzone.addEventListener('dragleave', () => editDropzone.classList.remove('dragging'));
			editDropzone.addEventListener('drop', (e) => {
				e.preventDefault();
				editDropzone.classList.remove('dragging');
				const files = e.dataTransfer.files;
				if(files.length) handleEditImageUpload(files[0]);
			});
			editImageInput.addEventListener('change', (e) => {
				if(e.target.files.length) handleEditImageUpload(e.target.files[0]);
			});
		}

		function handleEditImageUpload(file) {
			if(!file.type.startsWith('image/')) return alert('Por favor, selecciona una imagen.');

			const formData = new FormData();
			formData.append('action', 'tukitask_upload_image'); // Re-use existing image upload action
			formData.append('product_image', file);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			// Preview locally
			const reader = new FileReader();
			reader.onload = (e) => {
				editImagePreview.innerHTML = `<img src="${e.target.result}">`;
				editImagePreview.classList.add('active');
				editDropzone.querySelector('.upload-placeholder').style.display = 'none';
			};
			reader.readAsDataURL(file);

			// Real upload
			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				if(data.success) {
					editUploadedIdField.value = data.data.id;
				} else {
					alert('Error al subir imagen: ' + data.data.message);
				}
			});
		}

		// AJAX Submission for Product Edit
		const editProductForm = document.getElementById('tukitask-edit-product-form');
		if(editProductForm) {
			editProductForm.addEventListener('submit', function(e) {
				e.preventDefault();
				const btn = this.querySelector('button[type="submit"]');
				btn.disabled = true;
				btn.innerHTML = '<?php esc_html_e( 'Actualizando...', 'tukitask-local-drivers' ); ?>';

				const formData = new FormData(this);
				formData.append('action', 'tukitask_update_product');
				formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

				fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
					method: 'POST',
					body: formData
				})
				.then(response => response.json())
				.then(data => {
					alert(data.data.message);
					if(data.success) {
						if(document.location.search.includes('tab=products')) {
							location.reload();
						} else {
							window.location.href = '?tab=products';
						}
					}
					btn.disabled = false;
					btn.innerHTML = '<?php esc_html_e( 'Guardar Cambios', 'tukitask-local-drivers' ); ?>';
				});
			});
		}

		// Pricing Logic
		window.toggleSchedule = function(mode) {
			const box = document.getElementById(mode + '_schedule_dates');
			const link = document.querySelector(`#${mode}-product-modal .schedule-link`);
			
			if (box.style.display === 'none') {
				box.style.display = 'block';
				link.innerText = '<?php esc_html_e( 'Cancelar', 'tukitask-local-drivers' ); ?>';
			} else {
				box.style.display = 'none';
				link.innerText = '<?php esc_html_e( 'Programar', 'tukitask-local-drivers' ); ?>';
				// Clear dates
				document.getElementById(mode + '_date_on_sale_from').value = '';
				document.getElementById(mode + '_date_on_sale_to').value = '';
			}
		}

		window.calculateProfit = function(mode) {
			const priceInput = document.getElementById(mode + '_product_price');
			const catSelect = document.getElementById(mode + '_product_category');
			const display = document.getElementById(mode + '_profit_display');
			
			if (!priceInput || !catSelect || !display) return;
			
			const price = parseFloat(priceInput.value) || 0;
			const option = catSelect.options[catSelect.selectedIndex];
			let commission = 0; // Default
			
			// Try to get from selected category
			if (option && option.dataset.commission) {
				commission = parseFloat(option.dataset.commission);
			} else {
				// Fallback generic global visual estimate if no cat selected
				commission = 10; 
			}

			// Simple visual calculation: Price - (Price * Comm / 100)
			const fee = price * (commission / 100);
			const profit = price - fee;
			
			// Format as currency (Guarani)
			const formatter = new Intl.NumberFormat('es-PY', {
				style: 'currency',
				currency: 'PYG',
				minimumFractionDigits: 0
			});
			
			display.innerText = '( Tu ganancia: ' + formatter.format(profit) + ' )';
		}
		</script>
		<?php
		return ob_get_clean();
	}

	/**
	 * Render overview tab.
	 */
	private function render_overview() {
		$user_id = get_current_user_id();
		$product_count = count_user_posts( $user_id, 'product' );
		$total_revenue = $this->get_vendor_balance( $user_id );
		$recent_orders = $this->get_vendor_orders( $user_id, 5 );
		?>
		<div class="overview-header">
			<h1><?php esc_html_e( 'Vista General del Negocio', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Métricas de rendimiento en tiempo real basadas en tus ventas.', 'tukitask-local-drivers' ); ?></p>
		</div>

		<div class="stats-grid">
			<div class="stat-card glass accent-blue">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Ventas Totales', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo wc_price( $total_revenue ); ?></span>
					<span class="trend up"><?php esc_html_e( 'Datos reales WC', 'tukitask-local-drivers' ); ?></span>
				</div>
				<div class="stat-visual">
					<svg viewBox="0 0 24 24" width="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
				</div>
			</div>
			<div class="stat-card glass accent-purple">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Pedidos Totales', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo count( $this->get_vendor_orders( $user_id, 9999 ) ); ?></span>
					<span class="trend neutral">Live</span>
				</div>
				<div class="stat-visual">
					<svg viewBox="0 0 24 24" width="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H3M21 6H3M21 14H3M21 18H3"></path></svg>
				</div>
			</div>
			<div class="stat-card glass accent-green">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Productos Online', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo esc_html( $product_count ); ?></span>
				</div>
				<div class="stat-visual">
					<svg viewBox="0 0 24 24" width="32" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
				</div>
			</div>
			<div class="stat-card glass accent-orange">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Ventas T. Móvil', 'tukitask-local-drivers' ); ?></span>
					<span class="value">
						<?php 
						$m_orders = array_filter( $this->get_vendor_orders( $user_id, 9999 ), function($o) { return $o->get_meta('_is_mobile_order') === 'yes'; });
						echo count($m_orders);
						?>
					</span>
					<span class="trend up"><?php esc_html_e( 'Express', 'tukitask-local-drivers' ); ?></span>
				</div>
				<div class="stat-visual">
					<svg viewBox="0 0 24 24" width="32" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
				</div>
			</div>
		</div>

		<div class="grid-2-1">
			<div class="chart-container glass">
				<div class="chart-header">
					<h3><?php esc_html_e( 'Tendencia de Ventas Reales (Semana)', 'tukitask-local-drivers' ); ?></h3>
				</div>
				<canvas id="salesOverviewChart" height="150"></canvas>
			</div>
			<div class="recent-activities glass">
				<h3><?php esc_html_e( 'Últimos Pedidos', 'tukitask-local-drivers' ); ?></h3>
				<ul class="activity-list">
					<?php if ( ! empty( $recent_orders ) ) : ?>
						<?php foreach ( $recent_orders as $order ) : ?>
						<li>
							<span class="time"><?php echo esc_html( $order->get_date_created()->date( 'H:i' ) ); ?></span>
							<span class="desc">#<?php echo esc_html( $order->get_id() ); ?> - <strong><?php echo $order->get_formatted_order_total(); ?></strong></span>
							<span class="status <?php echo esc_attr( $order->get_status() ); ?>"><?php echo esc_html( wc_get_order_status_name( $order->get_status() ) ); ?></span>
						</li>
						<?php endforeach; ?>
					<?php else : ?>
						<li class="empty"><?php esc_html_e( 'No hay pedidos recientes.', 'tukitask-local-drivers' ); ?></li>
					<?php endif; ?>
				</ul>
			</div>
		</div>
		<script>
		function initOverviewChart() {
			const canvas = document.getElementById('salesOverviewChart');
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			
			if (window.myOverviewChart && typeof window.myOverviewChart.destroy === 'function') {
				window.myOverviewChart.destroy();
			}

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>?action=tukitask_get_stats&security=<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>')
				.then(response => response.json())
				.then(data => {
					if(!data.success) return;
					window.myOverviewChart = new Chart(ctx, {
						type: 'bar',
						data: {
							labels: data.data.labels,
							datasets: [{
								label: 'Ventas $',
								data: data.data.sales,
								backgroundColor: '#4F46E5',
								borderRadius: 5
							}]
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
							plugins: { legend: { display: false } },
							scales: {
								y: {
									beginAtZero: true
								}
							}
						}
					});
				});
		}

		// Initial load
		setTimeout(() => initOverviewChart(), 800);
		</script>
		<?php
	}

	/**
	 * Render products tab.
	 */
	private function render_products_tab() {
		$vendor_id = get_current_user_id();
		$paged = isset( $_GET['p-page'] ) ? intval( $_GET['p-page'] ) : 1;
		$status_filter = isset( $_GET['status'] ) ? sanitize_text_field( $_GET['status'] ) : 'all';
		$search_query = isset( $_GET['p-search'] ) ? sanitize_text_field( $_GET['p-search'] ) : '';
		$cat_filter = isset( $_GET['p-cat'] ) ? intval( $_GET['p-cat'] ) : -1;
		$products_per_page = 12;

		// Get counts for filters
		$count_all = count( get_posts( array( 'post_type' => 'product', 'author' => $vendor_id, 'posts_per_page' => -1, 'fields' => 'ids' ) ) );
		$count_publish = count( get_posts( array( 'post_type' => 'product', 'author' => $vendor_id, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids' ) ) );
		$count_stock = count( get_posts( array( 'post_type' => 'product', 'author' => $vendor_id, 'meta_query' => array( array( 'key' => '_stock_status', 'value' => 'instock' ) ), 'posts_per_page' => -1, 'fields' => 'ids' ) ) );

		?>
		<div class="product-listing-top">
			<ul class="subsubsub">
				<li class="<?php echo $status_filter === 'all' ? 'current' : ''; ?>">
					<a href="<?php echo add_query_arg( array( 'tab' => 'products', 'status' => 'all' ), remove_query_arg( array( 'p-page', 'p-search' ) ) ); ?>">
						<?php printf( __( 'Todos (%d)', 'tukitask-local-drivers' ), $count_all ); ?>
					</a> |
				</li>
				<li class="<?php echo $status_filter === 'publish' ? 'current' : ''; ?>">
					<a href="<?php echo add_query_arg( array( 'tab' => 'products', 'status' => 'publish' ), remove_query_arg( array( 'p-page', 'p-search' ) ) ); ?>">
						<?php printf( __( 'Publicados (%d)', 'tukitask-local-drivers' ), $count_publish ); ?>
					</a> |
				</li>
				<li class="<?php echo $status_filter === 'instock' ? 'current' : ''; ?>">
					<a href="<?php echo add_query_arg( array( 'tab' => 'products', 'status' => 'instock' ), remove_query_arg( array( 'p-page', 'p-search' ) ) ); ?>">
						<?php printf( __( 'Hay existencias (%d)', 'tukitask-local-drivers' ), $count_stock ); ?>
					</a>
				</li>
			</ul>

			<button class="tukitask-btn accent" onclick="document.getElementById('add-product-modal').style.display='flex'">
				<i class="fas fa-plus"></i> <?php esc_html_e( 'Añadir nuevo producto', 'tukitask-local-drivers' ); ?>
			</button>
		</div>

		<div class="product-filter-bar glass">
			<form method="get" class="filter-form">
				<input type="hidden" name="tab" value="products">
				<?php if ( isset( $_GET['status'] ) ) : ?>
					<input type="hidden" name="status" value="<?php echo esc_attr( $_GET['status'] ); ?>">
				<?php endif; ?>
				
				<div class="filter-group">
					<select name="p-cat">
						<option value="-1"><?php esc_html_e( '– Selecciona una categoría –', 'tukitask-local-drivers' ); ?></option>
						<?php
						$categories = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
						foreach ( $categories as $cat ) {
							printf( '<option value="%d" %s>%s</option>', $cat->term_id, selected( $cat_filter, $cat->term_id, false ), $cat->name );
						}
						?>
					</select>
					<button type="submit" class="btn-filter"><?php esc_html_e( 'Filtrar', 'tukitask-local-drivers' ); ?></button>
				</div>

				<div class="search-group">
					<input type="text" name="p-search" placeholder="<?php esc_html_e( 'Buscar productos...', 'tukitask-local-drivers' ); ?>" value="<?php echo esc_attr( $search_query ); ?>">
					<button type="submit" class="btn-search"><i class="fas fa-search"></i></button>
				</div>
			</form>
		</div>

		<div class="bulk-actions-wrapper">
			<select id="bulk-action-selector">
				<option value="-1"><?php esc_html_e( 'Acciones en lote', 'tukitask-local-drivers' ); ?></option>
				<option value="delete"><?php esc_html_e( 'Eliminar permanentemente', 'tukitask-local-drivers' ); ?></option>
			</select>
			<button class="tukitask-btn" onclick="applyBulkAction()"><?php esc_html_e( 'Aplicar', 'tukitask-local-drivers' ); ?></button>
		</div>

		<div class="table-container glass no-padding">
			<table class="enterprise-table product-list-table">
				<thead>
					<tr>
						<th class="check-column"><input type="checkbox" id="cb-select-all"></th>
						<th class="column-img"><?php esc_html_e( 'Imagen', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Nombre', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'SKU', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Inventario', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Precio', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Ganancias', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Tipo', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Vistas', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Fecha', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php
					$args = array(
						'post_type'      => 'product',
						'author'         => $vendor_id,
						'posts_per_page' => $products_per_page,
						'paged'          => $paged,
						's'              => $search_query,
					);

					if ( $status_filter === 'publish' ) {
						$args['post_status'] = 'publish';
					} elseif ( $status_filter === 'instock' ) {
						$args['meta_query'] = array( array( 'key' => '_stock_status', 'value' => 'instock' ) );
					}

					if ( $cat_filter > 0 ) {
						$args['tax_query'] = array( array( 'taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $cat_filter ) );
					}

					$query = new \WP_Query( $args );
					if ( $query->have_posts() ) {
						while ( $query->have_posts() ) {
							$query->the_post();
							$_product = wc_get_product( get_the_ID() );
							$stock_status = $_product->get_stock_status();
							$price = $_product->get_price();
							$commission = Commission_Manager::calculate_commission( $price, get_the_ID() );
							$earnings = $price - $commission;
							$product_type = $_product->get_type();
							$views = get_post_meta( get_the_ID(), 'total_views', true ); // Placeholder or common meta
							?>
							<tr id="product-row-<?php the_ID(); ?>">
								<td class="check-column"><input type="checkbox" class="cb-select" value="<?php the_ID(); ?>"></td>
								<td class="column-img">
									<a href="javascript:void(0)" onclick="openEditProductModal(<?php the_ID(); ?>)">
										<?php echo $_product->get_image( array( 50, 50 ) ); ?>
									</a>
								</td>
								<td class="column-name">
									<strong><a href="javascript:void(0)" onclick="openEditProductModal(<?php the_ID(); ?>)"><?php the_title(); ?></a></strong>
									<div class="row-actions">
										<span class="edit"><a href="javascript:void(0)" onclick="openEditProductModal(<?php the_ID(); ?>)"><?php _e( 'Editar', 'tukitask-local-drivers' ); ?></a> | </span>
										<span class="view"><a href="<?php echo get_permalink(); ?>" target="_blank"><?php _e( 'Ver', 'tukitask-local-drivers' ); ?></a> | </span>
										<span class="delete"><a href="javascript:void(0)" class="text-danger" onclick="deleteProduct(<?php the_ID(); ?>)"><?php _e( 'Eliminar', 'tukitask-local-drivers' ); ?></a></span>
									</div>
								</td>
								<td>
									<span class="dokan-label <?php echo $_product->get_status() === 'publish' ? 'success' : 'warning'; ?>">
										<?php echo $_product->get_status() === 'publish' ? __( 'Publicado', 'tukitask-local-drivers' ) : __( 'Borrador', 'tukitask-local-drivers' ); ?>
									</span>
								</td>
								<td><span class="na"><?php echo $_product->get_sku() ? esc_html( $_product->get_sku() ) : '–'; ?></span></td>
								<td>
									<mark class="<?php echo esc_attr( $stock_status ); ?>">
										<?php echo 'instock' === $stock_status ? __( 'Hay existencias', 'tukitask-local-drivers' ) : __( 'Sin existencias', 'tukitask-local-drivers' ); ?>
									</mark>
								</td>
								<td><?php echo $_product->get_price_html(); ?></td>
								<td><span class="earnings"><?php echo wc_price( $earnings ); ?></span></td>
								<td><span class="product-type-icon tips" title="<?php echo esc_attr( ucfirst( $product_type ) ); ?>"><i class="fas <?php 
									echo $product_type === 'simple' ? 'fa-cube' : ( $product_type === 'variable' ? 'fa-cubes' : 'fa-list' ); 
								?>"></i></span></td>
								<td><?php echo esc_html( $views ? $views : 0 ); ?></td>
								<td>
									<abbr title="<?php echo get_the_date( 'r' ); ?>"><?php echo get_the_date( 'j M, Y' ); ?></abbr>
									<div class="status-small"><?php echo ucfirst( $_product->get_status() ); ?></div>
								</td>
							</tr>
							<?php
						}
						wp_reset_postdata();
					} else {
						echo '<tr><td colspan="8" class="empty-state">' . esc_html__( 'No se encontraron productos.', 'tukitask-local-drivers' ) . '</td></tr>';
					}
					?>
				</tbody>
			</table>
		</div>
		<div class="pagination-wrapper">
			<?php
			echo paginate_links( array(
				'base'    => add_query_arg( 'p-page', '%#%' ),
				'format'  => '',
				'current' => max( 1, $paged ),
				'total'   => $query->max_num_pages,
				'prev_text' => '&laquo;',
				'next_text' => '&raquo;',
			) );
			?>
		</div>
		<script>
		// Bulk selection logic
		document.getElementById('cb-select-all').addEventListener('change', function() {
			document.querySelectorAll('.cb-select').forEach(cb => cb.checked = this.checked);
		});

		window.applyBulkAction = function() {
			const action = document.getElementById('bulk-action-selector').value;
			if (action === '-1') return;
			
			const selectedIds = Array.from(document.querySelectorAll('.cb-select:checked')).map(cb => cb.value);
			if (selectedIds.length === 0) return alert('Selecciona al menos un producto.');

			if (action === 'delete') {
				if (!confirm('¿Estás seguro de que quieres eliminar los productos seleccionados?')) return;
				
				const formData = new FormData();
				formData.append('action', 'tukitask_bulk_delete_products');
				formData.append('product_ids', selectedIds.join(','));
				formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

				fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
					method: 'POST',
					body: formData
				})
				.then(r => r.json())
				.then(data => {
					alert(data.data.message);
					if (data.success) {
						if(document.location.search.includes('tab=products')) {
							location.reload();
						} else {
							window.location.href = '?tab=products';
						}
					}
				});
			}
		}

		window.deleteProduct = function(productId) {
			if(!confirm('¿Estás seguro de que quieres borrar este producto?')) return;
			
			const formData = new FormData();
			formData.append('action', 'tukitask_delete_product');
			formData.append('product_id', productId);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				if(data.success) {
					document.getElementById('product-row-' + productId).remove();
					alert(data.data.message);
				} else {
					alert(data.data.message);
				}
			});
		}
		</script>
		<?php
	}

	/**
	 * Render orders tab.
	 */
	private function render_orders_tab() {
		$user_id = get_current_user_id();
		$paged = isset( $_GET['o-page'] ) ? intval( $_GET['o-page'] ) : 1;
		$orders_per_page = 10;
		
		// Scalable order fetching: Use standard WC query but with limits
		$order_query = new \WC_Order_Query( array(
			'limit'    => $orders_per_page,
			'page'     => $paged,
			'status'   => array( 'completed', 'processing', 'on-hold', 'listo-para-envio', 'en-camino', 'entrega-fallida' ),
			'paginate' => true,
		) );
		
		$results = $order_query->get_orders();
		$vendor_orders = [];
		
		// Filter vendor orders (since WC doesn't support 'author' in Order Query easily for items)
		// Note: In a true massive scale, we'd use a custom lookup table for vendor_id -> order_id
		foreach ( $results->orders as $order ) {
			foreach ( $order->get_items() as $item ) {
				$pid = $item->get_product_id();
				if ( (int) get_post_field( 'post_author', $pid ) === $user_id ) {
					$vendor_orders[] = $order;
					break;
				}
			}
		}
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Gestión de Pedidos Reales', 'tukitask-local-drivers' ); ?></h1>
			<div class="filter-pills">
				<button class="pill active" onclick="filterVendorOrders('all', this)"><?php esc_html_e( 'Todos', 'tukitask-local-drivers' ); ?></button>
				<button class="pill" onclick="filterVendorOrders('processing', this)"><?php esc_html_e( 'Preparando', 'tukitask-local-drivers' ); ?></button>
				<button class="pill" onclick="filterVendorOrders('on-hold', this)"><?php esc_html_e( 'En Espera', 'tukitask-local-drivers' ); ?></button>
				<button class="pill" onclick="filterVendorOrders('listo-para-envio', this)"><?php esc_html_e( 'Listo', 'tukitask-local-drivers' ); ?></button>
				<button class="pill" onclick="filterVendorOrders('en-camino', this)"><?php esc_html_e( 'En Camino', 'tukitask-local-drivers' ); ?></button>
				<button class="pill" onclick="filterVendorOrders('completed', this)"><?php esc_html_e( 'Completados', 'tukitask-local-drivers' ); ?></button>
			</div>
		</div>

		<div class="table-container glass">
			<table class="enterprise-table">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Pedido', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Fecha', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Cliente', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Artículos', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Total', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Asignación Driver', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Acción', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody id="vendor-orders-body">
					<?php if ( ! empty( $vendor_orders ) ) : ?>
						<?php foreach ( $vendor_orders as $order ) : 
							$items_count = 0;
							$vendor_items = [];
							foreach ( $order->get_items() as $item ) {
								$product = $item->get_product();
								if ( $product ) {
									$author_id = (int) get_post_field( 'post_author', $product->get_id() );
									if ( $author_id === $user_id ) {
										$vendor_items[] = $item->get_name() . ' (x' . $item->get_quantity() . ')';
										$items_count += $item->get_quantity();
									}
								}
							}
							// Estado de asignación de driver
							$driver_id = $order->get_meta('_assigned_driver_id');
							$broadcast_status = $order->get_meta('_broadcast_status');
							$driver_status_html = '';
							if ( $driver_id ) {
								$driver_name = get_the_title( $driver_id );
								if ( ! $driver_name ) {
									$d_user_id = get_post_meta( $driver_id, '_driver_user_id', true );
									$d_user_obj = $d_user_id ? get_user_by( 'ID', $d_user_id ) : null;
									$driver_name = $d_user_obj ? $d_user_obj->display_name : 'Driver asignado';
								}
								$driver_status_html = '<span class="badge success"><i class="fas fa-user-check"></i> ' . esc_html( $driver_name ) . '</span>';
							} elseif ( $broadcast_status === 'no_drivers' ) {
								$driver_status_html = '<span class="badge danger"><i class="fas fa-times-circle"></i> Sin conductores disponibles</span>';
							} elseif ( $broadcast_status === 'searching' || $order->get_meta('_tukitask_order_ready') === 'yes' ) {
								$driver_status_html = '<span class="badge info"><i class="fas fa-search"></i> Buscando conductor...</span>';
							} else {
								$driver_status_html = '<span class="badge muted"><i class="fas fa-clock"></i> Esperando acción</span>';
							}
						?>
						<tr class="order-row" data-status="<?php echo esc_attr( $order->get_status() ); ?>">
							<td><strong>#<?php echo esc_html( $order->get_id() ); ?></strong></td>
							<td><?php echo esc_html( $order->get_date_created()->date( 'd M, H:i' ) ); ?></td>
							<td><?php echo esc_html( $order->get_billing_first_name() ); ?></td>
							<td class="items-list"><?php echo implode( ', ', $vendor_items ); ?></td>
							<td><strong><?php echo $order->get_formatted_order_total(); ?></strong></td>
							<td>
								<span class="badge status-<?php echo esc_attr( $order->get_status() ); ?>"><?php echo esc_html( wc_get_order_status_name( $order->get_status() ) ); ?></span>
								<?php 
								$p_code = $order->get_meta( '_vendor_pickup_code' );
								if ( $p_code && $order->get_meta( '_tukitask_order_ready' ) === 'yes' ) : ?>
									<div class="pickup-code-badge" title="<?php esc_attr_e( 'Código para el repartidor', 'tukitask-local-drivers' ); ?>" style="margin-top:5px; font-size:11px; font-weight:700; color:var(--primary); background:rgba(79, 70, 229, 0.1); padding:2px 4px; border-radius:3px; border:1px solid var(--primary); display:inline-block; font-family:monospace;">
										<i class="fas fa-lock" style="font-size:9px;"></i> <?php echo esc_html( $p_code ); ?>
									</div>
								<?php endif; ?>
							</td>
							<td><?php echo $driver_status_html;
								if ( $broadcast_status === 'no_drivers' ) : ?>
									<button class="tukitask-btn small accent retry-driver-search" data-order-id="<?php echo esc_attr($order->get_id()); ?>" style="margin-top:6px;"><i class="fas fa-redo"></i> <?php esc_html_e('Reintentar búsqueda','tukitask-local-drivers'); ?></button>
								<?php endif; ?></td>
							<td>
								<?php if ( 'processing' === $order->get_status() && $order->get_meta( '_tukitask_order_ready' ) !== 'yes' ) : ?>
									<button class="tukitask-btn small accent" onclick="markOrderReady(<?php echo $order->get_id(); ?>, this)">
										<svg viewBox="0 0 24 24" width="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
										<?php esc_html_e( 'Listo', 'tukitask-local-drivers' ); ?>
									</button>
								<?php elseif ( $order->get_meta( '_tukitask_order_ready' ) === 'yes' ) : ?>
									<span class="text-success" style="font-size:0.8rem; font-weight:600;"><i class="fas fa-check-circle"></i> <?php esc_html_e( 'Repartidor Avisado', 'tukitask-local-drivers' ); ?></span>
								<?php else : ?>
									<span class="text-muted"><?php esc_html_e( 'N/A', 'tukitask-local-drivers' ); ?></span>
								<?php endif; ?>
							</td>
						</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
		<div class="pagination-wrapper">
			<?php
			echo paginate_links( array(
				'base'    => add_query_arg( 'o-page', '%#%' ),
				'format'  => '',
				'current' => max( 1, $paged ),
				'total'   => $results->max_num_pages,
			) );
			?>
		</div>
		<script>
		window.filterVendorOrders = function(status, btn) {
			const rows = document.querySelectorAll('.order-row');
			document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
			if (btn) btn.classList.add('active');
			var visibleCount = 0;
			rows.forEach(row => {
				if(status === 'all' || row.dataset.status === status) {
					row.style.display = '';
					visibleCount++;
				} else {
					row.style.display = 'none';
				}
			});
			// Show empty message if no rows match
			var emptyRow = document.getElementById('vendor-orders-empty');
			if (!emptyRow) {
				emptyRow = document.createElement('tr');
				emptyRow.id = 'vendor-orders-empty';
				emptyRow.innerHTML = '<td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;">No hay pedidos con este filtro.</td>';
				document.getElementById('vendor-orders-body').appendChild(emptyRow);
			}
			emptyRow.style.display = visibleCount === 0 ? '' : 'none';
		}

		window.markOrderReady = function(orderId, btn) {
			if(!confirm('¿El pedido está listo para ser recogido?')) return;
			
			const originalHtml = btn.innerHTML;
			btn.disabled = true;
			btn.innerHTML = '<?php esc_html_e( 'Procesando...', 'tukitask-local-drivers' ); ?>';

			const formData = new FormData();
			formData.append('action', 'tukitask_mark_order_ready');
			formData.append('order_id', orderId);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				if(data.success) {
					btn.innerHTML = '<?php esc_html_e( 'Avisado', 'tukitask-local-drivers' ); ?>';
					btn.classList.remove('accent');
					btn.style.background = '#64748B';
					alert(data.data.message);
				} else {
					alert(data.data.message);
					btn.disabled = false;
					btn.innerHTML = originalHtml;
				}
			})
			.catch(err => {
				console.error(err);
				alert('Error al procesar el pedido.');
				btn.disabled = false;
				btn.innerHTML = originalHtml;
			});
		}

		/* ── Real-time Order Polling ── */
		(function(){
			var lastPoll = Math.floor(Date.now() / 1000) - 300; // Start from 5 min ago
			var pollNonce = '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>';
			var pollUrl = '<?php echo admin_url( "admin-ajax.php" ); ?>';
			var pollInterval = null;

			function pollVendorOrders() {
				var formData = new FormData();
				formData.append('action', 'tukitask_poll_vendor_orders');
				formData.append('security', pollNonce);
				formData.append('since', lastPoll);

				fetch(pollUrl, { method: 'POST', body: formData })
					.then(function(r) { return r.json(); })
					.then(function(data) {
						if (!data.success || !data.data.orders.length) return;
						lastPoll = data.data.timestamp;
						data.data.orders.forEach(function(o) {
							updateOrderRow(o);
						});
					})
					.catch(function(err) { console.warn('TukiVendor poll error:', err); });
			}

			function updateOrderRow(o) {
				var rows = document.querySelectorAll('.order-row');
				rows.forEach(function(row) {
					var orderCell = row.querySelector('td:first-child strong');
					if (!orderCell) return;
					var rowOrderId = orderCell.textContent.replace('#', '').trim();
					if (parseInt(rowOrderId) !== o.id) return;

					// Update data-status attribute so filters keep working after poll updates
					row.dataset.status = o.status;

					// Update order status badge
					var statusBadge = row.querySelector('.badge[class*="status-"]');
					if (statusBadge) {
						statusBadge.className = 'badge status-' + o.status;
						statusBadge.textContent = o.status_label;
					}

					// Update driver assignment column (7th column)
					var cells = row.querySelectorAll('td');
					if (cells.length >= 7) {
						var driverCell = cells[6];
						if (o.driver_id && o.driver_name) {
							driverCell.innerHTML = '<span class="badge success"><i class="fas fa-user-check"></i> ' + o.driver_name + '</span>';
						} else if (o.broadcast_status === 'no_drivers') {
							driverCell.innerHTML = '<span class="badge danger"><i class="fas fa-times-circle"></i> Sin conductores</span>';
						} else if (o.broadcast_status === 'searching' || o.order_ready) {
							driverCell.innerHTML = '<span class="badge info"><i class="fas fa-search"></i> Buscando conductor...</span>';
						}
					}

					// Update pickup code display
					if (o.pickup_code && o.order_ready) {
						var statusCell = cells[5];
						if (statusCell && !statusCell.querySelector('.pickup-code-badge')) {
							var codeDiv = document.createElement('div');
							codeDiv.className = 'pickup-code-badge';
							codeDiv.style = 'margin-top:5px;font-size:11px;font-weight:700;color:var(--primary);background:rgba(79,70,229,0.1);padding:2px 4px;border-radius:3px;border:1px solid var(--primary);display:inline-block;font-family:monospace;';
							codeDiv.innerHTML = '<i class="fas fa-lock" style="font-size:9px;"></i> ' + o.pickup_code;
							statusCell.appendChild(codeDiv);
						}
					}

					// Flash updated row
					row.style.transition = 'background 0.3s';
					row.style.background = 'rgba(79,70,229,0.08)';
					setTimeout(function() { row.style.background = ''; }, 2000);
				});
			}

			// Poll every 15 seconds
			pollInterval = setInterval(pollVendorOrders, 15000);
			// Initial poll after 3 seconds
			setTimeout(pollVendorOrders, 3000);

			// Stop polling when tab is not visible
			document.addEventListener('visibilitychange', function() {
				if (document.hidden) {
					clearInterval(pollInterval);
				} else {
					pollVendorOrders();
					pollInterval = setInterval(pollVendorOrders, 15000);
				}
			});
		})();
		</script>
		<?php
	}

	/**
	 * Render analytics tab.
	 */
	private function render_analytics_tab() {
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Reportes de Negocio', 'tukitask-local-drivers' ); ?></h1>
			<div class="date-range">
				<input type="date" value="<?php echo date('Y-m-d', strtotime('-7 days')); ?>">
				<span>a</span>
				<input type="date" value="<?php echo date('Y-m-d'); ?>">
			</div>
		</div>

		<div class="analytics-dashboard">
			<div class="main-chart glass">
				<h3><?php esc_html_e( 'Rendimiento de Ventas ($)', 'tukitask-local-drivers' ); ?></h3>
				<canvas id="salesChart" height="300"></canvas>
			</div>
			<div class="stats-sidebar">
				<div class="mini-card glass">
					<span><?php esc_html_e( 'Mejor Producto', 'tukitask-local-drivers' ); ?></span>
					<strong id="top-product-name">...</strong>
					<small id="top-product-sales">...</small>
				</div>
				<div class="mini-card glass">
					<span><?php esc_html_e( 'Ticket Promedio', 'tukitask-local-drivers' ); ?></span>
					<strong id="avg-ticket-value">...</strong>
					<small id="avg-ticket-trend">+0%</small>
				</div>
			</div>
		</div>
		<script>
		// Analytics tab initialization is handled by the main tab logic to avoid duplication
		</script>
		<?php
	}

	/**
	 * Render wallet tab.
	 */
	public function render_wallet_tab() {
		$user_id = get_current_user_id();
		$balance = $this->get_vendor_balance( $user_id );
		$locked  = Payout_Manager::get_locked_balance( $user_id );

		// Calculate gross earnings for the breakdown
		$vendor_product_ids = get_posts( array( 'post_type' => 'product', 'author' => $user_id, 'fields' => 'ids', 'posts_per_page' => -1 ) );
		$gross_earned = 0;
		$total_commissions = 0;
		if ( ! empty( $vendor_product_ids ) ) {
			$orders = wc_get_orders( array( 'limit' => 200, 'status' => 'completed' ) );
			foreach ( $orders as $order ) {
				foreach ( $order->get_items() as $item ) {
					if ( in_array( $item->get_product_id(), $vendor_product_ids ) ) {
						$total = (float) $item->get_total();
						$commission = Commission_Manager::calculate_commission( $total, $item->get_product_id() );
						$gross_earned += $total;
						$total_commissions += $commission;
					}
				}
			}
		}

		global $wpdb;
		$total_paid = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT COALESCE(SUM(amount), 0) FROM {$wpdb->prefix}tukitask_payouts WHERE vendor_id = %d AND status = 'paid'",
			$user_id
		) );

		$can_withdraw = $balance > 0;
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Mi Billetera', 'tukitask-local-drivers' ); ?></h1>
		</div>

		<div class="wallet-overview">
			<div class="wallet-card gradient-dark">
				<div class="balance-info">
					<span class="label"><?php esc_html_e( 'Saldo Disponible', 'tukitask-local-drivers' ); ?></span>
					<span class="balance-amount"><?php echo wc_price( $balance ); ?></span>
				</div>
				<?php if ( $can_withdraw ) : ?>
					<button class="withdraw-btn" onclick="openWithdrawModal()"><?php esc_html_e( 'Solicitar Retiro', 'tukitask-local-drivers' ); ?></button>
				<?php else : ?>
					<button class="withdraw-btn" disabled style="opacity:0.5; cursor:not-allowed;"><?php esc_html_e( 'Sin saldo disponible', 'tukitask-local-drivers' ); ?></button>
				<?php endif; ?>
			</div>
			
			<div class="wallet-stats glass">
				<div class="w-stat">
					<span><?php esc_html_e( 'Ventas Brutas', 'tukitask-local-drivers' ); ?></span>
					<strong><?php echo wc_price( $gross_earned ); ?></strong>
				</div>
				<div class="w-stat">
					<span><?php esc_html_e( 'Comisiones', 'tukitask-local-drivers' ); ?></span>
					<strong style="color: #EF4444;">-<?php echo wc_price( $total_commissions ); ?></strong>
				</div>
				<div class="w-stat">
					<span><?php esc_html_e( 'Retirado', 'tukitask-local-drivers' ); ?></span>
					<strong style="color: #6B7280;"><?php echo wc_price( $total_paid ); ?></strong>
				</div>
				<div class="w-stat">
					<span><?php esc_html_e( 'En Proceso', 'tukitask-local-drivers' ); ?></span>
					<strong style="color: #F59E0B;"><?php echo wc_price( $locked ); ?></strong>
				</div>
			</div>
		</div>

		<div class="history-section glass" style="margin-top:20px;">
			<h3><?php _e( 'Historial de Retiros', 'tukitask-local-drivers' ); ?></h3>
			<table class="enterprise-table">
				<thead>
					<tr>
						<th><?php _e( 'Fecha', 'tukitask-local-drivers' ); ?></th>
						<th><?php _e( 'Monto', 'tukitask-local-drivers' ); ?></th>
						<th><?php _e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:right;"><?php _e( 'Acción', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php 
					$payouts = Payout_Manager::get_vendor_payouts( $user_id );
					if ( ! empty( $payouts ) ) : 
						foreach ( $payouts as $p ) : 
							$st_labels = array(
								'pending'    => array( 'l' => 'Pendiente', 'b' => 'stock-in' ),
								'processing' => array( 'l' => 'Procesando', 'b' => 'info' ),
								'paid'       => array( 'l' => 'Pagado', 'b' => 'success' ),
								'rejected'   => array( 'l' => 'Rechazado', 'b' => 'danger' ),
							);
							$st = isset($st_labels[$p->status]) ? $st_labels[$p->status] : $st_labels['pending'];
						?>
						<tr>
							<td><?php echo date_i18n( get_option('date_format'), strtotime($p->created_at) ); ?></td>
							<td><strong><?php echo wc_price($p->amount); ?></strong></td>
							<td><span class="badge <?php echo $st['b']; ?>"><?php echo $st['l']; ?></span></td>
							<td style="text-align:right;">
								<?php if ( 'paid' === $p->status ) : ?>
									<a href="<?php echo admin_url( 'admin-ajax.php?action=tukitask_download_invoice&type=payout&id=' . $p->id ); ?>" target="_blank" class="tukitask-btn small accent" style="padding: 6px 12px; font-size: 11px;">
										<i class="fas fa-file-pdf"></i> <?php _e( 'Factura', 'tukitask-local-drivers' ); ?>
									</a>
								<?php endif; ?>
							</td>
						</tr>
						<?php endforeach; ?>
					<?php else : ?>
						<tr><td colspan="3" class="empty-state"><?php _e( 'No has solicitado retiros aún.', 'tukitask-local-drivers' ); ?></td></tr>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
		<script>
		window.openWithdrawModal = function() {
			<?php if ( ! $can_withdraw ) : ?>
				alert('<?php esc_attr_e( 'No tienes saldo disponible para retirar.', 'tukitask-local-drivers' ); ?>');
				return;
			<?php endif; ?>
			var amountInput = document.getElementById('withdraw-amount');
			if (amountInput) {
				amountInput.max = <?php echo esc_js( $balance ); ?>;
				amountInput.value = '';
				amountInput.placeholder = '<?php echo esc_attr( sprintf( __( 'Máximo: %s', 'tukitask-local-drivers' ), strip_tags( wc_price( $balance ) ) ) ); ?>';
			}
			document.getElementById('withdraw-modal').style.display = 'flex';
		}

		window.requestWithdrawal = function() {
			var amount = parseFloat(document.getElementById('withdraw-amount').value);
			var maxBalance = <?php echo esc_js( $balance ); ?>;
			if(!amount || amount <= 0) return alert('<?php esc_attr_e( 'Ingresa un monto válido.', 'tukitask-local-drivers' ); ?>');
			if(amount > maxBalance) return alert('<?php esc_attr_e( 'El monto excede tu saldo disponible.', 'tukitask-local-drivers' ); ?>');

			var btn = document.querySelector('#withdraw-modal .tukitask-btn');
			if (btn) { btn.disabled = true; btn.innerHTML = '<?php esc_attr_e( 'Procesando...', 'tukitask-local-drivers' ); ?>'; }

			var formData = new FormData();
			formData.append('action', 'tukitask_request_withdrawal');
			formData.append('amount', amount);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(function(response) { return response.json(); })
			.then(function(data) {
				if(data.success) {
					alert(data.data.message);
					location.reload();
				} else {
					alert(data.data.message);
					if (btn) { btn.disabled = false; btn.innerHTML = '<?php esc_attr_e( 'Confirmar Retiro', 'tukitask-local-drivers' ); ?>'; }
				}
			});
		}
		</script>
		<?php
	}

	/**
	 * Render mobile store management tab.
	 */
	private function render_mobile_store_tab() {
		$user_id = get_current_user_id();
		$products = get_posts( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'author'         => $user_id,
		) );
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Inventario de Tienda Móvil', 'tukitask-local-drivers' ); ?></h1>
			<p><?php esc_html_e( 'Selecciona qué productos estarán disponibles para la venta en ruta.', 'tukitask-local-drivers' ); ?></p>
		</div>

		<div class="table-container glass">
			<table class="enterprise-table">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Producto', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Precio', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'En Vehículo', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if ( ! empty( $products ) ) : ?>
						<?php foreach ( $products as $p ) : 
							$_product = wc_get_product( $p->ID );
							$is_mobile = get_post_meta( $p->ID, '_tukitask_is_mobile_stock', true ) === 'yes';
						?>
						<tr>
							<td class="product-cell">
								<div class="p-img"><?php echo $_product->get_image( 'thumbnail' ); ?></div>
								<div class="p-info">
									<strong><?php echo esc_html( $p->post_title ); ?></strong>
									<span><?php echo esc_html( wc_get_product_category_list( $p->ID ) ); ?></span>
								</div>
							</td>
							<td><strong><?php echo wp_kses_post( $_product->get_price_html() ); ?></strong></td>
							<td>
								<label class="tuki-switch">
									<input type="checkbox" onchange="toggleMobileStock(<?php echo $p->ID; ?>, this.checked)" <?php checked( $is_mobile ); ?>>
									<span class="tuki-slider"></span>
								</label>
							</td>
							<td>
								<span id="badge-mobile-<?php echo $p->ID; ?>" class="badge <?php echo $is_mobile ? 'success' : 'stock-in'; ?>">
									<?php echo $is_mobile ? esc_html__( 'Móvil Activo', 'tukitask-local-drivers' ) : esc_html__( 'Local Solo', 'tukitask-local-drivers' ); ?>
								</span>
							</td>
						</tr>
						<?php endforeach; ?>
					<?php else : ?>
						<tr><td colspan="4" class="empty-state"><?php esc_html_e( 'No tienes productos aún.', 'tukitask-local-drivers' ); ?></td></tr>
					<?php endif; ?>
				</tbody>
			</table>
		</div>

		<style>
		.tuki-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
		.tuki-switch input { opacity: 0; width: 0; height: 0; }
		.tuki-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 24px; }
		.tuki-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
		input:checked + .tuki-slider { background-color: var(--e-primary); }
		input:checked + .tuki-slider:before { transform: translateX(20px); }
		</style>

		<script>
		window.toggleMobileStock = function(productId, isChecked) {
			const formData = new FormData();
			formData.append('action', 'tukitask_toggle_mobile_stock');
			formData.append('product_id', productId);
			formData.append('is_mobile', isChecked);
			formData.append('security', '<?php echo wp_create_nonce( "tukitask_vendedor_nonce" ); ?>');

			fetch('<?php echo admin_url( 'admin-ajax.php' ); ?>', {
				method: 'POST',
				body: formData
			})
			.then(response => response.json())
			.then(data => {
				const badge = document.getElementById('badge-mobile-' + productId);
				if(data.success) {
					if(isChecked) {
						badge.className = 'badge success';
						badge.innerHTML = '<?php esc_html_e( 'Móvil Activo', 'tukitask-local-drivers' ); ?>';
					} else {
						badge.className = 'badge stock-in';
						badge.innerHTML = '<?php esc_html_e( 'Local Solo', 'tukitask-local-drivers' ); ?>';
					}
				} else {
					alert(data.data.message);
				}
			});
		}
		</script>
		<?php
	}

	/* =========================================================================
	 *  TAB: DROPSHIP CATALOG (browse & import from providers)
	 * ====================================================================== */

	private function render_dropship_catalog_tab() {
		$vendor_id = get_current_user_id();
		$nonce = wp_create_nonce( 'tukitask_vendedor_nonce' );
		$ajax_url = admin_url( 'admin-ajax.php' );

		// Get already imported product source IDs
		$imported_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $vendor_id,
			'meta_key'       => '_tukitask_source_product_id',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		) );
		$imported_sources = array();
		foreach ( $imported_ids as $imp_id ) {
			$src = get_post_meta( $imp_id, '_tukitask_source_product_id', true );
			if ( $src ) $imported_sources[] = (int) $src;
		}

		// Get catalog categories
		$categories = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Catálogo Dropshipping', 'tukitask-local-drivers' ); ?></h1>
			<p style="color:var(--e-text-muted);"><?php esc_html_e( 'Importa productos de proveedores para vender en tu tienda. Tú defines el precio de venta y ganas la diferencia.', 'tukitask-local-drivers' ); ?></p>
		</div>

		<!-- Search & Filters -->
		<div class="glass" style="padding:15px 20px; margin:20px 0; border-radius:var(--e-radius-md); display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
			<input type="text" id="ds-search" placeholder="<?php esc_attr_e( 'Buscar productos...', 'tukitask-local-drivers' ); ?>" style="flex:1;min-width:200px;padding:10px 16px;border:1px solid var(--e-border);border-radius:8px;font-size:14px;">
			<select id="ds-category" style="padding:10px 14px;border:1px solid var(--e-border);border-radius:8px;font-size:14px;">
				<option value=""><?php esc_html_e( 'Todas las categorías', 'tukitask-local-drivers' ); ?></option>
				<?php if ( ! is_wp_error( $categories ) ) : foreach ( $categories as $cat ) : ?>
					<option value="<?php echo $cat->term_id; ?>"><?php echo esc_html( $cat->name ); ?></option>
				<?php endforeach; endif; ?>
			</select>
			<button class="tukitask-btn accent" onclick="dropshipSearch()"><?php esc_html_e( 'Buscar', 'tukitask-local-drivers' ); ?></button>
		</div>

		<!-- Product Grid -->
		<div id="ds-catalog-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;">
			<div class="glass" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--e-text-muted);">
				<p><?php esc_html_e( 'Haz clic en "Buscar" para cargar el catálogo de proveedores.', 'tukitask-local-drivers' ); ?></p>
			</div>
		</div>

		<!-- Import Modal -->
		<div id="ds-import-modal" class="enterprise-modal">
			<div class="modal-content glass" style="max-width:500px; padding:35px;">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
					<h2 id="ds-import-title" style="margin:0;"><?php esc_html_e( 'Importar Producto', 'tukitask-local-drivers' ); ?></h2>
					<button style="background:none;border:none;font-size:24px;cursor:pointer;" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>
				<img id="ds-import-img" src="" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:15px;">
				<p id="ds-import-desc" style="color:var(--e-text-muted);font-size:13px;margin-bottom:15px;"></p>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;">
					<div>
						<small style="color:var(--e-text-muted);font-weight:600;"><?php esc_html_e( 'Precio Proveedor', 'tukitask-local-drivers' ); ?></small>
						<div id="ds-import-supplier-price" style="font-size:20px;font-weight:800;color:var(--e-accent);"></div>
					</div>
					<div>
						<small style="color:var(--e-text-muted);font-weight:600;"><?php esc_html_e( 'PVP Sugerido', 'tukitask-local-drivers' ); ?></small>
						<div id="ds-import-suggested" style="font-size:20px;font-weight:800;color:#10B981;"></div>
					</div>
				</div>
				<div style="margin-bottom:12px;">
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Tu Precio de Venta', 'tukitask-local-drivers' ); ?> *</label>
					<input type="number" id="ds-sell-price" min="0" step="any" style="width:100%;padding:12px;border:1px solid var(--e-border);border-radius:8px;font-size:16px;" oninput="dsCalcMargin()">
				</div>
				<div id="ds-margin-info" style="padding:12px;border-radius:8px;background:#F0FDF4;border:1px solid #BBF7D0;margin-bottom:15px;display:none;">
					<span style="font-weight:600;color:#065F46;"><?php esc_html_e( 'Tu ganancia por venta:', 'tukitask-local-drivers' ); ?> <span id="ds-margin-amount"></span></span>
				</div>
				<input type="hidden" id="ds-import-product-id" value="">
				<input type="hidden" id="ds-import-supplier-val" value="">
				<button class="tukitask-btn accent" style="width:100%;" onclick="dsImportProduct()"><?php esc_html_e( 'Importar a Mi Tienda', 'tukitask-local-drivers' ); ?></button>
			</div>
		</div>

		<script>
		(function(){
			var dsNonce  = '<?php echo esc_js( $nonce ); ?>';
			var dsAjax   = '<?php echo esc_url( $ajax_url ); ?>';
			var imported = <?php echo wp_json_encode( $imported_sources ); ?>;

			window.dropshipSearch = function(page){
				page = page || 1;
				var search = document.getElementById('ds-search').value;
				var cat = document.getElementById('ds-category').value;
				var grid = document.getElementById('ds-catalog-grid');
				grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--e-text-muted);"><?php esc_attr_e( 'Cargando...', 'tukitask-local-drivers' ); ?></div>';

				var url = dsAjax + '?action=tukitask_dropship_browse&security=' + encodeURIComponent(dsNonce) + '&search=' + encodeURIComponent(search) + '&category=' + encodeURIComponent(cat) + '&paged=' + page;
				fetch(url).then(function(r){return r.json();}).then(function(data){
					if(!data.success || !data.data.products.length){
						grid.innerHTML = '<div class="glass" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--e-text-muted);"><?php esc_attr_e( 'No se encontraron productos en el catálogo.', 'tukitask-local-drivers' ); ?></div>';
						return;
					}
					var html = '';
					data.data.products.forEach(function(p){
						var alreadyImported = imported.indexOf(p.id) !== -1;
						html += '<div class="glass" style="border-radius:var(--e-radius-md);overflow:hidden;">';
						html += '<div style="height:160px;overflow:hidden;"><img src="'+p.image+'" style="width:100%;height:100%;object-fit:cover;" alt=""></div>';
						html += '<div style="padding:16px;">';
						html += '<h4 style="margin:0 0 6px;font-size:14px;font-weight:700;">'+p.name+'</h4>';
						html += '<div style="display:flex;gap:15px;margin-bottom:8px;">';
						html += '<div><small style="color:var(--e-text-muted);"><?php esc_attr_e( 'Proveedor', 'tukitask-local-drivers' ); ?></small><br><strong style="color:var(--e-accent);">'+formatPrice(p.supplier_price)+'</strong></div>';
						if(p.suggested_price) html += '<div><small style="color:var(--e-text-muted);">PVP Sug.</small><br><strong>'+formatPrice(p.suggested_price)+'</strong></div>';
						html += '</div>';
						html += '<div style="font-size:11px;color:var(--e-text-muted);margin-bottom:10px;">'+p.provider_name+' &bull; '+p.category+'</div>';
						if(alreadyImported){
							html += '<button class="tukitask-btn small" disabled style="width:100%;opacity:.5;"><?php esc_attr_e( 'Ya importado', 'tukitask-local-drivers' ); ?></button>';
						} else {
							html += '<button class="tukitask-btn accent small" style="width:100%;" onclick="dsOpenImport('+p.id+')"><?php esc_attr_e( 'Importar', 'tukitask-local-drivers' ); ?></button>';
						}
						html += '</div></div>';
					});
					grid.innerHTML = html;
				});
			};

			function formatPrice(val){
				return '$' + parseFloat(val).toLocaleString('es-CO', {minimumFractionDigits:0,maximumFractionDigits:0});
			}

			window.dsOpenImport = function(pid){
				var url = dsAjax + '?action=tukitask_dropship_product_detail&security=' + encodeURIComponent(dsNonce) + '&product_id=' + pid;
				fetch(url).then(function(r){return r.json();}).then(function(data){
					if(!data.success) return alert(data.data.message);
					var p = data.data;
					document.getElementById('ds-import-title').textContent = p.name;
					document.getElementById('ds-import-img').src = p.image;
					document.getElementById('ds-import-desc').textContent = p.description || '';
					document.getElementById('ds-import-supplier-price').textContent = formatPrice(p.supplier_price);
					document.getElementById('ds-import-suggested').textContent = p.suggested_price ? formatPrice(p.suggested_price) : '—';
					document.getElementById('ds-import-product-id').value = p.id;
					document.getElementById('ds-import-supplier-val').value = p.supplier_price;
					document.getElementById('ds-sell-price').value = p.suggested_price || '';
					document.getElementById('ds-sell-price').min = p.supplier_price;
					dsCalcMargin();
					document.getElementById('ds-import-modal').style.display = 'flex';
				});
			};

			window.dsCalcMargin = function(){
				var sell = parseFloat(document.getElementById('ds-sell-price').value) || 0;
				var cost = parseFloat(document.getElementById('ds-import-supplier-val').value) || 0;
				var info = document.getElementById('ds-margin-info');
				if(sell > cost){
					info.style.display = 'block';
					document.getElementById('ds-margin-amount').textContent = formatPrice(sell - cost);
				} else {
					info.style.display = 'none';
				}
			};

			window.dsImportProduct = function(){
				var pid = document.getElementById('ds-import-product-id').value;
				var sellPrice = document.getElementById('ds-sell-price').value;
				if(!pid || !sellPrice) return alert('<?php esc_attr_e( 'Define un precio de venta.', 'tukitask-local-drivers' ); ?>');

				var fd = new FormData();
				fd.append('action', 'tukitask_dropship_import');
				fd.append('security', dsNonce);
				fd.append('product_id', pid);
				fd.append('sell_price', sellPrice);

				fetch(dsAjax, {method:'POST', body:fd}).then(function(r){return r.json();}).then(function(data){
					alert(data.data.message);
					if(data.success){
						imported.push(parseInt(pid));
						document.getElementById('ds-import-modal').style.display = 'none';
						dropshipSearch(); // refresh grid
					}
				});
			};
		})();
		</script>
		<?php
	}

	/**
	 * Render profile tab.
	 */
	private function render_profile_tab() {
		$user_id = get_current_user_id();
		$user = get_userdata( $user_id );
		$description = get_user_meta( $user_id, '_vendedor_store_description', true );
		$logo_id = get_user_meta( $user_id, '_vendedor_store_logo', true );
		$banner_id = get_user_meta( $user_id, '_vendedor_store_banner', true );
		
		// WooCommerce billing meta
		$b_address_1 = get_user_meta( $user_id, 'billing_address_1', true );
		$b_address_2 = get_user_meta( $user_id, 'billing_address_2', true );
		$b_city      = get_user_meta( $user_id, 'billing_city', true );
		$b_postcode  = get_user_meta( $user_id, 'billing_postcode', true );
		$b_country   = get_user_meta( $user_id, 'billing_country', true );
		$b_state     = get_user_meta( $user_id, 'billing_state', true );
		$b_phone     = get_user_meta( $user_id, 'billing_phone', true );

		$logo_url = $logo_id ? wp_get_attachment_url( $logo_id ) : '';
		$banner_url = $banner_id ? wp_get_attachment_url( $banner_id ) : '';
		
		$countries_obj = new \WC_Countries();
		$countries = $countries_obj->get_countries();
		$states    = ( $b_country ) ? $countries_obj->get_states( $b_country ) : [];
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Perfil de mi Tienda', 'tukitask-local-drivers' ); ?></h1>
		</div>

		<div class="profile-layout grid-2-1">
			<div class="profile-form glass">

				<form id="store-profile-form">
					<div class="form-group">
						<label><?php esc_html_e( 'Nombre de la Tienda', 'tukitask-local-drivers' ); ?></label>
						<input type="text" id="store_name" value="<?php echo esc_attr($user->display_name); ?>" placeholder="<?php esc_attr_e( 'Nombre comercial', 'tukitask-local-drivers' ); ?>">
					</div>

					<div class="form-group">
						<label><?php esc_html_e( 'Descripción de la Tienda', 'tukitask-local-drivers' ); ?></label>
						<textarea rows="3" id="store_description" placeholder="Cuéntanos sobre tu negocio..."><?php echo esc_textarea($description); ?></textarea>
					</div>

					<h4 style="margin:25px 0 15px; padding-top:15px; border-top: 1px solid var(--border);"><?php _e( 'Dirección de Recogida', 'tukitask-local-drivers' ); ?></h4>
					
					<div class="form-group">
						<label><?php esc_html_e( 'Calle', 'tukitask-local-drivers' ); ?></label>
						<input type="text" id="store_address_1" value="<?php echo esc_attr($b_address_1); ?>" placeholder="<?php esc_attr_e( 'Dirección principal...', 'tukitask-local-drivers' ); ?>">
					</div>

					<div class="form-group">
						<label><?php esc_html_e( 'Calle 2 (Opcional)', 'tukitask-local-drivers' ); ?></label>
						<input type="text" id="store_address_2" value="<?php echo esc_attr($b_address_2); ?>" placeholder="<?php esc_attr_e( 'Apartamento, habitación, unidad, etc.', 'tukitask-local-drivers' ); ?>">
					</div>

					<div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
						<div class="form-group">
							<label><?php esc_html_e( 'Población / Ciudad', 'tukitask-local-drivers' ); ?></label>
							<input type="text" id="store_city" value="<?php echo esc_attr($b_city); ?>" placeholder="<?php esc_attr_e( 'Ciudad', 'tukitask-local-drivers' ); ?>">
						</div>
						<div class="form-group">
							<label><?php esc_html_e( 'Código Postal', 'tukitask-local-drivers' ); ?></label>
							<input type="text" id="store_postcode" value="<?php echo esc_attr($b_postcode); ?>" placeholder="<?php esc_attr_e( 'Código postal', 'tukitask-local-drivers' ); ?>">
						</div>
					</div>

					<div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
						<div class="form-group">
							<label><?php esc_html_e( 'País *', 'tukitask-local-drivers' ); ?></label>
							<select id="store_country" class="tuki-input">
								<?php foreach ( $countries as $code => $name ) : ?>
									<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $b_country, $code ); ?>><?php echo esc_html( $name ); ?></option>
								<?php endforeach; ?>
							</select>
						</div>
						<div class="form-group">
							<label><?php esc_html_e( 'Provincia / Estado *', 'tukitask-local-drivers' ); ?></label>
							<div id="store_state_wrapper">
								<?php if ( ! empty( $states ) ) : ?>
									<select id="store_state" class="tuki-input">
										<?php foreach ( $states as $code => $name ) : ?>
											<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $b_state, $code ); ?>><?php echo esc_html( $name ); ?></option>
										<?php endforeach; ?>
									</select>
								<?php else : ?>
									<input type="text" id="store_state" value="<?php echo esc_attr($b_state); ?>" placeholder="<?php esc_attr_e( 'Estado/Provincia', 'tukitask-local-drivers' ); ?>">
								<?php endif; ?>
							</div>
						</div>
					</div>

					<div class="form-group">
						<label><?php esc_html_e( 'Número de teléfono', 'tukitask-local-drivers' ); ?></label>
						<input type="text" id="store_phone" value="<?php echo esc_attr($b_phone); ?>" placeholder="<?php esc_attr_e( 'Teléfono para repartidores', 'tukitask-local-drivers' ); ?>">
					</div>

					<div style="display:none;">
						<input type="hidden" id="store_lat" value="<?php echo esc_attr(get_user_meta($user_id, '_vendedor_store_lat', true)); ?>">
						<input type="hidden" id="store_lng" value="<?php echo esc_attr(get_user_meta($user_id, '_vendedor_store_lng', true)); ?>">
					</div>

					<button type="submit" class="tukitask-btn accent" style="margin-top:20px; width:100%; padding: 15px;">
						<?php esc_html_e( 'Guardar Configuración', 'tukitask-local-drivers' ); ?>
					</button>
				</form>
			</div>

			<div class="branding-box glass">
				<h3><?php esc_html_e( 'Identidad Visual', 'tukitask-local-drivers' ); ?></h3>
				
				<div class="media-upload-wrapper">
					<label><?php esc_html_e( 'Banner de Portada', 'tukitask-local-drivers' ); ?></label>
					<div class="banner-preview" id="banner-preview-box" style="background-image: url('<?php echo esc_url($banner_url); ?>');">
						<?php if(!$banner_url): ?><span style="color:#64748b;"><?php esc_html_e( 'Subir Banner', 'tukitask-local-drivers' ); ?></span><?php endif; ?>
					</div>
					<input type="file" id="banner_input" hidden onchange="handleBrandingUpload(this, 'banner')">
					<button class="btn-text" onclick="document.getElementById('banner_input').click()"><?php esc_html_e( 'Cambiar Imagen', 'tukitask-local-drivers' ); ?></button>
				</div>

				<div class="media-upload-wrapper" style="margin-top: 25px;">
					<label><?php esc_html_e( 'Logo de la Tienda', 'tukitask-local-drivers' ); ?></label>
					<div class="logo-preview" id="logo-preview-box" style="background-image: url('<?php echo esc_url($logo_url); ?>');">
						<?php if(!$logo_url): ?><span style="color:#64748b;"><?php esc_html_e( 'Logo', 'tukitask-local-drivers' ); ?></span><?php endif; ?>
					</div>
					<input type="file" id="logo_input" hidden onchange="handleBrandingUpload(this, 'logo')">
					<button class="btn-text" onclick="document.getElementById('logo_input').click()"><?php esc_html_e( 'Cambiar Logo', 'tukitask-local-drivers' ); ?></button>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * Render all modals used in the UI.
	 */
	private function render_modals() {
		?>
		<!-- Add Product Modal -->
		<div id="add-product-modal" class="enterprise-modal">
			<div class="modal-content glass product-modal">
				<div class="modal-header">
					<div class="header-title">
						<i class="fas fa-box-open"></i>
						<h2><?php esc_html_e( 'Publicar Nuevo Producto', 'tukitask-local-drivers' ); ?></h2>
					</div>
					<button class="close-x" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>
				<form id="tukitask-add-product-form" class="enterprise-form">
					<div class="product-modal-grid">
						<!-- Left Side: Images -->
						<div class="modal-col-media">
							<div class="image-upload-zone" id="dropzone">
								<input type="file" id="image_input" accept="image/*" style="display:none">
								<input type="hidden" name="image_id" id="uploaded_image_id">
								<div class="upload-placeholder">
									<i class="fas fa-cloud-upload-alt"></i>
									<p><?php esc_html_e( 'Imagen Principal', 'tukitask-local-drivers' ); ?></p>
								</div>
								<div id="image-preview" class="preview-container"></div>
							</div>
							
							<div class="product-gallery-section">
								<ul id="gallery-preview-list" class="gallery-list">
									<li class="add-gallery-item" onclick="document.getElementById('gallery_input').click()">
										<i class="fas fa-plus"></i>
										<input type="file" id="gallery_input" accept="image/*" multiple style="display:none">
									</li>
								</ul>
								<input type="hidden" name="gallery_ids" id="product_gallery_ids">
							</div>
						</div>

						<!-- Right Side: Details -->
						<div class="modal-col-details">
							<div class="form-group">
								<label><?php esc_html_e( 'Nombre del Producto', 'tukitask-local-drivers' ); ?></label>
								<input type="text" name="title" required placeholder="Ej: Pizza Suprema">
							</div>

							<div class="form-row">
								<div class="form-group price-group">
									<label><?php esc_html_e( 'Precio (₲)', 'tukitask-local-drivers' ); ?> <span class="profit-display" id="add_profit_display"></span></label>
									<input type="number" step="0.01" name="price" id="add_product_price" required placeholder="0.00" oninput="calculateProfit('add')">
								</div>
								<div class="form-group price-group">
									<div class="label-row" style="margin-bottom: 5px;">
										<label><?php esc_html_e( 'Oferta', 'tukitask-local-drivers' ); ?></label>
										<a href="javascript:void(0)" class="schedule-link" onclick="toggleSchedule('add')"><?php esc_html_e( 'Programar', 'tukitask-local-drivers' ); ?></a>
									</div>
									<input type="number" step="0.01" name="sale_price" id="add_product_sale_price" placeholder="0.00">
								</div>
							</div>

							<div class="schedule-dates" id="add_schedule_dates" style="display:none; margin-bottom: 15px;">
								<div class="form-row">
									<div class="form-group">
										<label><?php esc_html_e( 'Desde', 'tukitask-local-drivers' ); ?></label>
										<input type="date" name="date_on_sale_from" id="add_date_on_sale_from">
									</div>
									<div class="form-group">
										<label><?php esc_html_e( 'Hasta', 'tukitask-local-drivers' ); ?></label>
										<input type="date" name="date_on_sale_to" id="add_date_on_sale_from_to">
									</div>
								</div>
							</div>

							<div class="form-row">
								<div class="form-group">
									<label><?php esc_html_e( 'Categoría', 'tukitask-local-drivers' ); ?></label>
									<select name="category" id="add_product_category" required onchange="calculateProfit('add')">
										<option value="" data-commission="0"><?php esc_html_e( 'Seleccionar...', 'tukitask-local-drivers' ); ?></option>
										<?php
										$categories = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
										foreach ( $categories as $category ) {
											$comm = get_term_meta( $category->term_id, '_tukitask_cat_commission', true );
											$comm_val = ($comm !== '') ? $comm : get_option( 'tukitask_ld_global_commission_val', 10 );
											echo '<option value="' . esc_attr( $category->term_id ) . '" data-commission="' . esc_attr( $comm_val ) . '">' . esc_html( $category->name ) . '</option>';
										}
										?>
									</select>
								</div>
								<div class="form-group">
									<label><?php esc_html_e( 'Stock (Opcional)', 'tukitask-local-drivers' ); ?></label>
									<input type="number" name="stock" placeholder="∞">
								</div>
							</div>

							<div class="form-group">
								<label><?php esc_html_e( 'Descripción', 'tukitask-local-drivers' ); ?></label>
								<textarea name="description" rows="3" placeholder="..."></textarea>
							</div>
						</div>
					</div>

					<div class="form-footer sticky-footer">
						<button type="button" class="btn-cancel" onclick="document.getElementById('add-product-modal').style.display='none'">
							<?php esc_html_e( 'Cancelar', 'tukitask-local-drivers' ); ?>
						</button>
						<button type="submit" class="tukitask-btn accent">
							<i class="fas fa-plus-circle"></i> <?php esc_html_e( 'Crear Producto', 'tukitask-local-drivers' ); ?>
						</button>
					</div>
				</form>
			</div>
		</div>

		<!-- Withdraw Modal -->
		<div id="withdraw-modal" class="enterprise-modal">
			<div class="modal-content glass withdraw-modal-small">
				<div class="modal-header">
					<div class="header-title">
						<i class="fas fa-wallet"></i>
						<h2><?php esc_html_e( 'Solicitar Retiro', 'tukitask-local-drivers' ); ?></h2>
					</div>
					<button class="close-x" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>
				<div class="enterprise-form">
					<div class="info-box">
						<i class="fas fa-info-circle"></i>
						<p><?php esc_html_e( 'Tu balance será transferido a tu cuenta bancaria registrada en 24-48h.', 'tukitask-local-drivers' ); ?></p>
					</div>
					<div class="form-group">
						<label><?php esc_html_e( 'Monto a retirar ($)', 'tukitask-local-drivers' ); ?></label>
						<div class="withdraw-input-wrapper">
							<span class="currency-symbol">$</span>
							<input type="number" id="withdraw-amount" min="1" step="any" class="withdraw-input">
						</div>
					</div>
					<button class="tukitask-btn accent full-width" onclick="requestWithdrawal()">
						<i class="fas fa-check-circle"></i> <?php esc_html_e( 'Confirmar Retiro', 'tukitask-local-drivers' ); ?>
					</button>
				</div>
			</div>
		</div>

		<!-- Edit Product Modal -->
		<div id="edit-product-modal" class="enterprise-modal">
			<div class="modal-content glass product-modal">
				<div class="modal-header">
					<div class="header-title">
						<i class="fas fa-edit"></i>
						<h2><?php esc_html_e( 'Editar Producto', 'tukitask-local-drivers' ); ?></h2>
					</div>
					<button class="close-x" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>
				<form id="tukitask-edit-product-form" class="enterprise-form">
					<input type="hidden" name="product_id" id="edit_product_id">
					<div class="product-modal-grid">
						<!-- Left Side: Images -->
						<div class="modal-col-media">
							<div class="image-upload-zone" id="edit_dropzone">
								<input type="file" id="edit_image_input" accept="image/*" style="display:none">
								<input type="hidden" name="image_id" id="edit_uploaded_image_id">
								<div class="upload-placeholder">
									<i class="fas fa-cloud-upload-alt"></i>
									<p><?php esc_html_e( 'Imagen Principal', 'tukitask-local-drivers' ); ?></p>
								</div>
								<div id="edit_image-preview" class="preview-container"></div>
							</div>

							<div class="product-gallery-section">
								<ul id="edit_gallery-preview-list" class="gallery-list">
									<li class="add-gallery-item" onclick="document.getElementById('edit_gallery_input').click()">
										<i class="fas fa-plus"></i>
										<input type="file" id="edit_gallery_input" accept="image/*" multiple style="display:none">
									</li>
								</ul>
								<input type="hidden" name="gallery_ids" id="edit_product_gallery_ids">
							</div>
						</div>

						<!-- Right Side: Details -->
						<div class="modal-col-details">
							<div class="form-group">
								<label><?php esc_html_e( 'Nombre del Producto', 'tukitask-local-drivers' ); ?></label>
								<input type="text" name="title" id="edit_product_title" required placeholder="Ej: Pizza Suprema">
							</div>

							<div class="form-row">
								<div class="form-group price-group">
									<label><?php esc_html_e( 'Precio (₲)', 'tukitask-local-drivers' ); ?> <span class="profit-display" id="edit_profit_display"></span></label>
									<input type="number" step="0.01" name="price" id="edit_product_price" required placeholder="0.00" oninput="calculateProfit('edit')">
								</div>
								<div class="form-group price-group">
									<div class="label-row" style="margin-bottom: 5px;">
										<label><?php esc_html_e( 'Oferta', 'tukitask-local-drivers' ); ?></label>
										<a href="javascript:void(0)" class="schedule-link" onclick="toggleSchedule('edit')"><?php esc_html_e( 'Programar', 'tukitask-local-drivers' ); ?></a>
									</div>
									<input type="number" step="0.01" name="sale_price" id="edit_product_sale_price" placeholder="0.00">
								</div>
							</div>

							<div class="schedule-dates" id="edit_schedule_dates" style="display:none; margin-bottom: 15px;">
								<div class="form-row">
									<div class="form-group">
										<label><?php esc_html_e( 'Desde', 'tukitask-local-drivers' ); ?></label>
										<input type="date" name="date_on_sale_from" id="edit_date_on_sale_from">
									</div>
									<div class="form-group">
										<label><?php esc_html_e( 'Hasta', 'tukitask-local-drivers' ); ?></label>
										<input type="date" name="date_on_sale_to" id="edit_date_on_sale_to">
									</div>
								</div>
							</div>

							<div class="form-row">
								<div class="form-group">
									<label><?php esc_html_e( 'Categoría', 'tukitask-local-drivers' ); ?></label>
									<select name="category" id="edit_product_category" required onchange="calculateProfit('edit')">
										<option value=""><?php esc_html_e( 'Seleccionar...', 'tukitask-local-drivers' ); ?></option>
										<?php
										$categories = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
										foreach ( $categories as $category ) {
											$comm = get_term_meta( $category->term_id, '_tukitask_cat_commission', true );
											$comm_val = ($comm !== '') ? $comm : get_option( 'tukitask_ld_global_commission_val', 10 );
											echo '<option value="' . esc_attr( $category->term_id ) . '" data-commission="' . esc_attr( $comm_val ) . '">' . esc_html( $category->name ) . '</option>';
										}
										?>
									</select>
								</div>
								<div class="form-group">
									<label><?php esc_html_e( 'Stock (Opcional)', 'tukitask-local-drivers' ); ?></label>
									<input type="number" name="stock" id="edit_product_stock" placeholder="∞">
								</div>
							</div>

							<div class="form-group">
								<label><?php esc_html_e( 'Descripción', 'tukitask-local-drivers' ); ?></label>
								<textarea name="description" id="edit_product_description" rows="3"></textarea>
							</div>
						</div>
					</div>

					<div class="form-footer sticky-footer">
						<button type="button" class="btn-cancel" onclick="this.closest('.enterprise-modal').style.display='none'">
							<?php esc_html_e( 'Cancelar', 'tukitask-local-drivers' ); ?>
						</button>
						<button type="submit" class="tukitask-btn accent">
							<i class="fas fa-save"></i> <?php esc_html_e( 'Guardar Cambios', 'tukitask-local-drivers' ); ?>
						</button>
					</div>
				</form>
			</div>
		</div>
		<?php
	}

	/**
	 * Output Enterprise-grade CSS.
	 */
	private function output_dashboard_css() {
		?>
		<style>
		:root {
			--e-primary: #4F46E5;
			--e-accent: #6366F1;
			--e-bg-side: #0F172A;
			--e-bg-main: #F8FAFC;
			--e-text: #1E293B;
			--e-text-muted: #64748B;
			--e-border: #E2E8F0;
			--e-white: #FFFFFF;
			--e-glass: rgba(255, 255, 255, 0.8);
			--e-radius-lg: 16px;
			--e-radius-md: 12px;
			--e-shadow: 0 4px 20px rgba(0,0,0,0.05);
		}

		.tukitask-vendedor-pro.enterprise {
			display: flex;
			min-height: 100vh;
			width: 100vw !important;
			max-width: 100vw !important;
			margin-left: calc(-50vw + 50%) !important;
			margin-right: calc(-50vw + 50%) !important;
			background: var(--e-bg-main);
			color: var(--e-text);
			font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
			letter-spacing: -0.01em;
			box-shadow: 0 0 40px rgba(0,0,0,0.05);
			position: relative;
			left: 0;
		}

		/* Sidebar Expanded */
		.vendedor-sidebar {
			width: 280px;
			background: var(--e-bg-side);
			color: #fff;
			display: flex;
			flex-direction: column;
			padding: 40px 0;
			position: sticky;
			top: 0;
			height: 100vh;
		}
		.sidebar-logo {
			padding: 0 40px 40px;
		}
		.sidebar-logo h2 {
			font-size: 24px;
			font-weight: 800;
			margin: 0;
			color: #fff;
		}
		.sidebar-logo span { color: var(--e-accent); }
		.sidebar-logo small { display: block; color: #64748B; font-weight: 600; font-size: 10px; text-transform: uppercase; margin-top: 5px; }

		.nav-item {
			width: 100%;
			padding: 16px 40px;
			display: flex;
			align-items: center;
			gap: 16px;
			background: transparent;
			border: none;
			color: #94A3B8;
			cursor: pointer;
			font-weight: 600;
			transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.nav-item svg { width: 22px; height: 22px; stroke-width: 1.5; }
		.nav-item:hover { color: #fff; transform: translateX(5px); }
		.nav-item.active {
			color: #fff;
			background: linear-gradient(90deg, rgba(79, 70, 229, 0.15) 0%, transparent 100%);
			box-shadow: inset 4px 0 0 var(--e-accent);
		}

		.sidebar-footer {
			margin-top: auto;
			padding: 0 20px;
		}
		.user-pill {
			background: rgba(255,255,255,0.05);
			padding: 12px;
			border-radius: var(--e-radius-md);
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.user-pill img { border-radius: 50%; }
		.user-meta { display: flex; flex-direction: column; }
		.user-name { font-weight: 700; font-size: 13px; }
		.user-role { font-size: 11px; color: #64748B; }

		/* Content Area */
		.vendedor-content {
			flex: 1;
			padding: 40px;
			overflow-y: auto;
		}
		.content-top-bar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 40px;
		}
		.search-box input {
			background: var(--e-white);
			border: 1px solid var(--e-border);
			padding: 12px 20px;
			border-radius: var(--e-radius-md);
			width: 320px;
			transition: all 0.2s;
		}
		.search-box input:focus { width: 400px; border-color: var(--e-accent); outline: none; }

		.top-bar-actions { display: flex; align-items: center; gap: 20px; }
		.icon-btn-rounded {
			background: var(--e-white);
			border: 1px solid var(--e-border);
			width: 44px;
			height: 44px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			position: relative;
		}
		.dot { position: absolute; top: 10px; right: 10px; width: 8px; height: 8px; background: #EF4444; border-radius: 50%; border: 2px solid #fff; }

		/* Stats & Cards */
		.glass { background: var(--e-glass); backdrop-filter: blur(12px); border: 1px solid var(--e-border); border-radius: var(--e-radius-lg); padding: 25px; box-shadow: var(--e-shadow); }

		.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 25px; margin-bottom: 30px; }
		.stat-card { display: flex; justify-content: space-between; align-items: center; }
		.stat-content { display: flex; flex-direction: column; gap: 4px; }
		.stat-card .label { color: var(--e-text-muted); font-weight: 600; font-size: 13px; }
		.stat-card .value { font-size: 28px; font-weight: 800; color: var(--e-text); }
		.trend { font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 6px; width: fit-content; }
		.trend.up { background: #DCFCE7; color: #166534; }
		.trend.neutral { background: #F1F5F9; color: #475569; }

		.grid-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 25px; }

		/* Multi-tab Panes */
		.tab-pane { display: none; }
		.tab-pane.active { display: block; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
		@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

		/* Tables Enterprise */
		.enterprise-table { width: 100%; border-collapse: separate; border-spacing: 0 10px; margin-top: -10px; }
		.enterprise-table th { padding: 15px 20px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--e-text-muted); font-weight: 800; }
		.enterprise-table td { background: #fff; padding: 20px; }
		.enterprise-table tr td:first-child { border-radius: 12px 0 0 12px; }
		.enterprise-table tr td:last-child { border-radius: 0 12px 12px 0; }
		
		.product-cell { display: flex; align-items: center; gap: 15px; }
		.p-img img { width: 50px; height: 50px; border-radius: 10px; object-fit: cover; }
		.p-info { display: flex; flex-direction: column; }
		.p-info strong { font-size: 15px; }
		.p-info span { font-size: 12px; color: var(--e-text-muted); }

		.badge { padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; }
		.badge.stock-in { background: #E0F2FE; color: #0369A1; }
		.badge.success { background: #DCFCE7; color: #166534; }

		/* Buttons Professional */
		.tukitask-btn { padding: 12px 24px; border-radius: 12px; font-weight: 700; border: none; cursor: pointer; transition: 0.2s; }
		.tukitask-btn.accent { background: var(--e-primary); color: #fff; box-shadow: 0 8px 15px rgba(79, 70, 229, 0.3); }
		.tukitask-btn.accent:hover { transform: translateY(-2px); box-shadow: 0 12px 20px rgba(79, 70, 229, 0.4); }

		/* Wallet UI */
		.wallet-card { padding: 40px; border-radius: 20px; color: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
		.gradient-dark { background: linear-gradient(135deg, #1E293B, #0F172A); }
		.balance-amount { font-size: 42px; font-weight: 800; display: block; margin-top: 10px; }
		.withdraw-btn { background: #fff; color: #000; border: none; padding: 14px 28px; border-radius: 12px; font-weight: 800; cursor: pointer; }

		/* Branding Styles */
		.banner-preview {
			height: 140px;
			background-size: cover;
			background-position: center;
			background-color: #f1f5f9;
			border-radius: 12px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: #94A3B8;
			font-weight: 600;
			border: 2px dashed var(--e-border);
			margin-bottom: 10px;
		}
		.logo-preview {
			width: 100px;
			height: 100px;
			border-radius: 50%;
			background-size: cover;
			background-position: center;
			background-color: #f1f5f9;
			border: 4px solid #fff;
			box-shadow: var(--e-shadow);
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 0 auto 10px;
		}
		.btn-text { background: none; border: none; color: var(--e-primary); font-weight: 700; cursor: pointer; font-size: 13px; text-decoration: underline; }

		/* Modal Enterprise - Premium Redesign */
		.enterprise-modal { 
			position: fixed; 
			top: 0; 
			left: 0; 
			width: 100%; 
			height: 100%; 
			background: rgba(15, 23, 42, 0.6); 
			backdrop-filter: blur(8px); 
			display: none; 
			align-items: center; 
			justify-content: center; 
			z-index: 99999; 
			padding: 20px; 
			box-sizing: border-box; 
		}

		.modal-content.glass { 
			background: rgba(255, 255, 255, 0.95);
			backdrop-filter: blur(20px);
			border: 1px solid rgba(255, 255, 255, 0.5);
			border-radius: 24px;
			box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
			width: 100%;
			max-height: 90vh;
			overflow-y: auto;
			position: relative;
			animation: modalAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		}

		@keyframes modalAppear {
			from { opacity: 0; transform: scale(0.95) translateY(10px); }
			to { opacity: 1; transform: scale(1) translateY(0); }
		}

		.product-modal { max-width: 800px; padding: 0 !important; }
		.withdraw-modal-small { max-width: 450px; padding: 40px !important; }

		.modal-header { 
			padding: 25px 40px;
			border-bottom: 1px solid var(--e-border);
			display: flex; 
			justify-content: space-between; 
			align-items: center;
			position: sticky;
			top: 0;
			background: inherit;
			z-index: 10;
		}

		.header-title { display: flex; align-items: center; gap: 15px; }
		.header-title i { font-size: 24px; color: var(--e-primary); }
		.modal-header h2 { margin: 0; font-size: 20px; font-weight: 800; color: var(--e-text); }

		.close-x { 
			background: var(--e-bg-main); 
			border: none; 
			width: 36px;
			height: 36px;
			font-size: 20px; 
			cursor: pointer; 
			color: var(--e-text-muted); 
			border-radius: 50%; 
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s; 
		}
		.close-x:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }

		/* Enterprise Form Improvements */
		.enterprise-form { padding: 30px 40px; }
		
		.form-grid { 
			display: grid; 
			grid-template-columns: 280px 1fr; 
			gap: 30px; 
			margin-bottom: 25px;
		}

		.image-upload-section { display: flex; flex-direction: column; gap: 10px; }
		.image-upload-zone {
			border: 2px dashed #cbd5e1;
			border-radius: 20px;
			background: #f8fafc;
			height: 280px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			transition: all 0.3s;
			position: relative;
			overflow: hidden;
		}

		.image-upload-zone:hover { border-color: var(--e-primary); background: #f1f5f9; }
		.image-upload-zone.dragging { border-color: var(--e-accent); background: rgba(99, 102, 241, 0.05); }

		.upload-placeholder { text-align: center; color: #64748b; }
		.upload-placeholder i { font-size: 40px; margin-bottom: 15px; color: #94a3b8; }
		.upload-placeholder p { font-weight: 700; font-size: 14px; margin: 0; }
		.upload-placeholder span { font-size: 12px; opacity: 0.7; }

		.preview-container { position: absolute; top:0; left:0; width:100%; height:100%; display:none; }
		.preview-container.active { display: block; }
		.preview-container img { width: 100%; height: 100%; object-fit: cover; }

		.form-main-details { display: flex; flex-direction: column; gap: 20px; }
		.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

		.form-group label { 
			display: flex; 
			align-items: center; 
			gap: 8px; 
			margin-bottom: 10px; 
			font-weight: 700; 
			font-size: 13px; 
			color: var(--e-text); 
		}
		.form-group label i { color: var(--e-text-muted); font-size: 14px; }

		.enterprise-form input, 
		.enterprise-form select, 
		.enterprise-form textarea { 
			width: 100%; 
			padding: 12px 16px; 
			border: 1px solid #e2e8f0; 
			border-radius: 12px; 
			background: #fff;
			font-size: 14px;
			font-weight: 500;
			transition: all 0.2s;
			box-shadow: 0 1px 2px rgba(0,0,0,0.05);
		}

		.enterprise-form input:focus, 
		.enterprise-form select:focus, 
		.enterprise-form textarea:focus { 
			outline: none; 
			border-color: var(--e-primary); 
			box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); 
		}

		.form-description { 
			background: #f8fafc; 
			padding: 25px; 
			border-radius: 20px; 
			margin-bottom: 30px; 
		}

		.form-footer { 
			padding: 25px 40px; 
			border-top: 1px solid var(--e-border);
			display: flex; 
			justify-content: flex-end; 
			gap: 15px; 
			background: #f8fafc;
			border-radius: 0 0 24px 24px;
		}

		.btn-cancel {
			background: #fff;
			border: 1px solid #e2e8f0;
			color: #64748b;
			padding: 12px 24px;
			border-radius: 12px;
			font-weight: 700;
			cursor: pointer;
			transition: all 0.2s;
		}
		.btn-cancel:hover { background: #f1f5f9; color: var(--e-text); }

		/* Withdraw Modal Specifics */
		.info-box {
			background: #eff6ff;
			border: 1px solid #bfdbfe;
			padding: 15px;
			border-radius: 12px;
			display: flex;
			gap: 12px;
			margin-bottom: 25px;
		}
		.info-box i { color: #3b82f6; font-size: 18px; }
		.info-box p { margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5; }

		.withdraw-input-wrapper { position: relative; display: flex; align-items: center; }
		.currency-symbol { position: absolute; left: 20px; font-weight: 800; font-size: 24px; color: var(--e-text); }
		.withdraw-input { 
			padding: 20px 20px 20px 50px !important; 
			font-size: 32px !important; 
			font-weight: 800 !important; 
			text-align: center;
			color: var(--e-primary);
		}

		.full-width { width: 100%; }

		/* Responsive Modals */
		@media (max-width: 768px) {
			.modal-content.glass { border-radius: 0; height: 100%; max-height: 100%; overflow-y: auto; }
			.enterprise-modal { padding: 0; }
			.product-modal { max-width: 100%; }
			.modal-header { padding: 20px; }
			.enterprise-form { padding: 20px; }
			.form-grid { grid-template-columns: 1fr; gap: 20px; }
			.image-upload-zone { height: 200px; }
			.form-row { grid-template-columns: 1fr; gap: 15px; }
			.form-footer { padding: 20px; flex-direction: column; }
			.form-footer button { width: 100%; }
		}

		@media (min-width: 769px) {
			.modal-content.glass { max-width: 90%; }
			.product-modal { max-width: 800px; }
		}

		/* Hide WooCommerce reviews section in vendor dashboard */
		.tukitask-vendedor-pro.enterprise .woocommerce-Reviews,
		.tukitask-vendedor-pro.enterprise #reviews {
			display: none !important;
		}

		/* Product List Layout Improvements */
		.product-listing-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
		.subsubsub { list-style: none; padding: 0; margin: 0; display: flex; gap: 5px; font-size: 13px; color: var(--e-text-muted); }
		.subsubsub li.current a { color: var(--e-primary); font-weight: 700; }
		.subsubsub a { text-decoration: none; color: inherit; }
		
		.product-filter-bar { padding: 15px 25px; margin-bottom: 20px; border-radius: 16px; }
		.filter-form { display: flex; justify-content: space-between; gap: 20px; }
		.filter-group, .search-group { display: flex; gap: 10px; }
		
		.filter-form select, .filter-form input { 
			padding: 8px 15px; 
			border: 1px solid var(--e-border); 
			border-radius: 8px; 
			font-size: 13px; 
		}
		
		.btn-filter, .btn-search { 
			background: var(--e-primary); 
			color: #fff; 
			border: none; 
			padding: 8px 15px; 
			border-radius: 8px; 
			cursor: pointer; 
			font-weight: 700;
		}

		.bulk-actions-wrapper { display: flex; gap: 10px; margin-bottom: 15px; }
		.bulk-actions-wrapper select { padding: 8px 15px; border: 1px solid var(--e-border); border-radius: 8px; font-size: 13px; }

		.product-list-table th.check-column, .product-list-table td.check-column { width: 40px; text-align: center; }
		.column-img { width: 60px; }
		.column-img img { border-radius: 8px; object-fit: cover; }
		
		.column-name .row-actions { font-size: 12px; visibility: hidden; margin-top: 5px; }
		.column-name:hover .row-actions { visibility: visible; }
		.row-actions span a { text-decoration: none; color: var(--e-primary); }
		.row-actions .delete a { color: #ef4444; }
		
		.dokan-label { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
		.dokan-label.success { background: #dcfce7; color: #166534; }
		.dokan-label.warning { background: #fef9c3; color: #854d0e; }
		
		mark.instock { background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
		mark.outofstock { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
		
		.status-small { font-size: 11px; color: var(--e-text-muted); margin-top: 2px; }
		.no-padding { padding: 0 !important; }
		
		.earnings { color: #059669; font-weight: 800; }
		.product-type-icon i { color: #6366f1; font-size: 16px; }

		/* Gallery Styles */
		.product-gallery-section { margin-top: 20px; }
		.product-gallery-section label { font-size: 13px; font-weight: 700; color: var(--e-text); margin-bottom: 10px; display: block; }
		.gallery-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
		.gallery-item { position: relative; width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 1px solid var(--e-border); }
		.gallery-item img { width: 100%; height: 100%; object-fit: cover; }
		.gallery-item .remove-gallery-img { 
			position: absolute; top: 5px; right: 5px; background: rgba(239, 68, 68, 0.9); color: #fff; 
			width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; 
			font-size: 10px; cursor: pointer; border: none; transition: 0.2s;
		}
		.gallery-item .remove-gallery-img:hover { transform: scale(1.1); background: #ef4444; }
		
		.add-gallery-item { 
			width: 100%; aspect-ratio: 1; border-radius: 12px; border: 2px dashed var(--e-border); 
			display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; color: var(--e-text-muted); 
		}
		.add-gallery-item:hover { border-color: var(--e-primary); color: var(--e-primary); background: rgba(79, 70, 229, 0.05); }

		/* Analytics Dashboard Responsive Layout */
		.analytics-dashboard {
			display: grid;
			grid-template-columns: 2fr 1fr;
			gap: 25px;
			align-items: start;
			min-height: 400px;
		}

		.main-chart {
			height: 400px;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.main-chart h3 {
			margin-bottom: 20px;
			font-size: 18px;
			font-weight: 700;
			flex-shrink: 0;
		}

		.main-chart canvas {
			flex: 1;
			width: 100% !important;
			height: 100% !important;
			max-height: 320px;
		}

		.chart-container {
			height: 350px;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.chart-container canvas {
			flex: 1;
			width: 100% !important;
			height: 100% !important;
		}

		.stats-sidebar {
			display: flex;
			flex-direction: column;
			gap: 20px;
		}

		.mini-card {
			padding: 20px;
			text-align: center;
			min-height: 120px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
		}

		.mini-card span {
			font-size: 12px;
			color: var(--e-text-muted);
			font-weight: 600;
			margin-bottom: 8px;
			text-transform: uppercase;
		}

		.mini-card strong {
			font-size: 16px;
			font-weight: 800;
			color: var(--e-text);
			margin-bottom: 4px;
		}

		.mini-card small {
			font-size: 11px;
			color: var(--e-text-muted);
		}

		/* Responsive Analytics */
		@media (max-width: 1024px) {
			.analytics-dashboard {
				grid-template-columns: 1fr;
				gap: 20px;
			}

			.main-chart {
				min-height: 300px;
			}

			.main-chart canvas {
				min-height: 250px;
			}

			.stats-sidebar {
				flex-direction: row;
				gap: 15px;
			}

			.mini-card {
				flex: 1;
				min-height: 100px;
				padding: 15px;
			}
		}

		@media (max-width: 768px) {
			.analytics-dashboard {
				grid-template-columns: 1fr;
				gap: 15px;
			}

			.main-chart {
				min-height: 250px;
			}

			.main-chart canvas {
				min-height: 200px;
			}

			.stats-sidebar {
				flex-direction: column;
				gap: 15px;
			}

			.mini-card {
				min-height: 80px;
				padding: 12px;
			}

			.mini-card strong {
				font-size: 14px;
			}
		}

		@media (max-width: 480px) {
			.analytics-dashboard {
				gap: 10px;
			}

			.main-chart {
				min-height: 250px;
			}

			.main-chart canvas {
				max-height: 200px;
			}

			.mini-card {
				min-height: 70px;
				padding: 10px;
			}

			.mini-card span {
				font-size: 11px;
			}

			.mini-card strong {
				font-size: 13px;
			}
		}

		/* Dokan Style Pricing */
		.label-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		}
		.schedule-link {
			font-size: 0.85rem;
			color: var(--e-primary);
			text-decoration: none;
			font-weight: 500;
			cursor: pointer;
		}
		.schedule-link:hover {
			text-decoration: underline;
		}
		.profit-display {
			font-size: 0.85rem;
			color: var(--e-text-muted);
			margin-left: 10px;
			font-weight: 400;
			float: right;
		}

		/* Product Modal Grid */
		.product-modal-grid {
			display: grid;
			grid-template-columns: 200px 1fr;
			gap: 25px;
			margin-bottom: 25px;
		}
		
		.image-upload-zone {
			aspect-ratio: 1;
			width: 100%;
			border: 2px dashed var(--e-border);
			border-radius: 12px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			position: relative;
			background: #f8fafc;
			transition: 0.2s;
			overflow: hidden;
		}
		.image-upload-zone.dragging { border-color: var(--e-primary); background: #eef2ff; }
		.image-upload-zone img { width: 100%; height: 100%; object-fit: cover; }
		.upload-placeholder { text-align: center; color: var(--e-text-muted); padding: 10px; }
		.upload-placeholder i { font-size: 24px; margin-bottom: 10px; display: block; color: var(--e-border); }

		.gallery-list {
			margin-top: 15px;
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
		}
		.add-gallery-item {
			aspect-ratio: 1;
			border: 1px dashed var(--e-border);
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
		}

		.sticky-footer {
			border-top: 1px solid var(--e-border);
			padding-top: 20px;
			margin-top: 20px;
			display: flex;
			justify-content: flex-end;
			gap: 15px;
		}

		@media (max-width: 768px) {
			.product-modal-grid {
				grid-template-columns: 1fr;
			}
			.image-upload-zone { margin: 0 auto; max-width: 200px; }
		}
		</style>
		<?php
	}
}
