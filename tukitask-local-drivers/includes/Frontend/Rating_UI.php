<?php
/**
 * Customer Rating & Reputation UI.
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Review_Manager;

/**
 * Rating_UI Class.
 *
 * Handles the star-rating shortcode and AJAX submission.
 */
class Rating_UI {

	/**
	 * Constructor.
	 *
	 * @param object $loader Hook loader instance.
	 */
	public function __construct( $loader ) {
		$loader->add_shortcode( 'tukitask_rate_order', $this, 'render_rating_form' );
		$loader->add_action( 'wp_ajax_tukitask_submit_rating', $this, 'ajax_submit_rating' );
	}

	/**
	 * Render the star-rating form.
	 */
	public function render_rating_form( $atts ) {
		$order_id = isset( $_GET['order_id'] ) ? intval( $_GET['order_id'] ) : 0;
		if ( ! $order_id ) {
			return '<p>' . __( 'ID de pedido no proporcionado.', 'tukitask-local-drivers' ) . '</p>';
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return '<p>' . __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) . '</p>';
		}

		ob_start();
		?>
		<div class="tukitask-rating-card glass" style="max-width: 500px; margin: 20px auto; padding: 30px; text-align: center; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
			<h2 style="margin-bottom: 5px;"><?php _e( '¿Qué tal tu entrega?', 'tukitask-local-drivers' ); ?></h2>
			<p style="color: #64748b; margin-bottom: 25px;"><?php printf( __( 'Pedido #%s', 'tukitask-local-drivers' ), $order->get_order_number() ); ?></p>

			<div class="rating-stars" style="display:flex; justify-content:center; gap:10px; margin-bottom: 25px;">
				<?php for($i=1; $i<=5; $i++): ?>
					<i class="far fa-star star-item" data-value="<?php echo $i; ?>" style="font-size: 2.5rem; color: #f59e0b; cursor:pointer;"></i>
				<?php endfor; ?>
			</div>

			<div class="form-group" style="text-align: left; margin-bottom: 20px;">
				<label style="font-weight:600; display:block; margin-bottom:8px;"><?php _e( '¿Tienes algún comentario?', 'tukitask-local-drivers' ); ?></label>
				<textarea id="rating_comment" rows="3" style="width:100%; border-radius:8px; border:1px solid #e2e8f0; padding:12px;" placeholder="Ej: ¡Llegó súper rápido!"></textarea>
			</div>

			<input type="hidden" id="rating_value" value="0">
			<button class="tukitask-btn accent" id="submit-rating-btn" style="width:100%; border-radius:8px; padding:15px; font-weight:700;"><?php _e( 'Enviar Calificación', 'tukitask-local-drivers' ); ?></button>
		</div>

		<style>
			.star-item.fas { transition: transform 0.2s; }
			.star-item:hover { transform: scale(1.1); }
		</style>

		<script>
		document.querySelectorAll('.star-item').forEach(star => {
			star.addEventListener('click', () => {
				const val = star.dataset.value;
				document.getElementById('rating_value').value = val;
				
				document.querySelectorAll('.star-item').forEach(s => {
					if(s.dataset.value <= val) {
						s.classList.remove('far');
						s.classList.add('fas');
					} else {
						s.classList.remove('fas');
						s.classList.add('far');
					}
				});
			});
		});

		document.getElementById('submit-rating-btn').addEventListener('click', function() {
			const val = document.getElementById('rating_value').value;
			const comment = document.getElementById('rating_comment').value;
			const btn = this;

			if(val == 0) {
				alert('Por favor selecciona una puntuación de estrellas.');
				return;
			}

			btn.disabled = true;
			btn.innerHTML = 'Enviando...';

			jQuery.post('<?php echo admin_url('admin-ajax.php'); ?>', {
				action: 'tukitask_submit_rating',
				order_id: '<?php echo $order_id; ?>',
				rating: val,
				comment: comment,
				security: '<?php echo wp_create_nonce("tukitask_rating_nonce"); ?>'
			}, function(res) {
				if(res.success) {
					document.querySelector('.tukitask-rating-card').innerHTML = `<h2 style="color:#10b981;">¡Gracias por tu opinión!</h2><p>Tu reseña ayuda a mejorar el marketplace.</p>`;
				} else {
					alert(res.data.message);
					btn.disabled = false;
					btn.innerHTML = 'Enviar Calificación';
				}
			});
		});
		</script>
		<?php
		return ob_get_clean();
	}

	/**
	 * AJAX logic for submitting ratings.
	 */
	public function ajax_submit_rating() {
		check_ajax_referer( 'tukitask_rating_nonce', 'security' );
		
		$order_id = intval( $_POST['order_id'] );
		$rating   = floatval( $_POST['rating'] );
		$comment  = sanitize_textarea_field( $_POST['comment'] );
		$user_id  = get_current_user_id();

		$order = wc_get_order( $order_id );
		if ( ! $order ) wp_send_json_error( array( 'message' => 'Pedido no válido.' ) );

		$driver_id = $order->get_meta( '_assigned_driver_id' );
		
		// 1. Rate Driver
		if ( $driver_id ) {
			Review_Manager::add_review( array(
				'item_id'     => $order_id,
				'customer_id' => $user_id,
				'target_id'   => $driver_id,
				'target_type' => 'driver',
				'rating'      => $rating,
				'comment'     => $comment
			) );
		}

		// 2. Rate Vendor
		$items = $order->get_items();
		foreach($items as $item) {
			$vendor_id = get_post_field('post_author', $item->get_product_id());
			if ( $vendor_id ) {
				Review_Manager::add_review( array(
					'item_id'     => $order_id,
					'customer_id' => $user_id,
					'target_id'   => $vendor_id,
					'target_type' => 'vendor',
					'rating'      => $rating,
					'comment'     => $comment
				) );
				break; // Normally rate the order as a whole
			}
		}

		wp_send_json_success();
	}
}
