import { supabaseAdmin, supabase, createServerClientWithCookies } from '@/lib/supabaseClient';
import {
  type Profile,
  type ClaimedTask,
  type WalletTransaction,
  type Submission,
  type SubmissionReview,
  type Contribution,
  type Task,
  getFullProfile,
  getClaimedTasksByUser,
  getWalletTransactions,
  getSubmissionsByUser,
  getContributionsByUser,
  getOpenTasks,
  getOpenTasksWithRepositories,
  getClaimsByUser,
  getRepositories,
  getPendingSubmissionsForCompany,
  countActiveClaimsForTasks,
  cleanGithubHandle,
} from '@/lib/db-operations';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type DashboardRole,
  type DashboardStats,
  type SidebarStats,
  normalizeDisplayName,
  normalizeEmail,
  normalizeHandle,
  getSidebarStatsSync,
} from '@/lib/dashboard-stats-defaults';

export {
  type DashboardRole,
  type DashboardStats,
  type SidebarStats,
  normalizeDisplayName,
  normalizeEmail,
  normalizeHandle,
  getSidebarStatsSync,
};

function supabaseDb(): SupabaseClient | null {
  return supabaseAdmin ?? supabase;
}

function formatBalance(inr: number): string {
  const amount = Number(inr) || 0;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface DeveloperStats {
  reputationScore: string;
  reputationBadge: string;
  reputationFooter: string;
  verifiedContributions: string;
  contributionsFooter: string;
  lockedTasks: string;
  lockedFooter: string;
  walletBalance: string;
  walletFooter: string;
}

const DEV_FALLBACK: DeveloperStats = {
  reputationScore: '0',
  reputationBadge: 'NEW',
  reputationFooter: 'Reputation score based on verified PR contributions',
  verifiedContributions: '0',
  contributionsFooter: 'No verified contributions yet',
  lockedTasks: '0',
  lockedFooter: 'No active escrow locks',
  walletBalance: '₹0',
  walletFooter: 'Ready for UPI bank withdrawal (Min ₹500)',
};

export async function getDeveloperStats(userId?: string): Promise<DeveloperStats> {
  if (userId && supabaseDb()) {
    try {
      const profile = await getFullProfile(userId);
      if (profile.user) {
        const balance = profile.wallet?.available_balance ?? 0;
        return {
          reputationScore: DEV_FALLBACK.reputationScore,
          reputationBadge: DEV_FALLBACK.reputationBadge,
          reputationFooter: DEV_FALLBACK.reputationFooter,
          verifiedContributions: String(profile.contributions_count),
          contributionsFooter: DEV_FALLBACK.contributionsFooter,
          lockedTasks: String(profile.submissions_count),
          lockedFooter: DEV_FALLBACK.lockedFooter,
          walletBalance: `\u20b9${balance}`,
          walletFooter: DEV_FALLBACK.walletFooter,
        };
      }
    } catch {
      // fall through to fallback
    }
  }
  return DEV_FALLBACK;
}

export async function getSidebarStats(role: DashboardRole, userId?: string): Promise<SidebarStats> {
  if (role === 'business') {
    const db = supabaseAdmin !== supabase ? supabaseAdmin : null;
    if (!db || !userId) {
      return getSidebarStatsSync('business');
    }
    try {
      const [walletRes, userRes] = await Promise.all([
        db.from('wallets').select('available_balance').eq('user_id', userId).maybeSingle(),
        db.from('users').select('company').eq('id', userId).maybeSingle(),
      ]);

      if (walletRes.error || userRes.error || walletRes.data == null) {
        return getSidebarStatsSync('business');
      }

      const balance = walletRes.data.available_balance ?? 0;
      const company = userRes.data?.company ?? null;

      let taskBacklog = 0;
      let talentPool = 0;
      if (company) {
        const repoRes = await db.from('repositories').select('id').eq('owner', company);
        const repoIds = (repoRes.data ?? []).map((r: { id: string }) => r.id);
        if (repoIds.length > 0) {
          const scopedTasks = await db
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open')
            .in('repository_id', repoIds);
          taskBacklog = scopedTasks.count ?? 0;
          const scopedClaims = await db
            .from('claims')
            .select('user_id')
            .in('task_id', repoIds)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString());
          if (scopedClaims.data) {
            const uniqueDevs = new Set((scopedClaims.data as any[]).map((c) => c.user_id));
            talentPool = uniqueDevs.size;
          }
        }
      }

      return {
        walletLabel: 'Escrow Vault',
        walletValue: formatBalance(balance),
        walletSubtext: balance > 0 ? 'Funds held in escrow' : 'No transactions yet',
        walletHref: '/dashboard/business?tab=billing',
        counts: {
          'Tasks Backlog': String(taskBacklog),
          'Talent Pool': String(talentPool),
          'Issue Pool': '0',
        },
      };
    } catch {
      return getSidebarStatsSync('business');
    }
  }

  // Independent sources: stats + open-task count resolve in parallel.
  const db = supabaseAdmin !== supabase ? supabaseAdmin : null;
  const [dev, issuePoolCount] = await Promise.all([
    getDeveloperStats(userId),
    (async () => {
      if (!db) return 0;
      try {
        const poolRes = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open');
        return poolRes.count ?? 0;
      } catch {
        return 0;
      }
    })(),
  ]);
  return {
    walletLabel: 'GIG Wallet',
    walletValue: dev.walletBalance,
    walletSubtext: 'Above \u20b9500 UPI threshold',
    walletHref: '/dashboard/developer?tab=wallet',
    reputationValue: dev.reputationScore,
    reputationBadge: dev.reputationBadge,
    counts: {
      Tasks: dev.lockedTasks,
      'Verified PRs': dev.verifiedContributions,
      'Issue Pool': String(issuePoolCount),
    },
  };
}

