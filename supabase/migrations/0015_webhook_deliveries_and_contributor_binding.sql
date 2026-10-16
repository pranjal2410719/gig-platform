-- =============================================================================
-- Migration: 0015_webhook_deliveries_and_contributor_binding.sql
-- Description:
--   Phase B: Durable webhook delivery idempotency with fencing tokens,
--   canonical 3-stage reward settlement (PENDING -> VERIFIED -> AVAILABLE),
--   task-level serialization to eliminate lock inversions, and claim validation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Webhook Deliveries Table (Fencing Tokens & Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id varchar(128) NOT NULL UNIQUE,
  event_type varchar(64) NOT NULL,
  repository_id uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  pr_number integer,
  status varchar(32) NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed', 'ignored'
  processing_token uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
  error_message text,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.webhook_deliveries FROM PUBLIC;
REVOKE ALL ON public.webhook_deliveries FROM authenticated;
REVOKE ALL ON public.webhook_deliveries FROM anon;
GRANT ALL ON public.webhook_deliveries TO service_role;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries (status, lease_expires_at);

-- -----------------------------------------------------------------------------
-- 2. RPC: atomic_claim_webhook_delivery
--    Fencing-token pattern: returns can_process, status, and unique processing_token.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_claim_webhook_delivery(
  p_delivery_id varchar(128),
  p_event_type varchar(64),
  p_repository_id uuid DEFAULT NULL,
  p_pr_number integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery record;
  v_token uuid;
  v_role text;
BEGIN
  v_role := COALESCE(auth.role(), '');
  IF v_role <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden: administrative operation requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_delivery
  FROM public.webhook_deliveries
  WHERE delivery_id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_token := gen_random_uuid();
    INSERT INTO public.webhook_deliveries (
      delivery_id,
      event_type,
      repository_id,
      pr_number,
      status,
      processing_token,
      lease_expires_at,
      created_at
    ) VALUES (
      p_delivery_id,
      p_event_type,
      p_repository_id,
      p_pr_number,
      'processing',
      v_token,
      NOW() + INTERVAL '2 minutes',
      NOW()
    );

    RETURN jsonb_build_object(
      'can_process', true,
      'status', 'claimed',
      'delivery_id', p_delivery_id,
      'processing_token', v_token
    );
  END IF;

  IF v_delivery.status = 'completed' THEN
    RETURN jsonb_build_object(
      'can_process', false,
      'status', 'already_completed',
      'delivery_id', p_delivery_id
    );
  END IF;

  IF v_delivery.status = 'ignored' THEN
    RETURN jsonb_build_object(
      'can_process', false,
      'status', 'already_ignored',
      'delivery_id', p_delivery_id
    );
  END IF;

  -- If status is 'failed' OR lease has expired, reclaim with fresh fencing token
  IF v_delivery.status = 'failed' OR v_delivery.lease_expires_at <= NOW() THEN
    v_token := gen_random_uuid();
    UPDATE public.webhook_deliveries
    SET status = 'processing',
        processing_token = v_token,
        lease_expires_at = NOW() + INTERVAL '2 minutes',
        error_message = CASE WHEN v_delivery.status = 'processing' THEN 'Recovered from expired lease' ELSE NULL END
    WHERE delivery_id = p_delivery_id;

    RETURN jsonb_build_object(
      'can_process', true,
      'status', CASE WHEN v_delivery.status = 'failed' THEN 'retrying' ELSE 'stale_recovered' END,
      'delivery_id', p_delivery_id,
      'processing_token', v_token
    );
  ELSE
    -- Active unexpired lease held by another worker
    RETURN jsonb_build_object(
      'can_process', false,
      'status', 'in_progress',
      'delivery_id', p_delivery_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_claim_webhook_delivery TO service_role;

-- -----------------------------------------------------------------------------
-- 3. RPC: atomic_complete_webhook_delivery
--    Fencing token verification: superseded workers cannot finalize deliveries.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_complete_webhook_delivery(
  p_delivery_id varchar(128),
  p_processing_token uuid,
  p_status varchar(32),
  p_error_message text DEFAULT NULL,
  p_payload_summary jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden: administrative operation requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.webhook_deliveries
  SET status = p_status,
      error_message = p_error_message,
      payload_summary = p_payload_summary,
      completed_at = NOW()
  WHERE delivery_id = p_delivery_id
    AND processing_token = p_processing_token;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_complete_webhook_delivery TO service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: atomic_process_pr_merge
--    Task-first serialization: locks task first to serialize concurrent merges
--    and eliminate task-to-competing-claim lock inversion deadlocks.
--    Canonical reward progression: PENDING -> VERIFIED -> AVAILABLE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_process_pr_merge(
  p_submission_id uuid,
  p_reviewer text,
  p_merged_at timestamptz,
  p_github_repo_id text,
  p_github_issue_number integer,
  p_pr_number integer,
  p_pr_author_github_id text,
  p_merge_commit_sha text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission record;
  v_task record;
  v_claim record;
  v_wallet_id uuid;
  v_contribution_id uuid;
  v_tx_id uuid;
  v_reward_amount integer;
  v_currency text;
  v_target_task_id uuid;
  v_target_claim_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden: administrative operation requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Pre-fetch target task and claim IDs from submission
  SELECT task_id, claim_id INTO v_target_task_id, v_target_claim_id
  FROM public.submissions
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  -- 2. Lock TASK first (Task-level serialization eliminates concurrent merge deadlocks)
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = v_target_task_id
  FOR UPDATE;

  -- 3. Lock SUBMISSION
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  -- Idempotency check: if already merged, return existing records
  IF v_submission.pr_status = 'merged' THEN
    SELECT id INTO v_contribution_id
    FROM public.contributions
    WHERE submission_id = v_submission.id;

    SELECT id INTO v_tx_id
    FROM public.wallet_transactions
    WHERE contribution_id = v_contribution_id AND type = 'TASK_REWARD';

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'submission_id', v_submission.id,
      'contribution_id', v_contribution_id,
      'transaction_id', v_tx_id,
      'message', 'Submission already merged and settled'
    );
  END IF;

  IF v_submission.pr_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Submission is in invalid status: ' || v_submission.pr_status
    );
  END IF;

  -- 4. Verify Task is open
  IF v_task.status <> 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Task is no longer open (current status: ' || v_task.status || ')'
    );
  END IF;

  -- 5. Lock winning CLAIM and verify active status
  SELECT * INTO v_claim
  FROM public.claims
  WHERE id = v_target_claim_id
  FOR UPDATE;

  IF v_claim.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Claim is not active (current status: ' || v_claim.status || ')'
    );
  END IF;

  -- 5. Transition submission status to 'merged'
  UPDATE public.submissions
  SET pr_status = 'merged'
  WHERE id = v_submission.id;

  -- 6. Insert verified contribution record (backed by contributions_submission_id_unique)
  INSERT INTO public.contributions (
    user_id,
    task_id,
    submission_id,
    status,
    reviewer,
    merged_at,
    github_repo_id,
    github_issue_number,
    pr_number,
    pr_author_github_id,
    merge_commit_sha,
    verification_source
  ) VALUES (
    v_submission.user_id,
    v_submission.task_id,
    v_submission.id,
    'verified',
    p_reviewer,
    COALESCE(p_merged_at, NOW()),
    p_github_repo_id,
    p_github_issue_number,
    p_pr_number,
    p_pr_author_github_id,
    p_merge_commit_sha,
    'github_webhook'
  )
  ON CONFLICT (submission_id) DO NOTHING
  RETURNING id INTO v_contribution_id;

  IF v_contribution_id IS NULL THEN
    SELECT id INTO v_contribution_id
    FROM public.contributions
    WHERE submission_id = v_submission.id;
  END IF;

  -- 7. Canonical 3-Stage Reward Ledger Settlement: PENDING -> VERIFIED -> AVAILABLE
  v_reward_amount := COALESCE(v_task.reward_amount, 0);
  v_currency := COALESCE(v_task.reward_currency, 'INR');

  IF v_reward_amount > 0 AND v_contribution_id IS NOT NULL THEN
    -- Upsert and lock developer wallet
    INSERT INTO public.wallets (user_id, available_balance, total_earned, created_at, updated_at)
    VALUES (v_submission.user_id, 0, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_wallet_id;

    -- Lock wallet row exclusively
    PERFORM 1 FROM public.wallets WHERE id = v_wallet_id FOR UPDATE;

    -- Check for existing TASK_REWARD transaction on this contribution
    SELECT id INTO v_tx_id
    FROM public.wallet_transactions
    WHERE contribution_id = v_contribution_id AND type = 'TASK_REWARD'
    FOR UPDATE;

    IF v_tx_id IS NULL THEN
      -- Stage 1: PENDING (Record reward evidence transaction)
      INSERT INTO public.wallet_transactions (
        wallet_id,
        task_id,
        contribution_id,
        amount,
        currency,
        type,
        status,
        created_at
      ) VALUES (
        v_wallet_id,
        v_submission.task_id,
        v_contribution_id,
        v_reward_amount,
        v_currency,
        'TASK_REWARD',
        'PENDING',
        NOW()
      )
      RETURNING id INTO v_tx_id;

      -- Stage 2: VERIFIED (Evidence snapshot verified against GitHub webhook metadata)
      UPDATE public.wallet_transactions
      SET status = 'VERIFIED'
      WHERE id = v_tx_id AND status = 'PENDING';

      -- Stage 3: AVAILABLE (Release bounty funds to developer wallet)
      UPDATE public.wallet_transactions
      SET status = 'AVAILABLE'
      WHERE id = v_tx_id AND status = 'VERIFIED';

      -- Credit developer wallet balances
      UPDATE public.wallets
      SET available_balance = available_balance + v_reward_amount,
          total_earned = total_earned + v_reward_amount,
          updated_at = NOW()
      WHERE id = v_wallet_id;
    END IF;
  END IF;

  -- 8. Complete winning claim
  UPDATE public.claims
  SET status = 'completed'
  WHERE id = v_submission.claim_id;

  -- 9. Close task
  UPDATE public.tasks
  SET status = 'closed'
  WHERE id = v_submission.task_id;

  -- 10. Expire competitor claims on this task (safe because task is locked first)
  UPDATE public.claims
  SET status = 'expired'
  WHERE task_id = v_submission.task_id
    AND id <> v_submission.claim_id
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'contribution_id', v_contribution_id,
    'transaction_id', v_tx_id,
    'reward_amount', v_reward_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_process_pr_merge TO service_role;

-- -----------------------------------------------------------------------------
-- 5. RPC: atomic_process_pr_closure
--    Validates that p_claim_id belongs to p_submission_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_process_pr_closure(
  p_submission_id uuid,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission record;
  v_claim record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden: administrative operation requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Lock submission
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  -- 2. Validate claim ownership
  IF v_submission.claim_id <> p_claim_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Claim does not belong to the specified submission'
    );
  END IF;

  IF v_submission.pr_status = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Submission already rejected');
  END IF;

  IF v_submission.pr_status = 'merged' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reject merged submission');
  END IF;

  -- 3. Lock claim
  SELECT * INTO v_claim
  FROM public.claims
  WHERE id = p_claim_id
  FOR UPDATE;

  -- Reject submission
  UPDATE public.submissions
  SET pr_status = 'rejected'
  WHERE id = v_submission.id;

  -- Expire claim if active
  IF v_claim.status = 'active' THEN
    UPDATE public.claims
    SET status = 'expired'
    WHERE id = v_claim.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission.id,
    'claim_id', p_claim_id,
    'submission_status', 'rejected',
    'claim_status', 'expired'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.atomic_process_pr_closure TO service_role;
