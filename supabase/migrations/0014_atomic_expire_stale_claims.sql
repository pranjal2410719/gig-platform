-- =============================================================================
-- Migration: 0014_atomic_expire_stale_claims.sql
-- Description:
--   Atomic background expiration for abandoned 48-hour claims with coordinated
--   row-level locking for PR submissions.
--
--   Key Guarantees:
--   1. BEFORE INSERT trigger on `submissions` row-locks the target claim
--      (FOR UPDATE) and enforces status = 'active' and expires_at > NOW().
--   2. `atomic_expire_stale_claims()` row-locks candidate claims (FOR UPDATE SKIP LOCKED)
--      and verifies NOT EXISTS (pending/merged submissions).
--   3. Enforces strict service_role administrative boundary.
--   4. Never mutates `tasks.status`.
-- =============================================================================

-- Ensure expires_at column exists on public.claims
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '48 hours');

-- -----------------------------------------------------------------------------
-- 1. Submission Validation Trigger (Coordinates with Expiration Sweep)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_validate_claim_for_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim record;
BEGIN
  -- Row-lock the target claim.
  -- This serializes concurrent submission attempts and expiration sweeps on this claim.
  SELECT id, status, expires_at
  INTO v_claim
  FROM public.claims
  WHERE id = NEW.claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target claim % does not exist', NEW.claim_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_claim.status <> 'active' THEN
    RAISE EXCEPTION 'Cannot submit PR for claim % with status %', NEW.claim_id, v_claim.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_claim.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot submit PR for claim %: claim expired at %', NEW.claim_id, v_claim.expires_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_active_claim_on_submission ON public.submissions;
CREATE TRIGGER trg_enforce_active_claim_on_submission
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_claim_for_submission();

-- -----------------------------------------------------------------------------
-- 2. Atomic Stale Claim Expiration RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_expire_stale_claims()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
  v_role text;
BEGIN
  -- Administrative Boundary: strictly service_role or database internal pg_cron only
  v_role := COALESCE(auth.role(), '');
  IF v_role <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden: administrative operation requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Atomic claim expiration:
  -- Locks candidate claims FOR UPDATE SKIP LOCKED to prevent contention with
  -- in-flight submissions, updating only claims that still have no pending/merged PR.
  WITH candidate_claims AS (
    SELECT id
    FROM public.claims
    WHERE status = 'active'
      AND expires_at <= NOW()
    FOR UPDATE SKIP LOCKED
  ),
  expired_rows AS (
    UPDATE public.claims c
    SET status = 'expired'
    FROM candidate_claims cc
    WHERE c.id = cc.id
      AND NOT EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.claim_id = c.id
          AND s.pr_status IN ('pending', 'merged')
      )
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_rows;

  RETURN jsonb_build_object(
    'success', true,
    'ok', true,
    'expired_claims_count', v_expired_count,
    'timestamp', NOW()
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Security Boundary & Least Privilege Execution Grants
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.atomic_expire_stale_claims() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_expire_stale_claims() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_expire_stale_claims() FROM anon;
GRANT EXECUTE ON FUNCTION public.atomic_expire_stale_claims() TO service_role;
