/**
 * TukiTask Advanced Filters
 * 
 * Dynamic filtering system for products with AJAX support.
 */

(function($) {
    'use strict';

    /**
     * Advanced Filters Controller
     */
    class TukiFilters {
        constructor() {
            this.filters = {};
            this.currentPage = 1;
            this.isLoading = false;
            this.debounceTimer = null;
            
            this.init();
        }

        init() {
            this.cacheElements();
            this.bindEvents();
            this.initRangeSliders();
            this.loadInitialProducts();
            this.getUserLocation();
        }

        cacheElements() {
            this.$wrapper = $('.tukitask-filters-wrapper');
            this.$filterBar = $('.tukitask-filter-bar');
            this.$productsContainer = $('.tukitask-products-container');
            this.$productsGrid = $('.tukitask-products-grid');
            this.$pagination = $('.tukitask-products-pagination');
            this.$activeFilters = $('.tukitask-active-filters');
            this.$activeFiltersTags = $('.active-filters-tags');
        }

        bindEvents() {
            // Filter section collapse
            $(document).on('click', '.filter-section-header', (e) => {
                const $section = $(e.currentTarget).closest('.tukitask-filter-section');
                if ($section.hasClass('collapsible')) {
                    $section.toggleClass('collapsed');
                }
            });

            // Llega Hoy toggle
            $(document).on('change', 'input[name="llega_hoy"]', (e) => {
                this.filters.llega_hoy = e.target.checked ? '1' : '';
                this.applyFilters();
            });

            // Distance range
            $(document).on('input', 'input[name="distance"]', (e) => {
                const value = e.target.value;
                $(e.target).closest('.tukitask-range-filter').find('.range-value').text(value + ' km');
                this.filters.distance = value;
                this.debouncedApply();
            });

            // Distance presets
            $(document).on('click', '.range-preset', (e) => {
                const value = $(e.currentTarget).data('value');
                const $range = $(e.currentTarget).closest('.tukitask-range-filter').find('input[type="range"]');
                $range.val(value).trigger('input');
            });

            // Price inputs
            $(document).on('input', 'input[name="price_min"], input[name="price_max"]', (e) => {
                this.filters.price_min = $('input[name="price_min"]').val();
                this.filters.price_max = $('input[name="price_max"]').val();
                this.debouncedApply();
            });

            // Price presets
            $(document).on('click', '.price-preset', (e) => {
                const $btn = $(e.currentTarget);
                const min = $btn.data('min');
                const max = $btn.data('max');
                
                $('input[name="price_min"]').val(min || '');
                $('input[name="price_max"]').val(max || '');
                
                this.filters.price_min = min || '';
                this.filters.price_max = max || '';
                this.applyFilters();
            });

            // Rating filter
            $(document).on('change', 'input[name="rating"]', (e) => {
                this.filters.rating = e.target.value;
                this.applyFilters();
            });

            // Delivery time
            $(document).on('change', 'input[name="delivery_time[]"]', () => {
                this.filters.delivery_time = [];
                $('input[name="delivery_time[]"]:checked').each((i, el) => {
                    this.filters.delivery_time.push(el.value);
                });
                this.applyFilters();
            });

            // Categories
            $(document).on('change', 'input[name="categories[]"]', () => {
                this.filters.categories = [];
                $('input[name="categories[]"]:checked').each((i, el) => {
                    this.filters.categories.push(el.value);
                });
                this.applyFilters();
            });

            // Vendors
            $(document).on('change', 'input[name="vendors[]"]', () => {
                this.filters.vendors = [];
                $('input[name="vendors[]"]:checked').each((i, el) => {
                    this.filters.vendors.push(el.value);
                });
                this.applyFilters();
            });

            // Additional filters
            $(document).on('change', 'input[name="in_stock"], input[name="on_sale"], input[name="free_shipping"]', () => {
                this.filters.in_stock = $('input[name="in_stock"]').is(':checked') ? '1' : '';
                this.filters.on_sale = $('input[name="on_sale"]').is(':checked') ? '1' : '';
                this.filters.free_shipping = $('input[name="free_shipping"]').is(':checked') ? '1' : '';
                this.applyFilters();
            });

            // Category search
            $(document).on('input', '.category-search input', (e) => {
                const query = e.target.value.toLowerCase();
                $('.category-option').each(function() {
                    const name = $(this).find('.option-name').text().toLowerCase();
                    $(this).toggle(name.includes(query));
                });
            });

            // Vendor search
            $(document).on('input', '.vendor-search input', (e) => {
                const query = e.target.value.toLowerCase();
                $('.vendor-option').each(function() {
                    const name = $(this).find('.option-name').text().toLowerCase();
                    $(this).toggle(name.includes(query));
                });
            });

            // Apply button
            $(document).on('click', '.tukitask-btn-apply', () => {
                this.applyFilters();
                this.closeMobileFilters();
            });

            // Clear buttons
            $(document).on('click', '.tukitask-btn-clear, .tukitask-filters-clear, .clear-all-filters', () => {
                this.clearAllFilters();
            });

            // Sort select
            $(document).on('change', '.tukitask-sort-select', (e) => {
                this.filters.orderby = e.target.value;
                this.applyFilters();
            });

            // Quick filters
            $(document).on('click', '.quick-filter', (e) => {
                const $btn = $(e.currentTarget);
                const filter = $btn.data('filter');
                const value = $btn.data('value');
                
                $btn.toggleClass('active');
                
                if ($btn.hasClass('active')) {
                    this.filters[filter] = value;
                } else {
                    delete this.filters[filter];
                }
                
                // Sync with sidebar checkbox if exists
                $(`input[name="${filter}"]`).prop('checked', $btn.hasClass('active'));
                
                this.applyFilters();
            });

            // View toggle
            $(document).on('click', '.view-btn', (e) => {
                const view = $(e.currentTarget).data('view');
                $('.view-btn').removeClass('active');
                $(e.currentTarget).addClass('active');
                this.$productsGrid.removeClass('view-grid view-list').addClass('view-' + view);
            });

            // Pagination
            $(document).on('click', '.pagination-btn', (e) => {
                const page = $(e.currentTarget).data('page');
                if (page && !$(e.currentTarget).hasClass('active')) {
                    this.currentPage = page;
                    this.loadProducts();
                    this.scrollToProducts();
                }
            });

            // Open mobile filters
            $(document).on('click', '.open-filters', () => {
                this.$wrapper.addClass('mobile-open');
                $('body').addClass('filters-open');
            });

            // Close mobile filters
            $(document).on('click', '.tukitask-filters-overlay, .close-mobile-filters', () => {
                this.closeMobileFilters();
            });

            // Remove active filter tag
            $(document).on('click', '.active-filter-tag .remove-tag', (e) => {
                const filter = $(e.currentTarget).closest('.active-filter-tag').data('filter');
                this.removeFilter(filter);
            });

            // Add to cart
            $(document).on('click', '.btn-add-to-cart', (e) => {
                e.preventDefault();
                const productId = $(e.currentTarget).data('product-id');
                this.addToCart(productId, $(e.currentTarget));
            });

            // Wishlist
            $(document).on('click', '.product-wishlist', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const productId = $(e.currentTarget).data('product-id');
                this.toggleWishlist(productId, $(e.currentTarget));
            });
        }

        initRangeSliders() {
            $('input[type="range"]').each(function() {
                const $input = $(this);
                const $filter = $input.closest('.tukitask-range-filter');
                const value = $input.val();
                $filter.find('.range-value').text(value + ' km');
            });
        }

        getUserLocation() {
            if (TukitaskFilters.user_lat && TukitaskFilters.user_lng) {
                this.filters.user_lat = TukitaskFilters.user_lat;
                this.filters.user_lng = TukitaskFilters.user_lng;
                return;
            }

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.filters.user_lat = position.coords.latitude;
                        this.filters.user_lng = position.coords.longitude;
                        
                        // Save to cookies
                        document.cookie = `tukitask_customer_lat=${this.filters.user_lat};path=/;max-age=86400`;
                        document.cookie = `tukitask_customer_lng=${this.filters.user_lng};path=/;max-age=86400`;
                    },
                    () => {
                        console.log('Geolocation not available');
                    }
                );
            }
        }

        debouncedApply() {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.applyFilters();
            }, 500);
        }

        applyFilters() {
            this.currentPage = 1;
            this.loadProducts();
            this.updateActiveFiltersTags();
            this.updateFilterCounts();
            this.updateURL();
        }

        loadInitialProducts() {
            // Parse URL params
            const params = new URLSearchParams(window.location.search);
            
            if (params.has('tuki_llega_hoy')) {
                this.filters.llega_hoy = '1';
                $('input[name="llega_hoy"]').prop('checked', true);
            }
            
            if (params.has('tuki_category')) {
                this.filters.categories = params.get('tuki_category').split(',');
            }
            
            this.loadProducts();
        }

        loadProducts() {
            if (this.isLoading) return;
            this.isLoading = true;

            this.showLoading();

            const data = {
                action: 'tukitask_filter_products',
                nonce: TukitaskFilters.nonce,
                page: this.currentPage,
                per_page: this.$productsContainer.data('per-page') || 12,
                ...this.filters
            };

            $.ajax({
                url: TukitaskFilters.ajax_url,
                type: 'POST',
                data: data,
                success: (response) => {
                    if (response.success) {
                        this.$productsGrid.html(response.data.html);
                        this.$pagination.html(response.data.pagination);
                        this.updateProductCount(response.data.total);
                    } else {
                        this.showError();
                    }
                },
                error: () => {
                    this.showError();
                },
                complete: () => {
                    this.isLoading = false;
                    this.hideLoading();
                }
            });
        }

        showLoading() {
            this.$productsGrid.addClass('loading');
            if (this.$productsGrid.find('.products-loading').length === 0) {
                this.$productsGrid.append(`
                    <div class="products-loading">
                        <div class="loading-spinner"></div>
                        <span>${TukitaskFilters.strings.loading}</span>
                    </div>
                `);
            }
        }

        hideLoading() {
            this.$productsGrid.removeClass('loading');
            this.$productsGrid.find('.products-loading').remove();
        }

        showError() {
            this.$productsGrid.html(`
                <div class="products-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p>${TukitaskFilters.strings.error}</p>
                </div>
            `);
        }

        updateProductCount(count) {
            $('.count-number').text(count);
        }

        updateActiveFiltersTags() {
            const tags = [];
            const filterLabels = {
                llega_hoy: '⚡ Llega Hoy',
                on_sale: '🏷️ En oferta',
                free_shipping: '🚚 Envío gratis',
                in_stock: '✓ En stock',
            };

            // Single value filters
            for (const [key, label] of Object.entries(filterLabels)) {
                if (this.filters[key] === '1') {
                    tags.push({ filter: key, label: label });
                }
            }

            // Distance
            if (this.filters.distance && this.filters.distance !== '10') {
                tags.push({ filter: 'distance', label: `📍 ${this.filters.distance} km` });
            }

            // Price range
            if (this.filters.price_min || this.filters.price_max) {
                let priceLabel = TukitaskFilters.currency;
                if (this.filters.price_min && this.filters.price_max) {
                    priceLabel += `${this.filters.price_min} - ${TukitaskFilters.currency}${this.filters.price_max}`;
                } else if (this.filters.price_min) {
                    priceLabel += `${this.filters.price_min}+`;
                } else {
                    priceLabel = `Hasta ${TukitaskFilters.currency}${this.filters.price_max}`;
                }
                tags.push({ filter: 'price', label: priceLabel });
            }

            // Rating
            if (this.filters.rating) {
                tags.push({ filter: 'rating', label: `⭐ ${this.filters.rating}+` });
            }

            // Categories
            if (this.filters.categories && this.filters.categories.length) {
                this.filters.categories.forEach(catId => {
                    const $cat = $(`input[name="categories[]"][value="${catId}"]`);
                    const name = $cat.closest('.category-option').find('.option-name').text();
                    tags.push({ filter: `category_${catId}`, label: name });
                });
            }

            // Vendors
            if (this.filters.vendors && this.filters.vendors.length) {
                this.filters.vendors.forEach(vendorId => {
                    const $vendor = $(`input[name="vendors[]"][value="${vendorId}"]`);
                    const name = $vendor.closest('.vendor-option').find('.option-name').text();
                    tags.push({ filter: `vendor_${vendorId}`, label: name });
                });
            }

            // Update UI
            if (tags.length > 0) {
                const tagsHtml = tags.map(tag => `
                    <span class="active-filter-tag" data-filter="${tag.filter}">
                        ${tag.label}
                        <button type="button" class="remove-tag">×</button>
                    </span>
                `).join('');
                
                this.$activeFiltersTags.html(tagsHtml);
                this.$activeFilters.show();
                $('.tukitask-filters-clear').show();
                $('.active-filters-count').text(tags.length).show();
            } else {
                this.$activeFilters.hide();
                $('.tukitask-filters-clear').hide();
                $('.active-filters-count').hide();
            }
        }

        removeFilter(filter) {
            // Handle specific filter types
            if (filter.startsWith('category_')) {
                const catId = filter.replace('category_', '');
                this.filters.categories = this.filters.categories.filter(id => id !== catId);
                $(`input[name="categories[]"][value="${catId}"]`).prop('checked', false);
            } else if (filter.startsWith('vendor_')) {
                const vendorId = filter.replace('vendor_', '');
                this.filters.vendors = this.filters.vendors.filter(id => id !== vendorId);
                $(`input[name="vendors[]"][value="${vendorId}"]`).prop('checked', false);
            } else if (filter === 'price') {
                delete this.filters.price_min;
                delete this.filters.price_max;
                $('input[name="price_min"], input[name="price_max"]').val('');
            } else if (filter === 'distance') {
                delete this.filters.distance;
                $('input[name="distance"]').val(10).trigger('input');
            } else if (filter === 'rating') {
                delete this.filters.rating;
                $('input[name="rating"]').prop('checked', false);
            } else {
                delete this.filters[filter];
                $(`input[name="${filter}"]`).prop('checked', false);
                $(`.quick-filter[data-filter="${filter}"]`).removeClass('active');
            }

            this.applyFilters();
        }

        clearAllFilters() {
            this.filters = {};
            
            // Reset all inputs
            this.$wrapper.find('input[type="checkbox"]').prop('checked', false);
            this.$wrapper.find('input[type="radio"]').prop('checked', false);
            this.$wrapper.find('input[type="number"]').val('');
            this.$wrapper.find('input[type="range"]').val(10).trigger('input');
            $('input[name="in_stock"]').prop('checked', true);
            
            // Reset quick filters
            $('.quick-filter').removeClass('active');
            
            // Reset sort
            $('.tukitask-sort-select').val('relevance');
            
            this.applyFilters();
        }

        updateFilterCounts() {
            $.ajax({
                url: TukitaskFilters.ajax_url,
                type: 'POST',
                data: {
                    action: 'tukitask_get_filter_counts',
                    nonce: TukitaskFilters.nonce
                },
                success: (response) => {
                    if (response.success) {
                        // Update rating counts
                        if (response.data.ratings) {
                            for (const [rating, count] of Object.entries(response.data.ratings)) {
                                $(`.rating-count[data-rating="${rating}"]`).text(count);
                            }
                        }
                    }
                }
            });
        }

        updateURL() {
            const params = new URLSearchParams();
            
            if (this.filters.llega_hoy === '1') {
                params.set('tuki_llega_hoy', '1');
            }
            if (this.filters.categories && this.filters.categories.length) {
                params.set('tuki_category', this.filters.categories.join(','));
            }
            if (this.filters.orderby && this.filters.orderby !== 'relevance') {
                params.set('tuki_sort', this.filters.orderby);
            }
            
            const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState({}, '', newURL);
        }

        closeMobileFilters() {
            this.$wrapper.removeClass('mobile-open');
            $('body').removeClass('filters-open');
        }

        scrollToProducts() {
            $('html, body').animate({
                scrollTop: this.$productsContainer.offset().top - 100
            }, 300);
        }

        addToCart(productId, $button) {
            const originalText = $button.html();
            $button.html('<span class="loading-spinner small"></span>');
            $button.prop('disabled', true);

            $.ajax({
                url: wc_add_to_cart_params?.ajax_url || TukitaskFilters.ajax_url,
                type: 'POST',
                data: {
                    action: 'woocommerce_ajax_add_to_cart',
                    product_id: productId,
                    quantity: 1
                },
                success: (response) => {
                    if (response.error) {
                        $button.html(originalText);
                    } else {
                        $button.html('✓ Agregado');
                        $(document.body).trigger('added_to_cart', [response.fragments, response.cart_hash]);
                        
                        setTimeout(() => {
                            $button.html(originalText);
                        }, 2000);
                    }
                },
                error: () => {
                    $button.html(originalText);
                },
                complete: () => {
                    $button.prop('disabled', false);
                }
            });
        }

        toggleWishlist(productId, $button) {
            $button.toggleClass('active');
            
            $.ajax({
                url: TukitaskFilters.ajax_url,
                type: 'POST',
                data: {
                    action: 'tukitask_toggle_favorite',
                    nonce: TukitaskFilters.nonce,
                    product_id: productId
                }
            });
        }
    }

    // Initialize when DOM is ready
    $(document).ready(() => {
        if ($('.tukitask-filters-wrapper').length || $('.tukitask-filter-bar').length) {
            window.TukiFiltersInstance = new TukiFilters();
        }
    });

})(jQuery);
