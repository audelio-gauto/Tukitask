<?php
/**
 * Supplier/Provider Dashboard — Dropshipping Panel (Dropi Style).
 *
 * Provides a full dashboard for suppliers (proveedores) to manage their
 * dropshipping catalog, fulfill orders from vendors, and track earnings.
 *
 * Shortcode: [tukitask_proveedor_panel]
 *
 * @package Tukitask\LocalDrivers\Frontend
 */

namespace Tukitask\LocalDrivers\Frontend;

use Tukitask\LocalDrivers\Helpers\Commission_Manager;
use Tukitask\LocalDrivers\Helpers\Payout_Manager;

class Proveedor_Dashboard {

	protected $loader;

	public function __construct( $loader ) {
		$this->loader = $loader;

		// Shortcode
		$loader->add_shortcode( 'tukitask_proveedor_panel', $this, 'render_dashboard' );

		// Provider AJAX actions
		$loader->add_action( 'wp_ajax_tukitask_prov_add_product', $this, 'ajax_add_product' );
		$loader->add_action( 'wp_ajax_tukitask_prov_update_product', $this, 'ajax_update_product' );
		$loader->add_action( 'wp_ajax_tukitask_prov_delete_product', $this, 'ajax_delete_product' );
		$loader->add_action( 'wp_ajax_tukitask_prov_upload_image', $this, 'ajax_upload_image' );
		$loader->add_action( 'wp_ajax_tukitask_prov_update_profile', $this, 'ajax_update_profile' );
		$loader->add_action( 'wp_ajax_tukitask_prov_fulfill_order', $this, 'ajax_fulfill_order' );
		$loader->add_action( 'wp_ajax_tukitask_prov_get_stats', $this, 'ajax_get_stats' );
		$loader->add_action( 'wp_ajax_tukitask_prov_request_withdrawal', $this, 'ajax_request_withdrawal' );

		// Vendor-side AJAX: browse & import from catalog
		$loader->add_action( 'wp_ajax_tukitask_dropship_browse', $this, 'ajax_dropship_browse' );
		$loader->add_action( 'wp_ajax_tukitask_dropship_import', $this, 'ajax_dropship_import' );
		$loader->add_action( 'wp_ajax_tukitask_dropship_product_detail', $this, 'ajax_dropship_product_detail' );
	}

	/* =========================================================================
	 *  ACCESS GUARD
	 * ====================================================================== */

	private function can_access() {
		return is_user_logged_in() && ( current_user_can( 'tukitask_provider_access' ) || current_user_can( 'manage_options' ) );
	}

	/* =========================================================================
	 *  SHORTCODE — MAIN DASHBOARD RENDERER
	 * ====================================================================== */

