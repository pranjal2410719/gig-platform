#!/usr/bin/env python3
"""
Real PostgreSQL Two-Connection Concurrency Integration Test
Validates that:
1. Interleaving 1: Developer submission obtaining the lock first prevents claim expiration.
2. Interleaving 2: Claim expiration obtaining the lock first rejects subsequent submissions cleanly.
"""

import os
import subprocess
import time
import sys

PG_HOST = os.environ.get("PG_HOST", "127.0.0.1")
PG_PORT = os.environ.get("PG_PORT", "5433")
PG_USER = os.environ.get("PG_USER", "postgres")
PG_DB = os.environ.get("PG_DB", "gig_test")
os.environ["PGPASSWORD"] = os.environ.get("PGPASSWORD", "postgres")


class PsqlSession:
    def __init__(self, name):
        self.name = name
        self.proc = subprocess.Popen(
            [
                "psql",
                "-h", PG_HOST,
                "-p", PG_PORT,
                "-U", PG_USER,
                "-d", PG_DB,
                "-q",
                "-v", "ON_ERROR_STOP=1",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def execute(self, sql):
        marker = f"__MARKER_{time.time_ns()}__"
        cmd = f"{sql}\n\\echo '{marker}'\n"
        self.proc.stdin.write(cmd)
        self.proc.stdin.flush()

        out_lines = []
        while True:
            line = self.proc.stdout.readline()
            if not line:
                err = self.proc.stderr.read()
                raise RuntimeError(f"[{self.name}] psql closed unexpectedly: {err}")
            if marker in line:
                break
            out_lines.append(line)
        return "".join(out_lines).strip()

    def close(self):
        try:
            self.proc.stdin.write("\\q\n")
            self.proc.stdin.flush()
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()


def apply_migrations():
    print("Applying schema and migrations to test database...")
    setup_sql = """
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;

    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'; $$;
    """
    p = subprocess.run(
        ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_DB, "-c", setup_sql],
        capture_output=True, text=True
    )
    if p.returncode != 0:
        raise RuntimeError(f"Failed to setup auth schema: {p.stderr}")

    with open("supabase/migrations/0000_init.sql") as f:
        init_sql = f.read()
    p = subprocess.run(
        ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_DB, "-c", init_sql],
        capture_output=True, text=True
    )
    if p.returncode != 0:
        raise RuntimeError(f"Failed to apply 0000_init.sql: {p.stderr}")

    with open("supabase/migrations/0014_atomic_expire_stale_claims.sql") as f:
        mig14_sql = f.read()
    p = subprocess.run(
        ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_DB, "-c", mig14_sql],
        capture_output=True, text=True
    )
    if p.returncode != 0:
        raise RuntimeError(f"Failed to apply 0014 migration: {p.stderr}")
    print("Schema and migrations applied successfully.")


