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

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: () => void;
}

export default function GitHubImportModal({
  isOpen,
  onClose,
  onTaskCreated,
}: GitHubImportModalProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [hasConnectedGithub, setHasConnectedGithub] = useState<boolean | null>(null);

  // Repository connect form
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoOwner, setNewRepoOwner] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoUrl, setNewRepoUrl] = useState("");

  // Task settings
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [technology, setTechnology] = useState("TypeScript");
  const [rewardAmount, setRewardAmount] = useState<number>(500);
  const [isBounty, setIsBounty] = useState(true);

  // States
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRepositories();
    }
  }, [isOpen]);

  const loadRepositories = async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/repositories");
      const json = await res.json();
      if (res.ok && json.repositories) {
        setRepositories(json.repositories);
        setHasConnectedGithub(Boolean(json.hasConnectedGithub));
        if (json.repositories.length > 0) {
          setSelectedRepoId(json.repositories[0].id);
          loadGitHubIssues(json.repositories[0]);
        }
      }
    } catch {
      setStatusMsg({ text: "Could not load connected repositories.", isError: true });
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSelectRepo = (repoId: string) => {
    setSelectedRepoId(repoId);
    setSelectedIssue(null);
    const repo = repositories.find((r) => r.id === repoId);
    if (repo) {
      loadGitHubIssues(repo);
    }
  };

  const loadGitHubIssues = async (repo: Repository) => {
    setLoadingIssues(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/github/issues?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`);
      const json = await res.json();
      if (res.ok && json.issues) {
        setIssues(json.issues);
      } else {
        setIssues([]);
        setStatusMsg({ text: json.error || "Could not fetch issues from GitHub.", isError: true });
      }
    } catch {
      setIssues([]);
      setStatusMsg({ text: "Network error fetching GitHub issues.", isError: true });
    } finally {
      setLoadingIssues(false);
    }
  };

  const handleConnectRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoOwner || !newRepoName) return;
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: newRepoOwner.trim(),
          name: newRepoName.trim(),
          url: newRepoUrl.trim() || `https://github.com/${newRepoOwner.trim()}/${newRepoName.trim()}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: json.error || "Failed to connect repository.", isError: true });
      } else {
        setStatusMsg({ text: "Repository connected successfully!", isError: false });
        setShowAddRepo(false);
        setNewRepoOwner("");
        setNewRepoName("");
        setNewRepoUrl("");
        await loadRepositories();
      }
    } catch {
      setStatusMsg({ text: "Network error connecting repository.", isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportIssue = async () => {
    if (!selectedRepoId || !selectedIssue) return;
    setSubmitting(true);
    setStatusMsg(null);

    const bounty = isBounty ? rewardAmount : 0;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository_id: selectedRepoId,
          title: selectedIssue.title,
          description: selectedIssue.body,
          issue_url: selectedIssue.html_url,
          difficulty,
          technology,
          reward_amount: bounty,
          reward_currency: "INR",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: json.error || "Could not import task.", isError: true });
      } else {
        setStatusMsg({ text: `Task imported successfully into the Issue Pool!`, isError: false });
        setTimeout(() => {
          onClose();
          if (onTaskCreated) onTaskCreated();
          window.location.reload();
        }, 1000);
      }
    } catch {
      setStatusMsg({ text: "Network error importing task.", isError: true });
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
        backgroundColor: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
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
        {/* Header */}
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
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: CHARCOAL }}>
              Import GitHub Issues to Pool
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: MUTED }}>
              Directly select open issues from your connected GitHub repositories.
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

        {/* Body */}
        <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
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

          {/* GitHub Connection Notice */}
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
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "#92400e" }}>
                  Connect your GitHub account
                </strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b45309" }}>
                  Link GitHub to automatically list all your company and personal repositories.
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
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>Connected Repository</label>
              <button
                type="button"
                onClick={() => setShowAddRepo(!showAddRepo)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  color: GREEN,
                  cursor: "pointer",
                }}
              >
                {showAddRepo ? "Cancel" : "+ Add custom repository"}
              </button>
            </div>

            {showAddRepo && (
              <form
                onSubmit={handleConnectRepo}
                style={{
                  backgroundColor: "#f9fafb",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Owner (e.g. facebook)"
                    value={newRepoOwner}
                    onChange={(e) => setNewRepoOwner(e.target.value)}
                    required
                    style={{ height: 36, padding: "0 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13 }}
                  />
                  <input
                    type="text"
                    placeholder="Repo name (e.g. react)"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    required
                    style={{ height: 36, padding: "0 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13 }}
                  />
                </div>
                <input
                  type="url"
                  placeholder="GitHub URL (https://github.com/facebook/react)"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  style={{ height: 36, padding: "0 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      height: 34,
                      padding: "0 14px",
                      borderRadius: 6,
                      backgroundColor: GREEN,
                      color: "#fff",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {submitting ? "Connecting..." : "Add Repository"}
                  </button>
                </div>
              </form>
            )}

            <select
              value={selectedRepoId}
              onChange={(e) => handleSelectRepo(e.target.value)}
              disabled={loadingRepos || repositories.length === 0}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                backgroundColor: "#ffffff",
                color: CHARCOAL,
                outline: "none",
              }}
            >
              {repositories.length === 0 ? (
                <option value="">No connected repositories yet</option>
              ) : (
                repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.owner}/{repo.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Issue List */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 8 }}>
              Select Issue to Import {loadingIssues && " (fetching from GitHub...)"}
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
              {issues.length === 0 ? (
                <p style={{ margin: 0, padding: 16, fontSize: 13, color: MUTED, textAlign: "center" }}>
                  {loadingIssues ? "Loading GitHub issues..." : "No open issues found for this repository."}
                </p>
              ) : (
                issues.map((issue) => {
                  const isSelected = selectedIssue?.id === issue.id;
                  return (
                    <div
                      key={issue.id}
                      onClick={() => {
                        setSelectedIssue(issue);
                        if (issue.labels && issue.labels.length > 0) {
                          setTechnology(issue.labels[0].name);
                        }
                      }}
                      style={{
                        padding: "10px 14px",
                        borderBottom: `1px solid ${BORDER}`,
                        cursor: "pointer",
                        backgroundColor: isSelected ? MINT_SOFT : "#ffffff",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
                          #{issue.number} {issue.title}
                        </span>
                        {isSelected && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase" }}>
                            Selected ✓
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {issue.labels.slice(0, 3).map((l) => (
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

          {/* Bounty & Difficulty Configuration */}
          {selectedIssue && (
            <div
              style={{
                backgroundColor: "#f9fafb",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: CHARCOAL }}>
                Task & Bounty Configuration
              </h4>

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
                    Technology / Primary Stack
                  </label>
                  <input
                    type="text"
                    value={technology}
                    onChange={(e) => setTechnology(e.target.value)}
                    placeholder="e.g. Next.js, Rust, Go"
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    id="bountyToggle"
                    checked={isBounty}
                    onChange={(e) => setIsBounty(e.target.checked)}
                  />
                  <label htmlFor="bountyToggle" style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, cursor: "pointer" }}>
                    Fund with GIG Coins Bounty (deducted into Platform Escrow)
                  </label>
                </div>

                {isBounty ? (
                  <div>
                    <input
                      type="number"
                      min="100"
                      step="100"
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(parseInt(e.target.value, 10) || 0)}
                      style={{
                        width: "100%",
                        height: 38,
                        borderRadius: 6,
                        border: `1px solid ${BORDER}`,
                        padding: "0 10px",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    />
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: MUTED }}>
                      Bounty will be locked in platform escrow until a developer PR is reviewed and merged.
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: GREEN, fontWeight: 500 }}>
                    Listed as a verified Open Source Contribution (awarding reputation points upon merge).
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            backgroundColor: "#fcfdfc",
          }}
        >
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
            type="button"
            disabled={submitting || !selectedIssue}
            onClick={handleImportIssue}
            style={{
              height: 40,
              padding: "0 22px",
              borderRadius: 8,
              border: "none",
              backgroundColor: MINT,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13,
              cursor: submitting || !selectedIssue ? "not-allowed" : "pointer",
              opacity: submitting || !selectedIssue ? 0.6 : 1,
            }}
          >
            {submitting ? "Publishing..." : "Publish to Issue Pool"}
          </button>
        </div>
      </div>
    </div>
  );
}
