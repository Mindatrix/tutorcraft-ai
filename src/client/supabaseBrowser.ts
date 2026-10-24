'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-side Supabase client, used only for tutor sign-in. The anon key is
// public by design; every privileged action still goes through our API routes,
// which verify the access token on the server.

let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** fetch() that adds the signed-in tutor's access token. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const sb = browserSupabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
