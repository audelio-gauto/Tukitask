<?php
/**
 * Vendor Payout Administrative Management.
 *
 * @package Tukitask\LocalDrivers\Admin
 */

namespace Tukitask\LocalDrivers\Admin;

use Tukitask\LocalDrivers\Helpers\Payout_Manager;

/**
 * Payouts_Admin Class.
 *
 * Handles the administrative dashboard for vendor withdrawal requests.
 */
class Payouts_Admin {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_action( 'admin_menu', $this, 'add_payouts_menu' );
		$loader->add_action( 'wp_ajax_tukitask_process_payout', $this, 'ajax_process_payout' );
	}

	/**
	 * Add "Retiros" menu under Tukitask.
	 */
	public function add_payouts_menu() {
		add_submenu_page(
			'tukitask-vendedores',
			__( 'Gestión de Retiros', 'tukitask-local-drivers' ),
			__( 'Finanza', 'tukitask-local-drivers' ),
			'manage_options',
			'tukitask-payouts',
			array( $this, 'render_payouts_page' )
		);
	}

	/**
	 * AJAX handler to process (pay/reject) a withdrawal request.
	 */
	public function ajax_process_payout() {
		check_ajax_referer( 'tukitask_admin_nonce', 'security' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => 'No autorizado.' ) );
		}

		$id             = intval( $_POST['payout_id'] );
		$status         = sanitize_text_field( $_POST['status'] );
		$admin_note     = sanitize_textarea_field( $_POST['admin_note'] );
		$transaction_id = sanitize_text_field( $_POST['transaction_id'] );

		if ( ! $id ) wp_send_json_error( array( 'message' => 'ID inválido.' ) );

		$updated = Payout_Manager::update_status( $id, $status, $admin_note, $transaction_id );

		if ( $updated ) wp_send_json_success( array( 'message' => __( 'Retiro actualizado correctamente.', 'tukitask-local-drivers' ) ) );
		else wp_send_json_error( array( 'message' => __( 'Error al actualizar el retiro.', 'tukitask-local-drivers' ) ) );
	}

	/**
	 * Render the payout management page.
	 */
	public function render_payouts_page() {
		$status = isset( $_GET['status'] ) ? sanitize_text_field( $_GET['status'] ) : '';
		$search = isset( $_GET['search'] ) ? sanitize_text_field( $_GET['search'] ) : '';
		$date_from = isset( $_GET['date_from'] ) ? sanitize_text_field( $_GET['date_from'] ) : '';
		$date_to = isset( $_GET['date_to'] ) ? sanitize_text_field( $_GET['date_to'] ) : '';
		
		// Get all requests with optimized query
		$all_requests = Payout_Manager::get_all_requests( $status === 'all' ? '' : $status );
		$counts = Payout_Manager::get_status_counts();
		
		// Apply filters in-memory (optimized for small datasets)
		$requests = $this->apply_payout_filters( $all_requests, $search, $date_from, $date_to );
		
		// Map internal status to requested tabs
		$tabs = array(
			''          => array( 'label' => __( 'Pendiente', 'tukitask-local-drivers' ), 'count' => $counts['pending'] ),
			'paid'      => array( 'label' => __( 'Aprobado', 'tukitask-local-drivers' ), 'count' => $counts['paid'] ),
			'rejected'  => array( 'label' => __( 'Cancelado', 'tukitask-local-drivers' ), 'count' => $counts['rejected'] ),
			'all'       => array( 'label' => __( 'Todo', 'tukitask-local-drivers' ), 'count' => $counts['all'] ),
		);

		$base_url = admin_url( 'admin.php?page=tukitask-payouts' );
		?>
		<div class="wrap tukitask-admin-payouts" style="max-width:100%;">
			<h1 class="wp-heading-inline"><?php _e( 'Gestión de Retiros', 'tukitask-local-drivers' ); ?></h1>
			<hr class="wp-header-end">
			
			<!-- Status Tabs -->
			<ul class="subsubsub" style="float:none; margin-bottom: 20px; padding:10px 0; border-bottom:2px solid #e5e5e5;">
				<?php 
				$total_tabs = count($tabs);
				$i = 0;
				foreach ( $tabs as $key => $tab ) : 
					$current = ( $status === $key ) ? 'style="color:#0073aa; font-weight:600;"' : '';
					$url = $key ? add_query_arg( array('status' => $key, 'search' => $search, 'date_from' => $date_from, 'date_to' => $date_to), $base_url ) : $base_url;
				?>
				<li style="display:inline-block; margin-right:20px;"><a href="<?php echo esc_url($url); ?>" <?php echo $current; ?>>
					<?php echo esc_html($tab['label']); ?> <span style="color:#999;">(<?php echo intval($tab['count']); ?>)</span>
				</a></li>
				<?php $i++; endforeach; ?>
			</ul>

			<!-- Filter Form -->
			<div style="background:#f9f9f9; padding:15px; border:1px solid #e5e5e5; border-radius:4px; margin-bottom:20px;">
				<form method="get" action="" style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
					<input type="hidden" name="page" value="tukitask-payouts">
					<?php if ( $status && $status !== 'all' ) : ?>
					<input type="hidden" name="status" value="<?php echo esc_attr($status); ?>">
					<?php endif; ?>
					
					<!-- Search by name/email -->
					<div style="flex:1; min-width:200px;">
						<label style="display:block; font-weight:600; margin-bottom:5px; font-size:13px;"><?php _e( 'Buscar Vendedor (Nombre o Email)', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="search" value="<?php echo esc_attr($search); ?>" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:3px;" placeholder="Juan Pérez, juan@email.com">
					</div>

					<!-- Date From -->
					<div style="min-width:150px;">
						<label style="display:block; font-weight:600; margin-bottom:5px; font-size:13px;"><?php _e( 'Desde', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="date_from" value="<?php echo esc_attr($date_from); ?>" style="padding:8px; border:1px solid #ddd; border-radius:3px;">
					</div>

					<!-- Date To -->
					<div style="min-width:150px;">
						<label style="display:block; font-weight:600; margin-bottom:5px; font-size:13px;"><?php _e( 'Hasta', 'tukitask-local-drivers' ); ?></label>
						<input type="date" name="date_to" value="<?php echo esc_attr($date_to); ?>" style="padding:8px; border:1px solid #ddd; border-radius:3px;">
					</div>

					<!-- Buttons -->
					<div style="display:flex; gap:8px;">
						<button type="submit" class="button button-primary"><?php _e( 'Filtrar', 'tukitask-local-drivers' ); ?></button>
						<a href="<?php echo esc_url($base_url); ?>" class="button"><?php _e( 'Limpiar', 'tukitask-local-drivers' ); ?></a>
					</div>
				</form>
			</div>

			<!-- Results Summary -->
			<div style="margin-bottom:15px; padding:10px; background:#e7f3ff; border-left:4px solid #0073aa; border-radius:3px;">
				<strong><?php echo count($requests); ?></strong> <?php _e( 'solicitud(es) encontrada(s)', 'tukitask-local-drivers' ); ?>
				<?php if ( $search || $date_from || $date_to ) : ?>
					<small style="color:#666;"><?php _e( '(Filtrada)', 'tukitask-local-drivers' ); ?></small>
				<?php endif; ?>
			</div>

			<!-- Data Table -->
			<table class="wp-list-table widefat fixed striped" style="border-collapse:collapse;">
				<thead>
					<tr style="background:#f5f5f5;">
						<th style="padding:12px;"><?php _e( 'Vendedor', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; width:100px;"><?php _e( 'Email', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; text-align:right; width:100px;"><?php _e( 'Importe', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; width:100px;"><?php _e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; width:110px;"><?php _e( 'Método', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; width:120px;"><?php _e( 'Fecha Solicitud', 'tukitask-local-drivers' ); ?></th>
						<th style="padding:12px; width:60px;"><?php _e( 'Acciones', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if ( empty( $requests ) ) : ?>
						<tr>
							<td colspan="7" style="text-align:center; padding:30px; color:#999;">
								<?php _e( 'No se encontraron solicitudes con los filtros aplicados.', 'tukitask-local-drivers' ); ?>
							</td>
						</tr>
					<?php else : ?>
						<?php foreach ( $requests as $req ) : 
							$vendor = get_userdata( $req->vendor_id );
							$charge = 0;
							$payable = $req->amount - $charge;
							
							$status_display = array(
								'pending'    => array( 'l' => 'Pendiente', 'c' => '#f59e0b', 'bg' => '#fffbeb' ),
								'processing' => array( 'l' => 'Procesando', 'c' => '#6366f1', 'bg' => '#eef2ff' ),
								'paid'       => array( 'l' => 'Aprobado', 'c' => '#10b981', 'bg' => '#ecfdf5' ),
								'rejected'   => array( 'l' => 'Cancelado', 'c' => '#ef4444', 'bg' => '#fef2f2' ),
							);
							$st_info = isset( $status_display[ $req->status ] ) ? $status_display[ $req->status ] : $status_display['pending'];
						?>
							<tr style="border-bottom:1px solid #eee; hover:background-color:#f9f9f9;">
								<td style="padding:12px;"><strong><?php echo $vendor ? esc_html( $vendor->display_name ) : 'N/A'; ?></strong></td>
								<td style="padding:12px; font-size:12px; color:#666;"><?php echo $vendor ? esc_html( $vendor->user_email ) : 'N/A'; ?></td>
								<td style="padding:12px; text-align:right; font-weight:600; color:#0073aa;"><?php echo wc_price( $req->amount ); ?></td>
								<td style="padding:12px;">
									<span style="background:<?php echo $st_info['bg']; ?>; color:<?php echo $st_info['c']; ?>; padding:4px 8px; border-radius:3px; font-size:12px; font-weight:600; display:inline-block;">
										<?php echo esc_html( $st_info['l'] ); ?>
									</span>
								</td>
								<td style="padding:12px; font-size:12px;"><?php echo esc_html( $req->payment_method ); ?></td>
								<td style="padding:12px; font-size:12px; color:#666;"><?php echo date_i18n( 'Y/m/d H:i', strtotime( $req->created_at ) ); ?></td>
								<td style="padding:12px;">
									<?php if ( in_array( $req->status, array( 'pending', 'processing' ) ) ) : ?>
										<button type="button" class="button button-small button-primary" onclick="openProcessModal(<?php echo $req->id; ?>, '<?php echo esc_js($req->amount); ?>', '<?php echo esc_js($vendor->display_name ?? 'Vendedor'); ?>');" style="margin-right:5px;">✓</button>
										<button type="button" class="button button-small button-secondary" onclick="quickReject(<?php echo $req->id; ?>);">✕</button>
									<?php else : ?>
										<span style="color:#999; font-size:12px;">—</span>
									<?php endif; ?>
								</td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>

		<!-- Process Payout Modal -->
		<div id="payout-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
			<div style="background:#fff; padding:30px; border-radius:8px; width:100%; max-width:450px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
				<h3 style="margin-top:0; margin-bottom:20px; font-size:18px; color:#333;"><?php _e( 'Procesar Retiro', 'tukitask-local-drivers' ); ?></h3>
				<form id="payout-admin-form">
					<input type="hidden" name="payout_id" id="modal-payout-id">
					
					<div style="margin-bottom:15px; padding:12px; background:#f0f7ff; border-radius:4px; border-left:4px solid #0073aa;">
						<small style="color:#666;"><?php _e( 'Vendedor:', 'tukitask-local-drivers' ); ?></small><br>
						<strong id="modal-vendor-name" style="font-size:14px;"></strong>
					</div>

					<div style="margin-bottom:15px; padding:12px; background:#f0f7ff; border-radius:4px; border-left:4px solid #0073aa;">
						<small style="color:#666;"><?php _e( 'Monto:', 'tukitask-local-drivers' ); ?></small><br>
						<strong id="modal-payout-amount" style="font-size:16px; color:#0073aa;"></strong>
					</div>
					
					<div style="margin-bottom:15px;">
						<label style="display:block; margin-bottom:5px; font-weight:600; color:#333;"><?php _e( 'Estado:', 'tukitask-local-drivers' ); ?></label>
						<select name="status" id="modal-payout-status" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
							<option value="paid"><?php _e( '✓ Aprobar (Marcar Pagado)', 'tukitask-local-drivers' ); ?></option>
							<option value="rejected"><?php _e( '✕ Cancelar (Rechazar)', 'tukitask-local-drivers' ); ?></option>
						</select>
					</div>

					<div style="margin-bottom:15px;">
						<label style="display:block; margin-bottom:5px; font-weight:600; color:#333;"><?php _e( 'ID Transacción / Ref (Opcional):', 'tukitask-local-drivers' ); ?></label>
						<input type="text" name="transaction_id" id="modal-payout-txid" style="width:100%; border:1px solid #ddd; padding:8px; border-radius:4px;" placeholder="Ej: #12345678">
					</div>

					<div style="margin-bottom:20px;">
						<label style="display:block; margin-bottom:5px; font-weight:600; color:#333;"><?php _e( 'Nota (Opcional):', 'tukitask-local-drivers' ); ?></label>
						<textarea name="admin_note" id="modal-payout-note" style="width:100%; border:1px solid #ddd; padding:8px; border-radius:4px; font-family:inherit;" rows="3" placeholder="Ej: Procesado por banco XYZ"></textarea>
					</div>

					<div style="display:flex; justify-content:flex-end; gap:10px;">
						<button type="button" class="button" onclick="jQuery('#payout-modal').hide()" style="padding:8px 16px;"><?php _e( 'Cancelar', 'tukitask-local-drivers' ); ?></button>
						<button type="submit" class="button button-primary" style="padding:8px 16px;"><?php _e( 'Guardar Cambios', 'tukitask-local-drivers' ); ?></button>
					</div>
				</form>
			</div>
		</div>

		<script>
		function openProcessModal(id, amount, vendorName) {
			jQuery('#modal-payout-id').val(id);
			jQuery('#modal-payout-amount').text(amount);
			jQuery('#modal-vendor-name').text(vendorName);
			jQuery('#modal-payout-txid').val('');
			jQuery('#modal-payout-note').val('');
			jQuery('#modal-payout-status').val('paid');
			jQuery('#payout-modal').css('display', 'flex');
		}

		function quickReject(id) {
			if(!confirm('¿Estás seguro de que deseas rechazar esta solicitud de retiro?')) return;
			
			jQuery.post(ajaxurl, {
				action: 'tukitask_process_payout',
				payout_id: id,
				status: 'rejected',
				admin_note: '<?php _e( 'Rechazado por administrador', 'tukitask-local-drivers' ); ?>',
				security: '<?php echo wp_create_nonce("tukitask_admin_nonce"); ?>'
			}, function(res) {
				if(res.success) {
					location.reload();
				} else {
					alert('Error: ' + (res.data?.message || 'Error desconocido'));
				}
			}, 'json');
		}

		jQuery('#payout-admin-form').on('submit', function(e) {
			e.preventDefault();
			const $btn = jQuery(this).find('button[type="submit"]');
			$btn.prop('disabled', true).text('Guardando...');

			jQuery.post(ajaxurl, {
				action: 'tukitask_process_payout',
				payout_id: jQuery('#modal-payout-id').val(),
				status: jQuery('#modal-payout-status').val(),
				transaction_id: jQuery('#modal-payout-txid').val(),
				admin_note: jQuery('#modal-payout-note').val(),
				security: '<?php echo wp_create_nonce("tukitask_admin_nonce"); ?>'
			}, function(res) {
				if(res.success) {
					jQuery('#payout-modal').hide();
					location.reload();
				} else {
					alert('Error: ' + (res.data?.message || 'Error desconocido'));
					$btn.prop('disabled', false).text('Guardar Cambios');
				}
			}, 'json');
		});
		</script>
		<?php
	}

	/**
	 * Apply filters to payout requests (name, email, date range).
	 * 
	 * @param array  $requests List of payout requests.
	 * @param string $search Search term.
	 * @param string $date_from Start date.
	 * @param string $date_to End date.
	 * @return array Filtered requests.
	 */
	private function apply_payout_filters( $requests, $search = '', $date_from = '', $date_to = '' ) {
		if ( empty( $search ) && empty( $date_from ) && empty( $date_to ) ) {
			return $requests;
		}

		return array_filter( $requests, function( $req ) use ( $search, $date_from, $date_to ) {
			// Search by vendor name or email
			if ( ! empty( $search ) ) {
				$vendor = get_userdata( $req->vendor_id );
				if ( ! $vendor ) {
					return false;
				}
				$search_lower = strtolower( $search );
				$name_match = stripos( $vendor->display_name, $search ) !== false;
				$email_match = stripos( $vendor->user_email, $search ) !== false;
				if ( ! ( $name_match || $email_match ) ) {
					return false;
				}
			}

			// Filter by date range
			if ( ! empty( $date_from ) || ! empty( $date_to ) ) {
				$req_date = strtotime( $req->created_at );
				if ( ! empty( $date_from ) ) {
					$from_date = strtotime( $date_from . ' 00:00:00' );
					if ( $req_date < $from_date ) {
						return false;
					}
				}
				if ( ! empty( $date_to ) ) {
					$to_date = strtotime( $date_to . ' 23:59:59' );
					if ( $req_date > $to_date ) {
						return false;
					}
				}
			}

			return true;
		} );
	}
}