export async function getDeveloperDashboard(userId: string) {
  let client: SupabaseClient | null = null;
  try {
    client = await createServerClientWithCookies();
  } catch {
    client = null;
  }

  let profile: Profile | null = null;
  let claimedTasks: ClaimedTask[] = [];
  let transactions: WalletTransaction[] = [];
  let submissions: Submission[] = [];
  let contributions: Contribution[] = [];

  if (client) {
    try {
      const [p, c, t, s, co] = await Promise.all([
        getFullProfile(userId, client),
        getClaimedTasksByUser(userId, client),
        getWalletTransactions(userId, client),
        getSubmissionsByUser(userId, client),
        getContributionsByUser(userId, client),
      ]);
      profile = p;
      claimedTasks = c;
      transactions = t;
      submissions = s;
      contributions = co;
    } catch {
      // fall through to fallback
    }
  }

  const user = profile?.user ?? null;
  const wallet = profile?.wallet ?? null;
  const walletBalance = wallet?.available_balance ?? 0;
  const cleanHandle = cleanGithubHandle(user?.github_handle);
  const displayName = cleanHandle || user?.username || user?.email?.split('@')[0] || 'Developer';
  const githubHandle = cleanHandle;

  const stats = profile?.user
    ? {
        reputationScore: '0',
        reputationBadge: 'NEW',
        reputationFooter: 'Reputation not yet calculated',
        verifiedContributions: String(profile.contributions_count),
        contributionsFooter:
          contributions.length > 0
            ? `Across ${new Set(contributions.map((c) => c.task_id)).size} tasks`
            : 'Across 6 production open-source repositories',
        lockedTasks: String(profile.submissions_count),
        lockedFooter: 'Locked escrow \u00b7 48h lock active',
        walletBalance: `\u20b9${walletBalance}`,
        walletFooter: 'Ready for instant UPI bank withdrawal (Min \u20b9500)',
      }
    : null;

  return {
    profile,
    user,
    wallet,
    claimedTasks,
    transactions,
    submissions,
    contributions,
    stats,
    displayName,
    githubHandle,
    handle: user?.email || profile?.user?.email || displayName,
  };
}

export interface WorkspaceMetric {
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}

export interface BacklogTask {
  id: string;
  title: string;
  repo: string;
  budget: string;
  applicantsCount: number;
  status: 'Active' | 'Reviewing' | 'Open for Bids' | 'Queued';
  assignee?: string;
  priority: 'Critical' | 'High' | 'Standard';
  targetRelease: string;
}

