<?php
/**
 * Intelligent Auto-Assignment System.
 *
 * @package Tukitask\LocalDrivers\Orders
 */

namespace Tukitask\LocalDrivers\Orders;

use Tukitask\LocalDrivers\Drivers\Driver_Availability;

/**
 * Auto_Assign Class.
 *
 * Handles intelligent automatic driver assignment based on multiple criteria.
 */
class Auto_Assign {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'woocommerce_order_status_processing', $this, 'auto_assign_driver', 10, 2 );
		$loader->add_action( 'woocommerce_order_status_pending', $this, 'auto_assign_driver', 10, 2 );
		$loader->add_action( 'tukitask_order_ready_for_pickup', $this, 'handle_order_ready', 10, 2 );
	}

	/**
	 * Handle order ready for pickup event.
	 *
	 * @param int $order_id  Order ID.
	 * @param int $vendor_id Vendor user ID.
	 */
	public function handle_order_ready( $order_id, $vendor_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		// If driver is not assigned, try auto-assign now.
		   if ( ! $order->get_meta( '_assigned_driver_id' ) ) {
			   $this->auto_assign_driver( $order_id, $order );
		   } else {
			   // Notificar push: pedido listo para retiro via action hook
			   do_action( 'tukitask_notify_order_event', $order, 'ready' );
			   $driver_id = $order->get_meta( '_assigned_driver_id' );
			   $order->add_order_note(
				   sprintf(
					   /* translators: %s: driver name */
					   __( 'El pedido está listo para retirar. Se ha notificado al conductor asignado: %s', 'tukitask-local-drivers' ),
					   get_the_title( $driver_id )
				   )
			   );
		   }
	}

	/**
	 * Auto-assign driver to order.
	 *
	 * @param int       $order_id Order ID.
	 * @param \WC_Order $order    Order object.
	 */
	public function auto_assign_driver( $order_id, $order ) {
		// Check if auto-assign is enabled.
		if ( 'yes' !== get_option( 'tukitask_ld_auto_assign_enabled', 'yes' ) ) {
			return;
		}

		// Check if driver is already assigned.
		if ( $order->get_meta( '_assigned_driver_id' ) ) {
			return;
		}

		// Check if order uses Tukitask shipping method.
		$shipping_methods = $order->get_shipping_methods();
		$chosen_method    = null;

		foreach ( $shipping_methods as $shipping_method ) {
			if ( strpos( $shipping_method->get_method_id(), 'tukitask_local_driver' ) !== false ) {
				$chosen_method = $shipping_method;
				break;
			}
		}

		if ( ! $chosen_method ) {
			return;
		}

		// --- Phase 3: Immediate Assignment for Mobile Store ---
		$is_mobile_order   = $chosen_method->get_meta( 'is_mobile_order' ) === 'yes';
		$preassigned_id    = $chosen_method->get_meta( 'assigned_driver' );

		if ( $is_mobile_order && $preassigned_id ) {
			// Basic assignment
			$this->assign_driver_to_order( $order, $preassigned_id );
			
			// Bypass workflow for mobile stock
			$order->update_meta_data( '_is_mobile_order', 'yes' );
			$order->update_meta_data( '_driver_accepted', 'yes' ); // Auto-accept
			$order->update_meta_data( '_tukitask_order_ready', 'yes' ); // Auto-ready
			$order->update_meta_data( '_delivery_status', 'out_for_delivery' ); // Already in route
			
			$order->add_order_note( sprintf( __( 'Pedido de Tienda Móvil detectado. Asignación inmediata y despacho automático para el conductor: %s', 'tukitask-local-drivers' ), get_the_title( $preassigned_id ) ) );
			$order->save();
			return;
		}

		// Standard Auto-Assign logic below...
		
		// IMPROVED: Get STORE coordinates (not customer) for pickup
		$store_coords = $this->get_store_coordinates_for_order( $order );
		
		// Fallback to customer coordinates if no store location
		if ( ! $store_coords ) {
			$store_coords = \Tukitask\LocalDrivers\Helpers\Geo::get_order_coordinates( $order );
			$order->add_order_note( __( 'Usando ubicación del cliente (tienda sin coordenadas configuradas).', 'tukitask-local-drivers' ) );
		}

		if ( ! $store_coords ) {
			$order->add_order_note( __( 'No se pudo asignar conductor automáticamente: sin coordenadas de tienda ni cliente.', 'tukitask-local-drivers' ) );
			return;
		}

		// Find best driver NEAR THE STORE for pickup
		$best_driver = $this->find_best_driver( $store_coords['lat'], $store_coords['lng'], $order );

		if ( ! $best_driver ) {
			$order->add_order_note( __( 'No se encontraron conductores disponibles cerca de la tienda para asignación automática.', 'tukitask-local-drivers' ) );
			return;
		}

		// Assign driver.
		$this->assign_driver_to_order( $order, $best_driver['id'] );

		// Add order note with store info.
		$driver_name = get_the_title( $best_driver['id'] );
		$order->add_order_note(
			sprintf(
				/* translators: 1: driver name, 2: distance to store, 3: score */
				__( 'Conductor asignado automáticamente: %1$s (Distancia a tienda: %2$s km, Score: %3$s)', 'tukitask-local-drivers' ),
				$driver_name,
				round( $best_driver['distance'], 2 ),
				round( $best_driver['score'], 2 )
			)
		);
	}

	/**
	 * Get store coordinates for an order.
	 * Tries to get from vendor's store location metadata.
	 *
	 * @param \WC_Order $order Order object.
	 * @return array|false Array with lat/lng or false.
	 */
	private function get_store_coordinates_for_order( $order ) {
		// Get vendor ID from order items
		$vendor_id = null;
		
		foreach ( $order->get_items() as $item ) {
			$product_id = $item->get_product_id();
			$product_vendor = get_post_field( 'post_author', $product_id );
			
			if ( $product_vendor ) {
				$vendor_id = $product_vendor;
				break; // Use first vendor found (multi-vendor orders could be split)
			}
		}

		if ( ! $vendor_id ) {
			return false;
		}

		// Try vendor store location from user meta
		$store_lat = get_user_meta( $vendor_id, '_vendedor_store_lat', true );
		$store_lng = get_user_meta( $vendor_id, '_vendedor_store_lng', true );

		if ( $store_lat && $store_lng ) {
			return array(
				'lat' => floatval( $store_lat ),
				'lng' => floatval( $store_lng ),
				'vendor_id' => $vendor_id,
			);
		}

		// Fallback: Try Dokan store location if plugin active
		if ( function_exists( 'dokan_get_store_info' ) ) {
			$store_info = dokan_get_store_info( $vendor_id );
			if ( ! empty( $store_info['location'] ) ) {
				$loc_parts = explode( ',', $store_info['location'] );
				if ( count( $loc_parts ) >= 2 ) {
					return array(
						'lat' => floatval( trim( $loc_parts[0] ) ),
						'lng' => floatval( trim( $loc_parts[1] ) ),
						'vendor_id' => $vendor_id,
					);
				}
			}
		}

		// Fallback: Try WCFM store location if plugin active
		$wcfm_lat = get_user_meta( $vendor_id, '_wcfm_store_lat', true );
		$wcfm_lng = get_user_meta( $vendor_id, '_wcfm_store_lng', true );
		
		if ( $wcfm_lat && $wcfm_lng ) {
			return array(
				'lat' => floatval( $wcfm_lat ),
				'lng' => floatval( $wcfm_lng ),
				'vendor_id' => $vendor_id,
			);
		}

		return false;
	}

	/**
	 * Find the best driver for an order using scoring algorithm.
	 *
	 * @param float     $lat   Latitude.
	 * @param float     $lng   Longitude.
	 * @param \WC_Order $order Order object.
	 * @return array|false Driver data or false if none found.
	 */
	private function find_best_driver( $lat, $lng, $order ) {
		$max_distance = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );

		// Get available drivers within range.
		$available_drivers = \Tukitask\LocalDrivers\Drivers\Driver_Availability::get_available_drivers( $lat, $lng, $max_distance );

		if ( empty( $available_drivers ) ) {
			return false;
		}

		$order_weight = $this->get_order_weight( $order );
		$scored_drivers = array();

		foreach ( $available_drivers as $driver_data ) {
			$driver_id = $driver_data['id'];
			$distance  = $driver_data['distance'];

			// Get driver capabilities.
			$driver_capacity = floatval( get_post_meta( $driver_id, '_driver_capacity', true ) );
			$driver_trunk    = get_post_meta( $driver_id, '_driver_trunk_available', true );

			// Check if driver already has an active trip (race condition protection).
			$active_trip = get_post_meta( $driver_id, '_driver_active_trip', true );
			if ( $active_trip ) {
				continue; // Skip this driver - already on a trip.
			}

			// Check capacity.
			if ( $order_weight > 0 && $driver_capacity > 0 && $order_weight > $driver_capacity ) {
				continue; // Skip this driver - insufficient capacity.
			}

			// Calculate score (lower is better).
			$score = $this->calculate_driver_score( $driver_id, $distance, $order );

			$scored_drivers[] = array(
				'id'       => $driver_id,
				'distance' => $distance,
				'score'    => $score,
			);
		}

		if ( empty( $scored_drivers ) ) {
			return false;
		}

		// Sort by score (ascending - lower score is better).
		usort(
			$scored_drivers,
			function ( $a, $b ) {
				return $a['score'] <=> $b['score'];
			}
		);

		return $scored_drivers[0];
	}

	/**
	 * Calculate driver score based on multiple factors.
	 *
	 * @param int       $driver_id Driver ID.
	 * @param float     $distance  Distance to order.
	 * @param \WC_Order $order     Order object.
	 * @return float Score (lower is better).
	 */
	private function calculate_driver_score( $driver_id, $distance, $order ) {
		$score = 0;

		// Distance factor (40% weight) - normalized to 0-100 scale.
		$max_distance    = floatval( get_option( 'tukitask_ld_max_distance', 50 ) );
		$distance_score  = ( $distance / $max_distance ) * 100;
		$score          += $distance_score * 0.4;

		// Active deliveries factor (30% weight).
		$active_trip = get_post_meta( $driver_id, '_driver_active_trip', true );
		if ( $active_trip ) {
			$score += 50 * 0.3; // Penalty for having active trip.
		}

		// Experience factor (20% weight) - drivers with more deliveries get priority.
		$total_deliveries   = intval( get_post_meta( $driver_id, '_driver_total_deliveries', true ) );
		$experience_score   = max( 0, 100 - ( $total_deliveries * 2 ) ); // More deliveries = lower score.
		$score             += $experience_score * 0.2;

		// Availability factor (10% weight) - how recently they updated location.
		$last_update = get_post_meta( $driver_id, '_driver_last_location_update', true );
		if ( $last_update ) {
			$minutes_since_update = ( current_time( 'timestamp' ) - $last_update ) / 60;
			$availability_score   = min( 100, $minutes_since_update * 2 ); // More recent = lower score.
			$score               += $availability_score * 0.1;
		} else {
			$score += 100 * 0.1; // No location update = max penalty.
		}

		return $score;
	}

	/**
	 * Assign driver to order.
	 *
	 * @param \WC_Order $order     Order object.
	 * @param int       $driver_id Driver ID.
	 */
	private function assign_driver_to_order( $order, $driver_id ) {
		// Update order metadata.
		$order->update_meta_data( '_assigned_driver_id', $driver_id );
		$order->update_meta_data( '_driver_assigned_at', current_time( 'timestamp' ) );
		$order->update_meta_data( '_driver_assignment_method', 'auto' );
		$order->save();

		// Update driver metadata.
		update_post_meta( $driver_id, '_driver_active_trip', $order->get_id() );
		update_post_meta( $driver_id, '_driver_status', 'en_viaje' );

		// Clear availability cache.
		Driver_Availability::clear_available_drivers_cache();

		   // Fire action hook for extensibilidad y notificación push
		   do_action( 'tukitask_notify_order_event', $order, 'assigned' );
		   do_action( 'tukitask_driver_assigned', $order->get_id(), $driver_id );
	}

	/**
	 * Get total weight of order items.
	 *
	 * @param \WC_Order $order Order object.
	 * @return float Total weight in kg.
	 */
	private function get_order_weight( $order ) {
		$total_weight = 0;

		foreach ( $order->get_items() as $item ) {
			$product = $item->get_product();
			if ( $product && $product->get_weight() ) {
				$weight        = floatval( $product->get_weight() );
				$quantity      = $item->get_quantity();
				$total_weight += $weight * $quantity;
			}
		}

		return $total_weight;
	}
}
