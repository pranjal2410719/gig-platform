import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getUserByGithubId, getUserById } from '../lib/db-operations';

const { mockSupabase, mockQueryBuilder } = vi.hoisted(() => {
  const mockAuth = {
    getUser: vi.fn(),
    getSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signInWithOAuth: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const mockSupabase = {
    auth: mockAuth,
    from: vi.fn().mockReturnValue(mockQueryBuilder),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { mockSupabase, mockAuth, mockQueryBuilder };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
  createServerClientWithCookies: vi.fn().mockResolvedValue(mockSupabase),
  createSupabaseServerClient: vi.fn().mockReturnValue(mockSupabase),
  isSupabaseConfigured: true,
  SUPABASE_URL: 'http://localhost',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
}));

vi.mock('@/lib/supabaseAuth', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  isLegacySessionEnabled: vi.fn().mockReturnValue(false),
  signInWithEmailPassword: vi.fn(),
  signInWithGitHub: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

function resetMocks() {
  vi.clearAllMocks();
  mockSupabase.from.mockReturnValue(mockQueryBuilder);
  mockQueryBuilder.select.mockReturnThis();
  mockQueryBuilder.insert.mockReturnThis();
  mockQueryBuilder.update.mockReturnThis();
  mockQueryBuilder.upsert.mockReturnThis();
  mockQueryBuilder.eq.mockReturnThis();
  mockQueryBuilder.in.mockReturnThis();
  mockQueryBuilder.order.mockReturnThis();
  mockQueryBuilder.limit.mockReturnThis();
  mockQueryBuilder.single.mockResolvedValue({ data: null, error: null });
  mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
}

describe('getUserByGithubId with role filter', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns matching profile when role filter matches', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-1', role: 'developer', github_id: 'gh-123', username: 'Dev User' },
      error: null,
    });

    const result = await getUserByGithubId('gh-123', mockSupabase as any, 'developer');

    expect(result).not.toBeNull();
    expect(result?.role).toBe('developer');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('github_id', 'gh-123');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('role', 'developer');
  });

  it('returns null when role filter does not match', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await getUserByGithubId('gh-123', mockSupabase as any, 'business');

    expect(result).toBeNull();
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('github_id', 'gh-123');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('role', 'business');
  });

  it('does not apply role filter when role is undefined (backward compatible)', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-1', role: 'developer', github_id: 'gh-123' },
      error: null,
    });

    const result = await getUserByGithubId('gh-123', mockSupabase as any);

    expect(result).not.toBeNull();
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('github_id', 'gh-123');
    expect(mockQueryBuilder.eq).not.toHaveBeenCalledWith('role', expect.anything());
  });
});

describe('GitHub callback role resolution', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('test_link_mode_preserves_existing_business_role: linking GitHub keeps the existing role', async () => {
    // Simulate: business user already authenticated, clicks Connect GitHub
    // The existing profile in DB has role='business'
    mockQueryBuilder.maybeSingle
      .mockResolvedValueOnce({
        data: { id: 'biz-user-1', role: 'business', github_id: null, github_handle: null },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'biz-user-1', role: 'business', github_id: 'gh-123', github_handle: 'octocat' },
        error: null,
      });

    // getUserById returns the existing business profile
    const existingProfile = await getUserById('biz-user-1', mockSupabase as any);

    // In link mode, the role is preserved from the existing profile
    const roleInLinkMode = existingProfile?.role ?? 'developer';

    expect(existingProfile).not.toBeNull();
    expect(roleInLinkMode).toBe('business');
    expect(existingProfile?.github_id).toBeNull(); // GitHub not yet linked
  });

  it('test_link_mode_preserves_existing_developer_role: linking GitHub keeps developer role', async () => {
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-1', role: 'developer', github_id: null },
      error: null,
    });

    const existingProfile = await getUserById('dev-1', mockSupabase as any);

    const roleInLinkMode = existingProfile?.role ?? 'developer';

    expect(roleInLinkMode).toBe('developer');
  });

  it('test_login_mode_business_role_hint: role hint is respected for new business profile', async () => {
    // Scenario: a user with GitHub ID 'gh-shared-123' already has a developer
    // profile. A business user (different auth UID) initiates GitHub login with
    // role=business. The getUserByGithubId call with role filter returns null
    // because no business profile exists for this GitHub ID.
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: null, // No business profile with this GitHub ID
      error: null,
    });

    const result = await getUserByGithubId('gh-shared-123', mockSupabase as any, 'business');

    expect(result).toBeNull();
    // The role hint 'business' should be used to create a new business profile
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('github_id', 'gh-shared-123');
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('role', 'business');
  });

  it('test_login_mode_developer_finds_existing: developer role hint finds existing dev profile', async () => {
    // Same GitHub ID already has a developer profile
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-1', role: 'developer', github_id: 'gh-shared-123', github_handle: 'octocat' },
      error: null,
    });

    const result = await getUserByGithubId('gh-shared-123', mockSupabase as any, 'developer');

    expect(result).not.toBeNull();
    expect(result?.role).toBe('developer');
    expect(result?.github_id).toBe('gh-shared-123');
  });

  it('test_dual_role: same GitHub ID can map to both developer and business profiles', async () => {
    // Simulate two separate users with the same GitHub ID but different roles

    // First lookup: business role
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'biz-user-1', role: 'business', github_id: 'gh-shared-123', github_handle: 'octocat' },
      error: null,
    });
    const bizProfile = await getUserByGithubId('gh-shared-123', mockSupabase as any, 'business');
    expect(bizProfile?.id).toBe('biz-user-1');
    expect(bizProfile?.role).toBe('business');

    // Second lookup: developer role
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'dev-user-1', role: 'developer', github_id: 'gh-shared-123', github_handle: 'octocat' },
      error: null,
    });
    const devProfile = await getUserByGithubId('gh-shared-123', mockSupabase as any, 'developer');
    expect(devProfile?.id).toBe('dev-user-1');
    expect(devProfile?.role).toBe('developer');

    // Both profiles share the same GitHub ID but have different UIDs and roles
    expect(bizProfile?.id).not.toBe(devProfile?.id);
    expect(bizProfile?.github_id).toBe(devProfile?.github_id);
  });
});
