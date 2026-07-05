import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
	if (_client) return _client;

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		const msg = 'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY';
		 
		console.error(msg, {
			NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl,
			NEXT_PUBLIC_SUPABASE_ANON_KEY: !!supabaseAnonKey,
		});
		throw new Error(msg);
	}

	_client = createClient(supabaseUrl, supabaseAnonKey);
	return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
	 
	get(_target, prop) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (getClient() as any)[prop];
	},
});
