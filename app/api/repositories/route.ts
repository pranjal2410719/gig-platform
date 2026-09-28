import { NextRequest, NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabaseClient";
import { getSession } from "@/lib/session";
import { getRepositories, Repository, cleanGithubHandle } from "@/lib/db-operations";

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClientWithCookies();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbClient = supabase;

    const { data: user } = await dbClient
      .from("users")
      .select("company, username, github_handle")
      .eq("id", session.userId)
      .maybeSingle();

    const company = user?.company ?? null;
    const rawGithubHandle = user?.github_handle || null;
    const cleanHandle = cleanGithubHandle(rawGithubHandle) || cleanGithubHandle(user?.username) || null;
    // For business accounts, prefer company if set, otherwise use github_handle as owner
    const ownerName = company || cleanHandle || null;

    let userGithubRepos: Array<{ name: string; owner: string; url: string; description: string | null }> = [];

    // If user has a GitHub handle or company, fetch live repos directly from GitHub API
    if (cleanHandle || company) {
      const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "gig-platform-sync",
      };
      if (githubToken) {
        headers["Authorization"] = `Bearer ${githubToken}`;
      }

      const targetsToFetch = Array.from(new Set([cleanHandle, company].filter(Boolean) as string[]));
      for (const target of targetsToFetch) {
        try {
          // Try user repos endpoint
          let ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(target)}/repos?sort=updated&per_page=100`, {
            headers,
            next: { revalidate: 60 },
          });
          // If not found as user, try orgs endpoint
          if (ghRes.status === 404) {
            ghRes = await fetch(`https://api.github.com/orgs/${encodeURIComponent(target)}/repos?sort=updated&per_page=100`, {
              headers,
              next: { revalidate: 60 },
            });
          }
          if (ghRes.ok) {
            const data = await ghRes.json();
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item && item.name && item.owner?.login) {
                  userGithubRepos.push({
                    name: item.name,
                    owner: item.owner.login,
                    url: item.html_url || `https://github.com/${item.owner.login}/${item.name}`,
                    description: item.description || null,
                  });
                }
              }
            }
          }
        } catch (fetchErr) {
          console.warn("[GET /api/repositories] Failed to fetch repos from GitHub for target:", target, fetchErr);
        }
      }
    }

    // Auto-upsert any fetched GitHub repos into database so they have real DB UUIDs for task referencing
    if (userGithubRepos.length > 0) {
      const upsertRows = userGithubRepos.map((r) => ({
        github_repo_id: `${r.owner}/${r.name}`,
        name: r.name,
        owner: r.owner,
        url: r.url,
        description: r.description,
        opted_in: true,
        opted_in_at: new Date().toISOString(),
      }));

      await dbClient
        .from("repositories")
        .upsert(upsertRows, { onConflict: "github_repo_id" });
    }

    let repos: Repository[] = [];
    if (ownerName) {
      repos = await getRepositories({ owner: ownerName }, dbClient);
    }

    // If ownerName lookup yielded 0 repos but we fetched user repos with different owner names (e.g. orgs)
    if (repos.length === 0 && userGithubRepos.length > 0) {
      const owners = Array.from(new Set(userGithubRepos.map((r) => r.owner)));
      const { data: matchedRepos } = await dbClient
        .from("repositories")
        .select()
        .in("owner", owners);
      if (matchedRepos && matchedRepos.length > 0) {
        repos = matchedRepos;
      }
    }

    // Fallback: return opted-in public repositories available to work with
    if (repos.length === 0) {
      repos = await getRepositories({ optedInOnly: true, limit: 15 }, dbClient);
    }

    const hasConnectedGithub = Boolean(cleanHandle || userGithubRepos.length > 0);

    return NextResponse.json({
      repositories: repos,
      hasConnectedGithub,
      githubHandle: cleanHandle,
      company: company,
    });
  } catch (err) {
    console.error("[GET /api/repositories]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClientWithCookies();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbClient = supabase;

    const body = await request.json();
    const { name, owner, url, description } = body;

    if (!name || !owner) {
      return NextResponse.json({ error: "Repository name and owner are required" }, { status: 400 });
    }

    const repoOwner = owner.trim();
    const repoName = name.trim();
    const githubRepoId = `${repoOwner}/${repoName}`;
    const repoUrl = url?.trim() || `https://github.com/${githubRepoId}`;

    const { data: repo, error } = await dbClient
      .from("repositories")
      .upsert(
        {
          github_repo_id: githubRepoId,
          name: repoName,
          owner: repoOwner,
          url: repoUrl,
          description: description || null,
          opted_in: true,
          opted_in_at: new Date().toISOString(),
        },
        { onConflict: "github_repo_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ repository: repo }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/repositories]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
