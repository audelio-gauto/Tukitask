<?php
/**
 * Driver Custom Post Type registration and UI.
 *
 * @package Tukitask\LocalDrivers\Drivers
 */

namespace Tukitask\LocalDrivers\Drivers;

/**
 * Driver_CPT Class.
 *
 * Registers the tukitask_driver custom post type and manages its UI.
 */
class Driver_CPT {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'init', $this, 'register_driver_cpt' );
		$loader->add_filter( 'post_updated_messages', $this, 'driver_updated_messages' );
		$loader->add_filter( 'manage_tukitask_driver_posts_columns', $this, 'set_custom_columns' );
		$loader->add_action( 'manage_tukitask_driver_posts_custom_column', $this, 'custom_column_content', 10, 2 );
		$loader->add_filter( 'post_row_actions', $this, 'add_row_actions', 10, 2 );
	}

	/**
	 * Register the Driver Custom Post Type.
	 */
	public function register_driver_cpt() {
		self::register_cpt();
		$this->register_driver_taxonomy();
	}

	/**
	 * Register the Driver Category Taxonomy.
	 */
	public function register_driver_taxonomy() {
		$labels = array(
			'name'              => _x( 'Categorías de Conductor', 'taxonomy general name', 'tukitask-local-drivers' ),
			'singular_name'     => _x( 'Categoría de Conductor', 'taxonomy singular name', 'tukitask-local-drivers' ),
			'search_items'      => __( 'Buscar Categorías', 'tukitask-local-drivers' ),
			'all_items'         => __( 'Todas las Categorías', 'tukitask-local-drivers' ),
			'parent_item'       => __( 'Categoría Padre', 'tukitask-local-drivers' ),
			'parent_item_colon' => __( 'Categoría Padre:', 'tukitask-local-drivers' ),
			'edit_item'         => __( 'Editar Categoría', 'tukitask-local-drivers' ),
			'update_item'       => __( 'Actualizar Categoría', 'tukitask-local-drivers' ),
			'add_new_item'      => __( 'Agregar Nueva Categoría', 'tukitask-local-drivers' ),
			'new_item_name'     => __( 'Nombre de Nueva Categoría', 'tukitask-local-drivers' ),
			'menu_name'         => __( 'Categorías', 'tukitask-local-drivers' ),
		);

		$args = array(
			'hierarchical'      => true,
			'labels'            => $labels,
			'show_ui'           => true,
			'show_admin_column' => true,
			'query_var'         => true,
			'rewrite'           => array( 'slug' => 'driver-category' ),
			'show_in_rest'      => true,
		);

		register_taxonomy( 'tukitask_driver_category', array( 'tukitask_driver' ), $args );
	}

	/**
	 * Static method for activation hook.
	 */
	public static function register_cpt() {
		$labels = array(
			'name'                  => _x( 'Conductores', 'post type general name', 'tukitask-local-drivers' ),
			'singular_name'         => _x( 'Conductor', 'post type singular name', 'tukitask-local-drivers' ),
			'menu_name'             => _x( 'Drivers', 'admin menu', 'tukitask-local-drivers' ),
			'name_admin_bar'        => _x( 'Conductor', 'add new on admin bar', 'tukitask-local-drivers' ),
			'add_new'               => _x( 'Agregar Nuevo', 'conductor', 'tukitask-local-drivers' ),
			'add_new_item'          => __( 'Agregar Nuevo Conductor', 'tukitask-local-drivers' ),
			'new_item'              => __( 'Nuevo Conductor', 'tukitask-local-drivers' ),
			'edit_item'             => __( 'Editar Conductor', 'tukitask-local-drivers' ),
			'view_item'             => __( 'Ver Conductor', 'tukitask-local-drivers' ),
			'all_items'             => __( 'Todos los Conductores', 'tukitask-local-drivers' ),
			'search_items'          => __( 'Buscar Conductores', 'tukitask-local-drivers' ),
			'parent_item_colon'     => __( 'Conductores Padre:', 'tukitask-local-drivers' ),
			'not_found'             => __( 'No se encontraron conductores.', 'tukitask-local-drivers' ),
			'not_found_in_trash'    => __( 'No se encontraron conductores en la papelera.', 'tukitask-local-drivers' ),
			'featured_image'        => __( 'Foto del Conductor', 'tukitask-local-drivers' ),
			'set_featured_image'    => __( 'Establecer foto del conductor', 'tukitask-local-drivers' ),
			'remove_featured_image' => __( 'Eliminar foto del conductor', 'tukitask-local-drivers' ),
			'use_featured_image'    => __( 'Usar como foto del conductor', 'tukitask-local-drivers' ),
		);

		$args = array(
			'labels'             => $labels,
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => true,
			'show_in_menu'       => 'tukitask-drivers',
			'query_var'          => true,
			'rewrite'            => array( 'slug' => 'tukitask-driver' ),
			'capability_type'    => 'post',
			'has_archive'        => false,
			'hierarchical'       => false,
			'menu_position'      => null,
			'menu_icon'          => 'dashicons-car',
			'supports'           => array( 'title', 'thumbnail' ),
			'show_in_rest'       => true,
		);

		register_post_type( 'tukitask_driver', $args );

		// Register taxonomy too for activation.
		register_taxonomy( 'tukitask_driver_category', array( 'tukitask_driver' ), array(
			'hierarchical' => true,
			'show_ui'      => true,
			'show_in_rest' => true,
		) );
	}

	/**
	 * Custom update messages for driver CPT.
	 *
	 * @param array $messages Existing messages.
	 * @return array Modified messages.
	 */
	public function driver_updated_messages( $messages ) {
		$post             = get_post();
		$post_type        = get_post_type( $post );
		$post_type_object = get_post_type_object( $post_type );

		$messages['tukitask_driver'] = array(
			0  => '', // Unused. Messages start at index 1.
			1  => __( 'Conductor actualizado.', 'tukitask-local-drivers' ),
			2  => __( 'Campo personalizado actualizado.', 'tukitask-local-drivers' ),
			3  => __( 'Campo personalizado eliminado.', 'tukitask-local-drivers' ),
			4  => __( 'Conductor actualizado.', 'tukitask-local-drivers' ),
			5  => isset( $_GET['revision'] ) ? sprintf( __( 'Conductor restaurado a revisión del %s', 'tukitask-local-drivers' ), wp_post_revision_title( (int) $_GET['revision'], false ) ) : false,
			6  => __( 'Conductor publicado.', 'tukitask-local-drivers' ),
			7  => __( 'Conductor guardado.', 'tukitask-local-drivers' ),
			8  => __( 'Conductor enviado.', 'tukitask-local-drivers' ),
			9  => sprintf(
				__( 'Conductor programado para: <strong>%1$s</strong>.', 'tukitask-local-drivers' ),
				date_i18n( __( 'M j, Y @ G:i', 'tukitask-local-drivers' ), strtotime( $post->post_date ) )
			),
			10 => __( 'Borrador de conductor actualizado.', 'tukitask-local-drivers' ),
		);

		return $messages;
	}

	/**
	 * Set custom columns for driver list table.
	 *
	 * @param array $columns Existing columns.
	 * @return array Modified columns.
	 */
	public function set_custom_columns( $columns ) {
		$new_columns = array();
		$new_columns['cb']            = $columns['cb'];
		$new_columns['title']         = __( 'Nombre', 'tukitask-local-drivers' );
		$new_columns['photo']         = __( 'Foto', 'tukitask-local-drivers' );
		$new_columns['status']        = __( 'Estado', 'tukitask-local-drivers' );
		$new_columns['active_orders'] = __( 'Pedido Activo', 'tukitask-local-drivers' );
		$new_columns['vehicle']       = __( 'Vehículo', 'tukitask-local-drivers' );
		$new_columns['user']          = __( 'Usuario Pro', 'tukitask-local-drivers' );
		$new_columns['date']          = $columns['date'];

		return $new_columns;
	}

	/**
	 * Display custom column content.
	 *
	 * @param string $column  Column name.
	 * @param int    $post_id Post ID.
	 */
	/**
	 * Display custom column content.
	 *
	 * @param string $column  Column name.
	 * @param int    $post_id Post ID.
	 */
	public function custom_column_content( $column, $post_id ) {
		switch ( $column ) {
			case 'photo':
				if ( has_post_thumbnail( $post_id ) ) {
					echo get_the_post_thumbnail( $post_id, array( 50, 50 ) );
				} else {
					echo '<span class="dashicons dashicons-admin-users" style="font-size:50px;color:#ccc;"></span>';
				}
				break;

			case 'status':
				$status = get_post_meta( $post_id, '_driver_status', true );
				$status = $status ? $status : 'offline';
				$badges = array(
					'available' => '<span style="background:#10b981;color:#fff;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;">Disponible</span>',
					'en_viaje'  => '<span style="background:#3b82f6;color:#fff;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;">En Viaje</span>',
					'ocupado'   => '<span style="background:#f59e0b;color:#fff;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;">Ocupado</span>',
					'offline'   => '<span style="background:#94a3b8;color:#fff;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;">Offline</span>',
				);
				echo isset( $badges[ $status ] ) ? $badges[ $status ] : $badges['offline'];
				break;

			case 'vehicle':
				$user_id = get_post_meta( $post_id, '_driver_user_id', true );
				$vehicle = get_user_meta( $user_id, '_driver_vehicle_type', true );
				echo $vehicle ? esc_html( $vehicle ) : '—';
				break;

			case 'active_orders':
				$active_trip = get_post_meta( $post_id, '_driver_active_trip', true );
				if ( $active_trip ) {
					echo '<a href="' . esc_url( get_edit_post_link( $active_trip ) ) . '">#' . esc_html( $active_trip ) . '</a>';
				} else {
					echo '—';
				}
				break;

			case 'capacity':
				$capacity = get_post_meta( $post_id, '_driver_capacity', true );
				echo $capacity ? esc_html( $capacity ) . ' kg' : '—';
				break;

			case 'radius':
				$radius = get_post_meta( $post_id, '_driver_radius', true );
				echo $radius ? esc_html( $radius ) . ' km' : '—';
				break;

			case 'user':
				$user_id = get_post_meta( $post_id, '_driver_user_id', true );
				if ( $user_id ) {
					$user = get_userdata( $user_id );
					if ( $user ) {
						echo '<strong><a href="' . esc_url( get_edit_user_link( $user_id ) ) . '">' . esc_html( $user->display_name ) . '</a></strong>';
					} else {
						echo '—';
					}
				} else {
					echo '—';
				}
				break;
		}
	}

	/**
	 * Add custom row actions.
	 */
	public function add_row_actions( $actions, $post ) {
		if ( 'tukitask_driver' !== $post->post_type ) {
			return $actions;
		}

		$user_id = get_post_meta( $post->ID, '_driver_user_id', true );
		if ( $user_id ) {
			$actions['edit_user'] = sprintf(
				'<a href="%s">%s</a>',
				esc_url( get_edit_user_link( $user_id ) ),
				__( 'Editar Perfil Usuario', 'tukitask-local-drivers' )
			);
		}

		return $actions;
	}
}
