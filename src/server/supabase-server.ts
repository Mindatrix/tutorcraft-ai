import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side client. Uses the service-role key when present so writes to
// RLS-protected tables (results, gems, weak matrix) only happen through our
// validated API routes. Falls back to the anon key for local development.

let client: SupabaseClient | null = null;

export function serverSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
