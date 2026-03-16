# INSTRUCCIONES DE ACTUALIZACIÓN - Panel de Driver Mejorado

## 📋 Archivos para Subir a Hosting

### NUEVOS ARCHIVOS (CREAR):

1. **assets/css/driver-app.css**
   - Ubicación: `/wp-content/plugins/tukitask-local-drivers/assets/css/driver-app.css`
   - Descripción: CSS nuevo, responsivo 100%, mobile-first
   - Tamaño: ~25 KB

2. **assets/js/driver-app.js**
   - Ubicación: `/wp-content/plugins/tukitask-local-drivers/assets/js/driver-app.js`
   - Descripción: JavaScript para interactividad del panel
   - Tamaño: ~18 KB

### ARCHIVOS A ACTUALIZAR:

3. **includes/Frontend/Driver_Dashboard.php**
   - Ubicación: `/wp-content/plugins/tukitask-local-drivers/includes/Frontend/Driver_Dashboard.php`
   - Cambio: Actualizado enqueue_assets() para incluir nuevos CSS/JS
   - Método de Update: Por línea (línea 322-382)

## 🚀 Pasos para Subir

### Opción 1: FileZilla (Recomendado)

1. Abre FileZilla
2. Conéctate con:
   - Host: `tukitask.com`
   - Usuario: `u208747126@tukitask.com`
   - Contraseña: (tu contraseña de FTP)
   - Puerto: 21

3. Navega a: `/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/`

4. **Crea carpeta si no existe**: `assets/css/` y `assets/js/`

5. Sube estos archivos:
   - `assets/css/driver-app.css` (NUEVO)
   - `assets/js/driver-app.js` (NUEVO)
   - `includes/Frontend/Driver_Dashboard.php` (ACTUALIZADO)

### Opción 2: cPanel File Manager

1. Accede a cPanel: https://panel.tukitask.com (o tu panel)
2. File Manager → public_html/id/wp-content/plugins/tukitask-local-drivers/
3. Sube los 3 archivos

### Opción 3: WP-CLI (Terminal)

```bash
cd /home/u208747126/domains/tukitask.com/public_html/id

# Sube driver-app.css
scp -r ~/Documents/tukitask-local-drivers/assets/css/driver-app.css \
    u208747126@tukitask.com:/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/assets/css/

# Sube driver-app.js
scp -r ~/Documents/tukitask-local-drivers/assets/js/driver-app.js \
    u208747126@tukitask.com:/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/assets/js/

# Actualiza Driver_Dashboard.php
scp -r ~/Documents/tukitask-local-drivers/includes/Frontend/Driver_Dashboard.php \
    u208747126@tukitask.com:/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/includes/Frontend/
```

## ✅ Verificación Post-Instalación

Después de subir, verifica:

1. **Panel de Driver**:
   - Accede a: `https://tukitask.com/id/panel-conductor/`
   - Verifica que los estilos se carguen (azul moderno, responsive)
   - Prueba en móvil (F12 → Toggle Device Toolbar)

2. **Menú Responsivo**:
   - En móvil: Debe haber hamburguesa (☰) en top-left
   - Haz click: Abre menú lateral
   - Click en overlay: Cierra menú

3. **Botones Aceptar/Rechazar**:
   - En pantalla de "Pedidos Asignados"
   - Deberías ver botones verdes (Aceptar) y rojos (Rechazar)
   - Haz click: Debe pedir confirmación
   - Verifica que funciona sin errores en console (F12)

4. **Chat**:
   - En cada pedido debe haber botón de chat
   - Click: Abre modal de chat flotante
   - Envía mensaje: Debe aparecer en lado derecho en azul

5. **Console (F12)**:
   - No debe haber errores rojos
   - Debe haber log: "DriverApp initialized" (si lo agregamos)

## 🔧 Troubleshooting

### Problema: CSS no se carga (página se ve sin estilos)
**Solución**:
1. Verifica que `driver-app.css` esté en `/assets/css/`
2. Limpia caché del navegador (Ctrl+Shift+Del)
3. En WordPress: Ir a Settings → Tukitask → Cache → Clear Cache
4. En cPanel: Limpiar caché de proxy (si existe)

### Problema: JavaScript no funciona (botones no responden)
**Solución**:
1. Verifica que `driver-app.js` esté en `/assets/js/`
2. Abre DevTools (F12) → Console
3. Verifica si hay errores de JavaScript
4. Verifica que jQuery esté cargado: `console.log(jQuery)`
5. Verifica que `tukitaskDriver` exista: `console.log(window.tukitaskDriver)`

### Problema: Menú no se ve en móvil
**Solución**:
1. Asegúrate que FontAwesome esté cargado
2. Verifica viewport meta tag en `<head>`
3. En DevTools: Abre responsive mode y cambia tamaño

### Problema: AJAX no funciona
**Solución**:
1. Verifica `tukitask_accept_order` y `tukitask_reject_order` hooks existan en `Driver_Dashboard.php`
2. Verifica nonce: `wp_create_nonce('tukitask_driver_action')`
3. Abre Network tab en DevTools y observa la llamada AJAX
4. Verifica que respuesta tenga `success: true`

## 📊 Características Implementadas

✅ **Diseño App-Like**: Interfaz moderna como aplicación nativa
✅ **100% Responsivo**: Mobile (320px), Tablet (768px), Desktop (1024px+)
✅ **Menú Responsive**: Drawer en móvil, sidebar en desktop
✅ **Botones Aceptar/Rechazar**: Con confirmación y feedback
✅ **Chat Mejorado**: Modal flotante, responsivo, AJAX
✅ **Notificaciones**: Sistema visual de éxito/error
✅ **Auto-refresh**: Actualiza pedidos automáticamente
✅ **Animaciones**: Transiciones suaves
✅ **Accesibilidad**: Contrast ratios adecuados, navegación por teclado

## 📱 Testing en Móvil

Para probar en tu teléfono:

1. Reemplaza `localhost` con tu URL: `https://tukitask.com/id/panel-conductor/`
2. Accede desde navegador móvil
3. Prueba:
   - Menú (☰)
   - Aceptar/Rechazar pedido
   - Chat
   - Responsive en landscape

## 🆘 Soporte

Si hay problemas después de instalar:

1. Verifica con inspector de elementos (F12)
2. Busca errores en console
3. Revisa que todos 3 archivos estén en el lugar correcto
4. Intenta con otro navegador
5. Contacta soporte técnico con screenshot del error

---

**Última actualización**: 29 de Enero, 2026
**Versión**: 1.0.0
**Compatibilidad**: WordPress 5.8+, WooCommerce 5.0+, PHP 7.4+
