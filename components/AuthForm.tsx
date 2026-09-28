"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {
  status: "idle",
};

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_disabled:
    "GitHub sign-in isn't enabled yet. Use email + password, or ask the platform admin to enable the GitHub provider.",
  access_denied: "You cancelled the GitHub sign-in. Try again or use email + password.",
  supabase_not_configured: "Sign-in isn't available right now (Supabase isn't configured).",
  github_exchange_failed: "GitHub sign-in failed. Please try again or use email + password.",
  session_missing: "GitHub sign-in failed. Please try again or use email + password.",
  profile_upsert_failed:
    "We couldn't link your GitHub profile. Please try again or use email + password.",
  oauth_failed: "GitHub sign-in failed. Please try again or use email + password.",
  missing_authorization_code:
    "GitHub sign-in failed. Please try again or use email + password.",
  github_required:
    "You must connect your GitHub account to access the issue pool. Connect GitHub from your profile settings.",
};

export default function AuthForm({
  audience,
  error,
}: {
  audience?: "business" | "developer";
  error?: string;
}) {
  // Default to developer if not provided (for safety)
  const role = audience || "developer";
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [notice, setNotice] = useState("");

  const errorMessage = state.status === "error" ? state.message : notice;
  const hasError = Boolean(errorMessage);

  const handleAction = (formData: FormData) => {
    setNotice("");
    formAction(formData);
  };

  // ==========================================
  // BUSINESS LOGIN
  // ==========================================
  if (role === "business") {
    return (
      <form action={handleAction} noValidate className="auth-form">
        <input type="hidden" name="role" value={role} />
        {error && (
          <p className="error-message visible" role="alert" style={{ display: "block", marginBottom: 12 }}>
            {error}
          </p>
        )}
        <div>
          <label className="auth-label" htmlFor="email">Work Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className={`auth-input ${hasError ? "has-error" : ""}`}
            aria-invalid={hasError}
            disabled={pending}
          />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label className="auth-label" htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
            <Link href="#" style={{ color: "var(--color-skill-green)", fontSize: 12, fontWeight: 600 }}>Forgot password?</Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={`auth-input ${hasError ? "has-error" : ""}`}
            disabled={pending}
          />
        </div>
        {errorMessage && (
          <p className="error-message visible" role="alert" style={{ display: "block", marginTop: 0 }}>
            {errorMessage}
          </p>
        )}
        
        <button type="submit" className="auth-cta" disabled={pending}>
          {pending ? "Logging in..." : "Log In to Workspace"}
        </button>
        
        <div className="auth-divider"><span>OR</span></div>
        
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" className="auth-ghost" onClick={() => setNotice("Google Workspace OAuth coming soon")} disabled={pending}>
            <span style={{ color: "var(--color-google-red)", fontWeight: 800, fontSize: 14 }}>G</span> Continue with Google Workspace
          </button>
        </div>
        <p className="auth-foot">Don&apos;t have a business account? <Link href="/#waitlist">Get free trial</Link> · <Link href="#">Contact sales</Link></p>
      </form>
    );
  }

  // ==========================================
  // DEVELOPER LOGIN
  // ==========================================
  return (
    <form action={handleAction} noValidate className="auth-form">
      <input type="hidden" name="role" value={role} />
      {error && (
        <p className="error-message visible" role="alert" style={{ display: "block", marginBottom: 12 }}>
          {error}
        </p>
      )}
      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          <a
            href="/api/auth/github?role=developer"
            className="auth-cta"
          style={{ backgroundColor: "#0b1215", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", textDecoration: "none" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
          Continue with GitHub
        </a>
      </div>

      <div className="auth-divider"><span>OR USE EMAIL</span></div>

      <div>
        <label className="auth-label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="dev@gig.dev"
          className={`auth-input ${hasError ? "has-error" : ""}`}
          aria-invalid={hasError}
          disabled={pending}
        />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label className="auth-label" htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
          <Link href="#" style={{ color: "var(--color-creator-violet)", fontSize: 12, fontWeight: 600 }}>Forgot password?</Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={`auth-input ${hasError ? "has-error" : ""}`}
          disabled={pending}
        />
      </div>
      {errorMessage && (
        <p className="error-message visible" role="alert" style={{ display: "block", marginTop: 0 }}>
          {errorMessage}
        </p>
      )}
      
      <button type="submit" className="auth-ghost" style={{ border: "1px solid var(--color-fog-border)", marginTop: 12 }} disabled={pending}>
        {pending ? "Signing in..." : "Sign In with Email"}
      </button>
      
      <p className="auth-foot">Don&apos;t have a GIG account? <Link href="/#waitlist">Create developer profile</Link></p>
    </form>
  );
}
