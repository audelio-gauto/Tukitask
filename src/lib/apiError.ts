import { NextResponse } from 'next/server';

/**
 * Logs the real DB/internal error message server-side for debugging,
 * but returns a generic "Internal server error" to the client so that
 * schema details, table names, and constraint names are never leaked.
 */
export function serverError(err: unknown, context?: string): NextResponse {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[API]${context ? ` [${context}]` : ''}`, msg);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
