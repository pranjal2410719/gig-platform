import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const { mockSupabase, mockDbOps } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const mockDbOps = {
    atomicClaimWebhookDelivery: vi.fn(),
    atomicCompleteWebhookDelivery: vi.fn(),
    atomicProcessPrMerge: vi.fn(),
    atomicProcessPrClosure: vi.fn(),
    createContribution: vi.fn(),
    creditReward: vi.fn(),
    verifyReward: vi.fn(),
    releaseReward: vi.fn(),
    setClaimStatus: vi.fn(),
    updateTaskStatus: vi.fn(),
    expireOtherClaimsForTask: vi.fn(),
    updateSubmissionStatus: vi.fn(),
  };
  return { mockSupabase, mockDbOps };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

vi.mock('@/lib/db-operations', () => mockDbOps);

import { POST } from '@/app/api/webhooks/github/route';

describe('GitHub Webhook Endpoint (/api/webhooks/github)', () => {
  const secret = 'test-webhook-secret';
  const originalEnv = { ...process.env };
  const mockToken = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    Object.assign(process.env, { NODE_ENV: 'test' });

    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.ilike.mockReturnValue(mockSupabase);

    // Default: claim delivery succeeds with fencing token
    mockDbOps.atomicClaimWebhookDelivery.mockResolvedValue({
      can_process: true,
      status: 'claimed',
      delivery_id: 'deliv-1',
      processing_token: mockToken,
    });
    mockDbOps.atomicCompleteWebhookDelivery.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createSignedRequest(
    bodyObj: Record<string, unknown>,
    options: {
      event?: string;
      deliveryId?: string | null;
      customSignature?: string;
      rawPayload?: string;
    } = {}
  ) {
    const rawBody = options.rawPayload ?? JSON.stringify(bodyObj);
    const signature =
      options.customSignature !== undefined
        ? options.customSignature
        : 'sha256=' +
          crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-github-event': options.event ?? 'pull_request',
    };
    if (signature) {
      headers['x-hub-signature-256'] = signature;
    }
    if (options.deliveryId !== null) {
      headers['x-github-delivery'] = options.deliveryId ?? 'deliv-default-1';
    }

    return new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      body: rawBody,
      headers,
    });
  }

  it('rejects payloads with invalid HMAC signatures when secret is set', async () => {
    const req = createSignedRequest(
      { action: 'ping' },
      { customSignature: 'sha256=invalidhexsignature000000000000000000000000000000000000000000000000' }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid signature');
  });

  it('fails with 500 in production when GITHUB_WEBHOOK_SECRET is unconfigured', async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    Object.assign(process.env, { NODE_ENV: 'production' });

    const req = new NextRequest('http://localhost:3000/api/webhooks/github', {
      method: 'POST',
      body: JSON.stringify({ action: 'ping' }),
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'ping',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/configuration error/i);
  });

  it('responds with 200 pong for ping events', async () => {
    const req = createSignedRequest({ zen: 'Keep it logically awesome.' }, { event: 'ping' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('pong');
  });

  it('ignores non-pull_request events with 200', async () => {
    const req = createSignedRequest({ action: 'created' }, { event: 'issue_comment' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/Ignored event: issue_comment/i);
  });

  it('rejects requests missing x-github-delivery header with 400', async () => {
    const req = createSignedRequest(
      { action: 'closed', pull_request: { merged: true, number: 42 } },
      { deliveryId: null }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Missing x-github-delivery header/i);
  });

  it('handles delivery idempotency: returns 200 when delivery already processed or in progress', async () => {
    mockDbOps.atomicClaimWebhookDelivery.mockResolvedValueOnce({
      can_process: false,
      status: 'already_completed',
      delivery_id: 'deliv-dup-1',
    });

    const req = createSignedRequest(
      { action: 'closed', pull_request: { merged: true, number: 42 } },
      { deliveryId: 'deliv-dup-1' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/already processed or currently in progress/i);
    expect(mockDbOps.atomicProcessPrMerge).not.toHaveBeenCalled();
  });

  it('fails safely with 500 when atomic_claim_webhook_delivery RPC fails (migration missing)', async () => {
    mockDbOps.atomicClaimWebhookDelivery.mockResolvedValueOnce({
      can_process: false,
      status: 'error',
      error: 'function atomic_claim_webhook_delivery does not exist',
    });

    const req = createSignedRequest(
      { action: 'closed', pull_request: { merged: true, number: 42 } },
      { deliveryId: 'deliv-err-1' }
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Database operation unavailable/i);
  });

  it('ignores events for unregistered repositories and completes delivery with fencing token', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: { merged: true, number: 42 },
        repository: { owner: { login: 'unknown-org' }, name: 'unknown-repo' },
      },
      { deliveryId: 'deliv-unreg-1' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/Repository not registered on platform/i);
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-unreg-1',
        processingToken: mockToken,
        status: 'ignored',
      }),
      expect.anything()
    );
  });

  it('ignores events for repositories that have not opted into the bounty network', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-optout', owner: 'org', name: 'repo', opted_in: false },
      error: null,
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: { merged: true, number: 42 },
        repository: { owner: { login: 'org' }, name: 'repo' },
      },
      { deliveryId: 'deliv-optout-1' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/Repository is not opted into the bounty network/i);
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-optout-1',
        processingToken: mockToken,
        status: 'ignored',
      }),
      expect.anything()
    );
  });

  it('handles PR closed WITHOUT merge: rejects pending submission and expires claim', async () => {
    // 1. Repo lookup
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    // 2. Pending submissions lookup
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-rejected-1',
          task_id: 'task-1',
          user_id: 'dev-user-1',
          claim_id: 'claim-1',
          pr_number: '55',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1' },
        },
      ],
      error: null,
    });
    // 3. Closure RPC response
    mockDbOps.atomicProcessPrClosure.mockResolvedValueOnce({
      success: true,
      submission_id: 'sub-rejected-1',
      claim_id: 'claim-1',
      submission_status: 'rejected',
      claim_status: 'expired',
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 55,
          merged: false,
          html_url: 'https://github.com/octocat/spoon-knife/pull/55',
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-closed-unmerged' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/closed without merge; submission rejected and claim expired/i);

    expect(mockDbOps.atomicProcessPrClosure).toHaveBeenCalledWith(
      { submissionId: 'sub-rejected-1', claimId: 'claim-1' },
      expect.anything()
    );
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-closed-unmerged',
        processingToken: mockToken,
        status: 'completed',
      }),
      expect.anything()
    );
    expect(mockDbOps.atomicProcessPrMerge).not.toHaveBeenCalled();
  });

  it('rejects with 403 Forbidden when merged PR author does not match claimant verified numeric GitHub ID', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-1',
          task_id: 'task-1',
          user_id: 'dev-user-alice',
          claim_id: 'claim-1',
          pr_number: '42',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1', reward_amount: 500 },
        },
      ],
      error: null,
    });
    // Claimant Alice has github_id: 11111
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dev-user-alice',
        github_id: '11111',
        username: 'alice',
      },
      error: null,
    });

    // PR author is Eve (id: 99999)
    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 42,
          html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          merged: true,
          merged_at: '2026-10-16T10:00:00Z',
          user: { id: 99999, login: 'eve-attacker' },
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-impersonation-attack' }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Contributor identity mismatch: PR author does not match claimant verified GitHub ID/i);

    // Zero financial mutations executed!
    expect(mockDbOps.atomicProcessPrMerge).not.toHaveBeenCalled();
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-impersonation-attack',
        processingToken: mockToken,
        status: 'failed',
      }),
      expect.anything()
    );
  });

  it('rejects with 403 Forbidden when claimant has no verified numeric github_id (zero-trust enforcement)', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-legacy-1',
          task_id: 'task-1',
          user_id: 'dev-user-unlinked',
          claim_id: 'claim-1',
          pr_number: '42',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1', reward_amount: 500 },
        },
      ],
      error: null,
    });
    // Claimant has NO github_id linked
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dev-user-unlinked',
        github_id: null,
        username: 'octocat-dev',
      },
      error: null,
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 42,
          html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          merged: true,
          merged_at: '2026-10-16T10:00:00Z',
          user: { id: 12345, login: 'octocat-dev' },
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-unlinked-account' }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Contributor identity mismatch: PR author does not match claimant verified GitHub ID/i);
    expect(mockDbOps.atomicProcessPrMerge).not.toHaveBeenCalled();
  });

  it('verifies merged PR with matching numeric GitHub ID and executes atomic settlement with fencing token', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'repo-1',
        owner: 'octocat',
        name: 'spoon-knife',
        github_repo_id: 'octocat/spoon-knife',
        opted_in: true,
      },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-1',
          task_id: 'task-1',
          user_id: 'dev-user-1',
          claim_id: 'claim-1',
          pr_url: 'https://github.com/octocat/spoon-knife/pull/42',
          pr_number: '42',
          pr_status: 'pending',
          tasks: {
            id: 'task-1',
            repository_id: 'repo-1',
            reward_amount: 500,
            reward_currency: 'INR',
            issue_url: 'https://github.com/octocat/spoon-knife/issues/42',
          },
        },
      ],
      error: null,
    });
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dev-user-1',
        github_id: '12345',
        username: 'octocat-dev',
      },
      error: null,
    });
    mockDbOps.atomicProcessPrMerge.mockResolvedValueOnce({
      success: true,
      submission_id: 'sub-1',
      contribution_id: 'contrib-1',
      transaction_id: 'tx-1',
      reward_amount: 500,
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 42,
          html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          merged: true,
          merged_at: '2026-10-16T10:00:00Z',
          merge_commit_sha: 'sha-webhook-merged-999',
          user: { id: 12345, login: 'octocat-dev' },
        },
        repository: {
          owner: { login: 'octocat' },
          name: 'spoon-knife',
        },
      },
      { deliveryId: 'deliv-valid-merge' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.contribution_id).toBe('contrib-1');

    expect(mockDbOps.atomicProcessPrMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: 'sub-1',
        reviewer: 'octocat',
        githubRepoId: 'octocat/spoon-knife',
        githubIssueNumber: 42,
        prNumber: 42,
        prAuthorGithubId: '12345',
        mergeCommitSha: 'sha-webhook-merged-999',
      }),
      expect.anything()
    );

    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-valid-merge',
        processingToken: mockToken,
        status: 'completed',
        payloadSummary: expect.objectContaining({ contribution_id: 'contrib-1' }),
      }),
      expect.anything()
    );
  });

  it('propagates 500 error when atomic settlement fails in database', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-1',
          task_id: 'task-1',
          user_id: 'dev-user-1',
          claim_id: 'claim-1',
          pr_number: '42',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1' },
        },
      ],
      error: null,
    });
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-user-1', github_id: '12345' },
      error: null,
    });
    mockDbOps.atomicProcessPrMerge.mockResolvedValueOnce({
      success: false,
      error: 'Deadlock detected during wallet settlement',
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 42,
          merged: true,
          html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          user: { id: 12345, login: 'octocat-dev' },
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-settlement-fail' }
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Deadlock detected during wallet settlement');
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-settlement-fail',
        processingToken: mockToken,
        status: 'failed',
      }),
      expect.anything()
    );
  });

  it('rejects unmerged PR closure with 500 when claim ID does not belong to submission', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-mismatch-1',
          task_id: 'task-1',
          user_id: 'dev-user-1',
          claim_id: 'claim-actual',
          pr_number: '55',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1' },
        },
      ],
      error: null,
    });
    mockDbOps.atomicProcessPrClosure.mockResolvedValueOnce({
      success: false,
      error: 'Claim does not belong to the specified submission',
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 55,
          merged: false,
          html_url: 'https://github.com/octocat/spoon-knife/pull/55',
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-claim-mismatch' }
    );

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Claim does not belong to the specified submission/i);
  });

  it('handles post-commit recovery idempotency: retried webhook after commit succeeds without duplicate payout', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'repo-1', owner: 'octocat', name: 'spoon-knife', opted_in: true },
      error: null,
    });
    mockSupabase.eq.mockResolvedValueOnce({
      data: [
        {
          id: 'sub-1',
          task_id: 'task-1',
          user_id: 'dev-user-1',
          claim_id: 'claim-1',
          pr_number: '42',
          pr_status: 'pending',
          tasks: { id: 'task-1', repository_id: 'repo-1', reward_amount: 500 },
        },
      ],
      error: null,
    });
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-user-1', github_id: '12345' },
      error: null,
    });
    // atomic_process_pr_merge returns idempotent success (already merged in previous attempt)
    mockDbOps.atomicProcessPrMerge.mockResolvedValueOnce({
      success: true,
      idempotent: true,
      submission_id: 'sub-1',
      contribution_id: 'contrib-1',
      transaction_id: 'tx-1',
      message: 'Submission already merged and settled',
    });

    const req = createSignedRequest(
      {
        action: 'closed',
        pull_request: {
          number: 42,
          merged: true,
          html_url: 'https://github.com/octocat/spoon-knife/pull/42',
          user: { id: 12345, login: 'octocat-dev' },
        },
        repository: { owner: { login: 'octocat' }, name: 'spoon-knife' },
      },
      { deliveryId: 'deliv-retried-after-disconnect' }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockDbOps.atomicCompleteWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'deliv-retried-after-disconnect',
        processingToken: mockToken,
        status: 'completed',
      }),
      expect.anything()
    );
  });
});