	public function render_dashboard( $atts = array() ) {
		if ( ! is_user_logged_in() ) {
			return '<div class="tukitask-error" style="padding:40px;text-align:center;background:#fff;border-radius:12px;border:1px solid #ef4444;margin:20px;">'
				. __( 'Debes iniciar sesión para acceder al panel de proveedor.', 'tukitask-local-drivers' ) . '</div>';
		}
		if ( ! $this->can_access() ) {
			return '<div class="tukitask-error" style="padding:40px;text-align:center;background:#fff;border-radius:12px;border:1px solid #ef4444;margin:20px;">'
				. __( 'No tienes permisos de proveedor. Contacta al administrador.', 'tukitask-local-drivers' ) . '</div>';
		}

		$user = wp_get_current_user();
		$active_tab = isset( $_GET['tab'] ) ? sanitize_text_field( $_GET['tab'] ) : 'overview';
		$nonce = wp_create_nonce( 'tukitask_proveedor_nonce' );

		ob_start();
		$this->output_css();
		?>
		<div class="tukitask-proveedor-pro enterprise" data-version="1.0.0">
			<!-- Sidebar -->
			<aside class="prov-sidebar">
				<div class="sidebar-logo">
					<h2>Tuki<span>Supplier</span></h2>
					<small>Dropshipping Hub</small>
				</div>
				<nav class="sidebar-nav">
					<?php
					$tabs = array(
						'overview'  => array( 'label' => 'Dashboard', 'icon' => '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' ),
						'catalog'   => array( 'label' => 'Mi Catálogo', 'icon' => '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' ),
						'orders'    => array( 'label' => 'Pedidos Dropship', 'icon' => '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' ),
						'vendors'   => array( 'label' => 'Mis Vendedores', 'icon' => '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' ),
						'wallet'    => array( 'label' => 'Billetera', 'icon' => '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' ),
						'profile'   => array( 'label' => 'Mi Perfil', 'icon' => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09"/>' ),
					);
					foreach ( $tabs as $id => $t ) : ?>
						<button class="nav-item <?php echo $active_tab === $id ? 'active' : ''; ?>" data-tab="<?php echo esc_attr( $id ); ?>">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><?php echo $t['icon']; ?></svg>
							<span><?php echo esc_html( $t['label'] ); ?></span>
						</button>
					<?php endforeach; ?>
				</nav>
				<div class="sidebar-footer">
					<div class="user-pill">
						<?php echo get_avatar( $user->ID, 32 ); ?>
						<div class="user-meta">
							<span class="user-name"><?php echo esc_html( $user->display_name ); ?></span>
							<span class="user-role">Proveedor</span>
						</div>
					</div>
					<a href="<?php echo wp_logout_url( get_permalink() ); ?>" class="logout-link">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
						<span>Cerrar Sesión</span>
					</a>
				</div>
			</aside>

			<!-- Main Content -->
			<main class="prov-content">
				<header class="content-top-bar">
					<div class="top-bar-title">
						<h3><?php esc_html_e( 'Panel de Proveedor', 'tukitask-local-drivers' ); ?></h3>
					</div>
					<div class="top-bar-actions">
						<button class="tukitask-btn accent" onclick="document.getElementById('prov-add-product-modal').style.display='flex'">+ <?php esc_html_e( 'Agregar Producto', 'tukitask-local-drivers' ); ?></button>
					</div>
				</header>

				<div class="tab-containers">
					<section id="tab-overview" class="tab-pane <?php echo $active_tab === 'overview' ? 'active' : ''; ?>">
						<?php $this->render_overview_tab(); ?>
					</section>
					<section id="tab-catalog" class="tab-pane <?php echo $active_tab === 'catalog' ? 'active' : ''; ?>">
						<?php $this->render_catalog_tab(); ?>
					</section>
					<section id="tab-orders" class="tab-pane <?php echo $active_tab === 'orders' ? 'active' : ''; ?>">
						<?php $this->render_orders_tab(); ?>
					</section>
					<section id="tab-vendors" class="tab-pane <?php echo $active_tab === 'vendors' ? 'active' : ''; ?>">
						<?php $this->render_vendors_tab(); ?>
					</section>
					<section id="tab-wallet" class="tab-pane <?php echo $active_tab === 'wallet' ? 'active' : ''; ?>">
						<?php $this->render_wallet_tab(); ?>
					</section>
					<section id="tab-profile" class="tab-pane <?php echo $active_tab === 'profile' ? 'active' : ''; ?>">
						<?php $this->render_profile_tab(); ?>
					</section>
				</div>
			</main>
		</div>

		<!-- Add Product Modal -->
		<?php $this->render_add_product_modal( $nonce ); ?>

		<script>
		(function(){
			var provNonce = '<?php echo esc_js( $nonce ); ?>';
			var ajaxUrl   = '<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>';

			/* ---- Tab navigation ---- */
			document.querySelectorAll('.prov-sidebar .nav-item').forEach(function(btn){
				btn.addEventListener('click', function(){
					var tab = this.dataset.tab;
					if(!tab) return;
					var url = new URL(window.location);
					url.searchParams.set('tab', tab);
					window.history.pushState({}, '', url);
					document.querySelectorAll('.prov-sidebar .nav-item').forEach(function(b){ b.classList.remove('active'); });
					this.classList.add('active');
					document.querySelectorAll('.tab-pane').forEach(function(p){ p.classList.remove('active'); });
					var target = document.getElementById('tab-' + tab);
					if(target) target.classList.add('active');
				});
			});

			/* ---- Helper: form submit via fetch ---- */
			function ajaxPost(action, formData, callback) {
				formData.append('action', action);
				formData.append('security', provNonce);
				fetch(ajaxUrl, { method:'POST', body: formData })
					.then(function(r){ return r.json(); })
					.then(callback);
			}

			/* ---- Add Product ---- */
			var addForm = document.getElementById('prov-add-product-form');
			if(addForm) {
				addForm.addEventListener('submit', function(e){
					e.preventDefault();
					var btn = this.querySelector('button[type="submit"]');
					btn.disabled = true;
					btn.textContent = '<?php esc_attr_e( 'Guardando...', 'tukitask-local-drivers' ); ?>';
					ajaxPost('tukitask_prov_add_product', new FormData(this), function(data){
						alert(data.data.message);
						if(data.success) location.reload();
						btn.disabled = false;
						btn.textContent = '<?php esc_attr_e( 'Publicar en Catálogo', 'tukitask-local-drivers' ); ?>';
					});
				});
			}

			/* ---- Image Upload ---- */
			window.provUploadImage = function(inputId, previewId, hiddenId){
				var input = document.getElementById(inputId);
				if(!input || !input.files[0]) return;
				var fd = new FormData();
				fd.append('file', input.files[0]);
				fd.append('action', 'tukitask_prov_upload_image');
				fd.append('security', provNonce);
				fetch(ajaxUrl, { method:'POST', body:fd })
					.then(function(r){ return r.json(); })
					.then(function(data){
						if(data.success){
							document.getElementById(hiddenId).value = data.data.id;
							var prev = document.getElementById(previewId);
							if(prev) prev.src = data.data.url;
						} else {
							alert(data.data.message || 'Error al subir imagen');
						}
					});
			};

			/* ---- Delete Product ---- */
			window.provDeleteProduct = function(pid){
				if(!confirm('<?php esc_attr_e( '¿Eliminar este producto del catálogo?', 'tukitask-local-drivers' ); ?>')) return;
				var fd = new FormData();
				fd.append('product_id', pid);
				ajaxPost('tukitask_prov_delete_product', fd, function(data){
					alert(data.data.message);
					if(data.success) location.reload();
				});
			};

			/* ---- Fulfill Order ---- */
			window.provFulfillOrder = function(orderId){
				if(!confirm('<?php esc_attr_e( '¿Confirmar preparación de este pedido?', 'tukitask-local-drivers' ); ?>')) return;
				var fd = new FormData();
				fd.append('order_id', orderId);
				ajaxPost('tukitask_prov_fulfill_order', fd, function(data){
					alert(data.data.message);
					if(data.success) location.reload();
				});
			};

			/* ---- Withdrawal ---- */
			window.provRequestWithdrawal = function(){
				var amount = parseFloat(document.getElementById('prov-withdraw-amount').value);
				var max = parseFloat(document.getElementById('prov-withdraw-amount').max) || 0;
				if(!amount || amount <= 0) return alert('<?php esc_attr_e( 'Ingresa un monto válido.', 'tukitask-local-drivers' ); ?>');
				if(amount > max) return alert('<?php esc_attr_e( 'El monto excede tu saldo disponible.', 'tukitask-local-drivers' ); ?>');
				var fd = new FormData();
				fd.append('amount', amount);
				ajaxPost('tukitask_prov_request_withdrawal', fd, function(data){
					alert(data.data.message);
					if(data.success) location.reload();
				});
			};

			/* ---- Profile ---- */
			var profForm = document.getElementById('prov-profile-form');
			if(profForm){
				profForm.addEventListener('submit', function(e){
					e.preventDefault();
					var btn = this.querySelector('button[type="submit"]');
					btn.disabled = true;
					ajaxPost('tukitask_prov_update_profile', new FormData(this), function(data){
						alert(data.data.message);
						btn.disabled = false;
					});
				});
			}
		})();
		</script>

		<?php
		return ob_get_clean();
	}

	/* =========================================================================
	 *  TAB: OVERVIEW
	 * ====================================================================== */

	private function render_overview_tab() {
		$user_id = get_current_user_id();
		$catalog_count = $this->get_catalog_count( $user_id );
		$active_vendors = $this->get_active_vendor_count( $user_id );
		$pending_orders = $this->get_dropship_orders( $user_id, 'pending' );
		$balance = $this->get_provider_balance( $user_id );
		$total_sold = $this->get_total_units_sold( $user_id );
		?>
		<div class="section-header"><h1><?php esc_html_e( 'Panel de Control', 'tukitask-local-drivers' ); ?></h1></div>

		<div class="stats-grid">
			<div class="stat-card glass accent-blue">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Productos en Catálogo', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo intval( $catalog_count ); ?></span>
				</div>
			</div>
			<div class="stat-card glass accent-purple">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Vendedores Vinculados', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo intval( $active_vendors ); ?></span>
				</div>
			</div>
			<div class="stat-card glass accent-green">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Pedidos Pendientes', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo count( $pending_orders ); ?></span>
				</div>
			</div>
			<div class="stat-card glass accent-orange">
				<div class="stat-content">
					<span class="label"><?php esc_html_e( 'Saldo Disponible', 'tukitask-local-drivers' ); ?></span>
					<span class="value"><?php echo wc_price( $balance ); ?></span>
				</div>
			</div>
		</div>

		<?php if ( ! empty( $pending_orders ) ) : ?>
		<div class="glass" style="padding:20px; margin-top:25px; border-radius:var(--e-radius-md);">
			<h3 style="margin:0 0 15px;"><?php esc_html_e( 'Pedidos por Preparar', 'tukitask-local-drivers' ); ?></h3>
			<?php foreach ( array_slice( $pending_orders, 0, 5 ) as $o ) : ?>
			<div class="order-row" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--e-border);">
				<div>
					<strong>#<?php echo $o['order_id']; ?></strong>
					<span style="color:var(--e-text-muted); margin-left:8px;"><?php echo esc_html( $o['vendor_name'] ); ?></span>
					<span style="color:var(--e-text-muted); margin-left:8px;"><?php echo esc_html( $o['product_name'] ); ?> × <?php echo $o['qty']; ?></span>
				</div>
				<button class="tukitask-btn accent small" onclick="provFulfillOrder(<?php echo $o['order_id']; ?>)"><?php esc_html_e( 'Preparar', 'tukitask-local-drivers' ); ?></button>
			</div>
			<?php endforeach; ?>
		</div>
		<?php endif; ?>
		<?php
	}

	/* =========================================================================
	 *  TAB: CATALOG
	 * ====================================================================== */

