"use client";

import { useState, useEffect } from "react";

const BORDER = "#e4e4e7";
const CHARCOAL = "#151b1d";
const MUTED = "#71717b";
const GREEN = "#257b5a";
const MINT = "#00c950";
const MINT_SOFT = "rgba(0, 201, 80, 0.10)";
const MINT_BDR = "rgba(0, 201, 80, 0.20)";

interface Repository {
  id: string;
  name: string;
  owner: string;
  url: string;
  opted_in: boolean;
  description?: string | null;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  user?: {
    login: string;
    avatar_url: string;
  } | null;
}

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userRole?: "business" | "developer";
}

export default function CreateIssueModal({
  isOpen,
  onClose,
  onSuccess,
  userRole = "developer",
}: CreateIssueModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "github">("github");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [hasConnectedGithub, setHasConnectedGithub] = useState<boolean | null>(null);
  const [githubHandle, setGithubHandle] = useState<string | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Manual Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [useExistingRepo, setUseExistingRepo] = useState(true);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [manualOwner, setManualOwner] = useState("");
  const [manualRepo, setManualRepo] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [technology, setTechnology] = useState("TypeScript");
  const [isBounty, setIsBounty] = useState(userRole === "business");
  const [rewardAmount, setRewardAmount] = useState(500);

  // GitHub Import State
  const [githubIssues, setGithubIssues] = useState<GitHubIssue[]>([]);
  const [selectedGithubIssue, setSelectedGithubIssue] = useState<GitHubIssue | null>(null);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // Status & balance state
  const [submitting, setSubmitting] = useState(false);
  const [userCoins, setUserCoins] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoadingRepos(true);
    try {
      const [repoRes, walletRes] = await Promise.all([
        fetch("/api/repositories"),
        fetch("/api/wallet"),
      ]);

      if (repoRes.ok) {
        const repoData = await repoRes.json();
        const list: Repository[] = repoData.repositories || [];
        const connected = Boolean(repoData.hasConnectedGithub);
        setRepositories(list);
        setHasConnectedGithub(connected);
        if (repoData.githubHandle) setGithubHandle(repoData.githubHandle);

        // Auto-select tab: if business or GitHub connected, default to "github" tab
        if (connected || userRole === "business") {
          setActiveTab("github");
        } else {
          setActiveTab("manual");
        }

        if (list.length > 0) {
          setSelectedRepoId(list[0].id);
          // Auto-fetch issues from the first repo immediately
          handleFetchGithubIssues(list[0]);
        } else {
          setUseExistingRepo(false);
        }
      }

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        const bal = parseInt(String(walletData.balance || "").replace(/[^0-9]/g, ""), 10);
        setUserCoins(Number.isNaN(bal) ? 0 : bal);
      }
    } catch {
      // Ignore initial load failure
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleFetchGithubIssues = async (repo: Repository) => {
    setLoadingIssues(true);
    setStatusMsg(null);
    setSelectedGithubIssue(null);
    try {
      const res = await fetch(
        `/api/github/issues?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`,
      );
      const json = await res.json();
      if (res.ok && json.issues) {
        setGithubIssues(json.issues);
      } else {
        setGithubIssues([]);
        setStatusMsg({ text: json.error || "Could not fetch GitHub issues for this repository.", isError: true });
      }
    } catch {
      setGithubIssues([]);
      setStatusMsg({ text: "Network error fetching GitHub issues.", isError: true });
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleSelectGithubIssue = (issue: GitHubIssue) => {
    setSelectedGithubIssue(issue);
    setTitle(issue.title);
    setDescription(issue.body || "");
    setIssueUrl(issue.html_url);
    if (issue.labels && issue.labels.length > 0) {
      setTechnology(issue.labels[0].name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setStatusMsg({ text: "Please select or enter an issue title.", isError: true });
      return;
    }

    const bounty = isBounty ? Number(rewardAmount) : 0;
    if (isBounty && bounty > 0 && userCoins !== null && userCoins < bounty) {
      setStatusMsg({
        text: `Insufficient GIG Coins balance: you have ${userCoins} coins, but this bounty requires ${bounty} coins.`,
        isError: true,
      });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        issue_url: issueUrl.trim() || null,
        difficulty,
        technology: technology.trim() || null,
        reward_amount: bounty,
        reward_currency: "INR",
      };

      if (useExistingRepo && selectedRepoId) {
        payload.repository_id = selectedRepoId;
      } else {
        if (!manualOwner.trim() || !manualRepo.trim()) {
          setStatusMsg({ text: "Please provide both Repository Owner and Repository Name.", isError: true });
          setSubmitting(false);
          return;
        }
        payload.repo_owner = manualOwner.trim();
        payload.repo_name = manualRepo.trim();
        payload.repo_url = manualUrl.trim() || `https://github.com/${manualOwner.trim()}/${manualRepo.trim()}`;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: data.error || "Failed to create issue.", isError: true });
      } else {
        setStatusMsg({ text: "Issue published to the Issue Pool successfully!", isError: false });
        setTimeout(() => {
          onClose();
          if (onSuccess) onSuccess();
          window.location.reload();
        }, 1200);
      }
    } catch {
      setStatusMsg({ text: "Network error occurred while creating issue.", isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 14,
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
          border: `1px solid ${BORDER}`,
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#fcfdfc",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: CHARCOAL }}>
                Post Issue to Pool
              </h3>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  backgroundColor: userRole === "business" ? "rgba(37, 123, 90, 0.1)" : "rgba(96, 72, 168, 0.1)",
                  color: userRole === "business" ? GREEN : "#6048a8",
                }}
              >
                {userRole === "business" ? "Business Sponsor" : "Developer / Maintainer"}
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: MUTED }}>
              Directly select open GitHub issues from your repositories or specify a custom issue spec.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: MUTED }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${BORDER}`,
            backgroundColor: "#f9fafb",
            padding: "0 24px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("github");
              if (repositories.length > 0) {
                const repo = repositories.find((r) => r.id === selectedRepoId) || repositories[0];
                handleFetchGithubIssues(repo);
              }
            }}
            style={{
              padding: "12px 16px",
              border: "none",
              borderBottom: activeTab === "github" ? `2px solid ${GREEN}` : "2px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 13,
              color: activeTab === "github" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            GitHub Repository Sync
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            style={{
              padding: "12px 16px",
              border: "none",
              borderBottom: activeTab === "manual" ? `2px solid ${GREEN}` : "2px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 13,
              color: activeTab === "manual" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            Manual Task Entry
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {statusMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                backgroundColor: statusMsg.isError ? "rgba(234, 67, 53, 0.1)" : MINT_SOFT,
                color: statusMsg.isError ? "#ea4335" : GREEN,
                border: `1px solid ${statusMsg.isError ? "rgba(234, 67, 53, 0.3)" : MINT_BDR}`,
              }}
            >
              {statusMsg.text}
            </div>
          )}

          {activeTab === "github" && (
            <div>
              {/* GitHub connection check banner */}
              {hasConnectedGithub === false && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: "#fffbeb",
                    border: "1px solid #fde68a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13, color: "#92400e" }}>
                      Connect your GitHub account to auto-load repositories
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b45309" }}>
                      Link GitHub in profile settings so your organizations and issues appear automatically.
                    </p>
                  </div>
                   <a
                     href="/api/auth/github?mode=link"
                     style={{
                       padding: "6px 14px",
                       borderRadius: 6,
                       backgroundColor: GREEN,
                       color: "#ffffff",
                       fontWeight: 700,
                       fontSize: 12,
                       textDecoration: "none",
                       whiteSpace: "nowrap",
                     }}
                  >
                    Connect GitHub
                  </a>
                </div>
              )}

              {/* Repository Selector */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
                  Select Repository {loadingRepos && " (Loading...)"}
                </label>
                <select
                  value={selectedRepoId}
                  onChange={(e) => {
                    setSelectedRepoId(e.target.value);
                    const repo = repositories.find((r) => r.id === e.target.value);
                    if (repo) handleFetchGithubIssues(repo);
                  }}
                  disabled={repositories.length === 0}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    padding: "0 12px",
                    fontSize: 13,
                    backgroundColor: "#ffffff",
                    color: CHARCOAL,
                  }}
                >
                  {repositories.length === 0 ? (
                    <option value="">No repositories available</option>
                  ) : (
                    repositories.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.owner}/{r.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Issue Selector Box */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
                  Select Open GitHub Issue to Import
                </label>
                <div
                  style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    maxHeight: 220,
                    overflowY: "auto",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {loadingIssues ? (
                    <p style={{ padding: 16, margin: 0, fontSize: 13, color: MUTED, textAlign: "center" }}>
                      Fetching open issues from GitHub...
                    </p>
                  ) : githubIssues.length === 0 ? (
                    <p style={{ padding: 16, margin: 0, fontSize: 13, color: MUTED, textAlign: "center" }}>
                      No open issues found for this repository.
                    </p>
                  ) : (
                    githubIssues.map((issue) => {
                      const isSelected = selectedGithubIssue?.id === issue.id;
                      return (
                        <div
                          key={issue.id}
                          onClick={() => handleSelectGithubIssue(issue)}
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${BORDER}`,
                            cursor: "pointer",
                            backgroundColor: isSelected ? MINT_SOFT : "#ffffff",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>
                              #{issue.number} {issue.title}
                            </span>
                            {isSelected && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase" }}>
                                SELECTED ✓
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                            {issue.user && (
                              <span style={{ fontSize: 11, color: MUTED }}>by @{issue.user.login}</span>
                            )}
                            {issue.labels.map((l) => (
                              <span
                                key={l.name}
                                style={{
                                  fontSize: 10,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  backgroundColor: `#${l.color}22`,
                                  color: CHARCOAL,
                                  fontWeight: 500,
                                }}
                              >
                                {l.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Manual Repo selection if manual tab */}
          {activeTab === "manual" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>Target Repository</label>
                {repositories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseExistingRepo(!useExistingRepo)}
                    style={{ background: "none", border: "none", fontSize: 12, color: GREEN, cursor: "pointer", fontWeight: 600 }}
                  >
                    {useExistingRepo ? "Enter custom repo info" : "Choose from connected repos"}
                  </button>
                )}
              </div>

              {useExistingRepo && repositories.length > 0 ? (
                <select
                  value={selectedRepoId}
                  onChange={(e) => setSelectedRepoId(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    padding: "0 12px",
                    fontSize: 13,
                  }}
                >
                  {repositories.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.owner}/{r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <input
                      type="text"
                      placeholder="Repo Owner (e.g. vercel)"
                      value={manualOwner}
                      onChange={(e) => setManualOwner(e.target.value)}
                      required={!useExistingRepo}
                      style={{
                        width: "100%",
                        height: 40,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: `1px solid ${BORDER}`,
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Repo Name (e.g. next.js)"
                      value={manualRepo}
                      onChange={(e) => setManualRepo(e.target.value)}
                      required={!useExistingRepo}
                      style={{
                        width: "100%",
                        height: 40,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: `1px solid ${BORDER}`,
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Issue Details Fields */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
              Issue Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Implement Turbopack Cache Middleware for Edge Functions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                height: 40,
                padding: "0 12px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
              Description / Acceptance Criteria
            </label>
            <textarea
              rows={3}
              placeholder="Describe the bug or feature, steps to reproduce, or requirements for a winning PR..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>

          {/* Difficulty & Technology */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
                Difficulty Tier
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  padding: "0 10px",
                  fontSize: 13,
                  backgroundColor: "#fff",
                }}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
                Technology / Stack Tag
              </label>
              <input
                type="text"
                value={technology}
                onChange={(e) => setTechnology(e.target.value)}
                placeholder="e.g. TypeScript, Rust, Go"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  padding: "0 10px",
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
              GitHub Issue URL
            </label>
            <input
              type="url"
              placeholder="https://github.com/org/repo/issues/123"
              value={issueUrl}
              onChange={(e) => setIssueUrl(e.target.value)}
              style={{
                width: "100%",
                height: 38,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                padding: "0 10px",
                fontSize: 13,
              }}
            />
          </div>

          {/* Bounty & Escrow Section */}
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              backgroundColor: "#f9fafb",
              border: `1px solid ${BORDER}`,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="bountyCheckbox"
                  checked={isBounty}
                  onChange={(e) => setIsBounty(e.target.checked)}
                />
                <label htmlFor="bountyCheckbox" style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, cursor: "pointer" }}>
                  Fund with GIG Coins Bounty (Lock into Escrow)
                </label>
              </div>
              {userCoins !== null && (
                <span style={{ fontSize: 12, color: MUTED }}>
                  Your Wallet: <strong style={{ color: CHARCOAL }}>{userCoins.toLocaleString()} Coins</strong>
                </span>
              )}
            </div>

            {isBounty ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(parseInt(e.target.value, 10) || 0)}
                    style={{
                      flex: 1,
                      height: 38,
                      borderRadius: 6,
                      border: `1px solid ${BORDER}`,
                      padding: "0 12px",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>GIG Coins</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: MUTED }}>
                  Coins are held in platform escrow upon publishing and automatically disbursed to the developer whose PR is merged.
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: GREEN, fontWeight: 500 }}>
                ✓ Listed as a verified Open Source Contribution (free to post, awards reputation & tamper-proof PR credit).
              </p>
            )}
          </div>

          {/* Footer actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 40,
                padding: "0 18px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                backgroundColor: "#ffffff",
                color: CHARCOAL,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                height: 40,
                padding: "0 22px",
                borderRadius: 8,
                border: "none",
                backgroundColor: MINT,
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 13,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Publishing..." : "Publish to Issue Pool"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
