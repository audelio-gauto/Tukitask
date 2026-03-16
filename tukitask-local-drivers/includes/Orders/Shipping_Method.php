<?php
/**
 * WooCommerce Shipping Method for Tukitask Local Drivers.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

/**
 * Shipping_Method Class.
 *
 * Registers custom WooCommerce shipping method.
 */
class Shipping_Method {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'woocommerce_shipping_init', $this, 'init_shipping_method' );
		$loader->add_filter( 'woocommerce_shipping_methods', $this, 'add_shipping_method' );
	}

	/**
	 * Initialize shipping method class.
	 */
	public function init_shipping_method() {
		// Class is already defined below, just ensure WC is loaded.
		if ( ! class_exists( 'WC_Shipping_Method' ) ) {
			return;
		}
	}

	/**
	 * Add shipping method to WooCommerce.
	 *
	 * @param array $methods Existing methods.
	 * @return array Modified methods.
	 */
	public function add_shipping_method( $methods ) {
		$methods['tukitask_local_driver'] = 'Tukitask_Shipping_Method';
		return $methods;
	}
}

/**
 * Tukitask Local Driver Shipping Method.
 *
 * This class must be in global namespace for WooCommerce to find it.
 */
if ( ! class_exists( 'Tukitask_Shipping_Method' ) ) {

	class Tukitask_Shipping_Method extends \WC_Shipping_Method {

		/**
		 * Constructor.
		 */
		public function __construct( $instance_id = 0 ) {
			$this->id                 = 'tukitask_local_driver';
			$this->instance_id        = absint( $instance_id );
			$this->method_title       = __( 'Tukitask Local Driver', 'tukitask-local-drivers' );
			$this->method_description = __( 'Envío con conductor local asignado automáticamente.', 'tukitask-local-drivers' );
			$this->supports           = array(
				'shipping-zones',
				'instance-settings',
				'instance-settings-modal',
			);

			$this->init();
		}

		/**
		 * Initialize settings.
		 */
		public function init() {
			$this->init_form_fields();
			$this->init_settings();

			$this->enabled      = $this->get_option( 'enabled' );
			$this->title        = $this->get_option( 'title' );
			$this->base_price   = $this->get_option( 'base_price' );
			$this->price_per_km = $this->get_option( 'price_per_km' );
			$this->max_distance = $this->get_option( 'max_distance' );

			add_action( 'woocommerce_update_options_shipping_' . $this->id, array( $this, 'process_admin_options' ) );
		}

		/**
		 * Initialize form fields.
		 */
		public function init_form_fields() {
			$this->instance_form_fields = array(
				'enabled'      => array(
					'title'   => __( 'Habilitar/Deshabilitar', 'tukitask-local-drivers' ),
					'type'    => 'checkbox',
					'label'   => __( 'Habilitar este método de envío', 'tukitask-local-drivers' ),
					'default' => 'yes',
				),
				'title'        => array(
					'title'       => __( 'Título del Método', 'tukitask-local-drivers' ),
					'type'        => 'text',
					'description' => __( 'Título mostrado al cliente durante el checkout.', 'tukitask-local-drivers' ),
					'default'     => __( 'Envío con Conductor Local', 'tukitask-local-drivers' ),
					'desc_tip'    => true,
				),
				'base_price'   => array(
					'title'       => __( 'Precio Base', 'tukitask-local-drivers' ),
					'type'        => 'number',
					'description' => __( 'Precio base del envío (sin incluir distancia).', 'tukitask-local-drivers' ),
					'default'     => '5.00',
					'desc_tip'    => true,
					'custom_attributes' => array(
						'step' => '0.01',
						'min'  => '0',
					),
				),
				'price_per_km' => array(
					'title'       => __( 'Precio por Kilómetro', 'tukitask-local-drivers' ),
					'type'        => 'number',
					'description' => __( 'Costo adicional por cada kilómetro de distancia.', 'tukitask-local-drivers' ),
					'default'     => '1.50',
					'desc_tip'    => true,
					'custom_attributes' => array(
						'step' => '0.01',
						'min'  => '0',
					),
				),
				'max_distance' => array(
					'title'       => __( 'Distancia Máxima (km)', 'tukitask-local-drivers' ),
					'type'        => 'number',
					'description' => __( 'Distancia máxima permitida para este método de envío.', 'tukitask-local-drivers' ),
					'default'     => '50',
					'desc_tip'    => true,
					'custom_attributes' => array(
						'step' => '1',
						'min'  => '1',
					),
				),
				'priority_price' => array(
					'title'       => __( 'Precio Priority (T. Móvil)', 'tukitask-local-drivers' ),
					'type'        => 'number',
					'description' => __( 'Costo fijo cuando el pedido es entregado desde una Tienda Móvil cercana.', 'tukitask-local-drivers' ),
					'default'     => '2.00',
					'desc_tip'    => true,
					'custom_attributes' => array(
						'step' => '0.10',
						'min'  => '0',
					),
				),
			);
		}

		/**
		 * Calculate shipping cost.
		 *
		 * @param array $package Package data.
		 */
		public function calculate_shipping( $package = array() ) {
			// Get customer shipping coordinates.
			$customer_coords = $this->get_customer_coordinates( $package );

			if ( ! $customer_coords ) {
				// Cannot calculate - don't offer this method.
				return;
			}

			// --- Phase 3: Mobile Store Check ---
			$is_mobile_possible = false;
			$mobile_driver_id   = 0;
			$mobile_radius      = floatval( get_option( 'tukitask_ld_mobile_store_radius', 5 ) );

			// Check if ALL products in cart are marked as 'Mobile Stock' OR if at least one is and we want to offer the method?
			// Requirement says: "Bypass Ready for Pickup for products marked as _tukitask_is_mobile_stock if sold by a mobile store"
			// Better: If at least one product has mobile stock and a driver is nearby with Mobile Store active.
			foreach ( $package['contents'] as $item ) {
				$product_id = $item['product_id'];
				$is_stock_mobile = get_post_meta( $product_id, '_tukitask_is_mobile_stock', true ) === 'yes';
				
				if ( $is_stock_mobile ) {
					$vendor_id = get_post_field( 'post_author', $product_id );
					// Check nearby drivers for this vendor with mobile store active.
					
					$args = array(
						'post_type'   => 'tukitask_driver',
						'post_status' => 'publish',
						'meta_query'  => array(
							array( 'key' => '_driver_user_id', 'value' => $vendor_id, 'compare' => '=' ),
							array( 'key' => '_mobile_store_active', 'value' => 'yes', 'compare' => '=' ),
							array( 'key' => '_driver_status', 'value' => 'available', 'compare' => '=' ),
						)
					);
					$m_query = new \WP_Query( $args );
					if ( $m_query->have_posts() ) {
						while ( $m_query->have_posts() ) {
							$m_query->the_post();
							$d_id = get_the_ID();
							$d_lat = get_post_meta( $d_id, '_driver_lat', true );
							$d_lng = get_post_meta( $d_id, '_driver_lng', true );
							if ( $d_lat && $d_lng ) {
								$dist = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $customer_coords['lat'], $customer_coords['lng'], $d_lat, $d_lng );
								if ( $dist <= $mobile_radius ) {
									$is_mobile_possible = true;
									$mobile_driver_id = $d_id;
									break 2;
								}
							}
						}
						wp_reset_postdata();
					}
				}
			}

			if ( $is_mobile_possible ) {
				$this->add_rate( array(
					'id'        => $this->get_rate_id() . '_priority',
					'label'     => __( 'Entrega Prioritaria (Tienda Móvil)', 'tukitask-local-drivers' ),
					'cost'      => floatval( $this->get_option( 'priority_price', '2.00' ) ),
					'meta_data' => array(
						'is_mobile_order' => 'yes',
						'assigned_driver' => $mobile_driver_id,
					),
				) );
				// We can still add the standard rate if preferred, but usually priority is better.
			}

			// Standard Logic (Find nearest available driver)
			$nearest_driver = \Tukitask\LocalDrivers\Helpers\Distance::get_nearest_driver(
				$customer_coords['lat'],
				$customer_coords['lng']
			);

			if ( ! $nearest_driver ) {
				$this->add_rate( array(
					'id'        => $this->get_rate_id(),
					'label'     => $this->title . ' ' . __( '(Cerca de ti)', 'tukitask-local-drivers' ),
					'cost'      => 0,
					'meta_data' => array( 'no_drivers' => true ),
				) );
				return;
			}

			$driver_lat = floatval( get_post_meta( $nearest_driver, '_driver_lat', true ) );
			$driver_lng = floatval( get_post_meta( $nearest_driver, '_driver_lng', true ) );
			$distance = \Tukitask\LocalDrivers\Helpers\Distance::haversine( $driver_lat, $driver_lng, $customer_coords['lat'], $customer_coords['lng'] );

			if ( $distance > floatval( $this->max_distance ) ) return;

			$cost = floatval( $this->base_price ) + ( $distance * floatval( $this->price_per_km ) );

			// --- Phase 22: Surge Pricing ---
			$multiplier = \Tukitask\LocalDrivers\Helpers\Surge_Pricing_Manager::get_multiplier( $customer_coords['lat'], $customer_coords['lng'] );
			$is_surge = $multiplier > 1.0;
			$cost *= $multiplier;

			$this->add_rate( array(
				'id'        => $this->get_rate_id(),
				'label'     => $this->title . ' (' . round( $distance, 2 ) . ' km)' . ( $is_surge ? ' ⚡' : '' ),
				'cost'      => $cost,
				'meta_data' => array(
					'distance'       => $distance,
					'nearest_driver' => $nearest_driver,
					'surge_applied'  => $is_surge ? 'yes' : 'no',
					'surge_factor'   => $multiplier
				),
			) );
		}

		/**
		 * Get customer coordinates from package.
		 *
		 * @param array $package Package data.
		 * @return array|false Coordinates or false.
		 */
		private function get_customer_coordinates( $package ) {
			if ( empty( $package['destination'] ) ) {
				return false;
			}

			$destination = $package['destination'];

			// Build address string.
			$address = '';
			if ( ! empty( $destination['address'] ) ) {
				$address .= $destination['address'] . ', ';
			}
			if ( ! empty( $destination['address_2'] ) ) {
				$address .= $destination['address_2'] . ', ';
			}
			if ( ! empty( $destination['city'] ) ) {
				$address .= $destination['city'] . ', ';
			}
			if ( ! empty( $destination['state'] ) ) {
				$address .= $destination['state'] . ', ';
			}
			if ( ! empty( $destination['postcode'] ) ) {
				$address .= $destination['postcode'] . ', ';
			}
			if ( ! empty( $destination['country'] ) ) {
				$address .= $destination['country'];
			}

			$address = trim( $address, ', ' );

			if ( empty( $address ) ) {
				return false;
			}

			// Try to geocode.
			return \Tukitask\LocalDrivers\Helpers\Geo::geocode_address( $address );
		}
	}
}