	private function render_catalog_tab() {
		$user_id = get_current_user_id();
		$products = get_posts( array(
			'post_type'      => 'product',
			'post_status'    => array( 'publish', 'draft' ),
			'author'         => $user_id,
			'posts_per_page' => -1,
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) );
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Catálogo Dropshipping', 'tukitask-local-drivers' ); ?></h1>
			<p style="color:var(--e-text-muted);"><?php esc_html_e( 'Productos disponibles para que los vendedores importen a sus tiendas.', 'tukitask-local-drivers' ); ?></p>
		</div>

		<div class="product-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:20px; margin-top:20px;">
			<?php if ( empty( $products ) ) : ?>
				<div class="glass" style="grid-column:1/-1; text-align:center; padding:60px 20px; color:var(--e-text-muted);">
					<p><?php esc_html_e( 'Aún no tienes productos en el catálogo dropshipping.', 'tukitask-local-drivers' ); ?></p>
					<button class="tukitask-btn accent" onclick="document.getElementById('prov-add-product-modal').style.display='flex'" style="margin-top:12px;">+ <?php esc_html_e( 'Agregar Producto', 'tukitask-local-drivers' ); ?></button>
				</div>
			<?php else : ?>
				<?php foreach ( $products as $p ) :
					$product = wc_get_product( $p->ID );
					if ( ! $product ) continue;
					$img = $product->get_image_id() ? wp_get_attachment_image_url( $product->get_image_id(), 'woocommerce_thumbnail' ) : wc_placeholder_img_src();
					$supplier_price = (float) get_post_meta( $p->ID, '_tukitask_supplier_price', true );
					$suggested_price = (float) get_post_meta( $p->ID, '_tukitask_suggested_retail_price', true );
					$imports_count = $this->count_product_imports( $p->ID );
				?>
				<div class="prov-product-card glass">
					<div class="prov-card-img">
						<img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $product->get_name() ); ?>">
						<?php if ( $product->get_status() === 'draft' ) : ?>
							<span class="card-badge draft"><?php esc_html_e( 'Borrador', 'tukitask-local-drivers' ); ?></span>
						<?php endif; ?>
					</div>
					<div class="prov-card-body">
						<h4><?php echo esc_html( $product->get_name() ); ?></h4>
						<div class="prov-card-prices">
							<div>
								<small><?php esc_html_e( 'Precio Proveedor', 'tukitask-local-drivers' ); ?></small>
								<strong style="color:var(--e-accent);"><?php echo wc_price( $supplier_price ); ?></strong>
							</div>
							<div>
								<small><?php esc_html_e( 'PVP Sugerido', 'tukitask-local-drivers' ); ?></small>
								<strong><?php echo $suggested_price ? wc_price( $suggested_price ) : '—'; ?></strong>
							</div>
						</div>
						<div class="prov-card-meta">
							<span title="<?php esc_attr_e( 'Vendedores que importaron este producto', 'tukitask-local-drivers' ); ?>">
								&#128101; <?php echo intval( $imports_count ); ?> <?php esc_html_e( 'vendedores', 'tukitask-local-drivers' ); ?>
							</span>
							<span>&#128230; <?php echo $product->get_stock_quantity() !== null ? $product->get_stock_quantity() : '∞'; ?></span>
						</div>
						<div class="prov-card-actions">
							<button class="tukitask-btn small danger" onclick="provDeleteProduct(<?php echo $p->ID; ?>)">&#128465;</button>
						</div>
					</div>
				</div>
				<?php endforeach; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	/* =========================================================================
	 *  TAB: ORDERS (Dropship fulfillment)
	 * ====================================================================== */

	private function render_orders_tab() {
		$user_id = get_current_user_id();
		$filter = isset( $_GET['order_filter'] ) ? sanitize_text_field( $_GET['order_filter'] ) : 'all';
		$orders = $this->get_dropship_orders( $user_id, $filter );
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Pedidos Dropshipping', 'tukitask-local-drivers' ); ?></h1>
			<p style="color:var(--e-text-muted);"><?php esc_html_e( 'Pedidos de vendedores que incluyen tus productos.', 'tukitask-local-drivers' ); ?></p>
		</div>

		<div class="filter-pills" style="display:flex; gap:10px; margin:20px 0;">
			<?php
			$filters = array(
				'all'       => __( 'Todos', 'tukitask-local-drivers' ),
				'pending'   => __( 'Pendientes', 'tukitask-local-drivers' ),
				'fulfilled' => __( 'Preparados', 'tukitask-local-drivers' ),
			);
			foreach ( $filters as $key => $label ) : ?>
				<a href="?tab=orders&order_filter=<?php echo esc_attr( $key ); ?>" class="pill <?php echo $filter === $key ? 'active' : ''; ?>"><?php echo esc_html( $label ); ?></a>
			<?php endforeach; ?>
		</div>

		<div class="table-container glass" style="margin-top:10px;">
			<table class="enterprise-table">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Pedido', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Vendedor', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Producto', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Cantidad', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Tu Ganancia', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Estado', 'tukitask-local-drivers' ); ?></th>
						<th style="text-align:right;"><?php esc_html_e( 'Acción', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
				<?php if ( empty( $orders ) ) : ?>
					<tr><td colspan="7" class="empty-state" style="text-align:center; padding:40px; color:var(--e-text-muted);"><?php esc_html_e( 'No hay pedidos en esta categoría.', 'tukitask-local-drivers' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $orders as $o ) : ?>
					<tr>
						<td><strong>#<?php echo $o['order_id']; ?></strong></td>
						<td><?php echo esc_html( $o['vendor_name'] ); ?></td>
						<td><?php echo esc_html( $o['product_name'] ); ?></td>
						<td><?php echo intval( $o['qty'] ); ?></td>
						<td><strong><?php echo wc_price( $o['provider_earning'] ); ?></strong></td>
						<td>
							<?php if ( $o['fulfilled'] ) : ?>
								<span class="badge success"><?php esc_html_e( 'Preparado', 'tukitask-local-drivers' ); ?></span>
							<?php else : ?>
								<span class="badge stock-in"><?php esc_html_e( 'Pendiente', 'tukitask-local-drivers' ); ?></span>
							<?php endif; ?>
						</td>
						<td style="text-align:right;">
							<?php if ( ! $o['fulfilled'] ) : ?>
								<button class="tukitask-btn accent small" onclick="provFulfillOrder(<?php echo $o['order_id']; ?>)"><?php esc_html_e( 'Preparar', 'tukitask-local-drivers' ); ?></button>
							<?php else : ?>
								<span style="color:var(--e-text-muted);">✓</span>
							<?php endif; ?>
						</td>
					</tr>
					<?php endforeach; ?>
				<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/* =========================================================================
	 *  TAB: VENDORS (who import my products)
	 * ====================================================================== */

	private function render_vendors_tab() {
		$user_id = get_current_user_id();
		$vendors = $this->get_linked_vendors( $user_id );
		?>
		<div class="section-header">
			<h1><?php esc_html_e( 'Vendedores que Importaron tus Productos', 'tukitask-local-drivers' ); ?></h1>
		</div>
		<div class="table-container glass" style="margin-top:20px;">
			<table class="enterprise-table">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Vendedor', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Productos Importados', 'tukitask-local-drivers' ); ?></th>
						<th><?php esc_html_e( 'Pedidos Generados', 'tukitask-local-drivers' ); ?></th>
					</tr>
				</thead>
				<tbody>
				<?php if ( empty( $vendors ) ) : ?>
					<tr><td colspan="3" class="empty-state" style="text-align:center; padding:40px; color:var(--e-text-muted);"><?php esc_html_e( 'Ningún vendedor ha importado tus productos aún.', 'tukitask-local-drivers' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $vendors as $v ) : $vuser = get_userdata( $v['vendor_id'] ); ?>
					<tr>
						<td style="display:flex;align-items:center;gap:10px;">
							<?php echo get_avatar( $v['vendor_id'], 32 ); ?>
							<span><?php echo $vuser ? esc_html( $vuser->display_name ) : 'N/A'; ?></span>
						</td>
						<td><?php echo intval( $v['product_count'] ); ?></td>
						<td><?php echo intval( $v['order_count'] ); ?></td>
					</tr>
					<?php endforeach; ?>
				<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/* =========================================================================
	 *  TAB: WALLET
	 * ====================================================================== */

	private function render_wallet_tab() {
		$user_id = get_current_user_id();
		$balance = $this->get_provider_balance( $user_id );
		$locked  = Payout_Manager::get_locked_balance( $user_id );
		$total_earned = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_total_earnings( $user_id );
		$can_withdraw = $balance > 0;

		global $wpdb;
		$total_paid = (float) $wpdb->get_var( $wpdb->prepare(
			"SELECT COALESCE(SUM(amount),0) FROM {$wpdb->prefix}tukitask_payouts WHERE vendor_id = %d AND status = 'paid'", $user_id
		) );
		?>
		<div class="section-header"><h1><?php esc_html_e( 'Mi Billetera', 'tukitask-local-drivers' ); ?></h1></div>
		<div class="wallet-overview">
			<div class="wallet-card gradient-dark">
				<div class="balance-info">
					<span class="label"><?php esc_html_e( 'Saldo Disponible', 'tukitask-local-drivers' ); ?></span>
					<span class="balance-amount"><?php echo wc_price( $balance ); ?></span>
				</div>
				<?php if ( $can_withdraw ) : ?>
					<button class="withdraw-btn" onclick="document.getElementById('prov-withdraw-modal').style.display='flex'"><?php esc_html_e( 'Solicitar Retiro', 'tukitask-local-drivers' ); ?></button>
				<?php else : ?>
					<button class="withdraw-btn" disabled style="opacity:.5;cursor:not-allowed;"><?php esc_html_e( 'Sin saldo', 'tukitask-local-drivers' ); ?></button>
				<?php endif; ?>
			</div>
			<div class="wallet-stats glass">
				<div class="w-stat"><span><?php esc_html_e( 'Total Ganado', 'tukitask-local-drivers' ); ?></span><strong><?php echo wc_price( $total_earned ); ?></strong></div>
				<div class="w-stat"><span><?php esc_html_e( 'Retirado', 'tukitask-local-drivers' ); ?></span><strong style="color:#6B7280;"><?php echo wc_price( $total_paid ); ?></strong></div>
				<div class="w-stat"><span><?php esc_html_e( 'En Proceso', 'tukitask-local-drivers' ); ?></span><strong style="color:#F59E0B;"><?php echo wc_price( $locked ); ?></strong></div>
			</div>
		</div>

		<!-- Payout History -->
		<div class="glass" style="margin-top:20px; padding:20px; border-radius:var(--e-radius-md);">
			<h3 style="margin:0 0 15px;"><?php esc_html_e( 'Historial', 'tukitask-local-drivers' ); ?></h3>
			<?php $history = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_history( $user_id, 15 ); ?>
			<?php if ( empty( $history ) ) : ?>
				<p style="color:var(--e-text-muted); text-align:center; padding:20px;"><?php esc_html_e( 'Sin movimientos aún.', 'tukitask-local-drivers' ); ?></p>
			<?php else : ?>
				<table class="enterprise-table">
					<thead><tr><th><?php esc_html_e( 'Fecha', 'tukitask-local-drivers' ); ?></th><th><?php esc_html_e( 'Descripción', 'tukitask-local-drivers' ); ?></th><th><?php esc_html_e( 'Monto', 'tukitask-local-drivers' ); ?></th></tr></thead>
					<tbody>
					<?php foreach ( $history as $h ) : ?>
						<tr>
							<td><?php echo date_i18n( get_option( 'date_format' ), strtotime( $h->created_at ) ); ?></td>
							<td><?php echo esc_html( $h->description ); ?></td>
							<td><strong style="color:<?php echo $h->amount >= 0 ? '#10B981' : '#EF4444'; ?>;"><?php echo wc_price( $h->amount ); ?></strong></td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>

		<!-- Withdrawal Modal -->
		<div id="prov-withdraw-modal" class="enterprise-modal">
			<div class="modal-content glass" style="max-width:450px; padding:40px;">
				<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
					<h2 style="margin:0;"><?php esc_html_e( 'Solicitar Retiro', 'tukitask-local-drivers' ); ?></h2>
					<button style="background:none;border:none;font-size:24px;cursor:pointer;" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>
				<div style="margin-bottom:15px;">
					<label style="display:block;font-weight:600;margin-bottom:6px;"><?php esc_html_e( 'Monto', 'tukitask-local-drivers' ); ?></label>
					<input type="number" id="prov-withdraw-amount" min="1" step="any" max="<?php echo esc_attr( $balance ); ?>" style="width:100%;padding:12px;border:1px solid var(--e-border);border-radius:8px;" placeholder="<?php echo esc_attr( strip_tags( wc_price( $balance ) ) ); ?>">
				</div>
				<button class="tukitask-btn accent" style="width:100%;" onclick="provRequestWithdrawal()"><?php esc_html_e( 'Confirmar Retiro', 'tukitask-local-drivers' ); ?></button>
			</div>
		</div>
		<?php
	}

	/* =========================================================================
	 *  TAB: PROFILE
	 * ====================================================================== */

	private function render_profile_tab() {
		$user_id = get_current_user_id();
		$user = wp_get_current_user();
		?>
		<div class="section-header"><h1><?php esc_html_e( 'Perfil de Proveedor', 'tukitask-local-drivers' ); ?></h1></div>
		<form id="prov-profile-form" class="glass" style="padding:30px; border-radius:var(--e-radius-md); max-width:700px;">
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Nombre de Empresa', 'tukitask-local-drivers' ); ?></label>
					<input type="text" name="company_name" value="<?php echo esc_attr( $user->display_name ); ?>" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
				</div>
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Email', 'tukitask-local-drivers' ); ?></label>
					<input type="email" value="<?php echo esc_attr( $user->user_email ); ?>" disabled style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;background:#f1f5f9;">
				</div>
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Teléfono', 'tukitask-local-drivers' ); ?></label>
					<input type="tel" name="phone" value="<?php echo esc_attr( get_user_meta( $user_id, 'billing_phone', true ) ); ?>" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
				</div>
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Dirección / Bodega', 'tukitask-local-drivers' ); ?></label>
					<input type="text" name="address" value="<?php echo esc_attr( get_user_meta( $user_id, 'billing_address_1', true ) ); ?>" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
				</div>
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Ciudad', 'tukitask-local-drivers' ); ?></label>
					<input type="text" name="city" value="<?php echo esc_attr( get_user_meta( $user_id, 'billing_city', true ) ); ?>" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
				</div>
				<div>
					<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'RUC / NIT', 'tukitask-local-drivers' ); ?></label>
					<input type="text" name="tax_id" value="<?php echo esc_attr( get_user_meta( $user_id, '_proveedor_tax_id', true ) ); ?>" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
				</div>
			</div>
			<div style="margin-top:15px;">
				<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Descripción / Sobre tu empresa', 'tukitask-local-drivers' ); ?></label>
				<textarea name="description" rows="3" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;"><?php echo esc_textarea( get_user_meta( $user_id, '_proveedor_description', true ) ); ?></textarea>
			</div>
			<button type="submit" class="tukitask-btn accent" style="margin-top:20px;"><?php esc_html_e( 'Guardar Cambios', 'tukitask-local-drivers' ); ?></button>
		</form>
		<?php
	}

