/**
 * Admin JavaScript for Tukitask Local Drivers Pro
 */

(function ($) {
    'use strict';

    $(document).ready(function () {
        // Admin dashboard functionality
        initAdminDashboard();
    });

    /**
     * Initialize admin dashboard.
     */
    function initAdminDashboard() {
        // Auto-refresh statistics every 30 seconds
        if ($('.tukitask-dashboard').length) {
            setInterval(function () {
                // Optionally refresh stats via AJAX
            }, 30000);
        }
    }

})(jQuery);
