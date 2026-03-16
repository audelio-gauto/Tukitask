<?php
/**
 * CPT: tukitask_ride
 */
add_action( 'init', function() {
    $labels = array(
        'name'               => _x( 'Rides', 'post type general name', 'tukitask-local-drivers' ),
        'singular_name'      => _x( 'Ride', 'post type singular name', 'tukitask-local-drivers' ),
        'menu_name'          => _x( 'Rides', 'admin menu', 'tukitask-local-drivers' ),
        'name_admin_bar'     => _x( 'Ride', 'add new on admin bar', 'tukitask-local-drivers' ),
    );

    $args = array(
        'labels'             => $labels,
        'public'             => false,
        'show_ui'            => true,
        'show_in_menu'       => true,
        'capability_type'    => 'post',
        'supports'           => array( 'title', 'custom-fields' ),
        'has_archive'        => false,
    );

    register_post_type( 'tukitask_ride', $args );
} );

/**
 * Helper to create a ride post when assigned.
 */
function tuki_create_ride_post( $ride_id, $data ) {
    if ( empty( $ride_id ) || empty( $data ) || ! is_array( $data ) ) return 0;
    $title = sprintf( 'Ride %s: %s → %s', $ride_id, $data['origen'] ?? '', $data['destino'] ?? '' );
    $post_id = wp_insert_post( array(
        'post_type' => 'tukitask_ride',
        'post_title' => wp_trim_words( $title, 12, '' ),
        'post_status' => 'publish'
    ) );
    if ( is_wp_error( $post_id ) || ! $post_id ) return 0;
    // Save meta
    foreach ( $data as $k => $v ) {
        if ( in_array( $k, array( 'drivers', 'rechazados' ), true ) ) continue;
        update_post_meta( $post_id, '_tuki_' . $k, $v );
    }
    if ( ! empty( $data['asignado'] ) ) {
        update_post_meta( $post_id, '_tuki_assigned_driver', $data['asignado'] );
    }
    update_post_meta( $post_id, '_tuki_transient_id', $ride_id );
    return $post_id;
}
