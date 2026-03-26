'use client';
/**
 * Drop-in replacement for `fetch` that automatically attaches the
 * current Supabase session token as an Authorization header.
 *
 * Use this for all mutating API calls (POST, PATCH, PUT, DELETE) so
 * the server can verify the caller's identity.
 *
 * Example:
 *   import { authFetch } from '@/lib/authFetch';
 *   const res = await authFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) });
 */
import { supabase } from './supabaseClient';

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  return fetch(url, { ...init, headers });
}
