hazme un analisis generar y mejorame el diseño que funcioes todos los botones chat etc<?php
/**
 * AJAX handler para solicitud de transporte tipo Bolt/Uber.
 * Recibe datos del formulario, busca 50 drivers más cercanos y notifica por push.
 */
add_action('wp_ajax_nopriv_tuki_solicitar_transporte', 'tuki_solicitar_transporte_ajax');
add_action('wp_ajax_tuki_solicitar_transporte', 'tuki_solicitar_transporte_ajax');

function tuki_solicitar_transporte_ajax() {
    // Validar y sanitizar datos
    $origen   = sanitize_text_field($_POST['origen'] ?? '');
    $destino  = sanitize_text_field($_POST['destino'] ?? '');
    $vehiculo = sanitize_text_field($_POST['vehiculo'] ?? 'auto');
    $nombre   = sanitize_text_field($_POST['nombre'] ?? '');
    $telefono = sanitize_text_field($_POST['telefono'] ?? '');
    if (!$origen || !$destino || !$nombre || !$telefono) {
        wp_send_json_error(['msg' => 'Faltan datos obligatorios.']);
    }
    // Obtener ubicación del cliente (ideal: usar geolocalización real)
    $lat = isset($_POST['lat']) ? floatval($_POST['lat']) : null;
    $lng = isset($_POST['lng']) ? floatval($_POST['lng']) : null;
    if (!$lat || !$lng) {
        wp_send_json_error(['msg' => 'Ubicación no detectada.']);
    }
    // Buscar 50 drivers más cercanos
    if (!class_exists('Tukitask\LocalDrivers\Helpers\Proximity_Manager')) {
        require_once dirname(__FILE__,2).'/Helpers/Proximity_Manager.php';
    }
    $drivers = Tukitask\LocalDrivers\Helpers\Proximity_Manager::get_nearby_drivers($lat, $lng, 10); // 10km radio
    if (!$drivers || !is_array($drivers)) {
        wp_send_json_error(['msg' => 'No hay conductores disponibles.']);
    }
    $drivers = array_slice($drivers, 0, 50);
    // Crear solicitud temporal (transient)
    $solicitud_id = uniqid('tuki_ride_');
    $cliente_id = get_current_user_id();
    set_transient($solicitud_id, [
        'origen' => $origen,
        'destino' => $destino,
        'vehiculo' => $vehiculo,
        'nombre' => $nombre,
        'telefono' => $telefono,
        'lat' => $lat,
        'lng' => $lng,
        'cliente_id' => $cliente_id,
        'drivers' => wp_list_pluck($drivers, 'id'),
        'asignado' => null,
        'rechazados' => [],
        'expira' => time() + 60,
    ], 65);
    // Log creation
    if ( file_exists( dirname(__FILE__,2) . '/Helpers/Ride_Logger.php' ) ) {
        require_once dirname(__FILE__,2) . '/Helpers/Ride_Logger.php';
        tuki_ride_log_event( $solicitud_id, 'created', $cliente_id, array( 'origen' => $origen, 'destino' => $destino ) );
    }
    // Programar comprobación de timeout (60s)
    if ( ! wp_next_scheduled( 'tuki_check_ride_timeout', array( $solicitud_id ) ) ) {
        wp_schedule_single_event( time() + 65, 'tuki_check_ride_timeout', array( $solicitud_id ) );
    }
    // Notificar por push a cada driver
    if (!class_exists('Tukitask\LocalDrivers\Helpers\Push_Manager')) {
        require_once dirname(__FILE__,2).'/Helpers/Push_Manager.php';
    }
    // URL que abrirá la interfaz de aceptación para el driver (debe abrirse en sesión de driver)
    $url_aceptar = admin_url('admin-ajax.php?action=tuki_driver_respond_ride&ride_id=') . $solicitud_id;
    $actions = array(
        array('action' => 'accept', 'title' => 'Aceptar'),
        array('action' => 'reject', 'title' => 'Rechazar'),
    );
    foreach ($drivers as $driver) {
        Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
            $driver['id'],
            'Nuevo viaje disponible',
            'Solicitud de ' . $nombre . ': ' . $origen . ' → ' . $destino . ' (' . ucfirst($vehiculo) . ')',
            $url_aceptar,
            array( 'ride_id' => $solicitud_id, 'actions' => $actions )
        );
    }
    wp_send_json_success(['solicitud_id' => $solicitud_id]);
}

// Timeout handler
add_action( 'tuki_check_ride_timeout', 'tuki_check_ride_timeout_handler', 10, 1 );
function tuki_check_ride_timeout_handler( $solicitud_id ) {
    if ( ! $solicitud_id ) return;
    $data = get_transient( $solicitud_id );
    if ( ! $data || ! is_array( $data ) ) return;
    // Si ya fue asignado, nada que hacer
    if ( ! empty( $data['asignado'] ) ) return;
    // Si expiró y nadie aceptó, notificar al cliente
    if ( isset( $data['expira'] ) && $data['expira'] < time() ) {
        if ( ! empty( $data['cliente_id'] ) && class_exists('Tukitask\\LocalDrivers\\Helpers\\Push_Manager') ) {
            Tukitask\LocalDrivers\Helpers\Push_Manager::send_notification(
                $data['cliente_id'],
                'Conductor no disponible',
                'Lo sentimos — no hay conductores disponibles para tu solicitud.',
                home_url()
            );
        }
        // Log timeout
        if ( file_exists( dirname(__FILE__,2) . '/Helpers/Ride_Logger.php' ) ) {
            require_once dirname(__FILE__,2) . '/Helpers/Ride_Logger.php';
            tuki_ride_log_event( $solicitud_id, 'timeout', 0 );
        }
        // Eliminar la solicitud
        delete_transient( $solicitud_id );
    }
}
