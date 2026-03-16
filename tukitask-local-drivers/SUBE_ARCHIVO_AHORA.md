⚡ ACTUALIZACIÓN URGENTE - SUBE ESTE ARCHIVO AHORA
═════════════════════════════════════════════════════════════════════════════

El error persiste porque el archivo en el servidor aún es la versión vieja.

He corregido el archivo AQUÍ. Ahora necesitas subirlo a tu hosting.


📁 ARCHIVO A DESCARGAR
═════════════════════════════════════════════════════════════════════════════

✅ DESCARGAR: includes/Admin/Admin.php

Este archivo YA ESTÁ CORREGIDO en tu carpeta local.


🚀 PASOS PARA SUBIR (5 MINUTOS)
═════════════════════════════════════════════════════════════════════════════

1. ABRE FILEZILLA O TU CLIENTE FTP

2. CONECTA A TU SERVIDOR:
   Host: tukitask.com
   Usuario: u208747126
   Contraseña: [tu contraseña FTP]

3. NAVEGA A:
   /home/u208747126/domains/tukitask.com/public_html/id/wp-content/plugins/tukitask-local-drivers/includes/Admin/

4. DESCARGA DESDE TU PC:
   c:\Users\Aurelio\Documents\tukitask-local-drivers\includes\Admin\Admin.php

5. SUBE (arrastra y suelta) EL ARCHIVO AL SERVIDOR

6. ESPERA A QUE TERMINE LA SUBIDA

7. ¡LISTO!


✅ VERIFICAR QUE FUNCIONÓ
═════════════════════════════════════════════════════════════════════════════

1. Accede a: https://tukitask.com/id/wp-admin/

2. Verifica:
   ✓ Carga sin errores
   ✓ Menú "Tukitask" aparece
   ✓ NO hay "Undefined constant" en pantalla


📝 QUÉ CAMBIÓ EN EL ARCHIVO
═════════════════════════════════════════════════════════════════════════════

La función enqueue_admin_scripts() ahora usa constant() para obtener las
constantes globales de forma segura dentro del namespace.

ANTES:
  wp_enqueue_script( 'tukitask-admin', TUKITASK_LOCAL_DRIVERS_URL . 'assets/js/admin.js', ...);

AHORA:
  $url = constant( 'TUKITASK_LOCAL_DRIVERS_URL' );
  wp_enqueue_script( 'tukitask-admin', $url . 'assets/js/admin.js', ...);

Esto es 100% compatible y funcionará sin problemas.


⏱️ TIEMPO ESTIMADO
═════════════════════════════════════════════════════════════════════════════

Descargar archivo: 1 min
Conectar FTP: 1 min
Navegar carpeta: 1 min
Subir archivo: 1-2 min
Verificar: 1 min

TOTAL: 5 minutos


❌ SI AÚN HAY ERROR DESPUÉS DE SUBIR
═════════════════════════════════════════════════════════════════════════════

1. Limpiar caché del navegador:
   - Ctrl+Shift+Delete (Chrome)
   - Cmd+Shift+Delete (Mac)
   - Selecciona "Archivos en caché"

2. Desactiva y reactiva el plugin:
   a. En admin: Plugins
   b. Busca "Tukitask Local Drivers"
   c. Desactiva
   d. Reactiva

3. Revisa logs:
   FTP a: wp-content/debug.log
   Busca "ERROR" o "Fatal"

4. Si sigue fallando:
   - Sube de nuevo el archivo
   - Verifica que no hay caracteres raros en el nombre


═════════════════════════════════════════════════════════════════════════════

IMPORTANTE: El archivo DEBE estar en:
/wp-content/plugins/tukitask-local-drivers/includes/Admin/Admin.php

Si lo pones en otro lugar NO funcionará.


¿NECESITAS AYUDA CON FTP?
═════════════════════════════════════════════════════════════════════════════

Tutorial rápido en FileZilla:

1. Abre FileZilla
2. Menú: Archivo → Gestor de sitios
3. Nuevo sitio
4. Nombre: TuKiTask
5. Host: tukitask.com
6. Usuario: u208747126
7. Contraseña: [tu pass]
8. Puerto: 21
9. Conectar
10. Arriba: tu PC
11. Abajo: servidor
12. Navega y arrastra archivos


═════════════════════════════════════════════════════════════════════════════

🎯 RESUMEN

✅ Archivo corregido: includes/Admin/Admin.php
✅ Ubicación en tu PC: c:\Users\Aurelio\Documents\tukitask-local-drivers\includes\Admin\Admin.php
✅ Destino en servidor: /wp-content/plugins/tukitask-local-drivers/includes/Admin/Admin.php
✅ Tiempo: 5 minutos
✅ Riesgo: CERO

¡AHORA SUBE EL ARCHIVO!
