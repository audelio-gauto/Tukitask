
# Next.js 14 + Supabase + Vercel

Aplicación Next.js 14 con App Router, arquitectura serverless, preparada para Vercel. Usa Supabase como backend (autenticación y base de datos), estructura limpia y buenas prácticas.

## Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Copia la URL y la clave anónima (anon key) de tu proyecto.
3. Crea un archivo `.env.local` en la raíz del proyecto y agrega:

	```env
	NEXT_PUBLIC_SUPABASE_URL=tu-url-supabase
	NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
	```

## Autenticación

La ruta `/auth` permite iniciar sesión con email y contraseña usando Supabase Auth.

Puedes personalizar el flujo de autenticación en `src/app/auth.tsx`.

## Navegación de administración

El panel usa dos niveles: Operaciones, Personas, Marketplace, Finanzas y
Configuración, con Inicio como centro de acción. El menú es de sección → enlace;
las vistas relacionadas se agrupan con pestañas dentro de cada workspace
(vendedores, productos, catálogo, pedidos, negociaciones, reportes, billeteras,
IA). El buscador del menú y los indicadores de colas críticas siguen disponibles;
en pantallas pequeñas el menú se abre desde la cabecera. Las rutas anteriores
siguen accesibles y las páginas sin datos reales ya no figuran en el menú.

Las vistas de stock, productos reportados y detección de fraude no están
conectadas: no deben interpretarse como ausencia de alertas. Los reembolsos y
retiros de vendedores aún no están habilitados. La pantalla de registros y
estados de vendedores clasifica por antigüedad y bloqueo; no representa una
verificación de identidad. La configuración de proveedores/modelos de IA está
en Control AI; las claves se cargan en Claves API.

Las alertas de administración llegan a la campana del encabezado: cuando un
vendedor envía un producto para revisión o cuando se solicita una recarga de
billetera, el panel recibe una notificación prioritaria que abre la cola
correspondiente. Se agrupan por cola para no repetir avisos sin leer.

## Radio de recogida de drivers

El filtro de solicitudes permite elegir entre 1 y 50 km en línea recta desde la
ubicación del conductor hasta la recogida. El valor predeterminado para perfiles
sin rango guardado es 50 km; los valores existentes, incluso los de 10 km,
se conservan y cada conductor puede cambiarlos en «Filtrar solicitudes».
Para que el servidor coincida con la interfaz, aplicar la migración
`sql/migrations/122_driver_pickup_default_50km.sql` antes de desplegar el código.
Siguen aplicándose los filtros de vehículo, documentos, ubicación, disponibilidad
y saldo existentes.

Al solicitar un servicio, el cliente busca conductores con ubicación reciente
hasta 50 km de la recogida, muestra primero los más cercanos y respeta el radio
y el filtro de servicio guardados por cada conductor. La búsqueda es inmediata,
no una asignación ni una garantía de que el conductor acepte. Los tiempos
mostrados son estimaciones, y una ubicación reciente no confirma por sí sola el
estado de disponibilidad. El mapa de inicio conserva su radio de 8 km.

Al cambiar a desconectado, el driver deja de recibir sonidos de nuevas
solicitudes y el servidor lo excluye de la búsqueda y la bandeja. Los avisos de
viajes activos no se desactivan. El formulario del cliente intenta actualizarse
por tiempo real y también consulta cada cuatro segundos como respaldo. Si falla
la sincronización se informa al driver y puede reintentar; sin conexión al
servidor no se puede actualizar inmediatamente el estado para otros usuarios.
Aplicar `sql/migrations/123_driver_availability.sql` después de la migración 122
y antes de desplegar esta versión. Los estados existentes se inicializan como
disponibles por compatibilidad y se sincronizan al abrir el inicio del driver.

## Aplicación Android y retirada de la PWA

La APK usa la aplicación web en vivo configurada en `capacitor.config.ts`.
La instalación como PWA, su caché sin conexión y las notificaciones push web
fueron retiradas; las notificaciones nativas de Android conservan su
configuración existente. La aplicación sigue disponible en el navegador.

Mientras el conductor o el técnico está disponible y pasa a otra aplicación
(Google Maps, Waze, WhatsApp, etc.), la APK mantiene un servicio en primer plano
que consulta `/api/driver/background-requests` o
`/api/tecnico/background-requests` cada pocos segundos, renueva la última
ubicación conocida y muestra un aviso local con la solicitud. El aviso del
conductor dice «Nuevo viaje solicitado», «Nuevo envío solicitado» o «Nuevo
flete solicitado» según el pedido; el del técnico conserva «Nuevo servicio».
Dentro de la app, la solicitud del conductor aparece como popup (también al
volver de otra aplicación) y no se acumula en la campanita; la tarjeta
accionable sigue en la bandeja. La burbuja flotante lleva una insignia con la
cantidad de pedidos o servicios esperando.
Todo se detiene al desconectarse o cerrar sesión. En Android 13+ hace falta
aceptar el permiso de notificaciones; sin permiso la burbuja y la búsqueda
siguen funcionando, pero el aviso no se muestra. En Android 15 el servicio de
datos tiene un límite diario y se reinicia al volver a abrir la app. Este
comportamiento requiere recompilar e instalar la APK con los cambios nativos.

Durante la transición, las instalaciones web existentes reciben un aviso:
Android puede descargar `/app-update/TukiTask.apk`; en iPhone se indica que el
APK no es compatible y que se puede utilizar el navegador. Los workers antiguos
se desregistran y solo se eliminan cachés con prefijo `tuki-cache-` cuando el
dispositivo vuelve a conectarse. Las rutas `/sw.js`,
`/firebase-messaging-sw.js` y `/manifest.json`, así como los endpoints antiguos
de iconos (que devuelven 410), se conservan temporalmente para retirar
instalaciones anteriores; no debe eliminarse esta compatibilidad sin considerar
a los usuarios que aún no hayan regresado.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
