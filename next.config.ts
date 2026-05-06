import type { NextConfig } from "next";

// Content Security Policy — covers all external services used by the app:
//   Supabase (REST + Realtime WebSocket), Firebase FCM, Mapbox GL,
//   OpenStreetMap tiles, CartoCDN tiles.
// Notes:
//   - 'unsafe-inline' on script-src: required by Next.js App Router hydration
//   - 'unsafe-eval' on script-src: required by Mapbox GL worker threads
//   - blob: on worker-src/child-src: required by Mapbox GL web workers
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://unpkg.com",
  "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://fcm.googleapis.com https://*.googleapis.com https://nominatim.openstreetmap.org",
  "font-src 'self' data:",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  // Enforce HTTPS for 1 year on all subdomains (no preload — allows future domain migration)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // X-Frame-Options kept for older browsers; CSP frame-ancestors covers modern ones
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return [
      // Combined service worker (PWA caching + FCM notifications)
      { source: '/sw.js', destination: '/api/sw' },
      // Legacy FCM-only SW — kept for any existing registrations
      { source: '/firebase-messaging-sw.js', destination: '/api/firebase-sw' },
      // Dynamic manifest — reads custom PWA icons from app_config
      { source: '/manifest.json', destination: '/api/manifest' },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // API routes: no caching + Vary so CDN doesn't cache CORS responses
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Vary', value: 'Origin' },
        ],
      },
      {
        // Combined service worker — controls full origin scope
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-store, no-cache' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // Legacy FCM SW
        source: '/firebase-messaging-sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // Icons are immutable — aggressive caching
        source: '/icons/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