	/* =========================================================================
	 *  MODAL: ADD PRODUCT
	 * ====================================================================== */

	private function render_add_product_modal( $nonce ) {
		$categories = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
		?>
		<div id="prov-add-product-modal" class="enterprise-modal">
			<div class="modal-content glass" style="max-width:650px; padding:40px; max-height:90vh; overflow-y:auto;">
				<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
					<h2 style="margin:0;"><?php esc_html_e( 'Nuevo Producto Dropshipping', 'tukitask-local-drivers' ); ?></h2>
					<button style="background:none;border:none;font-size:24px;cursor:pointer;" onclick="this.closest('.enterprise-modal').style.display='none'">&times;</button>
				</div>

				<form id="prov-add-product-form">
					<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
						<div style="grid-column:1/-1;">
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Nombre del Producto', 'tukitask-local-drivers' ); ?> *</label>
							<input type="text" name="product_name" required style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
						</div>
						<div>
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Precio Proveedor (costo)', 'tukitask-local-drivers' ); ?> *</label>
							<input type="number" name="supplier_price" required min="0" step="any" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
						</div>
						<div>
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'PVP Sugerido', 'tukitask-local-drivers' ); ?></label>
							<input type="number" name="suggested_price" min="0" step="any" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
						</div>
						<div>
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Stock Disponible', 'tukitask-local-drivers' ); ?></label>
							<input type="number" name="stock" min="0" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
						</div>
						<div>
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Categoría', 'tukitask-local-drivers' ); ?></label>
							<select name="category" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;">
								<option value=""><?php esc_html_e( '— Seleccionar —', 'tukitask-local-drivers' ); ?></option>
								<?php if ( ! is_wp_error( $categories ) ) : foreach ( $categories as $cat ) : ?>
									<option value="<?php echo $cat->term_id; ?>"><?php echo esc_html( $cat->name ); ?></option>
								<?php endforeach; endif; ?>
							</select>
						</div>
						<div style="grid-column:1/-1;">
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Descripción', 'tukitask-local-drivers' ); ?></label>
							<textarea name="description" rows="3" style="width:100%;padding:10px;border:1px solid var(--e-border);border-radius:8px;"></textarea>
						</div>
						<div style="grid-column:1/-1;">
							<label style="display:block;font-weight:600;margin-bottom:4px;"><?php esc_html_e( 'Imagen Principal', 'tukitask-local-drivers' ); ?></label>
							<input type="file" id="prov-product-img" accept="image/*" onchange="provUploadImage('prov-product-img','prov-img-preview','prov-image-id')">
							<input type="hidden" name="image_id" id="prov-image-id" value="">
							<img id="prov-img-preview" src="" style="max-width:120px; margin-top:8px; border-radius:8px; display:none;" onload="this.style.display='block'">
						</div>
					</div>
					<button type="submit" class="tukitask-btn accent" style="width:100%; margin-top:20px;"><?php esc_html_e( 'Publicar en Catálogo', 'tukitask-local-drivers' ); ?></button>
				</form>
			</div>
		</div>
		<?php
	}

	/* =========================================================================
	 *  AJAX: ADD PRODUCT
	 * ====================================================================== */

	public function ajax_add_product() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$name     = isset( $_POST['product_name'] ) ? sanitize_text_field( $_POST['product_name'] ) : '';
		$sup_price = isset( $_POST['supplier_price'] ) ? floatval( $_POST['supplier_price'] ) : 0;
		$sug_price = isset( $_POST['suggested_price'] ) ? floatval( $_POST['suggested_price'] ) : 0;
		$stock    = isset( $_POST['stock'] ) ? intval( $_POST['stock'] ) : '';
		$cat_id   = isset( $_POST['category'] ) ? intval( $_POST['category'] ) : 0;
		$desc     = isset( $_POST['description'] ) ? sanitize_textarea_field( $_POST['description'] ) : '';
		$image_id = isset( $_POST['image_id'] ) ? intval( $_POST['image_id'] ) : 0;

		if ( empty( $name ) || $sup_price <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'Nombre y precio proveedor son obligatorios.', 'tukitask-local-drivers' ) ) );
		}

		$product = new \WC_Product_Simple();
		$product->set_name( $name );
		$product->set_regular_price( $sug_price > 0 ? $sug_price : $sup_price );
		$product->set_description( $desc );
		$product->set_status( 'publish' );
		$product->set_catalog_visibility( 'hidden' ); // not visible in main shop; only via dropship catalog

		if ( $stock !== '' ) {
			$product->set_manage_stock( true );
			$product->set_stock_quantity( $stock );
			$product->set_stock_status( $stock > 0 ? 'instock' : 'outofstock' );
		} else {
			$product->set_stock_status( 'instock' );
		}

		if ( $image_id ) {
			$product->set_image_id( $image_id );
		}

		$product_id = $product->save();
		if ( ! $product_id ) {
			wp_send_json_error( array( 'message' => __( 'Error al crear el producto.', 'tukitask-local-drivers' ) ) );
		}

		// Set author to current provider
		wp_update_post( array( 'ID' => $product_id, 'post_author' => get_current_user_id() ) );

		// Category
		if ( $cat_id ) {
			wp_set_object_terms( $product_id, $cat_id, 'product_cat' );
		}

		// Dropshipping meta
		update_post_meta( $product_id, '_tukitask_dropship_available', 'yes' );
		update_post_meta( $product_id, '_tukitask_supplier_price', $sup_price );
		update_post_meta( $product_id, '_tukitask_suggested_retail_price', $sug_price > 0 ? $sug_price : '' );
		update_post_meta( $product_id, '_tukitask_provider_id', get_current_user_id() );

		wp_send_json_success( array( 'message' => __( 'Producto publicado en el catálogo dropshipping.', 'tukitask-local-drivers' ), 'product_id' => $product_id ) );
	}

	/* =========================================================================
	 *  AJAX: UPDATE PRODUCT
	 * ====================================================================== */

	public function ajax_update_product() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		$product = wc_get_product( $product_id );
		if ( ! $product || (int) get_post_field( 'post_author', $product_id ) !== get_current_user_id() ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado o sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		if ( isset( $_POST['supplier_price'] ) ) {
			update_post_meta( $product_id, '_tukitask_supplier_price', floatval( $_POST['supplier_price'] ) );
		}
		if ( isset( $_POST['suggested_price'] ) ) {
			update_post_meta( $product_id, '_tukitask_suggested_retail_price', floatval( $_POST['suggested_price'] ) );
		}
		if ( isset( $_POST['stock'] ) ) {
			$product->set_manage_stock( true );
			$product->set_stock_quantity( intval( $_POST['stock'] ) );
			$product->save();
		}

		wp_send_json_success( array( 'message' => __( 'Producto actualizado.', 'tukitask-local-drivers' ) ) );
	}

	/* =========================================================================
	 *  AJAX: DELETE PRODUCT
	 * ====================================================================== */

	public function ajax_delete_product() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$product_id = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		if ( ! $product_id || (int) get_post_field( 'post_author', $product_id ) !== get_current_user_id() ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado o sin permisos.', 'tukitask-local-drivers' ) ) );
		}

		wp_trash_post( $product_id );
		wp_send_json_success( array( 'message' => __( 'Producto eliminado del catálogo.', 'tukitask-local-drivers' ) ) );
	}

	/* =========================================================================
	 *  AJAX: UPLOAD IMAGE
	 * ====================================================================== */

	public function ajax_upload_image() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		if ( empty( $_FILES['file'] ) ) {
			wp_send_json_error( array( 'message' => __( 'No se recibió archivo.', 'tukitask-local-drivers' ) ) );
		}

		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';

		$attachment_id = media_handle_upload( 'file', 0 );
		if ( is_wp_error( $attachment_id ) ) {
			wp_send_json_error( array( 'message' => $attachment_id->get_error_message() ) );
		}

		wp_send_json_success( array(
			'id'  => $attachment_id,
			'url' => wp_get_attachment_image_url( $attachment_id, 'medium' ),
		) );
	}

	/* =========================================================================
	 *  AJAX: FULFILL ORDER
	 * ====================================================================== */

	public function ajax_fulfill_order() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$order_id = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			wp_send_json_error( array( 'message' => __( 'Pedido no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();

		// Verify this order contains provider's dropship products
		$has_products = false;
		foreach ( $order->get_items() as $item ) {
			$source_provider = get_post_meta( $item->get_product_id(), '_tukitask_source_provider_id', true );
			$original_provider = get_post_meta( $item->get_product_id(), '_tukitask_provider_id', true );
			if ( (int) $source_provider === $user_id || (int) $original_provider === $user_id ) {
				$has_products = true;
				break;
			}
		}
		if ( ! $has_products ) {
			wp_send_json_error( array( 'message' => __( 'Este pedido no contiene tus productos.', 'tukitask-local-drivers' ) ) );
		}

		// Mark as fulfilled
		$order->update_meta_data( '_dropship_fulfilled_by_' . $user_id, current_time( 'mysql' ) );
		$order->add_order_note(
			sprintf( __( 'Proveedor %s marcó sus productos como preparados.', 'tukitask-local-drivers' ), wp_get_current_user()->display_name )
		);
		$order->save();

		wp_send_json_success( array( 'message' => __( 'Pedido marcado como preparado.', 'tukitask-local-drivers' ) ) );
	}

	/* =========================================================================
	 *  AJAX: UPDATE PROFILE
	 * ====================================================================== */

	public function ajax_update_profile() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();

		if ( isset( $_POST['company_name'] ) ) {
			wp_update_user( array( 'ID' => $user_id, 'display_name' => sanitize_text_field( $_POST['company_name'] ) ) );
		}
		if ( isset( $_POST['phone'] ) ) {
			update_user_meta( $user_id, 'billing_phone', sanitize_text_field( $_POST['phone'] ) );
		}
		if ( isset( $_POST['address'] ) ) {
			update_user_meta( $user_id, 'billing_address_1', sanitize_text_field( $_POST['address'] ) );
		}
		if ( isset( $_POST['city'] ) ) {
			update_user_meta( $user_id, 'billing_city', sanitize_text_field( $_POST['city'] ) );
		}
		if ( isset( $_POST['tax_id'] ) ) {
			update_user_meta( $user_id, '_proveedor_tax_id', sanitize_text_field( $_POST['tax_id'] ) );
		}
		if ( isset( $_POST['description'] ) ) {
			update_user_meta( $user_id, '_proveedor_description', sanitize_textarea_field( $_POST['description'] ) );
		}

		wp_send_json_success( array( 'message' => __( 'Perfil actualizado.', 'tukitask-local-drivers' ) ) );
	}

	/* =========================================================================
	 *  AJAX: GET STATS
	 * ====================================================================== */

	public function ajax_get_stats() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		wp_send_json_success( array(
			'catalog_count'  => $this->get_catalog_count( $user_id ),
			'vendor_count'   => $this->get_active_vendor_count( $user_id ),
			'balance'        => $this->get_provider_balance( $user_id ),
			'pending_orders' => count( $this->get_dropship_orders( $user_id, 'pending' ) ),
		) );
	}

	/* =========================================================================
	 *  AJAX: REQUEST WITHDRAWAL
	 * ====================================================================== */

	public function ajax_request_withdrawal() {
		check_ajax_referer( 'tukitask_proveedor_nonce', 'security' );
		if ( ! $this->can_access() ) {
			wp_send_json_error( array( 'message' => __( 'Permiso denegado.', 'tukitask-local-drivers' ) ) );
		}

		$user_id = get_current_user_id();
		$amount  = isset( $_POST['amount'] ) ? floatval( $_POST['amount'] ) : 0;
		$balance = $this->get_provider_balance( $user_id );

		if ( $amount <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'El monto debe ser mayor a cero.', 'tukitask-local-drivers' ) ) );
		}
		if ( $balance <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'No tienes saldo disponible.', 'tukitask-local-drivers' ) ) );
		}
		if ( $amount > $balance ) {
			wp_send_json_error( array( 'message' => sprintf( __( 'Saldo insuficiente. Disponible: %s', 'tukitask-local-drivers' ), strip_tags( wc_price( $balance ) ) ) ) );
		}

		$request_id = Payout_Manager::create_request( array(
			'vendor_id'      => $user_id,
			'amount'         => $amount,
			'payment_method' => __( 'Transferencia Proveedor', 'tukitask-local-drivers' ),
		) );

		if ( $request_id ) {
			wp_send_json_success( array( 'message' => __( 'Solicitud de retiro enviada.', 'tukitask-local-drivers' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Error al procesar la solicitud.', 'tukitask-local-drivers' ) ) );
		}
	}

	/* =========================================================================
	 *  AJAX: VENDOR-SIDE — Browse Dropship Catalog
	 * ====================================================================== */

	public function ajax_dropship_browse() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		$search   = isset( $_GET['search'] ) ? sanitize_text_field( $_GET['search'] ) : '';
		$category = isset( $_GET['category'] ) ? intval( $_GET['category'] ) : 0;
		$page     = isset( $_GET['paged'] ) ? max( 1, intval( $_GET['paged'] ) ) : 1;
		$per_page = 20;

		$args = array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		);

		if ( $search ) {
			$args['s'] = $search;
		}
		if ( $category ) {
			$args['tax_query'] = array(
				array( 'taxonomy' => 'product_cat', 'field' => 'term_id', 'terms' => $category ),
			);
		}

		$query = new \WP_Query( $args );
		$items = array();

		foreach ( $query->posts as $post ) {
			$product = wc_get_product( $post->ID );
			if ( ! $product ) continue;

			$provider_id = (int) get_post_meta( $post->ID, '_tukitask_provider_id', true );
			$provider = get_userdata( $provider_id );

			$items[] = array(
				'id'              => $post->ID,
				'name'            => $product->get_name(),
				'image'           => $product->get_image_id() ? wp_get_attachment_image_url( $product->get_image_id(), 'woocommerce_thumbnail' ) : wc_placeholder_img_src(),
				'supplier_price'  => (float) get_post_meta( $post->ID, '_tukitask_supplier_price', true ),
				'suggested_price' => (float) get_post_meta( $post->ID, '_tukitask_suggested_retail_price', true ),
				'stock'           => $product->get_stock_quantity(),
				'stock_status'    => $product->get_stock_status(),
				'description'     => wp_trim_words( $product->get_short_description() ?: $product->get_description(), 25 ),
				'provider_name'   => $provider ? $provider->display_name : '',
				'category'        => wp_strip_all_tags( wc_get_product_category_list( $post->ID ) ),
			);
		}

		wp_send_json_success( array(
			'products'   => $items,
			'total'      => $query->found_posts,
			'pages'      => $query->max_num_pages,
			'page'       => $page,
		) );
	}

	/* =========================================================================
	 *  AJAX: VENDOR-SIDE — Import Product to My Store
	 * ====================================================================== */

	public function ajax_dropship_import() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		$source_id   = isset( $_POST['product_id'] ) ? intval( $_POST['product_id'] ) : 0;
		$sell_price  = isset( $_POST['sell_price'] ) ? floatval( $_POST['sell_price'] ) : 0;
		$vendor_id   = get_current_user_id();

		if ( ! $source_id || $sell_price <= 0 ) {
			wp_send_json_error( array( 'message' => __( 'Datos incompletos. Se requiere producto y precio de venta.', 'tukitask-local-drivers' ) ) );
		}

		$source = wc_get_product( $source_id );
		if ( ! $source ) {
			wp_send_json_error( array( 'message' => __( 'Producto origen no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		// Check not already imported
		$existing = get_posts( array(
			'post_type'      => 'product',
			'author'         => $vendor_id,
			'meta_key'       => '_tukitask_source_product_id',
			'meta_value'     => $source_id,
			'posts_per_page' => 1,
			'fields'         => 'ids',
		) );
		if ( ! empty( $existing ) ) {
			wp_send_json_error( array( 'message' => __( 'Ya importaste este producto a tu tienda.', 'tukitask-local-drivers' ) ) );
		}

		$supplier_price = (float) get_post_meta( $source_id, '_tukitask_supplier_price', true );
		if ( $sell_price <= $supplier_price ) {
			wp_send_json_error( array( 'message' => sprintf( __( 'El precio de venta debe ser mayor al precio del proveedor (%s).', 'tukitask-local-drivers' ), wc_price( $supplier_price ) ) ) );
		}

		$provider_id = (int) get_post_meta( $source_id, '_tukitask_provider_id', true );

		// Create a copy for the vendor
		$new_product = new \WC_Product_Simple();
		$new_product->set_name( $source->get_name() );
		$new_product->set_regular_price( $sell_price );
		$new_product->set_description( $source->get_description() );
		$new_product->set_short_description( $source->get_short_description() );
		$new_product->set_status( 'publish' );
		$new_product->set_catalog_visibility( 'visible' );

		if ( $source->get_image_id() ) {
			$new_product->set_image_id( $source->get_image_id() );
		}

		// Sync stock from source
		if ( $source->managing_stock() ) {
			$new_product->set_manage_stock( true );
			$new_product->set_stock_quantity( $source->get_stock_quantity() );
			$new_product->set_stock_status( $source->get_stock_status() );
		} else {
			$new_product->set_stock_status( 'instock' );
		}

		$new_id = $new_product->save();
		if ( ! $new_id ) {
			wp_send_json_error( array( 'message' => __( 'Error al crear el producto.', 'tukitask-local-drivers' ) ) );
		}

		// Set vendor as author
		wp_update_post( array( 'ID' => $new_id, 'post_author' => $vendor_id ) );

		// Copy categories
		$cats = wp_get_object_terms( $source_id, 'product_cat', array( 'fields' => 'ids' ) );
		if ( ! is_wp_error( $cats ) && ! empty( $cats ) ) {
			wp_set_object_terms( $new_id, $cats, 'product_cat' );
		}

		// Dropshipping link meta
		update_post_meta( $new_id, '_tukitask_source_product_id', $source_id );
		update_post_meta( $new_id, '_tukitask_source_provider_id', $provider_id );
		update_post_meta( $new_id, '_tukitask_supplier_price', $supplier_price );
		update_post_meta( $new_id, '_tukitask_is_dropship_import', 'yes' );

		wp_send_json_success( array(
			'message'    => sprintf( __( '"%s" importado a tu tienda con precio %s. Tu ganancia por venta: %s', 'tukitask-local-drivers' ), $source->get_name(), strip_tags( wc_price( $sell_price ) ), strip_tags( wc_price( $sell_price - $supplier_price ) ) ),
			'product_id' => $new_id,
		) );
	}

	/* =========================================================================
	 *  AJAX: VENDOR-SIDE — Product Detail (for import modal)
	 * ====================================================================== */

	public function ajax_dropship_product_detail() {
		check_ajax_referer( 'tukitask_vendedor_nonce', 'security' );

		$product_id = isset( $_GET['product_id'] ) ? intval( $_GET['product_id'] ) : 0;
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( array( 'message' => __( 'Producto no encontrado.', 'tukitask-local-drivers' ) ) );
		}

		$provider_id = (int) get_post_meta( $product_id, '_tukitask_provider_id', true );
		$provider = get_userdata( $provider_id );

		wp_send_json_success( array(
			'id'              => $product_id,
			'name'            => $product->get_name(),
			'description'     => $product->get_description(),
			'image'           => $product->get_image_id() ? wp_get_attachment_image_url( $product->get_image_id(), 'medium' ) : wc_placeholder_img_src(),
			'supplier_price'  => (float) get_post_meta( $product_id, '_tukitask_supplier_price', true ),
			'suggested_price' => (float) get_post_meta( $product_id, '_tukitask_suggested_retail_price', true ),
			'stock'           => $product->get_stock_quantity(),
			'provider_name'   => $provider ? $provider->display_name : '',
			'category'        => wp_strip_all_tags( wc_get_product_category_list( $product_id ) ),
		) );
	}

	/* =========================================================================
	 *  DATA HELPERS
	 * ====================================================================== */

	private function get_catalog_count( $user_id ) {
		return count( get_posts( array(
			'post_type'      => 'product',
			'author'         => $user_id,
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) ) );
	}

	private function count_product_imports( $source_product_id ) {
		return count( get_posts( array(
			'post_type'      => 'product',
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_key'       => '_tukitask_source_product_id',
			'meta_value'     => $source_product_id,
		) ) );
	}

	private function get_active_vendor_count( $provider_id ) {
		// Get all products by this provider
		$product_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $provider_id,
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) );
		if ( empty( $product_ids ) ) return 0;

		// Find unique vendors who imported any of these products
		global $wpdb;
		$ids_placeholder = implode( ',', array_map( 'intval', $product_ids ) );
		$vendor_count = $wpdb->get_var(
			"SELECT COUNT(DISTINCT post_author) FROM {$wpdb->posts} p
			 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
			 WHERE pm.meta_key = '_tukitask_source_product_id'
			 AND pm.meta_value IN ($ids_placeholder)
			 AND p.post_type = 'product'
			 AND p.post_status = 'publish'"
		);
		return intval( $vendor_count );
	}

	private function get_total_units_sold( $provider_id ) {
		// Count total quantity sold across all completed orders with this provider's dropship products
		$product_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $provider_id,
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) );
		if ( empty( $product_ids ) ) return 0;

		$total = 0;
		$orders = wc_get_orders( array( 'limit' => 200, 'status' => 'completed' ) );
		foreach ( $orders as $order ) {
			foreach ( $order->get_items() as $item ) {
				$source = (int) get_post_meta( $item->get_product_id(), '_tukitask_source_product_id', true );
				if ( $source && in_array( $source, $product_ids ) ) {
					$total += $item->get_quantity();
				}
			}
		}
		return $total;
	}

	/**
	 * Get dropship orders where this provider's products are included.
	 */
	private function get_dropship_orders( $provider_id, $filter = 'all' ) {
		$product_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $provider_id,
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) );
		if ( empty( $product_ids ) ) return array();

		$statuses = array( 'processing', 'on-hold', 'listo-para-envio', 'en-camino', 'completed' );
		$orders = wc_get_orders( array( 'limit' => 100, 'status' => $statuses, 'orderby' => 'date', 'order' => 'DESC' ) );
		$results = array();

		foreach ( $orders as $order ) {
			$fulfilled = $order->get_meta( '_dropship_fulfilled_by_' . $provider_id );

			foreach ( $order->get_items() as $item ) {
				$pid = $item->get_product_id();
				$source = (int) get_post_meta( $pid, '_tukitask_source_product_id', true );
				$direct_provider = (int) get_post_meta( $pid, '_tukitask_provider_id', true );
				$source_provider = (int) get_post_meta( $pid, '_tukitask_source_provider_id', true );

				$is_mine = ( $source && in_array( $source, $product_ids ) )
					|| ( $direct_provider === $provider_id )
					|| ( $source_provider === $provider_id );

				if ( ! $is_mine ) continue;

				$is_fulfilled = ! empty( $fulfilled );
				if ( $filter === 'pending' && $is_fulfilled ) continue;
				if ( $filter === 'fulfilled' && ! $is_fulfilled ) continue;

				$supplier_price = (float) get_post_meta( $pid, '_tukitask_supplier_price', true );
				$vendor_id = (int) get_post_field( 'post_author', $pid );
				$vendor = get_userdata( $vendor_id );

				$results[] = array(
					'order_id'         => $order->get_id(),
					'vendor_name'      => $vendor ? $vendor->display_name : 'N/A',
					'product_name'     => $item->get_name(),
					'qty'              => $item->get_quantity(),
					'provider_earning' => $supplier_price * $item->get_quantity(),
					'fulfilled'        => $is_fulfilled,
					'date'             => $order->get_date_created() ? $order->get_date_created()->date_i18n( get_option('date_format') ) : '',
				);
			}
		}
		return $results;
	}

	/**
	 * Get balance for provider (total ledger earnings minus payouts).
	 */
	private function get_provider_balance( $user_id ) {
		return \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $user_id );
	}

	private function get_linked_vendors( $provider_id ) {
		$product_ids = get_posts( array(
			'post_type'      => 'product',
			'author'         => $provider_id,
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'meta_query'     => array(
				array( 'key' => '_tukitask_dropship_available', 'value' => 'yes' ),
			),
		) );
		if ( empty( $product_ids ) ) return array();

		global $wpdb;
		$ids_placeholder = implode( ',', array_map( 'intval', $product_ids ) );

		$vendors = $wpdb->get_results(
			"SELECT p.post_author as vendor_id, COUNT(DISTINCT p.ID) as product_count
			 FROM {$wpdb->posts} p
			 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
			 WHERE pm.meta_key = '_tukitask_source_product_id'
			 AND pm.meta_value IN ($ids_placeholder)
			 AND p.post_type = 'product'
			 AND p.post_status = 'publish'
			 GROUP BY p.post_author",
			ARRAY_A
		);

		foreach ( $vendors as &$v ) {
			$v['order_count'] = 0;
			// Count orders by this vendor that contain dropship items from this provider
			$vendor_products = get_posts( array(
				'post_type'      => 'product',
				'author'         => $v['vendor_id'],
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'meta_key'       => '_tukitask_source_provider_id',
				'meta_value'     => $provider_id,
			) );
			if ( ! empty( $vendor_products ) ) {
				$completed_orders = wc_get_orders( array( 'limit' => 100, 'status' => 'completed' ) );
				foreach ( $completed_orders as $order ) {
					foreach ( $order->get_items() as $item ) {
						if ( in_array( $item->get_product_id(), $vendor_products ) ) {
							$v['order_count']++;
							break;
						}
					}
				}
			}
		}
		return $vendors;
	}

	/* =========================================================================
	 *  CSS
	 * ====================================================================== */

	private function output_css() {
		?>
		<style>
		:root {
			--e-primary: #4F46E5;
			--e-accent: #6366F1;
			--e-bg-side: #0F172A;
			--e-bg-main: #F8FAFC;
			--e-text: #1E293B;
			--e-text-muted: #64748B;
			--e-border: #E2E8F0;
			--e-white: #FFFFFF;
			--e-glass: rgba(255, 255, 255, 0.8);
			--e-radius-lg: 16px;
			--e-radius-md: 12px;
			--e-shadow: 0 4px 20px rgba(0,0,0,0.05);
		}

		.tukitask-proveedor-pro.enterprise {
			display: flex;
			min-height: 100vh;
			width: 100vw !important;
			max-width: 100vw !important;
			margin-left: calc(-50vw + 50%) !important;
			margin-right: calc(-50vw + 50%) !important;
			background: var(--e-bg-main);
			color: var(--e-text);
			font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
		}

		/* Sidebar */
		.prov-sidebar {
			width: 280px;
			background: var(--e-bg-side);
			color: #fff;
			display: flex;
			flex-direction: column;
			padding: 40px 0;
			position: sticky;
			top: 0;
			height: 100vh;
		}
		.prov-sidebar .sidebar-logo { padding: 0 40px 40px; }
		.prov-sidebar .sidebar-logo h2 { font-size: 24px; font-weight: 800; margin: 0; color: #fff; }
		.prov-sidebar .sidebar-logo span { color: #F59E0B; }
		.prov-sidebar .sidebar-logo small { display: block; color: #64748B; font-weight: 600; font-size: 10px; text-transform: uppercase; margin-top: 5px; }

		.prov-sidebar .nav-item {
			width: 100%;
			padding: 16px 40px;
			display: flex;
			align-items: center;
			gap: 14px;
			color: #94A3B8;
			font-weight: 500;
			font-size: 14px;
			cursor: pointer;
			background: none;
			border: none;
			text-align: left;
			transition: all 0.2s;
		}
		.prov-sidebar .nav-item:hover { color: #fff; background: rgba(255,255,255,.05); }
		.prov-sidebar .nav-item.active {
			color: #F59E0B;
			background: rgba(245,158,11,.08);
			border-right: 3px solid #F59E0B;
			font-weight: 700;
		}
		.prov-sidebar .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
		.prov-sidebar .sidebar-footer { margin-top: auto; padding: 0 30px; }
		.prov-sidebar .user-pill { display: flex; align-items: center; gap: 10px; padding: 15px 0; border-top: 1px solid rgba(255,255,255,.1); }
		.prov-sidebar .user-pill img { border-radius: 50%; }
		.prov-sidebar .user-meta { display: flex; flex-direction: column; }
		.prov-sidebar .user-name { font-weight: 600; font-size: 13px; color: #fff; }
		.prov-sidebar .user-role { font-size: 11px; color: #F59E0B; }
		.prov-sidebar .logout-link { display: flex; align-items: center; gap: 8px; color: #64748B; font-size: 13px; text-decoration: none; margin-top: 10px; }
		.prov-sidebar .logout-link:hover { color: #EF4444; }

		/* Main Content */
		.prov-content { flex: 1; padding: 0; overflow-x: hidden; }
		.content-top-bar { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: #fff; border-bottom: 1px solid var(--e-border); }
		.content-top-bar h3 { margin: 0; font-size:18px; }
		.tab-containers { padding: 30px 40px; }
		.tab-pane { display: none; }
		.tab-pane.active { display: block; }

		.section-header h1 { font-size: 22px; font-weight: 700; margin: 0 0 5px; }

		/* Stats Grid */
		.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-top: 20px; }
		.stat-card { padding: 24px; border-radius: var(--e-radius-md); }
		.stat-card .label { display: block; font-size: 12px; color: var(--e-text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
		.stat-card .value { display: block; font-size: 28px; font-weight: 800; }
		.glass { background: var(--e-glass); backdrop-filter: blur(10px); border: 1px solid var(--e-border); border-radius: var(--e-radius-md); }
		.accent-blue .value { color: #3B82F6; }
		.accent-purple .value { color: #8B5CF6; }
		.accent-green .value { color: #10B981; }
		.accent-orange .value { color: #F59E0B; }

		/* Buttons */
		.tukitask-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all .2s; }
		.tukitask-btn.accent { background: linear-gradient(135deg, #F59E0B, #D97706); color: #fff; }
		.tukitask-btn.accent:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(245,158,11,.3); }
		.tukitask-btn.small { padding: 6px 14px; font-size: 12px; }
		.tukitask-btn.danger { background: #FEE2E2; color: #EF4444; }

		/* Tables */
		.enterprise-table { width: 100%; border-collapse: collapse; }
		.enterprise-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--e-text-muted); font-weight: 700; padding: 12px 16px; border-bottom: 2px solid var(--e-border); }
		.enterprise-table td { padding: 14px 16px; border-bottom: 1px solid var(--e-border); font-size: 14px; }
		.enterprise-table tr:last-child td { border-bottom: none; }
		.badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
		.badge.success { background: #D1FAE5; color: #065F46; }
		.badge.stock-in { background: #FEF3C7; color: #92400E; }
		.badge.info { background: #DBEAFE; color: #1E40AF; }
		.badge.danger { background: #FEE2E2; color: #991B1B; }

		/* Filter pills */
		.pill { display: inline-block; padding: 8px 18px; border-radius: 20px; font-size: 13px; font-weight: 600; background: #F1F5F9; color: var(--e-text-muted); text-decoration: none; transition: all .2s; }
		.pill:hover, .pill.active { background: #F59E0B; color: #fff; }

		/* Product Cards */
		.prov-product-card { border-radius: var(--e-radius-md); overflow: hidden; transition: transform .2s; }
		.prov-product-card:hover { transform: translateY(-2px); }
		.prov-card-img { position: relative; height: 180px; overflow: hidden; }
		.prov-card-img img { width: 100%; height: 100%; object-fit: cover; }
		.card-badge { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
		.card-badge.draft { background: #FEF3C7; color: #92400E; }
		.prov-card-body { padding: 16px; }
		.prov-card-body h4 { margin: 0 0 10px; font-size: 15px; font-weight: 700; }
		.prov-card-prices { display: flex; gap: 20px; margin-bottom: 10px; }
		.prov-card-prices small { display: block; font-size: 10px; color: var(--e-text-muted); text-transform: uppercase; }
		.prov-card-meta { display: flex; gap: 15px; font-size: 12px; color: var(--e-text-muted); margin-bottom: 10px; }
		.prov-card-actions { display: flex; gap: 8px; justify-content: flex-end; }

		/* Wallet */
		.wallet-overview { margin-top: 20px; }
		.wallet-card { padding: 40px; border-radius: 20px; color: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
		.gradient-dark { background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); }
		.balance-info .label { display: block; font-size: 14px; opacity: .7; margin-bottom: 8px; }
		.balance-amount { font-size: 36px; font-weight: 800; }
		.withdraw-btn { padding: 14px 28px; border: none; border-radius: 12px; background: #F59E0B; color: #000; font-weight: 700; cursor: pointer; font-size: 14px; }
		.withdraw-btn:hover { background: #D97706; }
		.wallet-stats { display: flex; gap: 20px; padding: 20px; flex-wrap: wrap; }
		.w-stat { flex: 1; min-width: 120px; }
		.w-stat span { display: block; font-size: 12px; color: var(--e-text-muted); margin-bottom: 4px; }
		.w-stat strong { font-size: 18px; }

		/* Modals */
		.enterprise-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 99999; align-items: center; justify-content: center; }
		.enterprise-modal .modal-content { border-radius: var(--e-radius-lg); max-height: 90vh; overflow-y: auto; }

		/* Responsive */
		@media (max-width: 768px) {
			.tukitask-proveedor-pro.enterprise { flex-direction: column; }
			.prov-sidebar { width: 100%; height: auto; position: relative; flex-direction: row; padding: 10px 0; overflow-x: auto; }
			.prov-sidebar .sidebar-logo, .prov-sidebar .sidebar-footer { display: none; }
			.prov-sidebar .sidebar-nav { display: flex; flex-direction: row; width: 100%; overflow-x: auto; }
			.prov-sidebar .nav-item { padding: 10px 20px; white-space: nowrap; border-right: none; }
			.prov-sidebar .nav-item.active { border-right: none; border-bottom: 3px solid #F59E0B; }
			.tab-containers { padding: 15px; }
			.content-top-bar { padding: 15px; }
			.stats-grid { grid-template-columns: 1fr 1fr; }
			.wallet-card { flex-direction: column; gap: 15px; text-align: center; padding: 25px; }
		}
		</style>
		<?php
	}
}
