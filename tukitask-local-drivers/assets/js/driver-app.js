/**
 * Tukitask Driver App - Mobile-First JavaScript
 * Handles UI interactions, AJAX requests, and real-time updates
 */

(function($) {
	'use strict';

	const DriverApp = {
		// Configuration
		config: {
			ajaxUrl: window.tukitaskDriver?.ajaxUrl || ajaxurl,
			nonce: window.tukitaskDriver?.nonce || '',
			autoRefresh: 30000, // 30 seconds
			chatRefresh: 5000,  // 5 seconds
		},

		// Initialize app on document ready
		init: function() {
			this.cacheElements();
			this.bindEvents();
			this.attachARTCSS();
			this.startAutoRefresh();
		},

		// Cache DOM elements
		cacheElements: function() {
			this.$doc = $(document);
			this.$body = $('body');
			this.$sidebar = $('.tuki-sidebar');
			this.$overlay = $('.tuki-overlay');
			this.$menuToggle = $('#tuki-menu-toggle');
			this.$closeChat = $('#tuki-close-chat');
			this.$chatInput = $('#tuki-chat-input');
			this.$sendMessage = $('#tuki-send-message');
			this.$chatOverlay = $('#tuki-chat-overlay');
		},

		// Attach Art CSS if missing
		attachARTCSS: function() {
			if (!$('link[href*="driver-app.css"]').length) {
				// CSS should be enqueued by PHP, but as backup
				const cssUrl = window.tukitaskDriver?.pwaRoot + 'assets/css/driver-app.css';
				$('head').append('<link rel="stylesheet" href="' + cssUrl + '" />');
			}
		},

		// Bind all event listeners
		bindEvents: function() {
			// Mobile menu toggle
			this.$menuToggle.on('click', () => this.toggleSidebar());
			this.$overlay.on('click', () => this.closeSidebar());

			// Accept/Reject order buttons
			this.$doc.on('click', '.tuki-btn-accept', (e) => this.acceptOrder(e));
			this.$doc.on('click', '.tuki-btn-reject', (e) => this.rejectOrder(e));

			// Chat functionality
			this.$sendMessage.on('click', () => this.sendChatMessage());
			this.$chatInput.on('keypress', (e) => {
				if (e.which === 13 && !e.shiftKey) {
					e.preventDefault();
					this.sendChatMessage();
				}
			});
			this.$closeChat.on('click', () => this.closeChat());

			// Toggle availability
			this.$doc.on('click', '.tuki-toggle-availability', (e) => this.toggleAvailability(e));

			// Sidebar navigation
			this.$doc.on('click', '.tuki-nav-link', (e) => this.handleNavigation(e));
		},

		// Toggle sidebar on mobile
		toggleSidebar: function() {
			this.$sidebar.toggleClass('active');
			this.$overlay.toggleClass('active');
			this.$body.css('overflow', this.$sidebar.hasClass('active') ? 'hidden' : 'auto');
		},

		// Close sidebar
		closeSidebar: function() {
			this.$sidebar.removeClass('active');
			this.$overlay.removeClass('active');
			this.$body.css('overflow', 'auto');
		},

		// Handle navigation
		handleNavigation: function(e) {
			const $link = $(e.currentTarget);
			
			// Update active state
			$('.tuki-nav-link').removeClass('active');
			$link.addClass('active');

			// Close sidebar on mobile
			if ($(window).width() < 768) {
				this.closeSidebar();
			}
		},

		// ACCEPT ORDER
		acceptOrder: function(e) {
			const $btn = $(e.currentTarget);
			const orderId = $btn.data('order-id');

			if (!confirm(window.tukitaskDriver?.strings?.confirm_accept || '¿Aceptar este pedido?')) {
				return;
			}

			this.showLoading($btn);

			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_accept_order',
					order_id: orderId,
					security: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success) {
						this.showNotification('success', response.data?.message || 'Pedido aceptado correctamente');
						
						// Update UI
						setTimeout(() => {
							$btn.closest('.tuki-order-card').fadeOut(300, function() {
								$(this).remove();
							});
						}, 500);
					} else {
						this.showNotification('error', response.data?.message || 'Error al aceptar el pedido');
					}
				},
				error: () => {
					this.showNotification('error', window.tukitaskDriver?.i18n?.error || 'Error en la conexión');
				},
				complete: () => {
					this.hideLoading($btn);
				}
			});
		},

		// REJECT ORDER
		rejectOrder: function(e) {
			const $btn = $(e.currentTarget);
			const orderId = $btn.data('order-id');

			if (!confirm(window.tukitaskDriver?.strings?.confirm_reject || '¿Rechazar este pedido?')) {
				return;
			}

			this.showLoading($btn);

			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_reject_order',
					order_id: orderId,
					security: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success) {
						this.showNotification('success', response.data?.message || 'Pedido rechazado');
						
						// Update UI
						setTimeout(() => {
							$btn.closest('.tuki-order-card').fadeOut(300, function() {
								$(this).remove();
							});
						}, 500);
					} else {
						this.showNotification('error', response.data?.message || 'Error al rechazar el pedido');
					}
				},
				error: () => {
					this.showNotification('error', window.tukitaskDriver?.i18n?.error || 'Error en la conexión');
				},
				complete: () => {
					this.hideLoading($btn);
				}
			});
		},

		// Toggle driver availability
		toggleAvailability: function(e) {
			const $btn = $(e.currentTarget);
			const currentStatus = $btn.data('status');
			const newStatus = currentStatus === 'available' ? 'unavailable' : 'available';

			this.showLoading($btn);

			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_toggle_availability',
					nonce: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success) {
						const newStatus = response.data.new_status;
						const statusText = newStatus === 'available' ? 'Disponible' : 'No Disponible';
						
						// Update the status badge
						const $badge = $('#tuki-availability-label');
						if (newStatus === 'available') {
							$badge.removeClass('tuki-status-offline').addClass('tuki-status-online').text('Disponible');
						} else {
							$badge.removeClass('tuki-status-online').addClass('tuki-status-offline').text('No Disponible');
						}
						
						this.showNotification('success', response.data?.message || 'Estado actualizado');
					} else {
						this.showNotification('error', response.data?.message || 'Error al actualizar estado');
					}
				},
				error: (err) => {
					console.error('Toggle error:', err);
					this.showNotification('error', 'Error al conectar con el servidor');
				},
				complete: () => {
					this.hideLoading($btn);
				}
			});
		},

		// Send chat message
		sendChatMessage: function() {
			const message = this.$chatInput.val().trim();
			const orderId = this.$chatOverlay.data('order-id');

			if (!message || !orderId) {
				return;
			}

			const $sendBtn = this.$sendMessage;
			this.showLoading($sendBtn);

			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_send_chat_message',
					order_id: orderId,
					message: message,
					security: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success) {
						this.$chatInput.val('');
						this.appendChatMessage('sent', message);
					} else {
						this.showNotification('error', response.data?.message || 'Error al enviar mensaje');
					}
				},
				complete: () => {
					this.hideLoading($sendBtn);
				}
			});
		},

		// Append message to chat
		appendChatMessage: function(type, content) {
			const $messages = $('#tuki-chat-messages');
			const $msg = $('<div class="chat-msg ' + type + '">' + this.escapeHtml(content) + '</div>');
			$messages.append($msg);
			$messages.scrollTop($messages[0].scrollHeight);
		},

		// Close chat overlay
		closeChat: function() {
			this.$chatOverlay.removeClass('active');
		},

		// Open chat
		openChat: function(orderId, recipientName) {
			this.$chatOverlay.data('order-id', orderId);
			$('#chat-recipient-name').text(recipientName);
			this.$chatOverlay.addClass('active');
			this.loadChatMessages(orderId);
		},

		// Load chat messages via AJAX
		loadChatMessages: function(orderId) {
			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_get_chat_messages',
					order_id: orderId,
					security: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success) {
						const $messages = $('#tuki-chat-messages');
						$messages.empty();
						
						response.data.forEach((msg) => {
							const type = msg.is_sent ? 'sent' : 'received';
							this.appendChatMessage(type, msg.content);
						});
					}
				}
			});
		},

		// Auto-refresh orders
		startAutoRefresh: function() {
			setInterval(() => {
				this.refreshOrders();
			}, this.config.autoRefresh);
		},

		// Refresh orders list
		refreshOrders: function() {
			$.ajax({
				url: this.config.ajaxUrl,
				type: 'POST',
				data: {
					action: 'tukitask_get_driver_orders',
					security: this.config.nonce,
				},
				dataType: 'json',
				success: (response) => {
					if (response.success && response.data) {
						// Update order count or list
						// Implementation depends on your UI structure
					}
				}
			});
		},

		// Show loading state
		showLoading: function($btn) {
			$btn.prop('disabled', true);
			const originalText = $btn.html();
			$btn.data('original-text', originalText);
			$btn.html('<span class="tuki-loading"></span> ' + (window.tukitaskDriver?.strings?.saving || 'Cargando...'));
		},

		// Hide loading state
		hideLoading: function($btn) {
			$btn.prop('disabled', false);
			const originalText = $btn.data('original-text') || $btn.html();
			$btn.html(originalText);
		},

		// Show notification
		showNotification: function(type, message) {
			const colors = {
				success: '#10b981',
				error: '#ef4444',
				warning: '#f59e0b',
				info: '#4f46e5'
			};

			const color = colors[type] || colors.info;

			const $notification = $(`
				<div style="
					position: fixed;
					top: 20px;
					right: 20px;
					background: ${color};
					color: white;
					padding: 1rem 1.5rem;
					border-radius: 8px;
					box-shadow: 0 10px 25px rgba(0,0,0,0.2);
					z-index: 9999;
					max-width: 300px;
					animation: slideIn 0.3s ease;
				">
					${message}
				</div>
			`);

			$('body').append($notification);

			setTimeout(() => {
				$notification.fadeOut(300, function() {
					$(this).remove();
				});
			}, 4000);
		},

		// Escape HTML
		escapeHtml: function(text) {
			const map = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#039;'
			};
			return text.replace(/[&<>"']/g, (m) => map[m]);
		}
	};

	// Add slide-in animation
	$('head').append(`
		<style>
			@keyframes slideIn {
				from {
					transform: translateX(400px);
					opacity: 0;
				}
				to {
					transform: translateX(0);
					opacity: 1;
				}
			}
		</style>
	`);

	// Initialize on document ready
	$(document).ready(function() {
		DriverApp.init();
		
		// Expose globally for debugging
		window.DriverApp = DriverApp;
	});

})(jQuery);