export interface TalentContributor {
  id: string;
  name: string;
  githubHandle: string;
  reputation: number;
  mergedPRs: number;
  specialties: string[];
  status: 'Available' | 'Assigned' | 'Top Contributor';
}

export interface EscrowDisbursal {
  id: string;
  date: string;
  recipient: string;
  taskTitle: string;
  amount: string;
  status: 'Settled' | 'Processing';
  txHash: string;
}

export function getWorkspaceMetrics(): WorkspaceMetric[] {
  return [
    { label: 'Active Engineering Bounties', value: '—', subtext: '4 in progress, 4 accepting bids', highlight: true },
    { label: 'Vetted Talent Pool', value: '—', subtext: 'Certified contributors' },
    { label: 'Escrow Vault Secured', value: '—', subtext: 'Held in escrow' },
    { label: 'Avg PR Merge Velocity', value: '—', subtext: 'Automated verification test pass' },
  ];
}

export function getBacklogTasks(): BacklogTask[] {
  return [];
}

export function getTalentPool(): TalentContributor[] {
  return [];
}

export function getRecentDisbursals(): EscrowDisbursal[] {
  return [];
}

export interface BusinessDashboard {
  displayName: string;
  displayEmail: string;
  githubHandle?: string | null;
  company?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  metrics: WorkspaceMetric[];
  backlogTasks: BacklogTask[];
  talentPool: TalentContributor[];
  disbursals: EscrowDisbursal[];
}

