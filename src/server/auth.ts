import { serverSupabase } from './supabase-server';

export interface Tutor {
  id: string;
  email: string;
  name: string;
}

/** Pull the bearer token out of an Authorization header (pure, unit-tested). */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(header.trim());
  return m ? m[1] : null;
}

/**
 * Verifies the Supabase access token sent by the Studio and returns the tutor.
 * Never trusts anything the browser says about who it is except this token.
 */
export async function requireTutor(req: Request): Promise<Tutor | null> {
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return null;
  const db = serverSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim().slice(0, 60) : (data.user.email ?? 'Gia sư').split('@')[0];
    return { id: data.user.id, email: data.user.email ?? '', name };
  } catch {
    return null;
  }
}

export const UNAUTHORIZED = { error: 'Cần đăng nhập tài khoản gia sư.' } as const;

/** battles.tutor_id references profiles(id): make sure the row exists (idempotent, service role). */
export async function ensureTutorProfile(tutor: Tutor): Promise<void> {
  const db = serverSupabase();
  if (!db) return;
  await db.from('profiles').upsert({ id: tutor.id, role: 'tutor', full_name: tutor.name }, { onConflict: 'id', ignoreDuplicates: true });
}
