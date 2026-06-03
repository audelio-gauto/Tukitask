import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  if (!url || !key) {
    console.warn('Supabase server client missing env vars; set SUPABASE_SERVICE_ROLE_KEY')
    throw new Error('Supabase server client missing env vars')
  }
  _client = createClient(url, key)
  return _client
}

// Lazy proxy: createClient is only called on first use (inside a request handler),
// never at module evaluation time — prevents build-time crash when env vars are absent.
export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getClient() as any)[prop]
  },
})
