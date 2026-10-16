import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockSupabase, mockQueryBuilder } = vi.hoisted(() => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const mockSupabase = {
    from: vi.fn().mockReturnValue(mockQueryBuilder),
    rpc: vi.fn(),
  };
  return { mockSupabase, mockQueryBuilder };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
  createServerClientWithCookies: vi.fn().mockResolvedValue(mockSupabase),
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "dev-user-123",
    role: "developer",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { expireStaleClaims, submitPR, getActiveClaimForUserAndTask } from "@/lib/db-operations";
import { submitPrAction } from "@/app/actions/dev-loop";

describe("Phase A Client Concurrency Flow: App Action & DB Operation Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Scenario 1: On-time submission creation succeeds and cron sweep yields 0 expired claims", async () => {
    const mockClaim = {
      id: "claim-active-1",
      task_id: "task-100",
      user_id: "dev-user-123",
      status: "active",
      expires_at: new Date(Date.now() + 500).toISOString(),
    };

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: mockClaim,
      error: null,
    });

    const activeClaim = await getActiveClaimForUserAndTask("task-100", "dev-user-123");
    expect(activeClaim).not.toBeNull();
    expect(activeClaim?.status).toBe("active");

    const mockCreatedSubmission = {
      id: "sub-100",
      task_id: "task-100",
      user_id: "dev-user-123",
      claim_id: "claim-active-1",
      pr_url: "https://github.com/org/repo/pull/1",
      pr_status: "pending",
      revision_number: 1,
    };

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: mockCreatedSubmission,
      error: null,
    });

    const submission = await submitPR({
      task_id: "task-100",
      user_id: "dev-user-123",
      claim_id: "claim-active-1",
      pr_url: "https://github.com/org/repo/pull/1",
      pr_number: "1",
    });

    expect(submission).not.toBeNull();
    expect(submission?.pr_status).toBe("pending");

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        ok: true,
        expired_claims_count: 0,
        timestamp: new Date().toISOString(),
      },
      error: null,
    });

    const sweepResult = await expireStaleClaims();
    expect(sweepResult.ok).toBe(true);
    expect(sweepResult.expiredClaimsCount).toBe(0);
  });

  it("Scenario 2: Post-expiration submission is blocked by action check", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        success: true,
        ok: true,
        expired_claims_count: 1,
        timestamp: new Date().toISOString(),
      },
      error: null,
    });

    const sweepResult = await expireStaleClaims();
    expect(sweepResult.ok).toBe(true);
    expect(sweepResult.expiredClaimsCount).toBe(1);

    // submitPrAction calls: 1. getTaskById, 2. getRepositoryById, 3. getActiveClaimForUserAndTask
    mockQueryBuilder.maybeSingle
      .mockResolvedValueOnce({
        data: { id: "task-100", repository_id: "repo-100", title: "Test Task" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "repo-100", owner: "org", name: "repo" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null, // Claim expired: no active claim returned
        error: null,
      });

    const formData = new FormData();
    formData.append("taskId", "task-100");
    formData.append("prUrl", "https://github.com/org/repo/pull/1");

    const actionResult = await submitPrAction({ ok: false }, formData);

    expect(actionResult.ok).toBe(false);
    expect(actionResult.message).toContain("Claim this issue first before submitting a PR");
  });

  it("Scenario 3: submitPR handles database trigger rejection with check_violation cleanly", async () => {
    mockQueryBuilder.maybeSingle.mockReset();
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Cannot submit PR for claim claim-expired: claim expired",
        code: "23514",
      },
    });

    const submission = await submitPR({
      task_id: "task-100",
      user_id: "dev-user-123",
      claim_id: "claim-expired",
      pr_url: "https://github.com/org/repo/pull/1",
    });

    expect(submission).toBeNull();
  });
});
