/**
 * TukiTask Favorites System
 * Handles favorite/wishlist functionality
 */
(function($) {
    'use strict';
    
    // Initialize on document ready
    $(document).ready(function() {
        initFavorites();
        createToastContainer();
    });
    
    /**
     * Initialize favorites functionality
     */
    function initFavorites() {
        // Mark existing favorites
        if (tukiFavorites.favorites && tukiFavorites.favorites.length > 0) {
            tukiFavorites.favorites.forEach(function(productId) {
                $('.tuki-favorite-btn[data-product-id="' + productId + '"]').addClass('is-favorite');
            });
        }
        
        // Bind click events
        $(document).on('click', '.tuki-favorite-btn', handleFavoriteClick);
    }
    
    /**
     * Handle favorite button click
     */
    function handleFavoriteClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        var $btn = $(this);
        var productId = $btn.data('product-id');
        
        // Check if logged in
        if (!tukiFavorites.isLoggedIn) {
            showToast(tukiFavorites.i18n.loginRequired, 'error');
            setTimeout(function() {
                window.location.href = tukiFavorites.loginUrl;
            }, 1500);
            return;
        }
        
        // Disable button temporarily
        $btn.prop('disabled', true);
        
        // Add loading animation
        $btn.css('opacity', '0.7');
        
        // Send AJAX request
        $.ajax({
            url: tukiFavorites.ajaxUrl,
            type: 'POST',
            data: {
                action: 'tukitask_toggle_favorite',
                nonce: tukiFavorites.nonce,
                product_id: productId
            },
            success: function(response) {
                if (response.success) {
                    // Update button state
                    if (response.data.action === 'added') {
                        $btn.addClass('is-favorite');
                        showToast(tukiFavorites.i18n.addedToFavorites, 'success');
                    } else {
                        $btn.removeClass('is-favorite');
                        showToast(tukiFavorites.i18n.removedFromFavorites, 'info');
                    }
                    
                    // Update local favorites array
                    tukiFavorites.favorites = response.data.favorites;
                    
                    // Update any favorite count displays
                    updateFavoriteCount(response.data.count);
                    
                    // Trigger custom event
                    $(document).trigger('tukitask:favoriteChanged', {
                        productId: productId,
                        action: response.data.action,
                        count: response.data.count
                    });
                } else {
                    showToast(response.data.message || 'Error', 'error');
                    
                    if (response.data.login_required) {
                        setTimeout(function() {
                            window.location.href = tukiFavorites.loginUrl;
                        }, 1500);
                    }
                }
            },
            error: function() {
                showToast('Error de conexión', 'error');
            },
            complete: function() {
                $btn.prop('disabled', false);
                $btn.css('opacity', '1');
            }
        });
    }
    
    /**
     * Create toast notification container
     */
    function createToastContainer() {
        if ($('#tuki-toast-container').length === 0) {
            $('body').append('<div id="tuki-toast-container"></div>');
        }
    }
    
    /**
     * Show toast notification
     */
    function showToast(message, type) {
        type = type || 'info';
        
        var $toast = $('<div class="tuki-toast ' + type + '">' + 
            '<span class="tuki-toast-icon">' + getToastIcon(type) + '</span>' +
            '<span class="tuki-toast-message">' + message + '</span>' +
            '</div>');
        
        $('body').append($toast);
        
        // Trigger animation
        setTimeout(function() {
            $toast.addClass('show');
        }, 10);
        
        // Remove after delay
        setTimeout(function() {
            $toast.removeClass('show');
            setTimeout(function() {
                $toast.remove();
            }, 300);
        }, 3000);
    }
    
    /**
     * Get icon for toast type
     */
    function getToastIcon(type) {
        switch (type) {
            case 'success': return '❤️';
            case 'error': return '⚠️';
            case 'info': return '💔';
            default: return 'ℹ️';
        }
    }
    
    /**
     * Update favorite count displays
     */
    function updateFavoriteCount(count) {
        $('.tuki-favorites-count').text(count);
        
        // Update header badge if exists
        if (count > 0) {
            $('.tuki-favorites-badge').text(count).show();
        } else {
            $('.tuki-favorites-badge').hide();
        }
    }
    
    // Expose to global scope
    window.TukiFavorites = {
        toggle: function(productId) {
            $('.tuki-favorite-btn[data-product-id="' + productId + '"]').trigger('click');
        },
        isFavorite: function(productId) {
            return tukiFavorites.favorites.indexOf(parseInt(productId)) !== -1;
        },
        getCount: function() {
            return tukiFavorites.favorites.length;
        }
    };
    
})(jQuery);
