import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/cron/expire-claims/route";

const { mockSupabase, mockQueryBuilder } = vi.hoisted(() => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
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

import { expireStaleClaims } from "@/lib/db-operations";

describe("Phase A: Cron Expire Claims Route & DB Operation Unit Tests", () => {
  const CRON_SECRET = "test-cron-secret-1234567890";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe("Route Handler Authorization & Execution", () => {
    it("TC-01: Rejects request with 401 when Authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/expire-claims", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("TC-01b: Rejects request with 401 when Authorization token is incorrect", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/expire-claims", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-secret",
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("TC-02: Returns 200 with result when Authorization header matches CRON_SECRET", async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          ok: true,
          expired_claims_count: 3,
          timestamp: new Date().toISOString(),
        },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/cron/expire-claims", {
        method: "GET",
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
        },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.expired_claims_count).toBe(3);
      expect(json.timestamp).toBeDefined();
    });

    it("TC-10: Returns 500 when RPC returns an error", async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Database connection failed" },
      });

      const req = new NextRequest("http://localhost:3000/api/cron/expire-claims", {
        method: "POST",
        headers: {
          authorization: `Bearer ${CRON_SECRET}`,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Database connection failed");
    });
  });

  describe("lib/db-operations.ts: expireStaleClaims", () => {
    it("TC-03: Calls atomic_expire_stale_claims RPC and returns expired count", async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          ok: true,
          expired_claims_count: 5,
        },
        error: null,
      });

      const result = await expireStaleClaims();
      expect(mockSupabase.rpc).toHaveBeenCalledWith("atomic_expire_stale_claims");
      expect(result.ok).toBe(true);
      expect(result.expiredClaimsCount).toBe(5);
    });

    it("TC-08: Idempotency: second run returns 0 when no new stale claims exist", async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          ok: true,
          expired_claims_count: 0,
        },
        error: null,
      });

      const result = await expireStaleClaims();
      expect(result.ok).toBe(true);
      expect(result.expiredClaimsCount).toBe(0);
    });

    it("TC-10b: Returns ok: false with error message on RPC failure", async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: "insufficient_privilege: requires service_role" },
      });

      const result = await expireStaleClaims();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("insufficient_privilege");
    });
  });
});
