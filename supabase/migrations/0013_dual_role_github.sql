-- =============================================================================
-- 0013 — Enable dual-role GitHub association
--
-- Allow the same GitHub account (github_id) to be associated with multiple
-- user profiles (e.g. a developer profile and a business profile).  This
-- supports the scenario where a single GitHub identity is linked to both a
-- developer account (via GitHub login) and a business account (via email/
-- password login followed by GitHub linking).
-- =============================================================================

-- Drop the UNIQUE constraint on github_id so the same GitHub account can be
-- associated with multiple user profiles of different roles.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_github_id_key;

-- Index for efficient role-scoped lookups by github_id (new login flow)
CREATE INDEX IF NOT EXISTS idx_users_github_id_role ON public.users (github_id, role);

-- Index for efficient single-column lookups by github_id (existing sync / link flows)
CREATE INDEX IF NOT EXISTS idx_users_github_id ON public.users (github_id) WHERE github_id IS NOT NULL;
