╔════════════════════════════════════════════════════════════════════════════╗
║                    INSTRUCCIONES PARA ACTUALIZAR EN PRODUCCIÓN             ║
║                           TUKITASK LOCAL DRIVERS                            ║
╚════════════════════════════════════════════════════════════════════════════╝


🚀 OPCIÓN 1: USANDO EL SCRIPT AUTOMÁTICO (RECOMENDADO)
═══════════════════════════════════════════════════════════════════════════

PASO 1: Subir el script
───────────────────────────────────────────────────────────────────────────

1. En tu computadora local:
   • Abre: update_plugin.php (está en la carpeta del plugin)

2. Súbelo a tu servidor vía FTP/SFTP:
   • Destino: /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/
   • Nombre: update_plugin.php

   Puedes usar FileZilla o tu cliente FTP favorito


PASO 2: Ejecutar el script en servidor
───────────────────────────────────────────────────────────────────────────

OPCIÓN A: Vía SSH (si tienes acceso)
   1. Conecta por SSH a tu servidor:
      ssh usuario@tukitask.com

   2. Navega a la carpeta:
      cd /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/

   3. Ejecuta el script:
      php update_plugin.php

   4. Verifica que dice: ✅ ACTUALIZACIÓN COMPLETADA


OPCIÓN B: Vía cPanel File Manager
   1. Accede a cPanel
   2. Abre: File Manager
   3. Navega a: public_html → id → wp-content → plugins → tukitask-local-drivers
   4. Haz clic derecho en: update_plugin.php
   5. Selecciona: Run Script
   6. Verifica el resultado


PASO 3: Verificar actualización
───────────────────────────────────────────────────────────────────────────

1. Accede a: https://tukitask.com/id/wp-admin/

2. Verifica:
   ✓ El menú "Tukitask" aparece en el sidebar
   ✓ No hay errores en la página
   ✓ Las funcionalidades de payout funcionan

3. Revisa logs (opcional):
   • Accede vía FTP a: wp-content/debug.log
   • Busca errores recientes


╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                    OPCIÓN 2: ACTUALIZACIÓN MANUAL                         ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝


Si el script no funciona o prefieres hacerlo manualmente:

PASO 1: Hacer backup
───────────────────────────────────────────────────────────────────────────

1. Accede por FTP/SFTP:
   • Host: tukitask.com
   • Usuario: u208747126
   • Contraseña: [tu contraseña FTP]

2. Navega a:
   /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/

3. Descarga:
   includes/Admin/Admin.php
   (Guarda en tu computadora como: Admin.php.backup)


PASO 2: Actualizar el archivo
───────────────────────────────────────────────────────────────────────────

1. Abre en VS Code (o editor de texto):
   • Tu copia local: wp-content/plugins/tukitask-local-drivers/includes/Admin/Admin.php

2. Reemplaza TODO el contenido con:
   • El contenido del archivo: includes/Admin/Admin.php
     (que está en la carpeta del proyecto)

3. Verifica que contenga:
   ✓ <?php en línea 1
   ✓ namespace Tukitask\LocalDrivers\Admin; en línea 8
   ✓ class Admin { en línea 17

4. Sube el archivo actualizado vía FTP:
   • Destino: wp-content/plugins/tukitask-local-drivers/includes/Admin/Admin.php


PASO 3: Verificar en WordPress
───────────────────────────────────────────────────────────────────────────

1. Accede a: https://tukitask.com/id/wp-admin/

2. Ve a: Plugins

3. Busca "Tukitask Local Drivers"

4. Si está desactivado:
   a. Haz clic en: Activar
   b. Espera a que cargue

5. Verifica que no hay errores


═══════════════════════════════════════════════════════════════════════════════

⚠️  IMPORTANTE: Si algo falla
═════════════════════════════════════════════════════════════════════════════

1. Restaurar desde backup:
   • Sube el archivo Admin.php.backup que guardaste
   • Renómbralo a: Admin.php
   • Limpia caché del navegador
   • Recarga WordPress

2. Revisar logs:
   • Accede por FTP a: wp-content/debug.log
   • Busca líneas con "ERROR" o "Fatal"
   • Copia el error y envía para soporte


═══════════════════════════════════════════════════════════════════════════════

✅ Checklist de verificación post-actualización
═════════════════════════════════════════════════════════════════════════════

☐ Accediste a wp-admin sin errores
☐ Menú "Tukitask" aparece en sidebar
☐ Página de Tukitask carga sin errores
☐ Ningún error en: wp-content/debug.log
☐ Funcionalidades de payout funcionan
☐ Plugin está activo
☐ No hay corrupción de caracteres en admin


═══════════════════════════════════════════════════════════════════════════════

📞 Soporte rápido
═════════════════════════════════════════════════════════════════════════════

Si necesitas verificar que todo está bien, ejecuta en SSH:

  cd /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/
  php verify_plugin.php

Esto verificará que todas las clases se cargan correctamente.


═══════════════════════════════════════════════════════════════════════════════

¿Listo? Empieza por la OPCIÓN 1 (script automático)

Es la más fácil y rápida. ¡Suerte! 🚀
