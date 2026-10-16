import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin, supabase } from "@/lib/supabaseClient";
import {
  atomicClaimWebhookDelivery,
  atomicCompleteWebhookDelivery,
  atomicProcessPrMerge,
  atomicProcessPrClosure,
} from "@/lib/db-operations";

export const dynamic = "force-dynamic";

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;
  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const sigBuffer = Buffer.from(parts[1], "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

interface GitHubWebhookPayload {
  action?: string;
  pull_request?: {
    number?: number;
    html_url?: string;
    merged?: boolean;
    merged_at?: string | null;
    merge_commit_sha?: string | null;
    user?: {
      id?: number;
      login?: string;
    };
  };
  repository?: {
    name?: string;
    owner?: {
      login?: string;
    };
  };
}

interface SubmissionWithTask {
  id: string;
  task_id: string;
  user_id: string;
  claim_id: string;
  pr_url: string;
  pr_number: string | null;
  pr_status: string;
  tasks: {
    id: string;
    repository_id: string;
    reward_amount: number | null;
    reward_currency: string | null;
    issue_url: string | null;
  } | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const deliveryId = req.headers.get("x-github-delivery");
  const event = req.headers.get("x-github-event");

  // 1. Mandatory Webhook Authentication & Signature Verification
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Webhook Security Error] GITHUB_WEBHOOK_SECRET is not configured in production");
      return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
    }
  } else {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Fast response for ping events
  if (event === "ping") {
    return NextResponse.json({ message: "pong" }, { status: 200 });
  }

  // Ignore non-PR events
  if (event !== "pull_request") {
    return NextResponse.json({ message: `Ignored event: ${event}` }, { status: 200 });
  }

  // Enforce mandatory delivery ID
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 });
  }

  let body: GitHubWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { action, pull_request, repository } = body;

  const client = supabaseAdmin ?? supabase;
  if (!client) {
    return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
  }

  // 2. Durable Delivery Idempotency with Fencing Token
  const claimRes = await atomicClaimWebhookDelivery(
    {
      deliveryId,
      eventType: event,
      prNumber: pull_request?.number ?? null,
    },
    client,
  );

  if (claimRes.error) {
    console.error(`[Webhook Error] atomic_claim_webhook_delivery failed: ${claimRes.error}`);
    return NextResponse.json(
      { error: `Database operation unavailable: ${claimRes.error}` },
      { status: 500 },
    );
  }

  if (!claimRes.can_process) {
    return NextResponse.json(
      { message: `Delivery already processed or currently in progress (${claimRes.status})` },
      { status: 200 },
    );
  }

  const processingToken = claimRes.processing_token;
  if (!processingToken) {
    return NextResponse.json(
      { error: "Database operation unavailable: failed to acquire processing lease token" },
      { status: 500 },
    );
  }

  const prNumber = pull_request?.number;
  const prHtmlUrl = pull_request?.html_url;
  const repoOwner = repository?.owner?.login;
  const repoName = repository?.name;
  const prAuthorId = pull_request?.user?.id ? String(pull_request.user.id) : null;
  const prAuthorLogin = pull_request?.user?.login ? String(pull_request.user.login).toLowerCase() : null;
  const mergeCommitSha = pull_request?.merge_commit_sha || null;

  if (!prNumber || !repoOwner || !repoName) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: "Missing required PR/repo metadata" },
      client,
    );
    return NextResponse.json({ error: "Missing required PR/repo metadata" }, { status: 400 });
  }

  // 3. Locate & Authorize Repository (Must be registered AND opted_in)
  const { data: repoRecord, error: repoErr } = await client
    .from("repositories")
    .select("id, owner, name, github_repo_id, opted_in")
    .ilike("owner", repoOwner)
    .ilike("name", repoName)
    .maybeSingle();

  if (repoErr) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: repoErr.message },
      client,
    );
    return NextResponse.json({ error: `Repository query failed: ${repoErr.message}` }, { status: 500 });
  }

  if (!repoRecord) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "ignored", payloadSummary: { reason: "unregistered_repo" } },
      client,
    );
    return NextResponse.json({ message: "Repository not registered on platform" }, { status: 200 });
  }

  if (!repoRecord.opted_in) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "ignored", payloadSummary: { reason: "repo_not_opted_in" } },
      client,
    );
    return NextResponse.json({ message: "Repository is not opted into the bounty network" }, { status: 200 });
  }

  // 4. Locate Pending Submission for this Repository & PR
  const { data: submissions, error: subErr } = await client
    .from("submissions")
    .select("id, task_id, user_id, claim_id, pr_url, pr_number, pr_status, tasks(id, repository_id, reward_amount, reward_currency, issue_url)")
    .eq("pr_status", "pending");

  if (subErr) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: subErr.message },
      client,
    );
    return NextResponse.json({ error: `Submissions query failed: ${subErr.message}` }, { status: 500 });
  }

  const candidateSubmissions = (submissions ?? []) as unknown as SubmissionWithTask[];
  const matchingSubmission = candidateSubmissions.find((s) => {
    const task = s.tasks;
    if (!task || task.repository_id !== repoRecord.id) return false;
    if (s.pr_number && Number(s.pr_number) === Number(prNumber)) return true;
    if (s.pr_url && (s.pr_url === prHtmlUrl || s.pr_url.endsWith(`/pull/${prNumber}`))) return true;
    return false;
  });

  if (!matchingSubmission) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "ignored", payloadSummary: { reason: "no_matching_submission" } },
      client,
    );
    return NextResponse.json({ message: "No active pending submission found for this PR" }, { status: 200 });
  }

  // 5. Handle PR Closed WITHOUT Merging (Action === 'closed', merged === false)
  if (action === "closed" && !pull_request?.merged) {
    const closureRes = await atomicProcessPrClosure(
      {
        submissionId: matchingSubmission.id,
        claimId: matchingSubmission.claim_id,
      },
      client,
    );

    if (!closureRes.success) {
      await atomicCompleteWebhookDelivery(
        { deliveryId, processingToken, status: "failed", errorMessage: closureRes.error },
        client,
      );
      return NextResponse.json({ error: closureRes.error || "Failed to reject unmerged submission" }, { status: 500 });
    }

    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "completed", payloadSummary: { action: "rejected_unmerged_pr" } },
      client,
    );

    return NextResponse.json(
      { message: `PR #${prNumber} closed without merge; submission rejected and claim expired.` },
      { status: 200 },
    );
  }

  // Only proceed to reward settlement if PR was merged
  if (action !== "closed" || !pull_request?.merged) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "ignored", payloadSummary: { reason: "pr_not_merged" } },
      client,
    );
    return NextResponse.json({ message: "PR not merged, ignoring event" }, { status: 200 });
  }

  // 6. Zero-Trust Contributor Identity Binding (Strict numeric GitHub ID required)
  const { data: claimant, error: claimantErr } = await client
    .from("users")
    .select("id, github_id, username")
    .eq("id", matchingSubmission.user_id)
    .maybeSingle();

  if (claimantErr) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: claimantErr.message },
      client,
    );
    return NextResponse.json({ error: `Claimant query failed: ${claimantErr.message}` }, { status: 500 });
  }

  if (!claimant) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: "Claimant profile not found" },
      client,
    );
    return NextResponse.json({ error: "Claimant profile not found" }, { status: 404 });
  }

  // Strict zero-trust: claimant must have verified numeric github_id, and it must equal prAuthorId
  const isAuthorMatch = Boolean(
    prAuthorId &&
    claimant.github_id &&
    String(claimant.github_id) === String(prAuthorId)
  );

  if (!isAuthorMatch) {
    console.error(
      `[Webhook Security Alert] Contributor identity mismatch: PR author id=${prAuthorId} (${prAuthorLogin}) vs Claimant github_id=${claimant.github_id} (${claimant.username})`,
    );
    await atomicCompleteWebhookDelivery(
      {
        deliveryId,
        processingToken,
        status: "failed",
        errorMessage: `Contributor identity mismatch: PR author id=${prAuthorId} vs Claimant github_id=${claimant.github_id}`,
      },
      client,
    );
    return NextResponse.json(
      { error: "Contributor identity mismatch: PR author does not match claimant verified GitHub ID" },
      { status: 403 },
    );
  }

  // 7. Atomic Merge Settlement
  const task = matchingSubmission.tasks;
  const issueNumMatch = task?.issue_url ? task.issue_url.match(/\/issues\/(\d+)/) : null;
  const githubIssueNumber = issueNumMatch ? parseInt(issueNumMatch[1], 10) : null;

  const mergeRes = await atomicProcessPrMerge(
    {
      submissionId: matchingSubmission.id,
      reviewer: repoOwner,
      mergedAt: pull_request.merged_at || new Date().toISOString(),
      githubRepoId: repoRecord.github_repo_id || `${repoOwner}/${repoName}`,
      githubIssueNumber,
      prNumber: Number(prNumber),
      prAuthorGithubId: prAuthorId,
      mergeCommitSha,
    },
    client,
  );

  if (!mergeRes.success) {
    await atomicCompleteWebhookDelivery(
      { deliveryId, processingToken, status: "failed", errorMessage: mergeRes.error },
      client,
    );
    return NextResponse.json({ error: mergeRes.error || "Failed to settle PR merge" }, { status: 500 });
  }

  await atomicCompleteWebhookDelivery(
    {
      deliveryId,
      processingToken,
      status: "completed",
      payloadSummary: {
        submission_id: mergeRes.submission_id,
        contribution_id: mergeRes.contribution_id,
        transaction_id: mergeRes.transaction_id,
        reward_amount: mergeRes.reward_amount,
      },
    },
    client,
  );

  return NextResponse.json(
    {
      ok: true,
      message: `PR #${prNumber} verified and merged via webhook. Reward advanced to AVAILABLE.`,
      contribution_id: mergeRes.contribution_id ?? null,
    },
    { status: 200 },
  );
}
