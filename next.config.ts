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
      // Serve the FCM service worker from a dynamic route so env vars can be injected
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
        // Allow SW to control the full origin scope
        source: '/firebase-messaging-sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
