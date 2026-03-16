<?php
/**
 * Vendor Administrative Management (Dokan-style).
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

/**
 * Vendedores_Admin Class.
 *
 * Handles the marketplace vendor administration, lifecycle (activate/suspend),
 * and commission views.
 */
class Vendedores_Admin {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_menu', $this, 'add_vendedores_menu' );
		$loader->add_action( 'wp_ajax_tukitask_toggle_vendor_status', $this, 'ajax_toggle_vendor_status' );

		// Category Commission Overrides
		$loader->add_action( 'product_cat_add_form_fields', $this, 'add_cat_commission_field', 10 );
		$loader->add_action( 'product_cat_edit_form_fields', $this, 'edit_cat_commission_field', 10 );
		$loader->add_action( 'edited_product_cat', $this, 'save_cat_commission_field', 10 );
		$loader->add_action( 'create_product_cat', $this, 'save_cat_commission_field', 10 );
	}

	/**
	 * Add "Vendedores" menu under Tukitask.
	 */
	public function add_vendedores_menu() {
		add_submenu_page(
			'tukitask-vendedores',
			__( 'Gestión de Vendedores', 'tukitask-local-drivers' ),
			__( 'Gestión de Tiendas', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-vendedores',
			array( $this, 'render_vendedores_page' )
		);
	}

	/**
	 * AJAX handler to toggle vendor lifecycle status.
	 */
	public function ajax_toggle_vendor_status() {
		check_ajax_referer( 'tukitask_admin_nonce', 'security' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => 'Sin permisos.' ) );
		}

		$user_id = intval( $_POST['user_id'] );
		$status  = sanitize_text_field( $_POST['status'] ); // active, suspended, deactivated

		if ( ! $user_id ) {
			wp_send_json_error( array( 'message' => 'ID inválido.' ) );
		}

		update_user_meta( $user_id, '_tukitask_vendor_status', $status );

		wp_send_json_success( array( 'message' => __( 'Estado del vendedor actualizado.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * Render the vendor management page.
	 */
	public function render_vendedores_page() {
		$status_filter = isset( $_GET['status'] ) ? sanitize_text_field( $_GET['status'] ) : 'all';
		$search_query  = isset( $_GET['s'] ) ? sanitize_text_field( $_GET['s'] ) : '';

		$args = array( 'role' => 'tukitask_vendedor' );
		
		if ( $status_filter === 'approved' ) {
			$args['meta_key'] = '_tukitask_vendor_status';
			$args['meta_value'] = 'active';
		} elseif ( $status_filter === 'pending' ) {
			$args['meta_key'] = '_tukitask_vendor_status';
			$args['meta_value'] = 'pending';
		}

		if ( ! empty( $search_query ) ) {
			$args['search'] = '*' . $search_query . '*';
			$args['search_columns'] = array( 'user_login', 'user_email', 'display_name' );
		}

		$vendors = get_users( $args );

		// Stats for tabs
		$all_count = count( get_users( array( 'role' => 'tukitask_vendedor' ) ) );
		$approved_count = count( get_users( array( 'role' => 'tukitask_vendedor', 'meta_key' => '_tukitask_vendor_status', 'meta_value' => 'active' ) ) );
		$pending_count = count( get_users( array( 'role' => 'tukitask_vendedor', 'meta_key' => '_tukitask_vendor_status', 'meta_value' => 'pending' ) ) );

		?>
		<div class="wrap tukitask-admin-vendedores">
			<h1 class="wp-heading-inline"><?php _e( 'Vendedores', 'tukitask-local-drivers' ); ?></h1>
			<a href="<?php echo esc_url( admin_url( 'user-new.php?role=tukitask_vendedor' ) ); ?>" class="page-title-action"><?php _e( 'Add Vendor', 'tukitask-local-drivers' ); ?></a>
			<hr class="wp-header-end">

			<ul class="subsubsub">
				<li class="all"><a href="admin.php?page=tukitask-vendedores" class="<?php echo $status_filter === 'all' ? 'current' : ''; ?>"><?php _e( 'Todo', 'tukitask-local-drivers' ); ?> <span class="count">(<?php echo $all_count; ?>)</span></a> |</li>
				<li class="approved"><a href="admin.php?page=tukitask-vendedores&status=approved" class="<?php echo $status_filter === 'approved' ? 'current' : ''; ?>"><?php _e( 'Aprobado', 'tukitask-local-drivers' ); ?> <span class="count">(<?php echo $approved_count; ?>)</span></a> |</li>
				<li class="pending"><a href="admin.php?page=tukitask-vendedores&status=pending" class="<?php echo $status_filter === 'pending' ? 'current' : ''; ?>"><?php _e( 'Pendiente', 'tukitask-local-drivers' ); ?> <span class="count">(<?php echo $pending_count; ?>)</span></a></li>
			</ul>

			<form method="get" style="margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px;">
				<input type="hidden" name="page" value="tukitask-vendedores">
				<input type="search" name="s" value="<?php echo esc_attr($search_query); ?>" placeholder="<?php _e( 'Buscar vendedor...', 'tukitask-local-drivers' ); ?>">
				<button type="submit" class="button"><?php _e( 'Buscar', 'tukitask-local-drivers' ); ?></button>
			</form>

			<table class="wp-list-table widefat fixed striped">
				<thead>
					<tr>
						<th style="width: 50px;"></th>
						<th><?php _e( 'Vendedor', 'tukitask-local-drivers' ); ?></th>
						<th><?php _e( 'Teléfono', 'tukitask-local-drivers' ); ?></th>
						<th><?php _e( 'Registrado', 'tukitask-local-drivers' ); ?></th>
						<th><?php _e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align: right;"><?php _e( 'Actions', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if ( empty( $vendors ) ) : ?>
						<tr><td colspan="6" align="center"><?php _e( 'No se encontraron vendedores.', 'tukitask-local-drivers' ); ?></td></tr>
					<?php else : foreach ( $vendors as $vendor ) : 
						$status = get_user_meta( $vendor->ID, '_tukitask_vendor_status', true );
						if(!$status) $status = 'pending';
						$phone = get_user_meta( $vendor->ID, 'billing_phone', true );
						$reg_date = date_i18n( get_option( 'date_format' ), strtotime( $vendor->user_registered ) );
						$avatar = get_avatar_url( $vendor->ID, array( 'size' => 40 ) );
					?>
						<tr>
							<td><img src="<?php echo esc_url($avatar); ?>" style="border-radius: 4px; width: 40px; height: 40px; border: 1px solid #ddd;"></td>
							<td>
								<div style="font-weight: 700; color: #1e293b;"><?php echo esc_html($vendor->display_name); ?></div>
								<div style="font-size: 11px; color: #64748b;"><?php echo esc_html($vendor->user_email); ?></div>
							</td>
							<td><?php echo $phone ? esc_html($phone) : '—'; ?></td>
							<td><?php echo esc_html($reg_date); ?></td>
							<td>
								<?php if ( 'active' === $status ) : ?>
									<span class="badge-status enabled"><?php _e( 'Enabled', 'tukitask-local-drivers' ); ?></span>
								<?php elseif ( 'pending' === $status ) : ?>
									<span class="badge-status pending"><?php _e( 'Pending', 'tukitask-local-drivers' ); ?></span>
								<?php else : ?>
									<span class="badge-status disabled"><?php _e( 'Disabled', 'tukitask-local-drivers' ); ?></span>
								<?php endif; ?>
							</td>
							<td style="text-align: right;">
								<a href="<?php echo get_edit_user_link($vendor->ID); ?>" class="button button-small"><i class="dashicons dashicons-edit" style="font-size: 14px; margin-top: 3px;"></i></a>
								<?php if ( 'active' !== $status ) : ?>
									<button class="button button-small button-primary" onclick="toggleStatus('<?php echo $vendor->ID; ?>', 'active')"><?php _e( 'Aprobar', 'tukitask-local-drivers' ); ?></button>
								<?php else : ?>
									<button class="button button-small" onclick="toggleStatus('<?php echo $vendor->ID; ?>', 'suspended')"><?php _e( 'Desactivar', 'tukitask-local-drivers' ); ?></button>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; endif; ?>
				</tbody>
			</table>
		</div>

		<style>
			.tukitask-admin-vendedores .badge-status { padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
			.tukitask-admin-vendedores .badge-status.enabled { background: #dcfce7; color: #15803d; }
			.tukitask-admin-vendedores .badge-status.pending { background: #fef9c3; color: #a16207; }
			.tukitask-admin-vendedores .badge-status.disabled { background: #fee2e2; color: #b91c1c; }
			.tukitask-admin-vendedores .wp-list-table { margin-top: 10px; border: none; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
			.tukitask-admin-vendedores .wp-list-table th { background: #f8fafc; font-weight: 700; color: #64748b; border-bottom: 2px solid #f1f5f9; }
			.tukitask-admin-vendedores .wp-list-table td { vertical-align: middle; padding: 12px 10px; }
		</style>

		<script>
		function toggleStatus(uid, status) {
			var msg = status === 'active' ? '¿Deseas activar este vendedor?' : '¿Deseas desactivar este vendedor?';
			if(!confirm(msg)) return;
			
			jQuery.post(ajaxurl, {
				action: 'tukitask_toggle_vendor_status',
				user_id: uid,
				status: status,
				security: '<?php echo wp_create_nonce("tukitask_admin_nonce"); ?>'
			}, function(res) {
				if(res.success) location.reload();
				else alert(res.data.message);
			});
		}
		</script>
		<?php
	}

	/**
	 * Add category commission field (Add screen).
	 */
	public function add_cat_commission_field() {
		?>
		<div class="form-field">
			<label for="tukitask_cat_commission"><?php _e( 'Comisión del Marketplace (%)', 'tukitask-local-drivers' ); ?></label>
			<input type="number" name="tukitask_cat_commission" id="tukitask_cat_commission" step="0.1" min="0">
			<p class="description"><?php _e( 'Define un porcentaje de comisión específico para los productos de esta categoría. Sobrescribe la comisión global.', 'tukitask-local-drivers' ); ?></p>
		</div>
		<?php
	}

	/**
	 * Edit category commission field (Edit screen).
	 */
	public function edit_cat_commission_field( $term ) {
		$value = get_term_meta( $term->term_id, '_tukitask_cat_commission', true );
		?>
		<tr class="form-field">
			<th scope="row" valign="top"><label for="tukitask_cat_commission"><?php _e( 'Comisión del Marketplace (%)', 'tukitask-local-drivers' ); ?></label></th>
			<td>
				<input type="number" name="tukitask_cat_commission" id="tukitask_cat_commission" value="<?php echo esc_attr( $value ); ?>" step="0.1" min="0">
				<p class="description"><?php _e( 'Define un porcentaje de comisión específico para los productos de esta categoría. Sobrescribe la comisión global.', 'tukitask-local-drivers' ); ?></p>
			</td>
		</tr>
		<?php
	}

	/**
	 * Save category commission field.
	 */
	public function save_cat_commission_field( $term_id ) {
		if ( isset( $_POST['tukitask_cat_commission'] ) ) {
			update_term_meta( $term_id, '_tukitask_cat_commission', sanitize_text_field( $_POST['tukitask_cat_commission'] ) );
		}
	}
}
