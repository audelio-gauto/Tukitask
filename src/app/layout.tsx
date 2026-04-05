import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InstallPrompt } from "@/components/InstallPrompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TukiTask",
    template: "%s | TukiTask",
  },
  description: "Plataforma de envíos y servicios técnicos en tiempo real",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TukiTask",
    startupImage: [
      // iPhone 15 Pro Max
      { url: "/icons/icon-512x512.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
      // Generic fallback
      { url: "/icons/icon-512x512.png" },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png",  sizes: "32x32",  type: "image/png" },
      { url: "/icons/icon-96x96.png",  sizes: "96x96",  type: "image/png" },
      { url: "/icons/icon-192x192.png",sizes: "192x192",type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180x180.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
    ],
    shortcut: "/icons/icon-192x192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#0f0f1a",
    "msapplication-TileImage": "/icons/icon-144x144.png",
    "msapplication-config": "none",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#0f0f1a" },
    { media: "(prefers-color-scheme: light)", color: "#F5C518" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Preconnect to key origins for perf */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
