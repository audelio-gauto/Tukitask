/**
 * TukiTask Interactive Map
 * 
 * Real-time map visualization with stores, drivers, and products.
 * Uses Leaflet.js with MarkerCluster for optimal performance.
 */

(function($) {
    'use strict';

    // Map instances storage
    const TukitaskMaps = {};

    /**
     * Main Map Class
     */
    class TukiMap {
        constructor(containerId) {
            this.containerId = containerId;
            this.container = document.getElementById(containerId);
            this.wrapper = this.container.closest('.tukitask-map-wrapper');
            this.map = null;
            this.userMarker = null;
            this.userLocation = null;
            this.markers = {
                stores: [],
                drivers: [],
                products: []
            };
            this.clusterGroups = {};
            this.activeFilters = ['stores', 'drivers'];
            this.searchTimeout = null;
            this.refreshInterval = null;
            this.isFullscreen = false;
            
            this.config = {
                showStores: this.container.dataset.showStores === 'yes',
                showDrivers: this.container.dataset.showDrivers === 'yes',
                showProducts: this.container.dataset.showProducts === 'yes',
                radius: parseInt(this.container.dataset.radius) || 10,
                autoLocate: this.container.dataset.autoLocate === 'yes',
                mapStyle: this.container.dataset.style || 'default'
            };
            
            this.init();
        }

        /**
         * Initialize the map
         */
        init() {
            this.createMap();
            this.createClusterGroups();
            this.bindEvents();
            
            if (this.config.autoLocate) {
                this.locateUser();
            } else {
                this.loadMarkers();
            }
            
            // Start auto-refresh for real-time updates
            this.startAutoRefresh();
            
            // Hide loading
            this.hideLoading();
        }

        /**
         * Create Leaflet map instance
         */
        createMap() {
            const defaultLat = TukitaskMap.default_lat || 19.4326;
            const defaultLng = TukitaskMap.default_lng || -99.1332;
            const defaultZoom = TukitaskMap.default_zoom || 13;

            this.map = L.map(this.containerId, {
                center: [defaultLat, defaultLng],
                zoom: defaultZoom,
                zoomControl: false, // We'll use custom controls
                attributionControl: true
            });

            // Add tile layer based on style
            this.addTileLayer();
            
            // Add scale control
            L.control.scale({ imperial: false }).addTo(this.map);
        }

        /**
         * Add tile layer based on map style
         */
        addTileLayer() {
            const tiles = {
                default: {
                    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                },
                dark: {
                    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
                },
                satellite: {
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
                }
            };

            const style = tiles[this.config.mapStyle] || tiles.default;
            L.tileLayer(style.url, {
                attribution: style.attribution,
                maxZoom: 19
            }).addTo(this.map);
        }

        /**
         * Create marker cluster groups
         */
        createClusterGroups() {
            const clusterOptions = {
                maxClusterRadius: TukitaskMap.cluster_radius || 80,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                animate: true
            };

            this.clusterGroups = {
                stores: L.markerClusterGroup({
                    ...clusterOptions,
                    iconCreateFunction: (cluster) => this.createClusterIcon(cluster, 'store')
                }),
                drivers: L.markerClusterGroup({
                    ...clusterOptions,
                    iconCreateFunction: (cluster) => this.createClusterIcon(cluster, 'driver')
                }),
                products: L.markerClusterGroup({
                    ...clusterOptions,
                    iconCreateFunction: (cluster) => this.createClusterIcon(cluster, 'product')
                })
            };

            // Add to map
            Object.values(this.clusterGroups).forEach(group => {
                this.map.addLayer(group);
            });
        }

        /**
         * Create custom cluster icon
         */
        createClusterIcon(cluster, type) {
            const count = cluster.getChildCount();
            const colors = {
                store: '#10b981',
                driver: '#3b82f6',
                product: '#8b5cf6'
            };
            
            return L.divIcon({
                html: `<div class="tukitask-cluster-icon" style="background-color: ${colors[type]}">
                         <span>${count}</span>
                       </div>`,
                className: 'tukitask-cluster',
                iconSize: L.point(40, 40)
            });
        }

        /**
         * Bind event listeners
         */
        bindEvents() {
            // Filter chips
            $(this.wrapper).on('click', '.tukitask-filter-chip', (e) => {
                this.handleFilterClick(e);
            });

            // Radius select
            $(this.wrapper).on('change', '.tukitask-radius-select', (e) => {
                this.config.radius = parseInt(e.target.value);
                this.loadMarkers();
            });

            // Search input
            $(this.wrapper).on('input', '.tukitask-map-search-input', (e) => {
                this.handleSearch(e.target.value);
            });

            // Clear search
            $(this.wrapper).on('click', '.tukitask-search-clear', () => {
                $(this.wrapper).find('.tukitask-map-search-input').val('');
                $(this.wrapper).find('.tukitask-search-results').empty().hide();
                $(this.wrapper).find('.tukitask-search-clear').hide();
            });

            // Search result click
            $(this.wrapper).on('click', '.tukitask-search-result', (e) => {
                this.handleSearchResultClick(e);
            });

            // Map controls
            $(this.wrapper).on('click', '.tukitask-locate-btn', () => this.locateUser());
            $(this.wrapper).on('click', '.tukitask-zoom-in', () => this.map.zoomIn());
            $(this.wrapper).on('click', '.tukitask-zoom-out', () => this.map.zoomOut());
            $(this.wrapper).on('click', '.tukitask-fullscreen-btn', () => this.toggleFullscreen());

            // Panel close
            $(this.wrapper).on('click', '.tukitask-panel-close', () => {
                $(this.wrapper).find('.tukitask-map-panel').removeClass('active');
            });

            // Click outside search results to close
            $(document).on('click', (e) => {
                if (!$(e.target).closest('.tukitask-map-search').length) {
                    $(this.wrapper).find('.tukitask-search-results').hide();
                }
            });
        }

        /**
         * Handle filter chip click
         */
        handleFilterClick(e) {
            const $chip = $(e.currentTarget);
            const filter = $chip.data('filter');

            if (filter === 'llega-hoy') {
                $chip.toggleClass('active');
                this.loadMarkers();
                return;
            }

            $chip.toggleClass('active');
            
            if ($chip.hasClass('active')) {
                if (!this.activeFilters.includes(filter)) {
                    this.activeFilters.push(filter);
                }
                this.map.addLayer(this.clusterGroups[filter]);
            } else {
                this.activeFilters = this.activeFilters.filter(f => f !== filter);
                this.map.removeLayer(this.clusterGroups[filter]);
            }
        }

        /**
         * Geolocate user
         */
        locateUser() {
            if (!navigator.geolocation) {
                console.warn('Geolocation not supported');
                this.loadMarkers();
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    // Save to cookies for server-side use
                    document.cookie = `tukitask_customer_lat=${this.userLocation.lat};path=/;max-age=86400`;
                    document.cookie = `tukitask_customer_lng=${this.userLocation.lng};path=/;max-age=86400`;

                    // Center map on user
                    this.map.setView([this.userLocation.lat, this.userLocation.lng], 14);

                    // Add/update user marker
                    this.addUserMarker();

                    // Load markers with user location
                    this.loadMarkers();
                },
                (error) => {
                    console.warn('Geolocation error:', error);
                    this.loadMarkers();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes
                }
            );
        }

        /**
         * Add user location marker
         */
        addUserMarker() {
            if (!this.userLocation) return;

            if (this.userMarker) {
                this.userMarker.setLatLng([this.userLocation.lat, this.userLocation.lng]);
                return;
            }

            const userIcon = L.divIcon({
                html: `<div class="tukitask-user-marker">
                         <div class="tukitask-user-pulse"></div>
                         <div class="tukitask-user-dot"></div>
                       </div>`,
                className: 'tukitask-user-icon',
                iconSize: L.point(24, 24),
                iconAnchor: L.point(12, 12)
            });

            this.userMarker = L.marker([this.userLocation.lat, this.userLocation.lng], {
                icon: userIcon,
                zIndexOffset: 1000
            }).addTo(this.map);

            this.userMarker.bindPopup(`<strong>${TukitaskMap.strings.your_location}</strong>`);
        }

        /**
         * Load markers from server
         */
        loadMarkers() {
            const llegaHoyOnly = $(this.wrapper).find('.tukitask-filter-chip[data-filter="llega-hoy"]').hasClass('active');

            $.ajax({
                url: TukitaskMap.ajax_url,
                type: 'POST',
                data: {
                    action: 'tukitask_get_map_markers',
                    nonce: TukitaskMap.nonce,
                    lat: this.userLocation?.lat || null,
                    lng: this.userLocation?.lng || null,
                    radius: this.config.radius,
                    types: this.activeFilters,
                    llega_hoy: llegaHoyOnly
                },
                success: (response) => {
                    if (response.success) {
                        this.updateMarkers(response.data.markers);
                        this.updateCounts(response.data.counts);
                    }
                },
                error: (xhr, status, error) => {
                    console.error('Error loading markers:', error);
                }
            });
        }

        /**
         * Update markers on map
         */
        updateMarkers(markersData) {
            // Clear existing markers
            Object.values(this.clusterGroups).forEach(group => group.clearLayers());
            this.markers = { stores: [], drivers: [], products: [] };

            // Add stores
            if (markersData.stores && this.config.showStores) {
                markersData.stores.forEach(store => {
                    const marker = this.createMarker(store, 'store');
                    this.clusterGroups.stores.addLayer(marker);
                    this.markers.stores.push(marker);
                });
            }

            // Add drivers
            if (markersData.drivers && this.config.showDrivers) {
                markersData.drivers.forEach(driver => {
                    const marker = this.createMarker(driver, 'driver');
                    this.clusterGroups.drivers.addLayer(marker);
                    this.markers.drivers.push(marker);
                });
            }

            // Add products
            if (markersData.products && this.config.showProducts) {
                markersData.products.forEach(product => {
                    const marker = this.createMarker(product, 'product');
                    this.clusterGroups.products.addLayer(marker);
                    this.markers.products.push(marker);
                });
            }
        }

        /**
         * Create individual marker
         */
        createMarker(data, type) {
            const icon = this.createMarkerIcon(data, type);
            
            const marker = L.marker([data.lat, data.lng], {
                icon: icon,
                data: data
            });

            // Bind popup
            marker.bindPopup(() => this.createPopupContent(data, type), {
                maxWidth: 280,
                className: 'tukitask-popup'
            });

            // Click handler for panel
            marker.on('click', () => {
                this.showMarkerPanel(data, type);
            });

            return marker;
        }

        /**
         * Create marker icon
         */
        createMarkerIcon(data, type) {
            let iconHtml = '';
            let iconClass = `tukitask-marker tukitask-marker-${type}`;
            
            if (data.has_llega_hoy) {
                iconClass += ' has-llega-hoy';
            }

            switch (type) {
                case 'store':
                    const statusClass = data.is_open ? 'open' : 'closed';
                    iconHtml = `
                        <div class="${iconClass}">
                            <div class="marker-content">
                                ${data.logo ? `<img src="${data.logo}" alt="">` : 
                                  `<svg viewBox="0 0 24 24" fill="currentColor">
                                     <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                   </svg>`}
                            </div>
                            <span class="marker-status ${statusClass}"></span>
                            ${data.has_llega_hoy ? '<span class="marker-badge">⚡</span>' : ''}
                        </div>`;
                    break;

                case 'driver':
                    const availClass = data.is_available ? 'available' : 'busy';
                    const vehicleIcon = this.getVehicleIcon(data.vehicle);
                    iconHtml = `
                        <div class="${iconClass} ${availClass}">
                            <div class="marker-content">
                                ${data.photo ? `<img src="${data.photo}" alt="">` : vehicleIcon}
                            </div>
                            <span class="marker-status ${availClass}"></span>
                        </div>`;
                    break;

                case 'product':
                    iconHtml = `
                        <div class="${iconClass}">
                            <div class="marker-content">
                                <img src="${data.image}" alt="">
                            </div>
                            ${data.has_llega_hoy ? '<span class="marker-badge">⚡</span>' : ''}
                        </div>`;
                    break;
            }

            return L.divIcon({
                html: iconHtml,
                className: 'tukitask-marker-wrapper',
                iconSize: L.point(44, 52),
                iconAnchor: L.point(22, 52),
                popupAnchor: L.point(0, -52)
            });
        }

        /**
         * Get vehicle icon SVG
         */
        getVehicleIcon(vehicle) {
            const icons = {
                moto: `<svg viewBox="0 0 24 24" fill="currentColor">
                         <path d="M19 10h-2V7h-2l-3 5v4h3v3h2v-3h2v-6zm-6 3v-1.5l1.5-2.5h.5v4h-2z"/>
                         <circle cx="5" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>
                       </svg>`,
                car: `<svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                      </svg>`,
                bike: `<svg viewBox="0 0 24 24" fill="currentColor">
                         <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
                       </svg>`,
                walk: `<svg viewBox="0 0 24 24" fill="currentColor">
                         <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                       </svg>`
            };
            return icons[vehicle] || icons.moto;
        }

        /**
         * Create popup content
         */
        createPopupContent(data, type) {
            const distance = data.distance !== null 
                ? `<span class="popup-distance">${data.distance.toFixed(1)} ${TukitaskMap.strings.km_away}</span>` 
                : '';

            switch (type) {
                case 'store':
                    return `
                        <div class="tukitask-popup-content store">
                            ${data.logo ? `<img src="${data.logo}" class="popup-logo" alt="">` : ''}
                            <h4>${data.name}</h4>
                            ${distance}
                            <div class="popup-meta">
                                ${data.rating ? `<span class="popup-rating">⭐ ${data.rating.toFixed(1)}</span>` : ''}
                                <span class="popup-products">${data.product_count} productos</span>
                            </div>
                            ${data.has_llega_hoy ? `<span class="popup-badge llega-hoy">⚡ ${TukitaskMap.strings.arrives_today}</span>` : ''}
                            <a href="${data.url}" class="popup-link">${TukitaskMap.strings.view_store} →</a>
                        </div>`;

                case 'driver':
                    const statusText = data.is_available ? TukitaskMap.strings.available : TukitaskMap.strings.busy;
                    const statusClass = data.is_available ? 'available' : 'busy';
                    return `
                        <div class="tukitask-popup-content driver">
                            ${data.photo ? `<img src="${data.photo}" class="popup-photo" alt="">` : ''}
                            <h4>${data.name}</h4>
                            ${distance}
                            <div class="popup-meta">
                                <span class="popup-status ${statusClass}">${statusText}</span>
                                ${data.rating ? `<span class="popup-rating">⭐ ${data.rating.toFixed(1)}</span>` : ''}
                            </div>
                            <span class="popup-vehicle">${data.vehicle}</span>
                        </div>`;

                case 'product':
                    return `
                        <div class="tukitask-popup-content product">
                            <img src="${data.image}" class="popup-image" alt="">
                            <h4>${data.name}</h4>
                            <span class="popup-price">${data.price}</span>
                            ${distance}
                            ${data.has_llega_hoy ? `<span class="popup-badge llega-hoy">⚡ ${TukitaskMap.strings.arrives_today}</span>` : ''}
                            <a href="${data.url}" class="popup-link">${TukitaskMap.strings.view_products} →</a>
                        </div>`;
            }
        }

        /**
         * Show marker details in side panel
         */
        showMarkerPanel(data, type) {
            const $panel = $(this.wrapper).find('.tukitask-map-panel');
            const $content = $panel.find('.tukitask-panel-content');
            
            // Show loading
            $content.html('<div class="tukitask-panel-loading"><div class="tukitask-map-spinner"></div></div>');
            $panel.addClass('active');

            // Fetch full details
            $.ajax({
                url: TukitaskMap.ajax_url,
                type: 'POST',
                data: {
                    action: 'tukitask_get_marker_details',
                    nonce: TukitaskMap.nonce,
                    type: type,
                    id: data.id
                },
                success: (response) => {
                    if (response.success) {
                        $content.html(this.renderPanelContent(response.data, type));
                    } else {
                        $content.html('<p class="error">Error al cargar detalles</p>');
                    }
                },
                error: () => {
                    $content.html('<p class="error">Error de conexión</p>');
                }
            });
        }

        /**
         * Render panel content
         */
        renderPanelContent(data, type) {
            switch (type) {
                case 'store':
                    return this.renderStorePanel(data);
                case 'driver':
                    return this.renderDriverPanel(data);
                case 'product':
                    return this.renderProductPanel(data);
            }
        }

        /**
         * Render store panel
         */
        renderStorePanel(data) {
            const productsHtml = data.products.map(p => `
                <a href="${p.url}" class="panel-product">
                    <img src="${p.image}" alt="">
                    <div class="panel-product-info">
                        <span class="panel-product-name">${p.name}</span>
                        <span class="panel-product-price">${p.price}</span>
                    </div>
                </a>
            `).join('');

            return `
                <div class="tukitask-panel-store">
                    ${data.banner ? `<div class="panel-banner" style="background-image: url(${data.banner})"></div>` : ''}
                    <div class="panel-header">
                        <img src="${data.logo}" class="panel-logo" alt="">
                        <div class="panel-title">
                            <h3>${data.name}</h3>
                            ${data.rating ? `<div class="panel-rating">⭐ ${data.rating.toFixed(1)}</div>` : ''}
                        </div>
                    </div>
                    
                    <div class="panel-badges">
                        ${data.has_llega_hoy ? '<span class="badge llega-hoy">⚡ Llega Hoy</span>' : ''}
                        ${data.is_open ? '<span class="badge open">Abierto</span>' : '<span class="badge closed">Cerrado</span>'}
                    </div>
                    
                    ${data.description ? `<p class="panel-description">${data.description}</p>` : ''}
                    
                    <div class="panel-stats">
                        <div class="stat">
                            <span class="stat-value">${data.product_count}</span>
                            <span class="stat-label">Productos</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${data.rating?.toFixed(1) || '-'}</span>
                            <span class="stat-label">Rating</span>
                        </div>
                    </div>
                    
                    ${productsHtml ? `
                        <div class="panel-products">
                            <h4>Productos destacados</h4>
                            <div class="panel-products-grid">${productsHtml}</div>
                        </div>
                    ` : ''}
                    
                    <a href="${data.url}" class="panel-btn primary">Ver Tienda</a>
                    ${data.phone ? `<a href="tel:${data.phone}" class="panel-btn secondary">Llamar</a>` : ''}
                </div>
            `;
        }

        /**
         * Render driver panel
         */
        renderDriverPanel(data) {
            const statusText = data.is_available ? 'Disponible' : 'Ocupado';
            const statusClass = data.is_available ? 'available' : 'busy';
            
            return `
                <div class="tukitask-panel-driver">
                    <div class="panel-header centered">
                        <img src="${data.photo}" class="panel-photo" alt="">
                        <h3>${data.name}</h3>
                        <span class="panel-status ${statusClass}">${statusText}</span>
                    </div>
                    
                    <div class="panel-stats">
                        <div class="stat">
                            <span class="stat-value">${data.rating?.toFixed(1) || '-'}</span>
                            <span class="stat-label">Rating</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${data.completed_orders}</span>
                            <span class="stat-label">Entregas</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">${data.vehicle}</span>
                            <span class="stat-label">Vehículo</span>
                        </div>
                    </div>
                </div>
            `;
        }

        /**
         * Render product panel
         */
        renderProductPanel(data) {
            return `
                <div class="tukitask-panel-product">
                    <img src="${data.image}" class="panel-main-image" alt="">
                    
                    ${data.gallery?.length ? `
                        <div class="panel-gallery">
                            ${data.gallery.map(img => `<img src="${img}" alt="">`).join('')}
                        </div>
                    ` : ''}
                    
                    <h3>${data.name}</h3>
                    <div class="panel-price">${data.price}</div>
                    
                    ${data.has_llega_hoy ? '<span class="badge llega-hoy">⚡ Llega Hoy</span>' : ''}
                    ${data.in_stock ? '<span class="badge in-stock">En Stock</span>' : '<span class="badge out-stock">Agotado</span>'}
                    
                    ${data.description ? `<p class="panel-description">${data.description}</p>` : ''}
                    
                    <div class="panel-vendor">
                        <span>Vendido por:</span>
                        <strong>${data.vendor.name}</strong>
                    </div>
                    
                    <a href="${data.url}" class="panel-btn primary">Ver Producto</a>
                </div>
            `;
        }

        /**
         * Update filter counts
         */
        updateCounts(counts) {
            $(this.wrapper).find('[data-count="stores"]').text(counts.stores || 0);
            $(this.wrapper).find('[data-count="drivers"]').text(counts.drivers || 0);
            $(this.wrapper).find('[data-count="products"]').text(counts.products || 0);
        }

        /**
         * Handle search input
         */
        handleSearch(query) {
            clearTimeout(this.searchTimeout);
            
            const $clearBtn = $(this.wrapper).find('.tukitask-search-clear');
            const $results = $(this.wrapper).find('.tukitask-search-results');
            
            if (query.length < 2) {
                $clearBtn.hide();
                $results.empty().hide();
                return;
            }
            
            $clearBtn.show();
            
            this.searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        }

        /**
         * Perform search
         */
        performSearch(query) {
            const $results = $(this.wrapper).find('.tukitask-search-results');
            
            $results.html('<div class="search-loading">Buscando...</div>').show();

            $.ajax({
                url: TukitaskMap.ajax_url,
                type: 'POST',
                data: {
                    action: 'tukitask_search_map',
                    nonce: TukitaskMap.nonce,
                    query: query,
                    lat: this.userLocation?.lat,
                    lng: this.userLocation?.lng
                },
                success: (response) => {
                    if (response.success && response.data.results.length > 0) {
                        this.renderSearchResults(response.data.results);
                    } else {
                        $results.html(`<div class="search-no-results">${TukitaskMap.strings.no_results}</div>`);
                    }
                },
                error: () => {
                    $results.html('<div class="search-error">Error en la búsqueda</div>');
                }
            });
        }

        /**
         * Render search results
         */
        renderSearchResults(results) {
            const $results = $(this.wrapper).find('.tukitask-search-results');
            
            const html = results.map(result => {
                const icon = result.type === 'store' 
                    ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/></svg>';
                
                const distance = result.distance !== null 
                    ? `<span class="result-distance">${result.distance.toFixed(1)} km</span>` 
                    : '';

                return `
                    <div class="tukitask-search-result" 
                         data-lat="${result.lat}" 
                         data-lng="${result.lng}"
                         data-type="${result.type}"
                         data-id="${result.id}">
                        <span class="result-icon ${result.type}">${icon}</span>
                        <div class="result-info">
                            <span class="result-name">${result.name}</span>
                            ${result.price ? `<span class="result-price">${result.price}</span>` : ''}
                        </div>
                        ${distance}
                    </div>
                `;
            }).join('');

            $results.html(html);
        }

        /**
         * Handle search result click
         */
        handleSearchResultClick(e) {
            const $result = $(e.currentTarget);
            const lat = parseFloat($result.data('lat'));
            const lng = parseFloat($result.data('lng'));
            
            // Center map and zoom
            this.map.setView([lat, lng], 16);
            
            // Hide search results
            $(this.wrapper).find('.tukitask-search-results').hide();
            
            // Find and open marker popup
            const type = $result.data('type');
            const id = $result.data('id');
            
            const markersArray = this.markers[type + 's'] || [];
            const marker = markersArray.find(m => m.options.data && m.options.data.id === id);
            
            if (marker) {
                marker.openPopup();
            }
        }

        /**
         * Toggle fullscreen mode
         */
        toggleFullscreen() {
            const $wrapper = $(this.wrapper);
            
            if (this.isFullscreen) {
                $wrapper.removeClass('fullscreen');
                document.body.style.overflow = '';
            } else {
                $wrapper.addClass('fullscreen');
                document.body.style.overflow = 'hidden';
            }
            
            this.isFullscreen = !this.isFullscreen;
            
            // Invalidate map size after animation
            setTimeout(() => {
                this.map.invalidateSize();
            }, 300);
        }

        /**
         * Start auto-refresh for real-time updates
         */
        startAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            const interval = TukitaskMap.refresh_interval || 30000;
            
            this.refreshInterval = setInterval(() => {
                if (this.config.showDrivers) {
                    this.loadMarkers(); // Refresh to get updated driver positions
                }
            }, interval);
        }

        /**
         * Hide loading indicator
         */
        hideLoading() {
            $(this.container).find('.tukitask-map-loading').fadeOut();
        }

        /**
         * Destroy map instance
         */
        destroy() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            if (this.map) {
                this.map.remove();
            }
        }
    }

    /**
     * Initialize maps on page load
     */
    function initMaps() {
        $('.tukitask-map-container').each(function() {
            const mapId = this.id;
            if (mapId && !TukitaskMaps[mapId]) {
                TukitaskMaps[mapId] = new TukiMap(mapId);
            }
        });
    }

    // Initialize when DOM is ready
    $(document).ready(initMaps);

    // Re-initialize on AJAX content load
    $(document).on('ajaxComplete', function() {
        setTimeout(initMaps, 100);
    });

    // Expose for external use
    window.TukitaskMaps = TukitaskMaps;
    window.TukiMap = TukiMap;

})(jQuery);
