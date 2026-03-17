import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	const msg = 'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY';
	// Log prominently so Vercel build/runtime logs show the problem
	// (do not throw to avoid breaking builds, but client will fail early)
	// In production, this indicates you must set env vars in Vercel and redeploy.
	// eslint-disable-next-line no-console
	console.error(msg, { NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: !!supabaseAnonKey });
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
