
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
