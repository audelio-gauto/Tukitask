<?php
/**
 * Plugin Settings Management.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

/**
 * Settings Class.
 *
 * Manages plugin settings and configuration.
 */
class Settings {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_init', $this, 'register_settings' );
		$loader->add_action( 'admin_menu', $this, 'add_settings_page' );
		$loader->add_action( 'admin_menu', $this, 'add_api_settings_page', 90 );
	}

	/**
	 * Add settings page to admin menu.
	 */
	public function add_settings_page() {
		// 1. Settings for Conductores
		add_submenu_page(
			'tukitask-drivers',
			__( 'Configuración (Conductores)', 'tukitask-local-drivers' ),
			__( 'Configuración', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-settings-drivers',
			array( $this, 'render_settings_page' )
		);

		// 2. Settings for Vendedores
		add_submenu_page(
			'tukitask-vendedores',
			__( 'Configuración (Vendedores)', 'tukitask-local-drivers' ),
			__( 'Configuración', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-settings-vendedores',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Add API settings page (priority 90 to appear near end).
	 */
	public function add_api_settings_page() {
		add_submenu_page(
			'tukitask-drivers',
			__( 'Configuración API', 'tukitask-local-drivers' ),
			__( 'Configuración API', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-settings',
			array( $this, 'render_settings_page' )
		);

	}

	/**
	 * Render admin page that shows transient ride requests and recent logs.
	 */
	public function render_ride_requests_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Acceso restringido.', 'tukitask-local-drivers' ) . '</p></div>';
			return;
		}

		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'Solicitudes de Transporte (Temporales)', 'tukitask-local-drivers' ) . '</h1>';

		// List active transients
		echo '<h2 style="margin-top:1rem;">' . esc_html__( 'Solicitudes activas', 'tukitask-local-drivers' ) . '</h2>';
		global $wpdb;
		$active = array();
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s", '%_transient_tuki_ride_%' ) );
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$key = str_replace( '_transient_', '', $r->option_name );
				$val = maybe_unserialize( $r->option_value );
				$active[ $key ] = $val;
			}
		}
		if ( empty( $active ) ) {
			echo '<div class="tuki-text-secondary">' . esc_html__( 'No hay solicitudes activas en este momento.', 'tukitask-local-drivers' ) . '</div>';
		} else {
			echo '<table class="widefat" style="margin-top:1rem;">';
			echo '<thead><tr><th>ID</th><th>Cliente</th><th>Origen → Destino</th><th>Drivers notificados</th><th>Asignado</th><th>Expira</th></tr></thead>';
			echo '<tbody>';
			foreach ( $active as $k => $v ) {
				$cliente = ! empty( $v['cliente_id'] ) ? esc_html( $v['cliente_id'] ) : '-';
				$dr = ! empty( $v['drivers'] ) ? count( $v['drivers'] ) : 0;
				$asig = ! empty( $v['asignado'] ) ? esc_html( $v['asignado'] ) : '-';
				$exp = ! empty( $v['expira'] ) ? date_i18n( get_option('date_format') . ' ' . get_option('time_format'), $v['expira'] ) : '-';
				echo '<tr><td>' . esc_html( $k ) . '</td><td>' . $cliente . '</td><td>' . esc_html( ($v['origen'] ?? '') . ' → ' . ($v['destino'] ?? '') ) . '</td><td>' . intval( $dr ) . '</td><td>' . $asig . '</td><td>' . $exp . '</td></tr>';
			}
			echo '</tbody></table>';
		}

		// Recent logs
		echo '<h2 style="margin-top:1.5rem;">' . esc_html__( 'Logs recientes', 'tukitask-local-drivers' ) . '</h2>';
		if ( function_exists( 'tuki_get_ride_logs' ) ) {
			$logs = tuki_get_ride_logs( 200 );
			if ( empty( $logs ) ) {
				echo '<div class="tuki-text-secondary">' . esc_html__( 'No hay logs aún.', 'tukitask-local-drivers' ) . '</div>';
			} else {
				echo '<table class="widefat" style="margin-top:1rem;">';
				echo '<thead><tr><th>Fecha</th><th>Ride ID</th><th>Acción</th><th>Usuario</th><th>Meta</th></tr></thead><tbody>';
				foreach ( $logs as $l ) {
					$dt = date_i18n( get_option('date_format') . ' ' . get_option('time_format'), $l['time'] );
					echo '<tr><td>' . esc_html( $dt ) . '</td><td>' . esc_html( $l['ride_id'] ) . '</td><td>' . esc_html( $l['action'] ) . '</td><td>' . intval( $l['user_id'] ) . '</td><td><pre style="white-space:pre-wrap;">' . esc_html( wp_json_encode( $l['meta'] ) ) . '</pre></td></tr>';
				}
				echo '</tbody></table>';
			}
		} else {
			echo '<div class="tuki-text-secondary">' . esc_html__( 'Logger no disponible.', 'tukitask-local-drivers' ) . '</div>';
		}

		echo '</div>';
	}

	/**
	 * Register plugin settings.
	 */
	public function register_settings() {
		// General settings section.
		add_settings_section(
			'tukitask_general_settings',
			__( 'Configuración General', 'tukitask-local-drivers' ),
			array( $this, 'general_settings_callback' ),
			'tukitask-settings-drivers' // Specific page
		);

		// Auto-assign settings.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_auto_assign_enabled' );
		add_settings_field(
			'tukitask_ld_auto_assign_enabled',
			__( 'Auto-Asignación', 'tukitask-local-drivers' ),
			array( $this, 'checkbox_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_auto_assign_enabled',
				'description' => __( 'Habilitar asignación automática de conductores', 'tukitask-local-drivers' ),
			)
		);

		// Broadcast Limit (Bolt-style)
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_broadcast_limit' );
		add_settings_field(
			'tukitask_ld_broadcast_limit',
			__( 'Límite de Notificados', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_broadcast_limit',
				'description' => __( 'Número de conductores más cercanos a notificar por solicitud (ej: 50).', 'tukitask-local-drivers' ),
				'step'        => '1',
				'min'         => '1',
			)
		);

		// Base price.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_base_price' );
		add_settings_field(
			'tukitask_ld_base_price',
			__( 'Precio Base', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_base_price',
				'description' => __( 'Precio base del envío (sin distancia)', 'tukitask-local-drivers' ),
				'step'        => '0.01',
				'min'         => '0',
			)
		);

		// Price per km.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_price_per_km' );
		add_settings_field(
			'tukitask_ld_price_per_km',
			__( 'Precio por KM', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_price_per_km',
				'description' => __( 'Precio adicional por kilómetro', 'tukitask-local-drivers' ),
				'step'        => '0.01',
				'min'         => '0',
			)
		);

		// Max distance.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_max_distance' );
		add_settings_field(
			'tukitask_ld_max_distance',
			__( 'Distancia Máxima (KM)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_max_distance',
				'description' => __( 'Distancia máxima permitida para envíos', 'tukitask-local-drivers' ),
				'step'        => '1',
				'min'         => '1',
			)
		);

		// Default driver radius.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_default_driver_radius' );
		add_settings_field(
			'tukitask_ld_default_driver_radius',
			__( 'Radio Conductor por Defecto (KM)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_default_driver_radius',
				'description' => __( 'Radio de cobertura por defecto para nuevos conductores', 'tukitask-local-drivers' ),
				'step'        => '1',
				'min'         => '1',
			)
		);

		// Default Coordinates.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_default_lat' );
		add_settings_field(
			'tukitask_ld_default_lat',
			__( 'Latitud por Defecto', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_default_lat',
				'description' => __( 'Latitud central para los mapas (ej: -25.302466).', 'tukitask-local-drivers' ),
			)
		);

		register_setting( 'tukitask_ld_settings', 'tukitask_ld_default_lng' );
		add_settings_field(
			'tukitask_ld_default_lng',
			__( 'Longitud por Defecto', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_general_settings',
			array(
				'label_for'   => 'tukitask_ld_default_lng',
				'description' => __( 'Longitud central para los mapas (ej: -57.681781).', 'tukitask-local-drivers' ),
			)
		);

		// Mobile Store section.
		add_settings_section(
			'tukitask_mobile_store_settings',
			__( 'Tienda Móvil', 'tukitask-local-drivers' ),
			array( $this, 'mobile_store_settings_callback' ),
			'tukitask-settings-drivers' // Drivers menu
		);

		// Mobile store enabled.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_mobile_store_enabled' );
		add_settings_field(
			'tukitask_ld_mobile_store_enabled',
			__( 'Habilitar Tienda Móvil', 'tukitask-local-drivers' ),
			array( $this, 'checkbox_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_mobile_store_settings',
			array(
				'label_for'   => 'tukitask_ld_mobile_store_enabled',
				'description' => __( 'Permitir que conductores activen tienda móvil durante viajes', 'tukitask-local-drivers' ),
			)
		);

		// Mobile store radius.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_mobile_store_radius' );
		add_settings_field(
			'tukitask_ld_mobile_store_radius',
			__( 'Radio Tienda Móvil (KM)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_mobile_store_settings',
			array(
				'label_for'   => 'tukitask_ld_mobile_store_radius',
				'description' => __( 'Radio de visibilidad para tiendas móviles', 'tukitask-local-drivers' ),
				'step'        => '0.1',
				'min'         => '0.1',
			)
		);

		// Llega Hoy radius (driver near store detection).
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_llega_hoy_radius' );
		add_settings_field(
			'tukitask_ld_llega_hoy_radius',
			__( 'Radio "Llega Hoy" (KM)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_mobile_store_settings',
			array(
				'label_for'   => 'tukitask_ld_llega_hoy_radius',
				'description' => __( 'Distancia máxima del conductor a la tienda para activar "Llega Hoy" en productos', 'tukitask-local-drivers' ),
				'step'        => '0.5',
				'min'         => '1',
				'default'     => '5',
			)
		);

		// ====== PACKAGE TYPE MULTIPLIERS ======
		add_settings_section(
			'tukitask_package_multipliers',
			__( '📦 Multiplicadores por Tipo de Paquete', 'tukitask-local-drivers' ),
			array( $this, 'package_multipliers_callback' ),
			'tukitask-settings-drivers'
		);

		// Precio mínimo de envío
		register_setting( 'tukitask_ld_settings', 'tukitask_delivery_min_price' );
		add_settings_field(
			'tukitask_delivery_min_price',
			__( 'Precio Mínimo de Envío', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-drivers',
			'tukitask_package_multipliers',
			array(
				'label_for'   => 'tukitask_delivery_min_price',
				'description' => __( 'El envío nunca costará menos de este monto.', 'tukitask-local-drivers' ),
				'step'        => '0.01',
				'min'         => '0',
			)
		);

		$package_types = array(
			'document' => array( 'label' => __( '📄 Documento', 'tukitask-local-drivers' ), 'default' => 1.0 ),
			'small'    => array( 'label' => __( '📦 Pequeño (hasta 5 kg)', 'tukitask-local-drivers' ), 'default' => 1.0 ),
			'medium'   => array( 'label' => __( '📦 Mediano (5-15 kg)', 'tukitask-local-drivers' ), 'default' => 1.2 ),
			'large'    => array( 'label' => __( '📦 Grande (15-30 kg)', 'tukitask-local-drivers' ), 'default' => 1.5 ),
			'fragile'  => array( 'label' => __( '⚠️ Frágil', 'tukitask-local-drivers' ), 'default' => 1.3 ),
			'flete'    => array( 'label' => __( '🏗️ Flete', 'tukitask-local-drivers' ), 'default' => 2.0 ),
			'mudanza'  => array( 'label' => __( '🏠 Mudanza', 'tukitask-local-drivers' ), 'default' => 2.5 ),
		);

		foreach ( $package_types as $pkey => $pdata ) {
			$opt = 'tukitask_ld_package_multiplier_' . $pkey;
			register_setting( 'tukitask_ld_settings', $opt );
			add_settings_field(
				$opt,
				$pdata['label'],
				array( $this, 'number_field_callback' ),
				'tukitask-settings-drivers',
				'tukitask_package_multipliers',
				array(
					'label_for'   => $opt,
					'description' => sprintf( __( 'Multiplicador de precio (por defecto: %s). Ej: 1.5 = +50%%', 'tukitask-local-drivers' ), $pdata['default'] ),
					'step'        => '0.01',
					'min'         => '0.1',
					'suffix'      => 'x',
				)
			);
		}

		// Marketplace Commissions section.
		add_settings_section(
			'tukitask_marketplace_commission',
			__( 'Comisión', 'tukitask-local-drivers' ),
			array( $this, 'marketplace_commission_callback' ),
			'tukitask-settings-vendedores'
		);

		// Commission Type
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_commission_type' );
		add_settings_field(
			'tukitask_ld_commission_type',
			__( 'Tipo de comisión', 'tukitask-local-drivers' ),
			array( $this, 'select_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_marketplace_commission',
			array(
				'label_for'   => 'tukitask_ld_commission_type',
				'description' => __( 'Seleccione un tipo de comisión para el proveedor', 'tukitask-local-drivers' ),
				'options'     => array(
					'percentage' => __( 'Porcentaje', 'tukitask-local-drivers' ),
					'fixed'      => __( 'Fijado', 'tukitask-local-drivers' ),
					'both'       => __( '% + Fijo', 'tukitask-local-drivers' ),
				)
			)
		);

		// Admin Commission %
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_global_commission_val' );
		add_settings_field(
			'tukitask_ld_global_commission_val',
			__( 'Comisión del administrador (%)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_marketplace_commission',
			array(
				'label_for'   => 'tukitask_ld_global_commission_val',
				'description' => __( 'Cantidad que obtendrá de las ventas tanto en porcentaje como en tarifa fija.', 'tukitask-local-drivers' ),
				'step'        => '0.1',
				'min'         => '0',
				'suffix'      => '%',
				'prefix'      => '',
			)
		);

		// Admin Fixed Fee
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_global_fixed_fee' );
		add_settings_field(
			'tukitask_ld_global_fixed_fee',
			__( 'Tarifa Fija del administrador', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_marketplace_commission',
			array(
				'label_for'   => 'tukitask_ld_global_fixed_fee',
				'description' => __( 'Monto adicional fijo por cada venta exitosa.', 'tukitask-local-drivers' ),
				'step'        => '0.01',
				'min'         => '0',
				'suffix'      => ' ₲',
				'prefix'      => '+ ',
			)
		);

		// Fee Recipients section.
		add_settings_section(
			'tukitask_fee_recipients',
			__( 'Destinatarios de las tarifas', 'tukitask-local-drivers' ),
			array( $this, 'fee_recipients_callback' ),
			'tukitask-settings-vendedores'
		);

		// Shipping Fee Recipient
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_shipping_recipient' );
		add_settings_field(
			'tukitask_ld_shipping_recipient',
			__( 'Gastos de envío', 'tukitask-local-drivers' ),
			array( $this, 'radio_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_fee_recipients',
			array(
				'label_for'   => 'tukitask_ld_shipping_recipient',
				'description' => __( '¿Quién recibirá los gastos de envío?', 'tukitask-local-drivers' ),
				'options'     => array(
					'seller' => __( 'Vendedor', 'tukitask-local-drivers' ),
					'admin'  => __( 'Administrador', 'tukitask-local-drivers' ),
				)
			)
		);

		// Tax Recipient
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_tax_recipient' );
		add_settings_field(
			'tukitask_ld_tax_recipient',
			__( 'Tarifa de impuesto sobre productos', 'tukitask-local-drivers' ),
			array( $this, 'radio_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_fee_recipients',
			array(
				'label_for'   => 'tukitask_ld_tax_recipient',
				'description' => __( '¿Quién recibirá los impuestos de los productos?', 'tukitask-local-drivers' ),
				'options'     => array(
					'seller' => __( 'Vendedor', 'tukitask-local-drivers' ),
					'admin'  => __( 'Administrador', 'tukitask-local-drivers' ),
				)
			)
		);

		// Vendor Capabilities section.
		add_settings_section(
			'tukitask_vendor_capabilities',
			__( 'Capacidades del vendedor', 'tukitask-local-drivers' ),
			array( $this, 'vendor_capabilities_callback' ),
			'tukitask-settings-vendedores'
		);

		// Auto-enable selling
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_auto_enable_selling' );
		add_settings_field(
			'tukitask_ld_auto_enable_selling',
			__( 'Activar ventas', 'tukitask-local-drivers' ),
			array( $this, 'checkbox_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_vendor_capabilities',
			array(
				'label_for'   => 'tukitask_ld_auto_enable_selling',
				'description' => __( 'Habilitar inmediatamente la venta para vendedores recién registrados (Automáticamente).', 'tukitask-local-drivers' ),
			)
		);

		// Order Status Change
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_vendor_order_status_change' );
		add_settings_field(
			'tukitask_ld_vendor_order_status_change',
			__( 'Cambio de estado del pedido', 'tukitask-local-drivers' ),
			array( $this, 'checkbox_field_callback' ),
			'tukitask-settings-vendedores',
			'tukitask_vendor_capabilities',
			array(
				'label_for'   => 'tukitask_ld_vendor_order_status_change',
				'description' => __( 'Permitir al vendedor actualizar el estado del pedido.', 'tukitask-local-drivers' ),
			)
		);

		// API section.
		add_settings_section(
			'tukitask_api_settings',
			__( 'Configuración de API', 'tukitask-local-drivers' ),
			array( $this, 'api_settings_callback' ),
			'tukitask-settings'
		);

		// Google Maps API key.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_mapbox_api_key' );
		add_settings_field(
			'tukitask_ld_mapbox_api_key',
			__( 'Mapbox API Key', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings',
			'tukitask_api_settings',
			array(
				'label_for'   => 'tukitask_ld_mapbox_api_key',
				'description' => __( 'Clave de API de Mapbox para geocodificación', 'tukitask-local-drivers' ),
			)
		);

		// Push Notifications section.
		add_settings_section(
			'tukitask_push_settings',
			__( 'Notificaciones Push (FCM)', 'tukitask-local-drivers' ),
			array( $this, 'push_settings_callback' ),
			'tukitask-settings'
		);

		// FCM Server Key.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_fcm_server_key' );
		add_settings_field(
			'tukitask_ld_fcm_server_key',
			__( 'FCM Server Key', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings',
			'tukitask_push_settings',
			array(
				'label_for'   => 'tukitask_ld_fcm_server_key',
				'description' => __( 'Clave de servidor de tu proyecto Firebase Cloud Messaging.', 'tukitask-local-drivers' ),
			)
		);

		// FCM Sender ID.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_fcm_sender_id' );
		add_settings_field(
			'tukitask_ld_fcm_sender_id',
			__( 'FCM Sender ID', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings',
			'tukitask_push_settings',
			array(
				'label_for'   => 'tukitask_ld_fcm_sender_id',
				'description' => __( 'ID de remitente de Firebase.', 'tukitask-local-drivers' ),
			)
		);

		// Billing section.
		add_settings_section(
			'tukitask_billing_settings',
			__( 'Facturación', 'tukitask-local-drivers' ),
			array( $this, 'billing_settings_callback' ),
			'tukitask-settings'
		);

		// Billing Tax ID.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_billing_tax_id' );
		add_settings_field(
			'tukitask_ld_billing_tax_id',
			__( 'Identificación Fiscal (RUT/NIF)', 'tukitask-local-drivers' ),
			array( $this, 'text_field_callback' ),
			'tukitask-settings',
			'tukitask_billing_settings',
			array(
				'label_for'   => 'tukitask_ld_billing_tax_id',
				'description' => __( 'Número de identificación tributaria.', 'tukitask-local-drivers' ),
			)
		);

		// Surge section.
		add_settings_section(
			'tukitask_surge_settings',
			__( 'Precios Dinámicos (Surge)', 'tukitask-local-drivers' ),
			array( $this, 'surge_settings_callback' ),
			'tukitask-settings'
		);

		// Surge Enabled.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_surge_enabled' );
		add_settings_field(
			'tukitask_ld_surge_enabled',
			__( 'Habilitar Surge Pricing', 'tukitask-local-drivers' ),
			array( $this, 'checkbox_field_callback' ),
			'tukitask-settings',
			'tukitask_surge_settings',
			array(
				'label_for'   => 'tukitask_ld_surge_enabled',
				'description' => __( 'Activar multiplicador por alta demanda.', 'tukitask-local-drivers' ),
			)
		);

		// Surge Max.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_surge_max' );
		add_settings_field(
			'tukitask_ld_surge_max',
			__( 'Multiplicador Máximo', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings',
			'tukitask_surge_settings',
			array(
				'label_for'   => 'tukitask_ld_surge_max',
				'description' => __( 'Límite máximo del multiplicador (ej: 2.0).', 'tukitask-local-drivers' ),
				'step'        => '0.1',
				'min'         => '1.0',
			)
		);

		// Surge Sensitivity.
		register_setting( 'tukitask_ld_settings', 'tukitask_ld_surge_sensitivity' );
		add_settings_field(
			'tukitask_ld_surge_sensitivity',
			__( 'Sensibilidad (Factor)', 'tukitask-local-drivers' ),
			array( $this, 'number_field_callback' ),
			'tukitask-settings',
			'tukitask_surge_settings',
			array(
				'label_for'   => 'tukitask_ld_surge_sensitivity',
				'description' => __( 'Qué tan rápido sube el precio (ej: 0.5 es moderado).', 'tukitask-local-drivers' ),
				'min'         => '0.1',
			)
		);

		// ====== PER-VEHICLE TYPE CONFIGURATION ======
		$vehicles = array(
			'motorcycle' => '🏍️ ' . __( 'Moto', 'tukitask-local-drivers' ),
			'car'        => '🚗 ' . __( 'Auto', 'tukitask-local-drivers' ),
			'motocarro'  => '🛺 ' . __( 'Moto carro', 'tukitask-local-drivers' ),
			'truck_3000' => '🚛 ' . __( 'Camión 3000 kg', 'tukitask-local-drivers' ),
			'truck_5000' => '🚛 ' . __( 'Camión 5000 kg', 'tukitask-local-drivers' ),
		);

		foreach ( $vehicles as $vkey => $vlabel ) {
			$section_id = 'tukitask_vehicle_' . $vkey;

			add_settings_section(
				$section_id,
				$vlabel,
				array( $this, 'vehicle_config_callback' ),
				'tukitask-settings-drivers'
			);

			// Base Price
			$opt = 'tukitask_ld_' . $vkey . '_base_price';
			register_setting( 'tukitask_ld_settings', $opt );
			add_settings_field( $opt, __( 'Precio Base', 'tukitask-local-drivers' ), array( $this, 'number_field_callback' ), 'tukitask-settings-drivers', $section_id, array(
				'label_for'   => $opt,
				'description' => sprintf( __( 'Precio base del envío para %s. Si vacío, usa el global.', 'tukitask-local-drivers' ), $vlabel ),
				'step' => '0.01', 'min' => '0',
			) );

			// Price per KM
			$opt = 'tukitask_ld_' . $vkey . '_price_per_km';
			register_setting( 'tukitask_ld_settings', $opt );
			add_settings_field( $opt, __( 'Precio por KM', 'tukitask-local-drivers' ), array( $this, 'number_field_callback' ), 'tukitask-settings-drivers', $section_id, array(
				'label_for'   => $opt,
				'description' => sprintf( __( 'Precio por kilómetro para %s. Si vacío, usa el global.', 'tukitask-local-drivers' ), $vlabel ),
				'step' => '0.01', 'min' => '0',
			) );

		}
	}

	/**
	 * General settings section callback.
	 */
	public function general_settings_callback() {
		echo '<p>' . esc_html__( 'Configuración general del plugin.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Mobile store settings section callback.
	 */
	public function mobile_store_settings_callback() {
		echo '<p>' . esc_html__( 'Configuración de la funcionalidad de tienda móvil.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Marketplace commission settings section callback.
	 */
	public function marketplace_commission_callback() {
		echo '<p>' . esc_html__( 'Define tipos de comisiones, comisiones administrativas, destinatarios de envíos e impuestos, y más.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Fee recipients settings section callback.
	 */
	public function fee_recipients_callback() {
		echo '<p>' . esc_html__( 'Define las tarifas que recibirá el administrador o el proveedor.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Vendor capabilities settings section callback.
	 */
	public function vendor_capabilities_callback() {
		echo '<p>' . esc_html__( 'Configura tus ajustes de multi-vendedor y habilidades de venta del vendedor.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Marketplace settings section callback.
	 */
	public function marketplace_settings_callback() {
		echo '<p>' . esc_html__( 'Configura las ganancias del marketplace y reglas de vendedores.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * API settings section callback.
	 */
	public function api_settings_callback() {
		echo '<p>' . esc_html__( 'Configuración de APIs externas y caché.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Push settings section callback.
	 */
	public function push_settings_callback() {
		echo '<p>' . esc_html__( 'Configura Firebase Cloud Messaging para enviar alertas en tiempo real a los móviles de los repartidores.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Billing settings section callback.
	 */
	public function billing_settings_callback() {
		echo '<p>' . esc_html__( 'Configura la información legal de tu empresa para que aparezca en las facturas y recibos automáticos.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Surge settings section callback.
	 */
	public function surge_settings_callback() {
		echo '<p>' . esc_html__( 'Configura el motor de Precios Dinámicos para aumentar automáticamente el costo de envío cuando hay mucha demanda y pocos repartidores disponibles.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Package multipliers section callback.
	 */
	public function package_multipliers_callback() {
		echo '<p>' . esc_html__( 'Configura el multiplicador de precio para cada tipo de paquete. El precio base se multiplica por este valor. Ej: 1.0 = sin cambio, 1.5 = +50%, 2.0 = doble.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Per-vehicle configuration section callback.
	 */
	public function vehicle_config_callback() {
		echo '<p>' . esc_html__( 'Configura precios, comisiones y límites para este tipo de vehículo.', 'tukitask-local-drivers' ) . '</p>';
	}

	/**
	 * Checkbox field callback.
	 *
	 * @param array $args Field arguments.
	 */
	public function checkbox_field_callback( $args ) {
		$value = get_option( $args['label_for'], 'yes' );
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( $args['label_for'] ); ?>" value="yes" <?php checked( $value, 'yes' ); ?>>
			<?php echo esc_html( $args['description'] ); ?>
		</label>
		<?php
	}

	/**
	 * Text field callback.
	 *
	 * @param array $args Field arguments.
	 */
	public function text_field_callback( $args ) {
		$value = get_option( $args['label_for'], '' );
		?>
		<input type="text" name="<?php echo esc_attr( $args['label_for'] ); ?>" value="<?php echo esc_attr( $value ); ?>" class="regular-text">
		<p class="description"><?php echo esc_html( $args['description'] ); ?></p>
		<?php
	}

	/**
	 * Number field callback.
	 *
	 * @param array $args Field arguments.
	 */
	public function number_field_callback( $args ) {
		       $value  = get_option( $args['label_for'], '' );
		       $prefix = isset( $args['prefix'] ) ? $args['prefix'] : '';
		       $suffix = isset( $args['suffix'] ) ? $args['suffix'] : '';
		       $step   = isset( $args['step'] ) ? $args['step'] : '1';
		       $min    = isset( $args['min'] ) ? $args['min'] : '0';
		       ?>
		       <div style="display: flex; align-items: center; gap: 5px;">
			       <?php if ( $prefix ) echo esc_html( $prefix ); ?>
			       <input type="number" name="<?php echo esc_attr( $args['label_for'] ); ?>" value="<?php echo esc_attr( $value ); ?>" step="<?php echo esc_attr( $step ); ?>" min="<?php echo esc_attr( $min ); ?>" class="small-text">
			       <?php if ( $suffix ) echo esc_html( $suffix ); ?>
		       </div>
		       <p class="description"><?php echo esc_html( $args['description'] ); ?></p>
		       <?php
	}

	/**
	 * Select field callback.
	 *
	 * @param array $args Field arguments.
	 */
	public function select_field_callback( $args ) {
		$value = get_option( $args['label_for'], '' );
		?>
		<select name="<?php echo esc_attr( $args['label_for'] ); ?>">
			<?php foreach ( $args['options'] as $key => $label ) : ?>
				<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $value, $key ); ?>><?php echo esc_html( $label ); ?></option>
			<?php endforeach; ?>
		</select>
		<p class="description"><?php echo esc_html( $args['description'] ); ?></p>
		<?php
	}

	/**
	 * Radio field callback.
	 *
	 * @param array $args Field arguments.
	 */
	public function radio_field_callback( $args ) {
		$value = get_option( $args['label_for'], 'seller' );
		foreach ( $args['options'] as $key => $label ) :
			?>
			<label style="margin-right: 15px;">
				<input type="radio" name="<?php echo esc_attr( $args['label_for'] ); ?>" value="<?php echo esc_attr( $key ); ?>" <?php checked( $value, $key ); ?>>
				<?php echo esc_html( $label ); ?>
			</label>
			<?php
		endforeach;
		?>
		<p class="description"><?php echo esc_html( $args['description'] ); ?></p>
		<?php
	}

	/**
	 * Render settings page.
	 */
	public function render_settings_page() {
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Configuración Tukitask Pro', 'tukitask-local-drivers' ); ?></h1>
			<form method="post" action="options.php">
				<?php
				$active_tab = isset( $_GET['page'] ) ? $_GET['page'] : 'tukitask-settings-drivers';
				settings_fields( 'tukitask_ld_settings' );
				do_settings_sections( $active_tab );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
