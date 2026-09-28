import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient, isSupabaseConfigured, supabaseAdmin, type SupabaseCookieMethods } from '@/lib/supabaseClient';
import { createSession as createSupabaseSession } from '@/lib/supabaseAuth';
import {
  upsertUser,
  syncGithubProfile,
  getUserByGithubId,
  getUserByEmail,
  getUserById,
  cleanGithubHandle,
} from '@/lib/db-operations';

function getCookieMethods(cookieStore: Awaited<ReturnType<typeof cookies>>): SupabaseCookieMethods {
  return {
    getAll: () => cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  };
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const oauthError = request.nextUrl.searchParams.get('error');
  const mode = request.nextUrl.searchParams.get('mode') || 'login';
  const roleHint = request.nextUrl.searchParams.get('role') || 'developer';

  let success = false;
  let finalRole = 'developer';
  let errorCode: string | null = oauthError
    ? oauthError === 'access_denied'
      ? 'access_denied'
      : 'oauth_failed'
    : null;

  if (!errorCode && isSupabaseConfigured && code) {
    try {
      const cookieStore = await cookies();
      const cookieMethods = getCookieMethods(cookieStore);
      const supabase = createSupabaseServerClient(cookieMethods);

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        const githubSession = data.session;

        // In link mode, we want to keep the existing session and just link GitHub to it
        // In login mode, we need to establish the new user's session
        const isLinkMode = mode === 'link';
        
        if (!isLinkMode) {
          // Persist the Supabase session in SSR cookies for login mode
          await createSupabaseSession(githubSession);
        }
        // For link mode, we keep the existing session and use githubSession temporarily

        // DB writes below run as the service role: the `authenticated` role
        // cannot write `role`/`github_id`/`email`/`company` (migrations
        // 0002/0003/0005), and the identity here is already verified via
        // the code exchange. Falls back to the user-scoped client if no
        // service key is configured.
        const dbClient = supabaseAdmin ?? supabase;

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!userError && user) {
          const githubIdentity =
            user.identities?.find((id) => id.provider === 'github') || user.identities?.[0];
          const rawGithubId =
            githubIdentity?.identity_data?.sub ||
            githubIdentity?.id ||
            user.user_metadata?.github_id ||
            user.user_metadata?.provider_id ||
            null;
          const githubId = rawGithubId ? String(rawGithubId) : null;

          const rawHandle =
            githubIdentity?.identity_data?.user_name ||
            githubIdentity?.identity_data?.preferred_username ||
            githubIdentity?.identity_data?.login ||
            user.user_metadata?.user_name ||
            user.user_metadata?.preferred_username ||
            user.user_metadata?.github_handle ||
            null;

          const githubHandle = cleanGithubHandle(rawHandle);

          let role: string;

          if (mode === 'link') {
            // Linking mode: the user is already authenticated and we are
            // attaching a GitHub identity to their existing account.
            // Preserve the existing role — never override it here.
            const existingProfile = await getUserById(user.id, dbClient);
            if (existingProfile?.role) {
              role = existingProfile.role;
            } else {
              role = roleHint;
            }
          } else {
            // Login mode: respect the auth context (role hint) from the login path.
            // Only fall back to email-based resolution when no explicit role hint
            // was provided, so a developer who later links GitHub as business
            // isn't silently downgraded to 'developer'.
            role = roleHint;
            const existingByGithub = githubId
              ? await getUserByGithubId(githubId, dbClient, roleHint)
              : null;
            if (existingByGithub?.role) {
              role = existingByGithub.role;
            } else if (!roleHint || roleHint === 'developer') {
              // No explicit business intent — fall back to email lookup so
              // returning email/password users keep their profile.
              const existingByEmail = user.email
                ? await getUserByEmail(user.email, dbClient)
                : null;
              if (existingByEmail?.role) {
                role = existingByEmail.role;
              }
            }
            // If a business role hint was provided and no matching profile
            // exists, a new business profile is created with role 'business'.
          }
          finalRole = role;

          // Server-side upsert (service role): links github_id, github_handle, and assigns
          // the resolved role, which user-scoped clients cannot write.
          const profile = await upsertUser(
            {
              id: user.id,
              github_id: githubId,
              github_handle: githubHandle,
              username: user.user_metadata?.full_name || githubHandle || user.email?.split('@')[0] || 'Developer',
              email: user.email,
              avatar_url: user.user_metadata?.avatar_url || null,
              role,
            },
            dbClient,
          );

          if (profile) {
            // Fetch authoritative GitHub profile data (avatar URL, bio, stats) and store it locally
            await syncGithubProfile(
              user.id,
              githubSession.provider_token,
              githubId,
              githubHandle,
              dbClient,
            ).catch((syncErr) => {
              console.error('[GitHub OAuth Callback] Profile sync failed', syncErr);
            });

            success = true;
          } else {
            errorCode = 'profile_upsert_failed';
          }
        } else {
          errorCode = 'session_missing';
        }
      } else if (error) {
        errorCode = 'github_exchange_failed';
      }
    } catch (err) {
      console.error('[GitHub OAuth Callback]', err);
      errorCode = 'oauth_failed';
    }
  } else if (!errorCode) {
    errorCode = isSupabaseConfigured ? 'missing_authorization_code' : 'supabase_not_configured';
  }

  if (errorCode) {
    console.error('[GitHub OAuth Callback]', errorCode);
  }

  redirect(
    success
      ? finalRole === 'business'
        ? '/dashboard/business'
        : '/dashboard/developer'
      : `/auth?error=${encodeURIComponent(errorCode ?? 'oauth_failed')}`,
  );
}