export async function getBusinessDashboard(): Promise<BusinessDashboard | null> {
  let client: SupabaseClient | null = null;
  try {
    client = await createServerClientWithCookies();
  } catch {
    client = null;
  }

  let githubHandle: string | null = null;
  let openTasks: Task[] = [];
  let displayName = '';
  let displayEmail = '';
  let company: string | null = null;
  let bio: string | null = null;
  let location: string | null = null;
  let avatar_url: string | null = null;

  if (client) {
    try {
      // R2c: Fetch user and profile first (sequentially), then tasks scoped to company repos.
      const userRes = await client.auth.getUser();
      const user = userRes.data?.user;
      if (user) {
        if (user.email) displayEmail = user.email;

        // Fetch user profile row
        const { data: userRow } = await client
          .from("users")
          .select("username, company, bio, location, avatar_url, github_handle")
          .eq("id", user.id)
          .maybeSingle();

        if (userRow) {
          if (userRow.username) displayName = userRow.username;
          company = userRow.company || null;
          bio = userRow.bio || null;
          location = userRow.location || null;
          avatar_url = userRow.avatar_url || null;
          // Always prefer database github_handle over user_metadata (which may be stale)
          const rowHandle = cleanGithubHandle(userRow.github_handle);
          githubHandle = rowHandle || null;
        }

        // Only fetch tasks for this company's repositories; if no company but github_handle exists, use that.
        const owner = company || githubHandle;
        if (owner) {
          const repos = await getRepositories({ owner }, client);
          const repoIds = repos.map((r) => r.id);
          if (repoIds.length > 0) {
            // Fetch tasks for each repo and flatten; use first repo as filter entry point
            const taskResults = await Promise.all(
              repoIds.map((repoId) => getOpenTasks({ repositoryId: repoId }, client))
            );
            openTasks = taskResults.flat();
          }
        }
      }
    } catch {
      // fall through to fallback
    }
  }

  const backlogTasks: BacklogTask[] =
    openTasks.length > 0
      ? openTasks.map((t) => ({
          id: t.id,
          title: t.title,
          repo: t.technology || t.issue_url?.replace(/^https?:\/\/github\.com\//, '') || 'gig/repo',
          budget: `${t.reward_amount ?? 0} ${t.reward_currency || 'INR'}`,
          applicantsCount: 0,
          status: (t.status === 'open' ? 'Open for Bids' : 'Queued') as BacklogTask['status'],
          priority: (t.difficulty === 'hard' ? 'High' : 'Standard') as BacklogTask['priority'],
          targetRelease: 'v0.1.0',
        }))
      : [];

  return {
    displayName: displayName || 'Business Account',
    displayEmail,
    githubHandle,
    company,
    bio,
    location,
    avatar_url,
    metrics: getWorkspaceMetrics(),
    backlogTasks,
    talentPool: getTalentPool(),
    disbursals: getRecentDisbursals(),
  };
}

export interface IssuePoolIssue {
  id: string;
  title: string;
  repo: string;
  description?: string | null;
  issueUrl?: string | null;
  tags: string[];
  difficulty: string;
  technology?: string | null;
  reward: number;
  rewardCurrency: string;
  createdAt?: string | null;
  timeAgo: string;
  claimedByMe?: boolean;
  submittedByMe?: boolean;
}

export interface IssuePoolJourneyStep {
  num: number;
  title: string;
  desc: string;
}

export interface IssuePoolData {
  role: 'developer' | 'business';
  displayName: string;
  initials: string;
  company: string | null;
  issues: IssuePoolIssue[];
  openCount: number;
  claimedByMe: number;
  claimedTotal: number;
  rewardTotal: number;
  rewardCurrency: string;
  matchScore: string;
  matchLabel: string;
  matchSub: string;
  recommended: string[];
  journey: IssuePoolJourneyStep[];
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return 'recently';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return 'recently';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function initialsFrom(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function issuePoolJourneyFor(role: 'developer' | 'business'): IssuePoolJourneyStep[] {
  if (role === 'business') {
    return [
      { num: 1, title: 'Post issue', desc: 'Create a task spec with clear acceptance criteria' },
      { num: 2, title: 'Fund escrow', desc: 'Rewards stay locked in the vault until verified' },
      { num: 3, title: 'Review PRs', desc: 'Inspect pull requests and accept merged work' },
      { num: 4, title: 'Pay out', desc: 'Verified contributions disburse straight to devs' },
    ];
  }
  return [
    { num: 1, title: 'Browse', desc: 'Pick an issue that matches your skill set' },
    { num: 2, title: 'Claim', desc: 'Lock the issue for up to 48 hours' },
    { num: 3, title: 'Submit PR', desc: 'Open a pull request against the repository' },
    { num: 4, title: 'Get paid', desc: 'Verified PRs credit directly to your wallet' },
  ];
}

function buildEmptyIssuePool(
  role: 'developer' | 'business',
  userId: string,
  name?: string,
  company?: string | null,
): IssuePoolData {
  const displayName =
    name ||
    (role === 'business' ? 'Business Account' : 'Developer');
  return {
    role,
    displayName,
    initials: initialsFrom(displayName) || (role === 'business' ? 'CO' : 'DV'),
    company: company ?? null,
    issues: [],
    openCount: 0,
    claimedByMe: 0,
    claimedTotal: 0,
    rewardTotal: 0,
    rewardCurrency: 'INR',
    matchScore: role === 'business' ? '0%' : '82%',
    matchLabel: role === 'business' ? 'Engagement' : 'Match score',
    matchSub:
      role === 'business'
        ? 'issues claimed by developers'
        : 'how well your profile fits the pool',
    recommended: [],
    journey: issuePoolJourneyFor(role),
  };
}

export async function getIssuePoolData(
  role: 'developer' | 'business',
  userId: string,
): Promise<IssuePoolData> {
  const client: SupabaseClient | null = supabaseAdmin ?? supabase;
  if (!client || !userId) {
    return buildEmptyIssuePool(role, userId);
  }

  try {
    const profile = await getFullProfile(userId, client);
    const user = profile?.user ?? null;
    const company = user?.company ?? null;

    let repositoryIds: string[] | undefined;
    if (role === 'business') {
      // Use company as owner, fallback to github_handle or username if no company set
      const owner = company || cleanGithubHandle(user?.github_handle) || cleanGithubHandle(user?.username);
      if (!owner) {
        return buildEmptyIssuePool(role, userId, user?.username, company);
      }
      const repos = await getRepositories({ owner }, client);
      repositoryIds = repos.map((r) => r.id);
      if (repositoryIds.length === 0) {
        return buildEmptyIssuePool(role, userId, user?.username, company);
      }
    }

    const joined = await getOpenTasksWithRepositories(
      role === 'business' ? { repositoryIds } : {},
      client,
    );

    const issues: IssuePoolIssue[] = joined.map(({ task, repository }) => ({
      id: task.id,
      title: task.title,
      repo: repository ? `${repository.owner}/${repository.name}` : 'gig/repo',
      description: task.description ?? null,
      issueUrl: task.issue_url ?? null,
      tags: [
        ...(task.technology ? [task.technology] : []),
        task.difficulty,
      ],
      difficulty: task.difficulty,
      technology: task.technology ?? null,
      reward: task.reward_amount ?? 0,
      rewardCurrency: task.reward_currency || 'INR',
      createdAt: task.created_at ?? null,
      timeAgo: timeAgo(task.created_at),
    }));

    const openCount = issues.length;
    const rewardTotal = issues.reduce((sum, issue) => sum + issue.reward, 0);

    let claimedByMe = 0;
    let claimedTotal = 0;
    const claimedTaskIds = new Set<string>();
    const submittedTaskIds = new Set<string>();
    if (role === 'developer') {
      // Claims and submissions are independent of each other: fetch in parallel.
      const [claims, submissions] = await Promise.all([
        getClaimsByUser(userId, client),
        getSubmissionsByUser(userId, client),
      ]);
      const nowIso = new Date().toISOString();
      const active = claims.filter((c) => c.status === 'active' && (!c.expires_at || c.expires_at > nowIso));
      claimedByMe = active.length;
      claimedTotal = claimedByMe;
      active.forEach((c) => claimedTaskIds.add(c.task_id));
      submissions.forEach((s) => submittedTaskIds.add(s.task_id));
    } else {
      claimedTotal = await countActiveClaimsForTasks(
        joined.map((j) => j.task.id),
        client,
      );
    }

    const issuesWithClaim: IssuePoolIssue[] = issues.map((issue) =>
      role === 'developer'
        ? {
            ...issue,
            claimedByMe: claimedTaskIds.has(issue.id),
            submittedByMe: submittedTaskIds.has(issue.id),
          }
        : issue,
    );

    const contributionsCount = profile?.contributions_count ?? 0;
    const displayName =
      user?.username ||
      user?.email?.split('@')[0] ||
      (role === 'business' ? 'Business Account' : 'Developer');

    const recommended: string[] =
      role === 'business'
        ? Array.from(
            new Set(
              joined
                .map((j) =>
                  j.repository
                    ? `${j.repository.owner}/${j.repository.name}`
                    : '',
                )
                .filter(Boolean),
            ),
          ).slice(0, 3)
        : Array.from(
            new Set(issues.map((i) => i.technology).filter(Boolean) as string[]),
          ).slice(0, 3);

    const matchScore =
      role === 'business'
        ? `${openCount > 0 ? Math.round((claimedTotal / openCount) * 100) : 0}%`
        : `${Math.min(96, 80 + claimedByMe * 4 + contributionsCount * 2)}%`;

    return {
      role,
      displayName,
      initials: initialsFrom(displayName) || (role === 'business' ? 'CO' : 'DV'),
      company,
      issues: issuesWithClaim,
      openCount,
      claimedByMe,
      claimedTotal,
      rewardTotal,
      rewardCurrency: issues[0]?.rewardCurrency ?? 'INR',
      matchScore,
      matchLabel: role === 'business' ? 'Engagement' : 'Match score',
      matchSub:
        role === 'business'
          ? 'of your issues claimed by devs'
          : 'how well your profile fits the pool',
      recommended,
      journey: issuePoolJourneyFor(role),
    };
  } catch {
    return buildEmptyIssuePool(role, userId);
  }
}

export async function getBusinessReviews(userId?: string): Promise<SubmissionReview[]> {
  if (!userId) return [];
  const client: SupabaseClient | null = supabaseAdmin ?? supabase;
  if (!client) return [];
  const profile = await getFullProfile(userId, client);
  const company = profile?.user?.company ?? null;
  if (!company) return [];
  return getPendingSubmissionsForCompany(company, client);
}
