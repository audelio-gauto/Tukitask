import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
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
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
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
