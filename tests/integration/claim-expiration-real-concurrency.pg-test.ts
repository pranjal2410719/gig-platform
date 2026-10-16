import { describe, it, expect, beforeAll, afterAll } from "vitest";
// @ts-ignore
import { Client } from "pg";

/**
 * Real PostgreSQL Concurrency Integration Test
 *
 * Requirements:
 * 1. Requires a live PostgreSQL database with migration 0014 applied (e.g. Supabase local or CI test container).
 * 2. Uses two separate, unpooled database client connections to simulate real transactional concurrency.
 * 3. Verified across both interleavings:
 *    - Submission locks claim first -> expiration sweep skips and does NOT invalidate pending submission.
 *    - Expiration locks claim first -> subsequent submission is rejected with check_violation.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "Real PostgreSQL Concurrency: Two-Connection Interleaving Verification",
  () => {
    let connDev: Client;
    let connCron: Client;

    beforeAll(async () => {
      connDev = new Client({ connectionString: TEST_DATABASE_URL });
      connCron = new Client({ connectionString: TEST_DATABASE_URL });
      await connDev.connect();
      await connCron.connect();
    });

    afterAll(async () => {
      await connDev.end();
      await connCron.end();
    });

    it("Interleaving 1: Developer submission obtains lock first -> expiration does NOT invalidate pending submission", async () => {
      const claimId = "11111111-1111-1111-1111-111111111111";
      const taskId = "22222222-2222-2222-2222-222222222222";
      const userId = "33333333-3333-3333-3333-333333333333";

      // Seed task and active claim nearing expiry (1 second left)
      await connCron.query(`
        INSERT INTO public.tasks (id, repository_id, title, status)
        VALUES ('${taskId}', (SELECT id FROM public.repositories LIMIT 1), 'Concurrency Task 1', 'open')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.claims (id, task_id, user_id, status, expires_at)
        VALUES ('${claimId}', '${taskId}', '${userId}', 'active', NOW() + INTERVAL '1 second')
        ON CONFLICT (id) DO UPDATE SET status = 'active', expires_at = NOW() + INTERVAL '1 second';
      `);

      // Connection 1 (Dev) begins transaction and inserts submission
      await connDev.query("BEGIN;");
      await connDev.query(`
        INSERT INTO public.submissions (task_id, user_id, claim_id, pr_url, pr_status)
        VALUES ('${taskId}', '${userId}', '${claimId}', 'https://github.com/org/repo/pull/1', 'pending');
      `);
      // Row lock on claimId is actively held by connDev until COMMIT

      // Connection 2 (Cron) runs atomic_expire_stale_claims while connDev holds lock
      // Candidate query uses FOR UPDATE SKIP LOCKED -> skips the in-flight locked claimId
      const sweep1 = await connCron.query("SELECT public.atomic_expire_stale_claims() AS result;");
      expect(sweep1.rows[0].result.expired_claims_count).toBe(0);

      // Connection 1 commits
      await connDev.query("COMMIT;");

      // Wait for the 1-second expiry window to elapse
      await new Promise((r) => setTimeout(r, 1100));

      // Connection 2 runs sweep again
      // NOT EXISTS (SELECT 1 FROM submissions WHERE claim_id = c.id AND pr_status IN ('pending', 'merged')) evaluates to FALSE
      const sweep2 = await connCron.query("SELECT public.atomic_expire_stale_claims() AS result;");
      expect(sweep2.rows[0].result.expired_claims_count).toBe(0);

      // Verify claim status remains 'active'
      const claimCheck = await connCron.query(`SELECT status FROM public.claims WHERE id = '${claimId}';`);
      expect(claimCheck.rows[0].status).toBe("active");

      // Verify submission remains 'pending'
      const subCheck = await connCron.query(`SELECT pr_status FROM public.submissions WHERE claim_id = '${claimId}';`);
      expect(subCheck.rows[0].pr_status).toBe("pending");
    });

    it("Interleaving 2: Expiration obtains lock first -> subsequent submission is rejected with check_violation", async () => {
      const claimId = "44444444-4444-4444-4444-444444444444";
      const taskId = "55555555-5555-5555-5555-555555555555";
      const userId = "66666666-6666-6666-6666-666666666666";

      // Seed stale claim (expired 5 minutes ago, no submissions)
      await connCron.query(`
        INSERT INTO public.tasks (id, repository_id, title, status)
        VALUES ('${taskId}', (SELECT id FROM public.repositories LIMIT 1), 'Stale Task 2', 'open')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.claims (id, task_id, user_id, status, expires_at)
        VALUES ('${claimId}', '${taskId}', '${userId}', 'active', NOW() - INTERVAL '5 minutes')
        ON CONFLICT (id) DO UPDATE SET status = 'active', expires_at = NOW() - INTERVAL '5 minutes';
      `);

      // Connection 2 (Cron) runs sweep and transitions claim to 'expired'
      const sweep = await connCron.query("SELECT public.atomic_expire_stale_claims() AS result;");
      expect(sweep.rows[0].result.expired_claims_count).toBeGreaterThanOrEqual(1);

      const claimCheck = await connCron.query(`SELECT status FROM public.claims WHERE id = '${claimId}';`);
      expect(claimCheck.rows[0].status).toBe("expired");

      // Connection 1 (Dev) attempts to submit against the expired claim
      let submissionError: any = null;
      try {
        await connDev.query(`
          INSERT INTO public.submissions (task_id, user_id, claim_id, pr_url, pr_status)
          VALUES ('${taskId}', '${userId}', '${claimId}', 'https://github.com/org/repo/pull/2', 'pending');
        `);
      } catch (err) {
        submissionError = err;
      }

      // Trigger rejected the insert with check_violation
      expect(submissionError).not.toBeNull();
      expect(submissionError.message).toContain("Cannot submit PR for claim");

      // Verify zero submissions were created for this claim
      const subCount = await connCron.query(`SELECT COUNT(*) FROM public.submissions WHERE claim_id = '${claimId}';`);
      expect(Number(subCount.rows[0].count)).toBe(0);
    });
  }
);
