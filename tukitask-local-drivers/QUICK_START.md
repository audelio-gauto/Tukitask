🚀 ACTUALIZAR PLUGIN EN PRODUCCIÓN - INSTRUCCIONES RÁPIDAS
═════════════════════════════════════════════════════════════════════════

TL;DR - RESUMEN RÁPIDO
───────────────────────────────────────────────────────────────────────────

1. Descarga estos 2 archivos de tu carpeta local:
   ├─ update_plugin.php
   └─ includes/Admin/Admin.php

2. Sube ambos a tu servidor vía FTP en:
   /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/

3. Ejecuta en SSH:
   php update_plugin.php

4. ¡Listo! ✅


═════════════════════════════════════════════════════════════════════════════

OPCIÓN AUTOMÁTICA (RECOMENDADA)
═════════════════════════════════════════════════════════════════════════════

El script update_plugin.php hace TODO automáticamente:
  ✓ Crea backup
  ✓ Actualiza archivos
  ✓ Verifica integridad
  ✓ Limpia caché

PASOS:

1. Sube update_plugin.php a:
   /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/

2. En SSH o cPanel Terminal:
   cd /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/
   php update_plugin.php

3. Espera a ver: ✅ ACTUALIZACIÓN COMPLETADA

4. Accede a: https://tukitask.com/id/wp-admin/

5. Verifica todo funciona


═════════════════════════════════════════════════════════════════════════════

OPCIÓN MANUAL (Si el script falla)
═════════════════════════════════════════════════════════════════════════════

1. BACKUP PRIMERO:
   • Descarga: includes/Admin/Admin.php
   • Guarda en tu PC como: Admin.php.backup

2. SUBIR ARCHIVO CORREGIDO:
   • Sube el nuevo: includes/Admin/Admin.php a la misma ubicación
   • Reemplaza el archivo existente

3. EN WORDPRESS:
   • Accede a: https://tukitask.com/id/wp-admin/
   • Ve a: Plugins
   • Desactiva y reactiva "Tukitask Local Drivers"

4. LISTO ✅


═════════════════════════════════════════════════════════════════════════════

ARCHIVOS A DESCARGAR DE AQUÍ
═════════════════════════════════════════════════════════════════════════════

Estos archivos ya están corregidos en tu carpeta local:

📁 includes/Admin/Admin.php
   └─ Este es el archivo que necesitas subir

📁 update_plugin.php
   └─ Script de actualización automática

📁 INSTRUCCIONES_PRODUCCION.md
   └─ Instrucciones detalladas (si necesitas más ayuda)

📁 verify_plugin.php
   └─ Para verificar que todo está bien


═════════════════════════════════════════════════════════════════════════════

¿CÓMO SUBIR ARCHIVOS?
═════════════════════════════════════════════════════════════════════════════

OPCIÓN A: FileZilla (FTP)
──────────────
1. Abre FileZilla
2. Conecta a: tukitask.com
   Usuario: u208747126
   Contraseña: [tu pass FTP]

3. Navega a:
   /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/

4. Arrastra y suelta los archivos desde tu PC


OPCIÓN B: cPanel File Manager
──────────────
1. Accede a: cPanel
2. Abre: File Manager
3. Navega a: public_html → id → wp-content → plugins → tukitask-local-drivers
4. Sube archivos: Upload
5. Selecciona los archivos de tu PC


OPCIÓN C: SSH Terminal
──────────────
1. En terminal de tu PC (o cPanel terminal):
   
   scp update_plugin.php usuario@tukitask.com:/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/
   
   scp -r includes/Admin/Admin.php usuario@tukitask.com:/home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/includes/Admin/


═════════════════════════════════════════════════════════════════════════════

VERIFICAR QUE FUNCIONÓ
═════════════════════════════════════════════════════════════════════════════

1. Accede a: https://tukitask.com/id/wp-admin/

2. Verifica:
   ✓ No hay errores en pantalla
   ✓ Menú "Tukitask" aparece en sidebar
   ✓ Puedes entrar a Tukitask → Dashboard

3. Prueba funcionalidades:
   ✓ Crea una solicitud de payout
   ✓ Filtra solicitudes
   ✓ Todo funciona sin errores


═════════════════════════════════════════════════════════════════════════════

❌ SI ALGO FALLA
═════════════════════════════════════════════════════════════════════════════

1. El script dejó el backup en: backups-[fecha-hora]/

2. Restaura manualmente:
   • Descarga el archivo de backup
   • Súbelo reemplazando el actual

3. O revisa el log:
   • FTP a: wp-content/debug.log
   • Busca errores


═════════════════════════════════════════════════════════════════════════════

🎯 RESUMEN DE LO QUE VA A PASAR
═════════════════════════════════════════════════════════════════════════════

ANTES:
  ❌ Error: "Class not found"
  ❌ Plugin no funciona en admin
  ❌ Menú Tukitask no aparece

DESPUÉS:
  ✅ Plugin carga correctamente
  ✅ Menú Tukitask aparece
  ✅ Todas las funcionalidades funcionan
  ✅ Sin errores en logs


═════════════════════════════════════════════════════════════════════════════

¿PREGUNTAS?
═════════════════════════════════════════════════════════════════════════════

Lee: INSTRUCCIONES_PRODUCCION.md (más detallado)

O ejecuta: php verify_plugin.php
(para diagnosticar problemas)


═════════════════════════════════════════════════════════════════════════════

LISTO PARA EMPEZAR?

1. Descarga update_plugin.php
2. Descarga includes/Admin/Admin.php  
3. Sube a tu servidor
4. Ejecuta: php update_plugin.php
5. ¡Disfruta tu plugin funcionando! 🎉
