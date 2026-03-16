<?php
/**
 * Driver Roles and Capabilities.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Driver_Capabilities Class.
 *
 * Manages custom roles and capabilities for drivers and dispatchers.
 */
class Driver_Capabilities {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		// No hooks needed - roles are initialized on activation.
	}

	/**
	 * Initialize custom roles on plugin activation.
	 */
	public static function init_roles() {
		// Add custom capabilities.
		$all_caps = array(
			'read'                       => true,
			'tukitask_driver_access'     => true, // Can access driver-specific features/dashboard.
			'tukitask_mobile_store_access' => true, // Can activate/manage mobile store.
		);

		// Add AutoDriver Auto role (Delivery/Transport).
		add_role(
			'tukitask_autodriver_auto',
			__( 'Tukitask AutoDriver (Auto)', 'tukitask-local-drivers' ),
			array_merge(
				$all_caps,
				array(
					'edit_posts'             => false,
					'delete_posts'           => false,
					'tukitask_mobile_store_access' => false, // Cannot access mobile store.
				)
			)
		);

		// Add AutoDriver Tienda role (Delivery/Transport + Mobile Store).
		add_role(
			'tukitask_autodriver_tienda',
			__( 'Tukitask AutoDriver (Tienda Móvil)', 'tukitask-local-drivers' ),
			array_merge(
				$all_caps,
				array(
					'edit_posts'             => false,
					'delete_posts'           => false,
				)
			)
		);

		// Add MotoDriver Moto role (Delivery/Transport).
		add_role(
			'tukitask_motodriver_moto',
			__( 'Tukitask MotoDriver (Moto)', 'tukitask-local-drivers' ),
			array_merge(
				$all_caps,
				array(
					'edit_posts'             => false,
					'delete_posts'           => false,
					'tukitask_mobile_store_access' => false, // Cannot access mobile store.
				)
			)
		);

		// Add MotoDriver Tienda role (Delivery/Transport + Mobile Store).
		add_role(
			'tukitask_motodriver_tienda',
			__( 'Tukitask MotoDriver (Tienda Móvil)', 'tukitask-local-drivers' ),
			array_merge(
				$all_caps,
				array(
					'edit_posts'             => false,
					'delete_posts'           => false,
				)
			)
		);

		// Add Dispatcher role.
		add_role(
			'tukitask_dispatcher',
			__( 'Tukitask Dispatcher', 'tukitask-local-drivers' ),
			array(
				'read'                       => true,
				'manage_woocommerce'         => true,
				'edit_shop_orders'           => true,
				'read_shop_orders'           => true,
				'delete_shop_orders'         => false,
				'publish_shop_orders'        => false,
				'edit_product'               => false,
				'read_product'               => true,
				'delete_product'             => false,
				'edit_products'              => false,
				'publish_products'           => false,
				'tukitask_dispatcher_access' => true,
			)
		);

		// Add custom capabilities to Administrator.
		$admin = get_role( 'administrator' );
		if ( $admin ) {
			$admin->add_cap( 'tukitask_driver_access' );
			$admin->add_cap( 'tukitask_mobile_store_access' );
			$admin->add_cap( 'tukitask_dispatcher_access' );
			$admin->add_cap( 'tukitask_vendor_access' );
			$admin->add_cap( 'tukitask_provider_access' );
		}

		// Add Vendor role for marketplace sellers.
		add_role(
			'tukitask_vendedor',
			__( 'Tukitask Vendedor', 'tukitask-local-drivers' ),
			array(
				'read'                   => true,
				'edit_posts'             => true,
				'delete_posts'           => true,
				'publish_posts'          => true,
				'upload_files'           => true,
				'edit_products'          => true,
				'edit_product'           => true,
				'publish_products'       => true,
				'delete_products'        => true,
				'edit_published_products'     => true,
				'delete_published_products'   => true,
				'tukitask_vendor_access' => true,
			)
		);

		// Add Provider role for dropshipping suppliers.
		add_role(
			'tukitask_proveedor',
			__( 'Tukitask Proveedor', 'tukitask-local-drivers' ),
			array(
				'read'                       => true,
				'edit_posts'                 => true,
				'delete_posts'               => true,
				'publish_posts'              => true,
				'upload_files'               => true,
				'edit_products'              => true,
				'edit_product'               => true,
				'publish_products'           => true,
				'delete_products'            => true,
				'edit_published_products'    => true,
				'delete_published_products'  => true,
				'tukitask_provider_access'   => true,
			)
		);
	}

	/**
	 * Remove custom roles on plugin uninstall.
	 */
	public static function remove_roles() {
		remove_role( 'tukitask_autodriver_auto' );
		remove_role( 'tukitask_autodriver_tienda' );
		remove_role( 'tukitask_motodriver_moto' );
		remove_role( 'tukitask_motodriver_tienda' );
		remove_role( 'tukitask_dispatcher' );
		remove_role( 'tukitask_vendedor' );
		remove_role( 'tukitask_proveedor' );

		// Remove custom capabilities from Administrator.
		$admin = get_role( 'administrator' );
		if ( $admin ) {
			$admin->remove_cap( 'tukitask_driver_access' );
			$admin->remove_cap( 'tukitask_mobile_store_access' );
			$admin->remove_cap( 'tukitask_dispatcher_access' );
			$admin->remove_cap( 'tukitask_vendor_access' );
			$admin->remove_cap( 'tukitask_provider_access' );
		}
	}
}