def run_concurrency_tests():
    conn_dev = PsqlSession("Developer-Conn")
    conn_cron = PsqlSession("Cron-Conn")

    try:
        # Seed test repository and developer user
        repo_id = "11111111-0000-0000-0000-000000000001"
        dev_user_id = "22222222-0000-0000-0000-000000000002"
        seed_sql = f"""
        INSERT INTO auth.users (id, email) VALUES ('{dev_user_id}', 'dev@test.com') ON CONFLICT DO NOTHING;
        INSERT INTO public.repositories (id, github_repo_id, name, owner, url)
        VALUES ('{repo_id}', 'repo-1', 'test-repo', 'braynix', 'https://github.com/braynix/test-repo')
        ON CONFLICT DO NOTHING;
        """
        conn_cron.execute(seed_sql)

        # -------------------------------------------------------------
        # Test Case 1: Interleaving 1 - Developer submission locks first
        # -------------------------------------------------------------
        print("\n--- Running Interleaving 1: Submission Locks Claim First ---")
        task1_id = "aaaaaaaa-1111-0000-0000-000000000001"
        claim1_id = "aaaaaaaa-2222-0000-0000-000000000002"

        # Claim expires in 1 second
        conn_cron.execute(f"""
        INSERT INTO public.tasks (id, repository_id, title, status)
        VALUES ('{task1_id}', '{repo_id}', 'Interleaving Task 1', 'open') ON CONFLICT DO NOTHING;

        INSERT INTO public.claims (id, task_id, user_id, status, expires_at)
        VALUES ('{claim1_id}', '{task1_id}', '{dev_user_id}', 'active', NOW() + INTERVAL '1 second')
        ON CONFLICT (id) DO UPDATE SET status = 'active', expires_at = NOW() + INTERVAL '1 second';
        """)

        # 1. Connection 1 (Dev) begins transaction and inserts submission
        conn_dev.execute("BEGIN;")
        conn_dev.execute(f"""
        INSERT INTO public.submissions (task_id, user_id, claim_id, pr_url, pr_status)
        VALUES ('{task1_id}', '{dev_user_id}', '{claim1_id}', 'https://github.com/braynix/test-repo/pull/1', 'pending');
        """)
        print("[Dev-Conn] Transaction active: Submission inserted, row-lock held on claim.")

        # 2. Connection 2 (Cron) runs sweep while Dev holds the row-lock
        # Candidate selection uses FOR UPDATE SKIP LOCKED -> skips claim1_id without blocking
        sweep1 = conn_cron.execute("SELECT public.atomic_expire_stale_claims();")
        print(f"[Cron-Conn] Sweep during active submission: {sweep1}")
        assert '"expired_claims_count": 0' in sweep1, f"Expected 0 expired claims during in-flight lock, got: {sweep1}"

        # 3. Connection 1 commits
        conn_dev.execute("COMMIT;")
        print("[Dev-Conn] Transaction committed: Submission persisted, row-lock released.")

        # 4. Wait for the 1-second expiry window to elapse
        time.sleep(1.2)

        # 5. Connection 2 runs sweep again (claim's expires_at is now in the past)
        # Because pending submission exists, NOT EXISTS evaluates to FALSE -> claim is preserved!
        sweep2 = conn_cron.execute("SELECT public.atomic_expire_stale_claims();")
        print(f"[Cron-Conn] Sweep after deadline with pending submission: {sweep2}")
        assert '"expired_claims_count": 0' in sweep2, f"Expected 0 expired claims, got: {sweep2}"

        # 6. Verify claim and submission status
        claim1_status = conn_cron.execute(f"SELECT status FROM public.claims WHERE id = '{claim1_id}';")
        sub1_status = conn_cron.execute(f"SELECT pr_status FROM public.submissions WHERE claim_id = '{claim1_id}';")
        print(f"[Verify] Claim status: {claim1_status}, Submission status: {sub1_status}")
        assert "active" in claim1_status, f"Claim should still be active, got {claim1_status}"
        assert "pending" in sub1_status, f"Submission should be pending, got {sub1_status}"
        print("✓ Interleaving 1 PASSED: On-time submission was safely protected from expiration.")

        # -------------------------------------------------------------
        # Test Case 2: Interleaving 2 - Expiration locks first
        # -------------------------------------------------------------
        print("\n--- Running Interleaving 2: Expiration Locks Claim First ---")
        task2_id = "bbbbbbbb-1111-0000-0000-000000000001"
        claim2_id = "bbbbbbbb-2222-0000-0000-000000000002"

        # Stale claim expired 5 minutes ago with no submissions
        conn_cron.execute(f"""
        INSERT INTO public.tasks (id, repository_id, title, status)
        VALUES ('{task2_id}', '{repo_id}', 'Interleaving Task 2', 'open') ON CONFLICT DO NOTHING;

        INSERT INTO public.claims (id, task_id, user_id, status, expires_at)
        VALUES ('{claim2_id}', '{task2_id}', '{dev_user_id}', 'active', NOW() - INTERVAL '5 minutes')
        ON CONFLICT (id) DO UPDATE SET status = 'active', expires_at = NOW() - INTERVAL '5 minutes';
        """)

        # 1. Connection 2 (Cron) runs sweep and expires the stale claim
        sweep_expire = conn_cron.execute("SELECT public.atomic_expire_stale_claims();")
        print(f"[Cron-Conn] Stale claim expiration sweep: {sweep_expire}")
        assert '"expired_claims_count": 1' in sweep_expire or '"expired_claims_count": 2' in sweep_expire

        claim2_status = conn_cron.execute(f"SELECT status FROM public.claims WHERE id = '{claim2_id}';")
        print(f"[Verify] Stale claim status: {claim2_status}")
        assert "expired" in claim2_status, f"Claim should be expired, got {claim2_status}"

        # 2. Connection 1 (Dev) attempts to submit against the expired claim
        # Trigger trg_enforce_active_claim_on_submission must raise check_violation
        insert_cmd = f"""
        INSERT INTO public.submissions (task_id, user_id, claim_id, pr_url, pr_status)
        VALUES ('{task2_id}', '{dev_user_id}', '{claim2_id}', 'https://github.com/braynix/test-repo/pull/2', 'pending');
        """
        p_sub = subprocess.run(
            ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_DB, "-c", insert_cmd],
            capture_output=True, text=True
        )
        print(f"[Dev-Conn] Attempt to submit on expired claim result (return code {p_sub.returncode}):")
        print(f"[Dev-Conn] stderr: {p_sub.stderr.strip()}")

        assert p_sub.returncode != 0, "Expected submission insert to fail with exception, but it succeeded!"
        assert "check_violation" in p_sub.stderr or "Cannot submit PR for claim" in p_sub.stderr, (
            f"Expected check_violation error, got: {p_sub.stderr}"
        )

        # 3. Verify zero submissions exist for claim2
        sub2_count = conn_cron.execute(f"SELECT count(*) FROM public.submissions WHERE claim_id = '{claim2_id}';")
        print(f"[Verify] Submissions count for expired claim: {sub2_count}")
        assert "0" in sub2_count, f"Expected 0 submissions, got: {sub2_count}"
        print("✓ Interleaving 2 PASSED: Post-expiration submission was rejected cleanly; zero orphaned rows created.")

        print("\n========================================================")
        print("ALL REAL POSTGRESQL CONCURRENCY TESTS PASSED SUCCESSFULLY!")
        print("========================================================")

    finally:
        conn_dev.close()
        conn_cron.close()


if __name__ == "__main__":
    apply_migrations()
    run_concurrency_tests()
