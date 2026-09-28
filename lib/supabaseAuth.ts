import { cookies } from 'next/headers';
import { createSupabaseServerClient, isSupabaseConfigured, type SupabaseCookieMethods } from './supabaseClient';

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'developer' | 'business';
  name: string;
  githubId?: string;
  githubHandle?: string;
  expiresAt: number;
}

const LEGACY_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'gig_session';
const MAX_AGE = 7 * 24 * 60 * 60;

async function getSSRCookieMethods(): Promise<SupabaseCookieMethods> {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  };
}

export async function createSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): Promise<void> {
  if (!isSupabaseConfigured) return;
  const cookieMethods = await getSSRCookieMethods();
  const supabase = createSupabaseServerClient(cookieMethods);
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieMethods = await getSSRCookieMethods();
  const cookieStore = await cookies();

  if (isSupabaseConfigured) {
    const supabase = createSupabaseServerClient(cookieMethods);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signOut errors, proceed to delete cookie directly
    }
  }

  cookieStore.delete(LEGACY_COOKIE_NAME);
  cookieStore.delete('gig_supabase_auth_token');
}

export async function getSession(): Promise<SessionPayload | null> {
  if (!isSupabaseConfigured) return null;
  const cookieMethods = await getSSRCookieMethods();
  const supabase = createSupabaseServerClient(cookieMethods);

  // getUser (network) and getSession (local cookie read) are independent.
  const [{ data: { user }, error }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (error || !user) return null;

  const expiresAt = session?.expires_at ? session.expires_at * 1000 : Date.now() + MAX_AGE * 1000;

  // BUG-001 FIX: Read verified role and profile from public.users rather than mutable metadata.
  // R2a: If there is no public.users row, the user has not completed registration — return null.
  const { data: profile } = await supabase
    .from('users')
    .select('role, github_id, github_handle, username, company')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email || '',
    role: profile.role as 'developer' | 'business',
    name: profile.username || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    githubId: profile.github_id || user.user_metadata?.github_id,
    githubHandle: profile.github_handle || user.user_metadata?.github_handle,
    expiresAt,
  };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<{
  session: { access_token: string; refresh_token: string; expires_at?: number } | null;
  error: Error | null;
}> {
  if (!isSupabaseConfigured) return { session: null, error: new Error('Supabase is not configured') };
  const cookieMethods = await getSSRCookieMethods();
  const supabase = createSupabaseServerClient(cookieMethods);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { session: null, error };
  return {
    session: data.session
      ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at }
      : null,
    error: null,
  };
}

export async function signInWithGitHub(): Promise<{ url: string | null; error: Error | null }> {
  if (!isSupabaseConfigured) return { url: null, error: new Error('Supabase is not configured') };
  const cookieMethods = await getSSRCookieMethods();
  const supabase = createSupabaseServerClient(cookieMethods);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${baseUrl}/api/auth/github/callback` },
  });
  if (error) return { url: null, error };
  return { url: data.url || null, error: null };
}

export async function signOut(): Promise<void> {
  await deleteSession();
}
