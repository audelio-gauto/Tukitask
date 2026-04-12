/**
 * Server-side auth utilities for API routes.
 * Usage:
 *   const user = await getAuthUser(req);
 *   if (!user) return unauthorized();
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ADMIN_ROLES } from './constants';

export interface AuthUser {
  id: string;
  email: string;
}

/** Service-role Supabase client (server only, never exposed to browser). */
// Module-level singleton — avoids creating a new DB connection on every request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sbAdmin: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sbAdmin(): any {
  if (_sbAdmin) return _sbAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server env vars');
  _sbAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sbAdmin;
}

/**
 * Extract and validate the Bearer token from the Authorization header.
 * Returns the authenticated user or null if unauthenticated / token invalid.
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const auth = (req.headers.get('authorization') || '').trim();
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!token) return null;
  try {
    const { data: { user }, error } = await sbAdmin().auth.getUser(token);
    if (error) {
      console.error('[getAuthUser] auth.getUser error:', error.message);
      // A-4: Reset singleton if the client has gone stale (e.g. worker recycled)
      if (error.message?.includes('Invalid API key') || error.message?.includes('connection')) {
        _sbAdmin = null;
      }
      return null;
    }
    if (!user?.email) return null;
    return { id: user.id, email: user.email.toLowerCase() };
  } catch (err) {
    console.error('[getAuthUser] unexpected error:', err);
    return null;
  }
}

/**
 * Like getAuthUser but also verifies the user has an admin role in the users table.
 */
export async function getAuthAdmin(req: Request): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) return null;
  try {
    const { data } = await sbAdmin()
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = (data as unknown as { role?: string } | null)?.role ?? '';
    if (!ADMIN_ROLES.includes(role)) return null;
    return user;
  } catch {
    return null;
  }
}

/** 401 Unauthorized response. */
export const unauthorized = (msg = 'No autorizado') =>
  NextResponse.json({ error: msg }, { status: 401 });

/** 403 Forbidden response. */
export const forbidden = (msg = 'Acceso denegado') =>
  NextResponse.json({ error: msg }, { status: 403 });
