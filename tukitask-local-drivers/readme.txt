=== Tukitask Local Drivers Pro ===
Contributors: tukitask
Tags: woocommerce, shipping, delivery, drivers, logistics
Requires at least: 5.8
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sistema profesional de asignación automática de conductores locales, envíos WooCommerce por distancia y tienda móvil en movimiento.

== Description ==

Tukitask Local Drivers Pro es un plugin comercial de WordPress que transforma tu tienda WooCommerce en un sistema de entregas profesional con asignación inteligente de conductores.

= Características Principales =

* **Gestión de Conductores**: Custom Post Type completo para administrar conductores con perfiles detallados
* **Auto-Asignación Inteligente**: Sistema de scoring multi-factor basado en distancia, disponibilidad, experiencia y capacidad
* **Método de Envío WooCommerce**: Cálculo dinámico de precios basado en distancia real
* **Panel de Conductor**: Dashboard frontend completo con shortcodes para gestión de pedidos
* **Tracking en Tiempo Real**: Sistema de seguimiento con eventos de entrega
* **REST API Completa**: Endpoints para integración con apps móviles
* **Tienda Móvil**: Conductores pueden activar tienda durante viajes con prioridad geográfica
* **Compatible con HPOS**: Totalmente compatible con High-Performance Order Storage de WooCommerce
* **Geolocalización**: Integración con Mapbox API para geocodificación automática

= Casos de Uso =

* Tiendas locales con entregas a domicilio
* Marketplaces multi-vendor con logística propia
* Servicios de delivery tipo Uber Eats
* Flotas de reparto con múltiples conductores

= Requisitos =

* WordPress 5.8 o superior
* WooCommerce 5.0 o superior
* PHP 7.4 o superior
* Mapbox API Key (for geolocation and distance calculations)

== Installation ==

1. Sube el plugin a `/wp-content/plugins/tukitask-local-drivers/`
2. Activa el plugin desde el menú 'Plugins' en WordPress
3. Ve a WooCommerce > Tukitask Drivers para configurar
4. Configura tu Mapbox API Key en Configuración Tukitask
5. Crea tus primeros conductores desde el menú Drivers
6. Configura el método de envío en WooCommerce > Ajustes > Envío

== Frequently Asked Questions ==

= ¿Necesito WooCommerce instalado? =

Sí, este plugin requiere WooCommerce activo para funcionar.

= ¿Cómo funciona la auto-asignación? =

El sistema calcula un score para cada conductor disponible basado en:
- Distancia al punto de recogida (40%)
- Pedidos activos (30%)
- Experiencia/entregas completadas (20%)
- Última actualización de ubicación (10%)

= ¿Puedo asignar conductores manualmente? =

Sí, en la página de edición de pedido hay un meta box para asignación manual.

= ¿Es compatible con HPOS? =

Sí, el plugin declara compatibilidad total con High-Performance Order Storage.

== Changelog ==

= 1.0.0 =
* Lanzamiento inicial
* Sistema completo de gestión de conductores
* Auto-asignación inteligente
* Método de envío WooCommerce
* Panel de conductor frontend
* REST API completa
* Funcionalidad de tienda móvil
* Compatible con HPOS

== Upgrade Notice ==

= 1.0.0 =
Lanzamiento inicial del plugin.

== Screenshots ==

1. Dashboard principal con estadísticas de conductores
2. Perfil de conductor con metadatos completos
3. Panel de conductor frontend
4. Configuración del plugin
5. Método de envío en checkout

== Additional Info ==

Para soporte y documentación completa, visita https://tukitask.com

== Privacy Policy ==

Este plugin almacena:
- Información de conductores (nombre, vehículo, teléfono, ubicación)
- Metadatos de pedidos (conductor asignado, estado de entrega)
- Historial de ubicaciones (últimas 10 posiciones)

No se comparte información con terceros excepto Mapbox API para geocodificación.
