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
export function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server env vars');
  return createClient(url, key);
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
    const { data: { user } } = await sbAdmin().auth.getUser(token);
    if (!user?.email) return null;
    return { id: user.id, email: user.email.toLowerCase() };
  } catch {
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
    if (!ADMIN_ROLES.includes(data?.role ?? '')) return null;
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
