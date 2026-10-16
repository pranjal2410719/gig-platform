#!/usr/bin/env python3
import threading, time, subprocess, json, os, sys

# Helper to run psql function and capture output

def run_psql(sql):
    result = subprocess.run(['psql', '-d', 'gig_test', '-c', sql, '-t', '-A', '-F', ',' ], capture_output=True, text=True)
    return result.stdout.strip()

# Worker 1: invoke atomic_process_pr_merge
def merge_worker(submission_id):
    sql = f"SELECT public.atomic_process_pr_merge('{submission_id}', 'reviewer', NOW(), 'repo', 1, 1, '11111', 'sha');"
    out = run_psql(sql)
    print('Merge worker output:', out)

# Worker 2: invoke atomic_expire_stale_claims (cron sweep)
def expire_worker():
    sql = "SELECT public.atomic_expire_stale_claims();"
    out = run_psql(sql)
    print('Expire worker output:', out)

# Setup: create a task, claim, submission
setup_sql = """
INSERT INTO public.tasks (id, repository_id, title, status, reward_amount, reward_currency) VALUES (uuid_generate_v4(), uuid_generate_v4(), 'Test task', 'open', 100, 'INR');
INSERT INTO public.claims (id, task_id, user_id, status) VALUES (uuid_generate_v4(), (SELECT id FROM public.tasks LIMIT 1), uuid_generate_v4(), 'active');
INSERT INTO public.submissions (id, task_id, user_id, claim_id, pr_url, pr_status) VALUES (uuid_generate_v4(), (SELECT id FROM public.tasks LIMIT 1), uuid_generate_v4(), (SELECT id FROM public.claims LIMIT 1), 'http://example.com/pr', 'pending');
"""
run_psql(setup_sql)
# Get the submission id
sub_id = subprocess.check_output(['psql', '-d', 'gig_test', '-t', '-c', "SELECT id FROM public.submissions LIMIT 1;"], text=True).strip()
print('Submission ID:', sub_id)

t1 = threading.Thread(target=merge_worker, args=(sub_id,))
 t2 = threading.Thread(target=expire_worker)

t1.start(); t2.start()
 t1.join(); t2.join()
"
