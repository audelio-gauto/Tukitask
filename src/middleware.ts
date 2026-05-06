import { NextRequest, NextResponse } from 'next/server';

// Allowed origins: web/PWA, future custom domain, Capacitor Android/iOS WebView, local dev
const ALLOWED_ORIGINS = [
  'https://tukitask.vercel.app',
  'https://tukitask.com',
  'https://www.tukitask.com',
  'capacitor://localhost',    // Android Capacitor APK WebView
  'https://localhost',        // iOS Capacitor WebView
  'http://localhost:3000',    // local development
  'http://localhost:3001',
];

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, apikey, x-client-info',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // Preflight OPTIONS — respond immediately
  if (request.method === 'OPTIONS') {
    if (isAllowed) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
    }
    return new NextResponse(null, { status: 403 });
  }

  // For actual requests from allowed origins, attach CORS headers to the response
  const response = NextResponse.next();
  if (isAllowed) {
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  return response;
}

// Only apply to API routes
export const config = {
  matcher: '/api/:path*',
};
