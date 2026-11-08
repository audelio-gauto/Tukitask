# Seguimiento GPS de conductor y cliente

El conductor comparte la ubicación desde el GPS web y, en Android, desde el
observador nativo existente. Se aceptan coordenadas válidas y lecturas recientes
en orden de captura; el evento Realtime incluye, cuando están disponibles,
precisión, velocidad y rumbo. Los receptores siguen aceptando eventos antiguos
que solo contienen latitud y longitud.

El cliente prioriza los eventos recientes frente al respaldo consultado por API.
El respaldo conserva el contrato y la tabla existentes: `updated_at` indica la
hora de escritura del servidor, no la hora exacta de captura. Para evitar
renovar una posición sin señal, el conductor no guarda lecturas con más de
30 segundos. Si la ubicación deja de actualizarse, la pantalla muestra un
aviso; una señal GPS detenida o limitada en segundo plano también puede
provocar ese aviso.

El rumbo GPS se usa cuando hay velocidad y precisión suficientes. En otros
casos se estima a partir del desplazamiento o se conserva el último rumbo.
El mapa sigue usando Leaflet; la cámara no gira. Al arrastrar se suspende el
seguimiento y el botón de centrado lo reactiva. Las rutas fallidas se muestran
como aproximaciones, no como indicaciones viales confirmadas.

Las comprobaciones de hora dependen del reloj de cada dispositivo. La
persistencia todavía no almacena la hora de captura ni los metadatos GPS, por
lo que no puede garantizarse el orden perfecto entre todos los dispositivos y
el respaldo. El canal Broadcast y las políticas RLS desplegadas requieren una
auditoría independiente antes de afirmar que solo los participantes
autorizados pueden acceder a la ubicación. No se modificaron esas políticas.

Antes de desplegar, ejecutar las pruebas locales y comprobar con dos cuentas y
dispositivos autorizados: movimiento y giros, detención, pérdida de señal,
recogida y viaje, segundo plano, reconexión y fallback. También verificar el
seguimiento del técnico, los mapas existentes y los demás paneles.
