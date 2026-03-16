import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Lazy initialization to avoid crashes during build/prerendering
let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client && supabaseUrl && supabaseAnonKey) {
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  if (!_client) {
    // Fallback for build time - won't be used at runtime
    _client = createClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }
  return _client;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
