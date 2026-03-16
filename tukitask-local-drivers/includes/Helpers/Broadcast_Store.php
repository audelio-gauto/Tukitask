<?php
/**
 * High-performance Broadcast Store using custom DB table.
 *
 * Replaces WordPress transients for broadcast data, allowing indexed
 * queries that scale to 200K+ drivers without LIKE scans on wp_options.
 *
 * @package Tukitask\LocalDrivers\Helpers
 */

namespace Tukitask\LocalDrivers\Helpers;

class Broadcast_Store {

    /**
     * Get the broadcasts table name.
     *
     * @return string
     */
    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'tukitask_broadcasts';
    }

    /**
     * Create the broadcasts table (called from Plugin::create_tables).
     */
    public static function create_table() {
        global $wpdb;
        $table   = self::table();
        $charset = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE {$table} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            driver_id bigint(20) UNSIGNED NOT NULL,
            item_id bigint(20) UNSIGNED NOT NULL,
            item_type varchar(20) NOT NULL DEFAULT 'order',
            pickup_distance decimal(8,2) DEFAULT 0 NOT NULL,
            delivery_distance decimal(8,2) DEFAULT 0 NOT NULL,
            total_distance decimal(8,2) DEFAULT 0 NOT NULL,
            extra_data text,
            status varchar(20) DEFAULT 'pending' NOT NULL,
            expires_at datetime NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY driver_item (driver_id, item_id, item_type),
            KEY idx_driver_status (driver_id, status, expires_at),
            KEY idx_item (item_id, item_type),
            KEY idx_expires (expires_at)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );
    }

    /**
     * Add a broadcast entry for a driver.
     *
     * @param int    $driver_id  Driver post ID.
     * @param int    $item_id    Order/Delivery ID.
     * @param string $item_type  'order' or 'delivery'.
     * @param array  $data       Extra data (distances, prices, etc.).
     * @param int    $ttl_seconds Seconds until expiry.
     * @return int|false Insert ID or false.
     */
    public static function add( $driver_id, $item_id, $item_type, $data = array(), $ttl_seconds = 300 ) {
        global $wpdb;
        $table = self::table();

        $pickup_distance   = isset( $data['pickup_distance'] ) ? floatval( $data['pickup_distance'] ) : 0;
        $delivery_distance = isset( $data['delivery_distance'] ) ? floatval( $data['delivery_distance'] ) : 0;
        $total_distance    = isset( $data['total_distance'] ) ? floatval( $data['total_distance'] ) : ( $pickup_distance + $delivery_distance );

        $extra = $data;
        unset( $extra['pickup_distance'], $extra['delivery_distance'], $extra['total_distance'] );

        $expires_at = gmdate( 'Y-m-d H:i:s', time() + $ttl_seconds );

        // Use REPLACE to handle duplicates (same driver + item + type)
        $result = $wpdb->replace(
            $table,
            array(
                'driver_id'         => intval( $driver_id ),
                'item_id'           => intval( $item_id ),
                'item_type'         => sanitize_key( $item_type ),
                'pickup_distance'   => $pickup_distance,
                'delivery_distance' => $delivery_distance,
                'total_distance'    => $total_distance,
                'extra_data'        => ! empty( $extra ) ? wp_json_encode( $extra ) : null,
                'status'            => 'pending',
                'expires_at'        => $expires_at,
                'created_at'        => current_time( 'mysql', true ),
            ),
            array( '%d', '%d', '%s', '%f', '%f', '%f', '%s', '%s', '%s', '%s' )
        );

        return $result ? $wpdb->insert_id : false;
    }

    /**
     * Get pending broadcasts for a driver.
     *
     * @param int    $driver_id Driver post ID.
     * @param string $item_type 'order', 'delivery', or null for both.
     * @return array Array keyed by item_id.
     */
    public static function get_for_driver( $driver_id, $item_type = null ) {
        global $wpdb;
        $table = self::table();
        $now   = current_time( 'mysql', true );

        $type_clause = '';
        if ( $item_type ) {
            $type_clause = $wpdb->prepare( ' AND item_type = %s', $item_type );
        }

        $rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$table}
             WHERE driver_id = %d AND status = 'pending' AND expires_at > %s {$type_clause}
             ORDER BY created_at DESC",
            intval( $driver_id ),
            $now
        ), ARRAY_A );

        $result = array();
        foreach ( $rows as $row ) {
            $extra = $row['extra_data'] ? json_decode( $row['extra_data'], true ) : array();
            $result[ intval( $row['item_id'] ) ] = array_merge( $extra, array(
                'broadcast_id'      => intval( $row['id'] ),
                'item_id'           => intval( $row['item_id'] ),
                'item_type'         => $row['item_type'],
                'pickup_distance'   => floatval( $row['pickup_distance'] ),
                'delivery_distance' => floatval( $row['delivery_distance'] ),
                'total_distance'    => floatval( $row['total_distance'] ),
                'status'            => $row['status'],
                'expires_at'        => strtotime( $row['expires_at'] ),
                'received_at'       => strtotime( $row['created_at'] ),
            ) );
        }

        return $result;
    }

    /**
     * Remove a specific broadcast for a driver + item.
     *
     * @param int    $driver_id Driver post ID.
     * @param int    $item_id   Order/Delivery ID.
     * @param string $item_type 'order' or 'delivery'.
     * @return int|false Rows affected.
     */
    public static function remove( $driver_id, $item_id, $item_type = 'order' ) {
        global $wpdb;
        return $wpdb->delete(
            self::table(),
            array(
                'driver_id' => intval( $driver_id ),
                'item_id'   => intval( $item_id ),
                'item_type' => $item_type,
            ),
            array( '%d', '%d', '%s' )
        );
    }

    /**
     * Remove ALL broadcasts for an item (when assigned to a driver).
     *
     * @param int    $item_id   Order/Delivery ID.
     * @param string $item_type 'order' or 'delivery'.
     * @return int|false Rows deleted.
     */
    public static function remove_all_for_item( $item_id, $item_type = 'order' ) {
        global $wpdb;
        return $wpdb->delete(
            self::table(),
            array(
                'item_id'   => intval( $item_id ),
                'item_type' => $item_type,
            ),
            array( '%d', '%s' )
        );
    }

    /**
     * Remove all broadcasts for a driver.
     *
     * @param int $driver_id Driver post ID.
     * @return int|false Rows deleted.
     */
    public static function remove_all_for_driver( $driver_id ) {
        global $wpdb;
        return $wpdb->delete(
            self::table(),
            array( 'driver_id' => intval( $driver_id ) ),
            array( '%d' )
        );
    }

    /**
     * Get count of pending broadcasts for a driver.
     *
     * @param int    $driver_id Driver post ID.
     * @param string $item_type Optional filter.
     * @return int
     */
    public static function count_for_driver( $driver_id, $item_type = null ) {
        global $wpdb;
        $table = self::table();
        $now   = current_time( 'mysql', true );

        $type_clause = '';
        if ( $item_type ) {
            $type_clause = $wpdb->prepare( ' AND item_type = %s', $item_type );
        }

        return (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$table}
             WHERE driver_id = %d AND status = 'pending' AND expires_at > %s {$type_clause}",
            intval( $driver_id ),
            $now
        ) );
    }

    /**
     * Purge expired broadcasts (called from cron or cleanup).
     *
     * @param int $batch_size Max rows to delete per call.
     * @return int Rows deleted.
     */
    public static function purge_expired( $batch_size = 1000 ) {
        global $wpdb;
        $table = self::table();
        $now   = current_time( 'mysql', true );

        return $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$table} WHERE expires_at < %s LIMIT %d",
            $now,
            $batch_size
        ) );
    }

    /**
     * Get all driver IDs that were notified about a specific item.
     *
     * @param int    $item_id   Order/Delivery ID.
     * @param string $item_type 'order' or 'delivery'.
     * @return array Driver IDs.
     */
    public static function get_drivers_for_item( $item_id, $item_type = 'order' ) {
        global $wpdb;
        $table = self::table();

        return $wpdb->get_col( $wpdb->prepare(
            "SELECT driver_id FROM {$table} WHERE item_id = %d AND item_type = %s",
            intval( $item_id ),
            $item_type
        ) );
    }
}
