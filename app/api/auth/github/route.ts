import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient, isSupabaseConfigured, type SupabaseCookieMethods } from '@/lib/supabaseClient';

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    redirect('/auth');
  }

  const role = request.nextUrl.searchParams.get('role') || 'developer';
  const mode = request.nextUrl.searchParams.get('mode') || 'login';

  const cookieStore = await cookies();
  const cookieMethods: SupabaseCookieMethods = {
    getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  };
  const supabase = createSupabaseServerClient(cookieMethods);

  // Linking mode requires an existing authenticated session.
  if (mode === 'link') {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      redirect('/auth');
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const redirectTo = new URL(`${baseUrl}/api/auth/github/callback`);
  redirectTo.searchParams.set('mode', mode);
  redirectTo.searchParams.set('role', role);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: redirectTo.toString() },
  });

  if (error || !data.url) {
    const providerDisabled =
      error?.message?.toLowerCase().includes('provider') ||
      error?.message?.toLowerCase().includes('not enabled');
    redirect(`/auth?error=${providerDisabled ? 'provider_disabled' : 'oauth_failed'}`);
  }

  redirect(data.url);
}
