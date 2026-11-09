
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

El panel agrupa las herramientas en Personas, Operaciones, Marketplace, Finanzas,
Calidad y control, Estadísticas y Configuración. El buscador del menú encuentra
opciones dentro de cada grupo; en pantallas pequeñas el menú se abre desde la
cabecera. Las rutas anteriores siguen disponibles.

Las vistas de stock y productos reportados se identifican como no conectadas:
no deben interpretarse como ausencia de alertas. Los retiros de vendedores aún
no están habilitados. La pantalla de registros y estados de vendedores clasifica
por antigüedad y bloqueo; no representa una verificación de identidad.

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

## Aplicación Android y retirada de la PWA

La APK usa la aplicación web en vivo configurada en `capacitor.config.ts`.
La instalación como PWA, su caché sin conexión y las notificaciones push web
fueron retiradas; las notificaciones nativas de Android conservan su
configuración existente. La aplicación sigue disponible en el navegador.

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
