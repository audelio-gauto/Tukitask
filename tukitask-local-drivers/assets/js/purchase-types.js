/**
 * Purchase Types JavaScript
 * Maneja la selección de tipos de compra: Normal, Llega Hoy, Tienda Móvil
 */

(function($) {
    'use strict';

    /**
     * Purchase Types Manager
     */
    const PurchaseTypes = {
        userLocation: null,
        
        /**
         * Initialize
         */
        init: function() {
            this.getUserLocation();
            this.initPurchaseTypeSelectors();
            this.initMobileStoreSection();
        },

        /**
         * Get user's current location
         */
        getUserLocation: function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.userLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        // Trigger event for components waiting for location
                        $(document).trigger('tukitask:locationReady', [this.userLocation]);
                    },
                    (error) => {
                        console.log('Geolocation error:', error.message);
                        $(document).trigger('tukitask:locationError', [error]);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 300000 // 5 minutes cache
                    }
                );
            }
        },

        /**
         * Initialize purchase type selectors on product pages
         */
        initPurchaseTypeSelectors: function() {
            const selectors = $('.tuki-purchase-type-selector');
            
            if (selectors.length === 0) return;

            selectors.each(function() {
                const $selector = $(this);
                const productId = $selector.data('product-id');
                
                // Wait for location
                if (PurchaseTypes.userLocation) {
                    PurchaseTypes.loadPurchaseTypes($selector, productId);
                } else {
                    $(document).on('tukitask:locationReady', function(e, location) {
                        PurchaseTypes.loadPurchaseTypes($selector, productId);
                    });
                    
                    $(document).on('tukitask:locationError', function() {
                        // Still load without location (only normal available)
                        PurchaseTypes.loadPurchaseTypes($selector, productId);
                    });
                    
                    // Timeout fallback
                    setTimeout(function() {
                        if (!PurchaseTypes.userLocation) {
                            PurchaseTypes.loadPurchaseTypes($selector, productId);
                        }
                    }, 5000);
                }
            });
        },

        /**
         * Load available purchase types for a product
         */
        loadPurchaseTypes: function($selector, productId) {
            const $loading = $selector.find('.tuki-purchase-loading');
            const $options = $selector.find('.tuki-purchase-options');

            $.ajax({
                url: tukitaskPurchase.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_get_available_purchase_types',
                    product_id: productId,
                    lat: this.userLocation ? this.userLocation.lat : null,
                    lng: this.userLocation ? this.userLocation.lng : null
                },
                success: function(response) {
                    if (response.success && response.data.types) {
                        PurchaseTypes.renderPurchaseTypes($options, response.data.types, productId);
                        $loading.hide();
                        $options.show();
                    } else {
                        $loading.html('<p>' + tukitaskPurchase.strings.unavailable + '</p>');
                    }
                },
                error: function() {
                    $loading.html('<p>Error al cargar opciones.</p>');
                }
            });
        },

        /**
         * Render purchase type options
         */
        renderPurchaseTypes: function($container, types, productId) {
            $container.empty();

            Object.keys(types).forEach(function(key, index) {
                const type = types[key];
                const $option = $('<div class="tuki-purchase-option tuki-fade-in"></div>')
                    .attr('data-type', type.type)
                    .attr('data-product-id', productId)
                    .attr('data-driver-id', type.driver_id || 0);

                // First option selected by default
                if (index === 0) {
                    $option.addClass('selected');
                }

                const html = `
                    <div class="tuki-option-icon">${type.icon}</div>
                    <div class="tuki-option-content">
                        <div class="tuki-option-title">${type.label}</div>
                        <div class="tuki-option-description">${type.description}</div>
                        ${type.extra_cost && type.extra_cost > 0 ? 
                            `<div class="tuki-extra-cost">+$${type.extra_cost.toFixed(2)}</div>` : ''}
                    </div>
                    <div class="tuki-option-eta">${type.eta}</div>
                `;

                $option.html(html);
                $container.append($option);

                // Animation delay
                $option.css('animation-delay', (index * 0.1) + 's');
            });

            // Bind click events
            $container.find('.tuki-purchase-option').on('click', function() {
                PurchaseTypes.selectPurchaseType($(this));
            });

            // Auto-select first option
            const $firstOption = $container.find('.tuki-purchase-option').first();
            if ($firstOption.length) {
                PurchaseTypes.selectPurchaseType($firstOption, true);
            }
        },

        /**
         * Select a purchase type
         */
        selectPurchaseType: function($option, silent) {
            const $container = $option.closest('.tuki-purchase-options');
            $container.find('.tuki-purchase-option').removeClass('selected');
            $option.addClass('selected');

            const type = $option.data('type');
            const productId = $option.data('product-id');
            const driverId = $option.data('driver-id');

            // Save selection via AJAX
            $.ajax({
                url: tukitaskPurchase.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_set_purchase_type',
                    nonce: tukitaskPurchase.nonce,
                    type: type,
                    product_id: productId,
                    driver_id: driverId
                },
                success: function(response) {
                    if (!silent && response.success) {
                        PurchaseTypes.showNotification(response.data.message, 'success');
                    }
                }
            });

            // Trigger event for other components
            $(document).trigger('tukitask:purchaseTypeSelected', [{
                type: type,
                productId: productId,
                driverId: driverId
            }]);
        },

        /**
         * Initialize Mobile Store section
         */
        initMobileStoreSection: function() {
            const $section = $('.tuki-mobile-store-section');
            
            if ($section.length === 0) return;

            const maxDistance = $section.data('max-distance') || 5;

            // Wait for location
            $(document).on('tukitask:locationReady', function(e, location) {
                PurchaseTypes.loadMobileStoreProducts($section, location, maxDistance);
            });

            $(document).on('tukitask:locationError', function() {
                $section.find('.tuki-mobile-products-loading').hide();
                $section.find('.tuki-mobile-products-empty').show();
            });

            // If location already available
            if (this.userLocation) {
                this.loadMobileStoreProducts($section, this.userLocation, maxDistance);
            }
        },

        /**
         * Load mobile store products near user
         */
        loadMobileStoreProducts: function($section, location, maxDistance) {
            const $loading = $section.find('.tuki-mobile-products-loading');
            const $container = $section.find('.tuki-mobile-products-container');
            const $empty = $section.find('.tuki-mobile-products-empty');

            $.ajax({
                url: tukitaskPurchase.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'tukitask_get_mobile_store_products',
                    lat: location.lat,
                    lng: location.lng,
                    max_distance: maxDistance
                },
                success: function(response) {
                    $loading.hide();

                    if (response.success && response.data.products && response.data.products.length > 0) {
                        PurchaseTypes.renderMobileProducts($container.find('ul'), response.data.products);
                        $container.show();
                    } else {
                        $empty.show();
                    }
                },
                error: function() {
                    $loading.hide();
                    $empty.show();
                }
            });
        },

        /**
         * Render mobile store products
         */
        renderMobileProducts: function($list, products) {
            $list.empty();

            products.forEach(function(product, index) {
                const $item = $(`
                    <li class="product type-product tuki-fade-in" style="animation-delay: ${index * 0.05}s">
                        <a href="${product.url}" class="woocommerce-LoopProduct-link">
                            <img src="${product.image}" alt="${product.name}" class="wp-post-image">
                            <h2 class="woocommerce-loop-product__title">${product.name}</h2>
                            <span class="price">${product.price_html}</span>
                        </a>
                        <div class="tuki-mobile-product-info">
                            <span class="tuki-mobile-distance">
                                <i class="fas fa-map-marker-alt"></i>
                                ${product.distance.toFixed(1)} km
                            </span>
                            <span class="tuki-mobile-eta">
                                ~${product.eta_minutes} min
                            </span>
                        </div>
                        <a href="?add-to-cart=${product.id}&tuki_type=tienda_movil&tuki_driver=${product.driver_id}" 
                           class="button add_to_cart_button ajax_add_to_cart">
                            Agregar al carrito
                        </a>
                    </li>
                `);

                $list.append($item);
            });
        },

        /**
         * Show notification
         */
        showNotification: function(message, type) {
            const $notification = $(`
                <div class="tuki-notification ${type}">
                    ${message}
                </div>
            `);

            $('body').append($notification);

            setTimeout(function() {
                $notification.addClass('show');
            }, 10);

            setTimeout(function() {
                $notification.removeClass('show');
                setTimeout(function() {
                    $notification.remove();
                }, 300);
            }, 3000);
        }
    };

    /**
     * Checkout Integration
     */
    const CheckoutIntegration = {
        init: function() {
            this.displayPurchaseTypeInCheckout();
            this.updateOnChange();
        },

        /**
         * Display purchase type summary in checkout
         */
        displayPurchaseTypeInCheckout: function() {
            // This will be populated by WooCommerce hooks
            $(document.body).on('updated_checkout', function() {
                // Checkout updated, purchase type info should be visible via PHP
            });
        },

        /**
         * Update checkout when purchase type changes
         */
        updateOnChange: function() {
            $(document).on('tukitask:purchaseTypeSelected', function() {
                // Trigger checkout update
                if (typeof wc_checkout_params !== 'undefined') {
                    $(document.body).trigger('update_checkout');
                }
            });
        }
    };

    /**
     * Cart Integration
     */
    const CartIntegration = {
        init: function() {
            this.addPurchaseTypeBadges();
        },

        /**
         * Add purchase type badges to cart items
         */
        addPurchaseTypeBadges: function() {
            $('.woocommerce-cart-form .cart_item').each(function() {
                const $item = $(this);
                const $meta = $item.find('.variation');
                
                // Check for purchase type in item meta
                const typeMeta = $meta.find('[data-tuki-type]');
                if (typeMeta.length > 0) {
                    const type = typeMeta.data('tuki-type');
                    const label = typeMeta.data('tuki-label');
                    
                    const badgeClass = type === 'llega_hoy' ? 'llega-hoy' : 
                                       type === 'tienda_movil' ? 'tienda-movil' : '';
                    
                    if (badgeClass) {
                        $item.find('.product-name').append(
                            `<span class="tuki-cart-item-type ${badgeClass}">${label}</span>`
                        );
                    }
                }
            });
        }
    };

    /**
     * Product Badge Injector
     */
    const BadgeInjector = {
        init: function() {
            this.addBadgesToProductLoops();
        },

        /**
         * Add delivery type badges to product loops
         */
        addBadgesToProductLoops: function() {
            // Check each product for available delivery options
            $('.products .product').each(function() {
                const $product = $(this);
                const productId = $product.data('product-id') || 
                                  $product.find('[data-product-id]').data('product-id');
                
                if (!productId) return;

                // Check if badges are already present
                if ($product.find('.tuki-product-badges').length > 0) return;

                // Add badge container
                const $badgeContainer = $('<div class="tuki-product-badges"></div>');
                $product.find('.woocommerce-LoopProduct-link').prepend($badgeContainer);
            });
        }
    };

    /**
     * Initialize on document ready
     */
    $(document).ready(function() {
        PurchaseTypes.init();
        CheckoutIntegration.init();
        CartIntegration.init();
        BadgeInjector.init();
    });

    // Expose for external use
    window.TukitaskPurchaseTypes = PurchaseTypes;

})(jQuery);

/**
 * Notification Styles (injected dynamically)
 */
(function() {
    const style = document.createElement('style');
    style.textContent = `
        .tuki-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 15px 25px;
            background: #333;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            z-index: 10000;
        }
        .tuki-notification.show {
            opacity: 1;
            transform: translateY(0);
        }
        .tuki-notification.success {
            background: linear-gradient(135deg, #4caf50 0%, #8bc34a 100%);
        }
        .tuki-notification.error {
            background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
        }
    `;
    document.head.appendChild(style);
})();
