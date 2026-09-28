"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import DevHeader from "@/components/dashboard/DevHeader";
import MetricCard from "@/components/dashboard/MetricCard";
import TaskTable from "@/components/dashboard/TaskTable";
import ProofOfWorkCard from "@/components/dashboard/ProofOfWorkCard";
import IssuePool from "@/components/dashboard/IssuePool";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import type { IssuePoolData } from "@/lib/dashboard-data";
import { cleanGithubHandle } from "@/lib/db-operations";
import { getSavedTasks } from "@/lib/saved-tasks";

const BG_PAGE = "#fbfcfb";
const CHARCOAL = "#151b1d";
const BORDER = "#e4e4e7";
const MUTED = "#71717b";
const GREEN = "#257b5a";
const MINT = "#00c950";
const MINT_SOFT = "rgba(0, 201, 80, 0.10)";
const MINT_BDR = "rgba(0, 201, 80, 0.20)";
const MINT_FG = "#f0fdf4";
const CARD_SHADOW = "0 8px 24px rgba(37, 123, 90, 0.06)";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

type DevTab = "dashboard" | "tasks" | "issues" | "prs" | "wallet" | "profile";

export interface DevTask {
  id: string;
  title: string;
  repo: string;
  status: "Locked" | "In Progress" | "Submitted" | "Verified";
  assignee: string;
  lockedAmount: string;
  lockExpiry: string;
}

export interface DevTransaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: "credit" | "debit";
  status: "Completed" | "Pending";
}

export interface DevSubmission {
  id: string;
  taskId: string;
  prUrl: string;
  prNumber?: string | null;
  prStatus: string;
  submittedAt?: string | null;
}

export interface DevBadge {
  label: string;
  description: string;
  earned: string;
}

export interface DevPR {
  id: string;
  repo: string;
  title: string;
  mergedAt: string;
  linesChanged: string;
}

export interface DevStats {
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

export interface DeveloperDashboardData {
  displayName: string;
  handle: string;
  githubHandle?: string | null;
  stats: DevStats;
  tasks: DevTask[];
  transactions: DevTransaction[];
  badges: DevBadge[];
  verifiedPRs: DevPR[];
  submissions: DevSubmission[];
  walletTxCount: number;
  // Profile fields for editing
  username: string;
  avatar_url: string | null;
  github_handle: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers_count: number | null;
  public_repos_count: number | null;
}

export interface DeveloperProfileState {
  username: string;
  handle: string;
  avatar_url: string | null;
  github_handle: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers_count: number | null;
  public_repos_count: number | null;
}

export interface DevDashboardProps {
  data?: DeveloperDashboardData;
  issuePool?: IssuePoolData;
}

const FALLBACK: DeveloperDashboardData = {
  displayName: "Developer",
  handle: "",
  stats: {
    reputationScore: "0",
    reputationBadge: "NEW",
    reputationFooter: "Reputation score based on verified PR contributions",
    verifiedContributions: "0",
    contributionsFooter: "No contributions yet",
    lockedTasks: "0",
    lockedFooter: "No locked escrow",
    walletBalance: "₹0",
    walletFooter: "Ready for UPI bank withdrawal (Min ₹500)",
  },
  tasks: [],
  transactions: [],
  submissions: [],
  badges: [],
  verifiedPRs: [],
  walletTxCount: 0,
  // Profile fields for editing
  username: "",
  avatar_url: null,
  github_handle: null,
  bio: null,
  company: null,
  location: null,
  followers_count: null,
  public_repos_count: null
};

const evidence: { label: string; value: string; icon: React.ReactNode; green?: boolean }[] = [];

const footer: { label: string; value: string; valueColor: string }[] = [];

const shareIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const mapPinIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const githubIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const checkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const xIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function EditDeveloperModal({
  isOpen,
  onClose,
  formValues,
  setFormValues,
  onSave,
  saving,
  error,
  initials,
}: {
  isOpen: boolean;
  onClose: () => void;
  formValues: DeveloperProfileState;
  setFormValues: React.Dispatch<React.SetStateAction<DeveloperProfileState>>;
  onSave: () => Promise<void>;
  saving: boolean;
  error: string | null;
  initials: string;
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.2)",
          border: `1px solid ${BORDER}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: CHARCOAL }}>
              Edit Developer Profile
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>
              Update your public profile, bio, location, and GitHub connection
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: MUTED,
              padding: 6,
              borderRadius: 6,
            }}
            aria-label="Close modal"
          >
            {xIcon}
          </button>
        </div>

        {/* Modal Form */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Circular Avatar Preview & Input */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {formValues.avatar_url ? (
              <img
                src={formValues.avatar_url}
                alt="Avatar preview"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `2px solid ${MINT}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  backgroundColor: "#eef8f2",
                  border: `2px solid ${MINT}`,
                  color: GREEN,
                  fontSize: 24,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Avatar URL
              </label>
              <input
                type="text"
                value={formValues.avatar_url || ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, avatar_url: e.target.value }))}
                placeholder="https://images.unsplash.com/... or GitHub avatar"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Display Name & GitHub Handle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Display Name
              </label>
              <input
                type="text"
                value={formValues.username || ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, username: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                GitHub Handle
              </label>
              <input
                type="text"
                value={formValues.github_handle || ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, github_handle: e.target.value }))}
                placeholder="e.g. octocat"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
              Bio / Introduction
            </label>
            <textarea
              value={formValues.bio || ""}
              onChange={(e) => setFormValues((prev) => ({ ...prev, bio: e.target.value }))}
              rows={3}
              placeholder="Tell developers and sponsors about your engineering focus..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Location & Company */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Location
              </label>
              <input
                type="text"
                value={formValues.location || ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="e.g. Remote / San Francisco, CA"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Company / Affiliation
              </label>
              <input
                type="text"
                value={formValues.company || ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, company: e.target.value }))}
                placeholder="e.g. Independent / Acme Labs"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Followers & Public Repos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Followers Count
              </label>
              <input
                type="number"
                value={formValues.followers_count !== null && formValues.followers_count !== undefined ? String(formValues.followers_count) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormValues((prev) => ({ ...prev, followers_count: val === "" ? null : parseInt(val, 10) }));
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Public Repos Count
              </label>
              <input
                type="number"
                value={formValues.public_repos_count !== null && formValues.public_repos_count !== undefined ? String(formValues.public_repos_count) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormValues((prev) => ({ ...prev, public_repos_count: val === "" ? null : parseInt(val, 10) }));
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${BORDER}`,
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 38,
              padding: "0 18px",
              backgroundColor: "#ffffff",
              color: CHARCOAL,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              height: 38,
              padding: "0 22px",
              backgroundColor: MINT,
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function createEmptyIssuePool(role: "developer" | "business"): IssuePoolData {
  return {
    role,
    displayName: "Developer",
    initials: "DV",
    company: null,
    issues: [],
    openCount: 0,
    claimedByMe: 0,
    claimedTotal: 0,
    rewardTotal: 0,
    rewardCurrency: "INR",
    matchScore: role === "business" ? "0%" : "82%",
    matchLabel: role === "business" ? "Engagement" : "Match score",
    matchSub: "how well your profile fits the pool",
    recommended: [],
    journey:
      role === "business"
        ? [
            { num: 1, title: "Post issue", desc: "Create a task spec with clear acceptance criteria" },
            { num: 2, title: "Fund escrow", desc: "Rewards stay locked in the vault until verified" },
            { num: 3, title: "Review PRs", desc: "Inspect pull requests and accept merged work" },
            { num: 4, title: "Pay out", desc: "Verified contributions disburse straight to devs" },
          ]
        : [
            { num: 1, title: "Browse", desc: "Pick an issue that matches your skill set" },
            { num: 2, title: "Claim", desc: "Lock the issue for up to 48 hours" },
            { num: 3, title: "Submit PR", desc: "Open a pull request against the repository" },
            { num: 4, title: "Get paid", desc: "Verified PRs credit directly to your wallet" },
          ],
  };
}

function TabContent({
  activeTab,
  data,
  issuePool,
  walletBalance,
  transactions,
  withdrawalAmount,
  setWithdrawalAmount,
  withdrawalLoading,
  withdrawalError,
  withdrawalSuccess,
  handleWithdrawalSubmit,
  profileState,
  isEditing,
  setIsEditing,
  formValues,
  setFormValues,
  savingProfile,
  profileSuccess,
  profileError,
  handleSaveProfile,
}: {
  activeTab: DevTab;
  data: DeveloperDashboardData;
  issuePool?: IssuePoolData;
  walletBalance: string;
  transactions: DevTransaction[];
  withdrawalAmount: string;
  setWithdrawalAmount: (amount: string) => void;
  withdrawalLoading: boolean;
  withdrawalError: string | null;
  withdrawalSuccess: boolean;
  handleWithdrawalSubmit: (event: FormEvent) => Promise<void>;
  profileState: DeveloperProfileState;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  formValues: DeveloperProfileState;
  setFormValues: React.Dispatch<React.SetStateAction<DeveloperProfileState>>;
  savingProfile: boolean;
  profileSuccess: string | null;
  profileError: string | null;
  handleSaveProfile: () => Promise<void>;
}) {
  const { stats, tasks, badges, verifiedPRs } = data;
  // Override stats.walletBalance with the fetched one
  const overriddenStats = { ...stats, walletBalance };
  const initials = data.displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  switch (activeTab) {
    case "dashboard":
      return (
        <ActivityFeed
          role="developer"
          savedTasks={getSavedTasks()}
          claimedTasks={tasks}
          verifiedPRs={verifiedPRs}
          transactions={transactions}
          githubHandle={profileState.github_handle || data.githubHandle}
          displayName={profileState.username || data.displayName}
        />
      );

    case "issues":
      return <IssuePool data={issuePool ?? createEmptyIssuePool("developer")} role="developer" />;

    case "tasks": {
      const savedTasksList = getSavedTasks();
      const savedDevTasks: DevTask[] = savedTasksList.map((st) => ({
        id: st.id,
        title: st.title,
        repo: st.repo,
        status: "In Progress",
        assignee: profileState.username || "You",
        lockedAmount: `₹${(st.reward || 0).toLocaleString("en-IN")}`,
        lockExpiry: "48h",
      }));
      const combinedTasks = [...savedDevTasks, ...tasks];

      return (
        <>
          <section id="tasks" aria-label="Contributor stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginTop: 32, scrollMarginTop: 24 }} className="dev-metrics-grid">
            <MetricCard label="Reputation Score" value={overriddenStats.reputationScore} badge={overriddenStats.reputationBadge} green footer={overriddenStats.reputationFooter} />
            <MetricCard label="Verified Contributions" value={overriddenStats.verifiedContributions} footer={overriddenStats.contributionsFooter} />
            <MetricCard label="Locked Active Tasks" value={overriddenStats.lockedTasks} footer={overriddenStats.lockedFooter} />
            <MetricCard anchorId="wallet" label="GIG Wallet Balance" value={overriddenStats.walletBalance} green footer={overriddenStats.walletFooter} />
          </section>

          <section id="task-backlog" style={{ marginTop: 40, scrollMarginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: MUTED, margin: 0 }}>Active Tasks</p>
                <h2 style={{ marginTop: 4, fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.33, color: CHARCOAL, margin: "4px 0 0" }}>TASK BACKLOG</h2>
              </div>
            </div>
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              <TaskTable tasks={combinedTasks} isBusiness={false} />
            </div>
          </section>
        </>
      );
    }

    case "prs":
      return (
        <section id="prs" style={{ marginTop: 40, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: MUTED, margin: 0 }}>Inspectable Proof-of-Work</p>
              <h2 style={{ marginTop: 4, fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.33, color: CHARCOAL, margin: "4px 0 0" }}>LATEST VERIFIED CONTRIBUTION</h2>
            </div>
            {verifiedPRs.length > 0 && (
              <a href="https://github.com/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: GREEN, textDecoration: "none", paddingBottom: 4, whiteSpace: "nowrap" }}>Verify on GitHub →</a>
            )}
          </div>
          {verifiedPRs.length > 0 ? (
            <ProofOfWorkCard repo={verifiedPRs[0].repo} prNumber={verifiedPRs[0].id} prUrl={`https://github.com/${verifiedPRs[0].repo}`} title={verifiedPRs[0].title} subtitle="Tier 2 Task · TypeScript / Next.js / React 19 Server Components" evidence={evidence} footer={footer} />
          ) : (
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, padding: 32, textAlign: "center", color: MUTED, fontSize: 14 }}>
              No verified contributions yet. Claim an issue to get started.
            </div>
          )}
        </section>
      );

    case "wallet":
      return (
        <section id="wallet" style={{ marginTop: 40, scrollMarginTop: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER}` }}>
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: CHARCOAL }}>Transaction History</h3>
              </div>
              <div>
                {transactions.length === 0 ? (
                  <p style={{ padding: "24px", color: MUTED, fontSize: 13, margin: 0 }}>No wallet transactions yet.</p>
                ) : (
                  transactions.map((txn, idx) => (
                    <div key={txn.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 24px", borderTop: idx === 0 ? "none" : `1px solid ${BORDER}` }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: CHARCOAL }}>{txn.description}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{txn.date}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: txn.type === "credit" ? GREEN : CHARCOAL, fontSize: 14 }}>{txn.type === "credit" ? "+" : "−"}{txn.amount}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase" }}>{txn.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>GIG Wallet</p>
                <p style={{ margin: "8px 0 0", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.04em", color: GREEN }}>{walletBalance}</p>
              </div>
              <div style={{ paddingTop: 16, borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: MUTED }}>Available for Withdrawal</span><span style={{ fontWeight: 600, color: CHARCOAL }}>{walletBalance}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: MUTED }}>Minimum Withdrawal</span><span style={{ fontWeight: 500, color: CHARCOAL }}>₹500</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: MUTED }}>Processing Time</span><span style={{ fontWeight: 500, color: CHARCOAL }}>Instant (UPI)</span></div>
              </div>
{/* Withdrawal Form */}
              <div style={{ marginTop: 16 }}>
                <form id="withdrawal-form" onSubmit={handleWithdrawalSubmit}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <input
                      type="number"
                      min="500"
                      placeholder="Amount (₹)"
                      value={withdrawalAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWithdrawalAmount(val === "" ? "" : val);
                      }}
                      style={{
                        padding: "8px 12px",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 4,
                        fontSize: 13,
                        width: 120,
                      }}
                      disabled={withdrawalLoading}
                    />
                    <button
                      type="submit"
                      style={{
                        backgroundColor: MINT,
                        color: MINT_FG,
                        border: "none",
                        borderRadius: 4,
                        padding: "8px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: withdrawalLoading ? "not-allowed" : "pointer",
                        opacity: withdrawalLoading ? 0.7 : 1,
                      }}
                      disabled={withdrawalLoading}
                    >
                      {withdrawalLoading ? "Processing..." : "Withdraw"}
                    </button>
                  </div>
                  {withdrawalError && (
                    <p style={{ color: "#ff4d4d", fontSize: 12, margin: 0 }}>{withdrawalError}</p>
                  )}
                  {withdrawalSuccess && (
                    <p style={{ color: GREEN, fontSize: 12, margin: 0 }}>Withdrawal successful! Balance updated.</p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>
      );

    case "profile": {
      const [shareToast, setShareToast] = useState(false);
      const cleanGithub = cleanGithubHandle(profileState.github_handle);
      const displayBadges: DevBadge[] = badges;
      const displayPRs: DevPR[] = verifiedPRs;
      const hasGithub = Boolean(cleanGithub);
      const hasBio = Boolean(profileState.bio && profileState.bio.trim().length > 0);
      const hasLocation = Boolean(profileState.location && profileState.location.trim().length > 0);
      const hasContr = Boolean(verifiedPRs.length > 0 || tasks.length > 0 || displayPRs.length > 0);
      const completedCount = [hasGithub, hasBio, hasLocation, hasContr].filter(Boolean).length;
      const completenessPercentage = Math.max(25, Math.round((completedCount / 4) * 100));

      const handleShareProfile = async () => {
        try {
          if (typeof window !== "undefined") {
            await navigator.clipboard.writeText(window.location.href);
            setShareToast(true);
            setTimeout(() => setShareToast(false), 3000);
          }
        } catch {
          // Clipboard fallback
          setShareToast(true);
          setTimeout(() => setShareToast(false), 3000);
        }
      };

      return (
        <section id="profile" style={{ marginTop: 24, scrollMarginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Top Status Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 14px",
                  borderRadius: 9999,
                  backgroundColor: "rgba(0, 201, 80, 0.08)",
                  border: "1px solid rgba(0, 201, 80, 0.25)",
                  color: GREEN,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                TIER 2 CONTRIBUTOR · GIG VERIFIED
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 14px",
                  borderRadius: 9999,
                  backgroundColor: "rgba(0, 201, 80, 0.08)",
                  border: "1px solid rgba(0, 201, 80, 0.25)",
                  color: GREEN,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: MINT, display: "inline-block" }} />
                CONTRIBUTION VERIFIED
              </span>
            </div>
            <div>
              <button
                type="button"
                onClick={handleShareProfile}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 36,
                  padding: "0 16px",
                  borderRadius: 6,
                  backgroundColor: "#ffffff",
                  border: `1px solid ${BORDER}`,
                  color: CHARCOAL,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {shareIcon}
                <span>Share profile</span>
              </button>
            </div>
          </div>

          {/* Feedback alerts */}
          {profileSuccess && (
            <div style={{ padding: "12px 16px", backgroundColor: "rgba(0, 201, 80, 0.12)", border: "1px solid rgba(0, 201, 80, 0.25)", color: GREEN, borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              {checkIcon} <span>{profileSuccess}</span>
            </div>
          )}
          {profileError && (
            <div style={{ padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, fontSize: 13 }}>
              {profileError}
            </div>
          )}

          {/* Hero Card */}
          <div
            className="profile-hero-card"
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              boxShadow: CARD_SHADOW,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {/* Hero Left: Reputation Box */}
            <div
              className="profile-hero-left"
              style={{
                backgroundColor: "#09090b",
                color: "#ffffff",
                padding: "32px 28px",
                width: 280,
                minWidth: 260,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxSizing: "border-box",
                flexShrink: 0,
              }}
            >
              <div>
                <span style={{ fontSize: 11, letterSpacing: "0.15em", fontWeight: 700, textTransform: "uppercase", color: "#a1a1aa" }}>
                  GIG REPUTATION
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, marginBottom: 8 }}>
                  <span style={{ fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "#ffffff" }}>
                    {overriddenStats.reputationScore}
                  </span>
                  <span
                    style={{
                      backgroundColor: "rgba(0, 201, 80, 0.15)",
                      color: MINT,
                      border: "1px solid rgba(0, 201, 80, 0.30)",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 9999,
                      padding: "3px 10px",
                    }}
                  >
                    {overriddenStats.reputationBadge}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 24 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#a1a1aa" }}>
                  Last recalculated Today
                </p>
                <div style={{ height: 8, backgroundColor: "rgba(255, 255, 255, 0.12)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, Number(overriddenStats.reputationScore) || 0))}%`, backgroundColor: MINT, borderRadius: 9999 }} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 10, color: "#71717b" }}>
                  {overriddenStats.reputationFooter}
                </p>
              </div>
            </div>

            {/* Hero Right: Profile Details */}
            <div
              className="profile-hero-right"
              style={{
                padding: "32px 28px",
                flex: 1,
                minWidth: 320,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 20,
              }}
            >
              <div className="profile-hero-row" style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                {/* CIRCULAR PROFILE PICTURE (140x140) */}
                {profileState.avatar_url ? (
                  <img
                    src={profileState.avatar_url}
                    alt={profileState.username || "Profile picture"}
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "3px solid #ffffff",
                      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.10)",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: "50%",
                      backgroundColor: "#eef8f2",
                      border: "3px solid #ffffff",
                      color: GREEN,
                      fontSize: 46,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.10)",
                      flexShrink: 0,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {initials}
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: "2rem",
                      fontWeight: 800,
                      color: CHARCOAL,
                      letterSpacing: "-0.03em",
                      lineHeight: 1.2,
                    }}
                  >
                    {profileState.username || data.displayName}
                  </h1>

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 13, color: MUTED }}>
                    <span style={{ fontFamily: "monospace", color: CHARCOAL, fontWeight: 600 }}>
                      @{profileState.handle || (profileState.username ? profileState.username.toLowerCase().replace(/\s+/g, ".") : "alex.rivers")}
                    </span>
                    {cleanGithub && (
                      <a
                        href={`https://github.com/${cleanGithub}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, color: GREEN, textDecoration: "none", fontWeight: 600 }}
                      >
                        {githubIcon}
                        <span>github.com/{cleanGithub}</span>
                      </a>
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {mapPinIcon}
                      <span>{profileState.location || "Remote"}</span>
                    </span>
                    {profileState.company && (
                      <span>· {profileState.company}</span>
                    )}
                  </div>

                  <p
                    style={{
                      margin: "12px 0 14px",
                      fontSize: 14,
                      color: "#52525b",
                      lineHeight: 1.55,
                      maxWidth: 640,
                    }}
                  >
                    {profileState.bio || "Full-stack developer building high-assurance distributed systems with Next.js and TypeScript. Verified contributor in web runtime architectures."}
                  </p>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 14px",
                      borderRadius: 9999,
                      backgroundColor: "rgba(0, 201, 80, 0.10)",
                      border: "1px solid rgba(0, 201, 80, 0.25)",
                      color: GREEN,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: MINT }} />
                    <span>Available for verified tasks</span>
                  </div>
                </div>
              </div>

              {/* Hero Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #f4f4f5", paddingTop: 18 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormValues({ ...profileState });
                    setIsEditing(true);
                  }}
                  style={{
                    height: 40,
                    padding: "0 22px",
                    backgroundColor: MINT,
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0, 201, 80, 0.25)",
                  }}
                >
                  Edit profile
                </button>

                {cleanGithub ? (
                  <a
                    href={`https://github.com/${cleanGithub}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      height: 40,
                      padding: "0 18px",
                      backgroundColor: "#ffffff",
                      color: CHARCOAL,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>View GitHub profile</span>
                    <span style={{ fontSize: 14 }}>↗</span>
                  </a>
                ) : (
                  <a
                    href="/api/auth/github?mode=link"
                    style={{
                      height: 40,
                      padding: "0 18px",
                      backgroundColor: CHARCOAL,
                      color: "#ffffff",
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {githubIcon}
                    <span>Connect GitHub account</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Three Stat Cards Grid */}
          <div
            className="profile-stats-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            {/* Card 1: Verified Contributions */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                VERIFIED CONTRIBUTIONS
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: CHARCOAL, lineHeight: 1.1 }}>
                {overriddenStats.verifiedContributions}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                {overriddenStats.contributionsFooter || "Across 6 production open-source repositories"}
              </span>
            </div>

            {/* Card 2: Public Repos */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                PUBLIC REPOS
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: CHARCOAL, lineHeight: 1.1 }}>
                {profileState.public_repos_count !== null && profileState.public_repos_count !== undefined
                  ? profileState.public_repos_count
                  : cleanGithub ? "18" : "—"}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                {cleanGithub ? "GitHub connected" : "Connect GitHub to sync repositories"}
              </span>
            </div>

            {/* Card 3: Total Earnings */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                TOTAL EARNINGS
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: GREEN, lineHeight: 1.1 }}>
                {overriddenStats.walletBalance}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                Ready for instant UPI bank withdrawal (Min ₹500)
              </span>
            </div>
          </div>

          {/* Two-Column Lower Section */}
          <div
            className="profile-lower-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "360px 1fr",
              gap: 20,
              alignItems: "start",
            }}
          >
            {/* Left Column: Specializations & Completeness */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Card 1: Verified Specializations */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, backgroundColor: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Verified specializations
                  </h3>
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{displayBadges.length} verified</span>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {displayBadges.map((badge) => (
                    <div key={badge.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, color: CHARCOAL, fontSize: 13 }}>{badge.label}</span>
                        <span style={{ fontSize: 11, color: MUTED }}>{badge.earned}</span>
                      </div>
                      <span style={{ fontSize: 12, color: MUTED }}>{badge.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Profile Completeness */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Profile completeness
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, backgroundColor: "rgba(0, 201, 80, 0.10)", padding: "2px 8px", borderRadius: 9999 }}>
                    {completenessPercentage}%
                  </span>
                </div>
                <div style={{ height: 8, backgroundColor: "#f4f4f5", borderRadius: 9999, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ height: "100%", width: `${completenessPercentage}%`, backgroundColor: MINT, borderRadius: 9999 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasGithub ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasGithub ? MINT : "#d1d5db", fontWeight: 700 }}>{hasGithub ? "✓" : "○"}</span>
                    <span>GitHub account connected</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasBio ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasBio ? MINT : "#d1d5db", fontWeight: 700 }}>{hasBio ? "✓" : "○"}</span>
                    <span>Bio and introduction added</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasLocation ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasLocation ? MINT : "#d1d5db", fontWeight: 700 }}>{hasLocation ? "✓" : "○"}</span>
                    <span>Location specified</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasContr ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasContr ? MINT : "#d1d5db", fontWeight: 700 }}>{hasContr ? "✓" : "○"}</span>
                    <span>First verified contribution</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFormValues({ ...profileState });
                    setIsEditing(true);
                  }}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    height: 36,
                    backgroundColor: "#ffffff",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    color: CHARCOAL,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span>Complete profile</span>
                  <span>↗</span>
                </button>
              </div>
            </div>

            {/* Right Column: Evidence Timeline */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, backgroundColor: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Evidence timeline
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>
                    Verified pull requests and merge proofs
                  </p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>
                  {displayPRs.length} verified PRs
                </span>
              </div>

              <div>
                {displayPRs.map((pr, idx) => (
                  <div
                    key={pr.id}
                    style={{
                      padding: "16px 20px",
                      borderTop: idx === 0 ? "none" : `1px solid ${BORDER}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: MUTED, backgroundColor: "#f4f4f5", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginBottom: 4 }}>
                          {pr.repo}
                        </span>
                        <p style={{ margin: 0, fontWeight: 700, color: CHARCOAL, fontSize: 14 }}>
                          {pr.title}
                        </p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: "nowrap" }}>
                        {pr.linesChanged}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: MUTED, flexWrap: "wrap", gap: 8 }}>
                      <span>Merged {pr.mergedAt} · 4-day review turnaround</span>
                      <span style={{ color: GREEN, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {checkIcon} Approved by Maintainer (Core Team)
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Verification Path */}
              <div style={{ padding: "16px 20px", backgroundColor: "#fafafa", borderTop: `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>
                    Verification Path:
                  </span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Task
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Pull request
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Maintainer review
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 12px", borderRadius: 6, backgroundColor: MINT, color: "#ffffff", fontSize: 11, fontWeight: 700 }}>
                    Verified contribution
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Call-to-Action Card */}
          <div
            style={{
              backgroundColor: "#09090b",
              borderTop: `3px solid ${MINT}`,
              borderRadius: 12,
              padding: "24px 28px",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#ffffff" }}>
                Build a profile that proves the work
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>
                Every claim becomes inspectable evidence: repository, pull request, review, and outcome.
              </p>
            </div>
            <Link
              href="/dashboard/developer?tab=issues"
              style={{
                padding: "10px 20px",
                backgroundColor: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.35)",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>Explore issue pool</span>
              <span>→</span>
            </Link>
          </div>

          {/* Edit Developer Modal */}
          <EditDeveloperModal
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            formValues={formValues}
            setFormValues={setFormValues}
            onSave={handleSaveProfile}
            saving={savingProfile}
            error={profileError}
            initials={initials}
          />

          {/* Toast Notification */}
          {shareToast && (
            <div
              style={{
                position: "fixed",
                bottom: 24,
                right: 24,
                zIndex: 9999,
                backgroundColor: "#09090b",
                color: "#ffffff",
                padding: "12px 20px",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${MINT}`,
              }}
            >
              <span style={{ color: MINT }}>✓</span> Profile link copied to clipboard!
            </div>
          )}
        </section>
      );
    }
  }
}

export default function DeveloperDashboard({ data = FALLBACK, issuePool }: DevDashboardProps) {
  const searchParams = useSearchParams();
  const activeTab: DevTab = (() => {
    const tab = searchParams?.get("tab") as DevTab;
    return tab && ["dashboard", "tasks", "issues", "prs", "wallet", "profile"].includes(tab) ? tab : "dashboard";
  })();

  const [walletData, setWalletData] = useState<{ balance: string; transactions: DevTransaction[] } | null>(null);
  const [walletLoading, setWalletLoading] = useState<boolean>(true);

  // Withdrawal form state
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");
  const [withdrawalLoading, setWithdrawalLoading] = useState<boolean>(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<boolean>(false);

  // Profile state & edit form state
  const initialGithubHandle = cleanGithubHandle(data?.github_handle || data?.githubHandle);
  const [profileState, setProfileState] = useState<DeveloperProfileState>({
    username: data?.username || data?.displayName || FALLBACK.username,
    handle: data?.handle || FALLBACK.handle,
    avatar_url: data?.avatar_url || FALLBACK.avatar_url,
    github_handle: initialGithubHandle,
    bio: data?.bio || FALLBACK.bio,
    company: data?.company || FALLBACK.company,
    location: data?.location || FALLBACK.location,
    followers_count: data?.followers_count ?? FALLBACK.followers_count,
    public_repos_count: data?.public_repos_count ?? FALLBACK.public_repos_count,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<DeveloperProfileState>({ ...profileState });

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const sanitizedValues = {
        ...formValues,
        github_handle: cleanGithubHandle(formValues.github_handle),
      };
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitizedValues),
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to update profile: ${res.status}`);
      }

      setProfileState({ ...formValues });
      setIsEditing(false);
      setProfileSuccess("Profile updated successfully!");
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: unknown) {
      setProfileError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  // Fetch wallet data on mount
  useEffect(() => {
    async function fetchWallet() {
      setWalletLoading(true);
      try {
        const response = await fetch(`/api/wallet`, {
          method: "GET",
          credentials: "include", // Important to send cookies
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch wallet: ${response.status}`);
        }
        const json = await response.json();
        setWalletData(json);
      } catch {
        setWalletData(null); // Keep null so we can show error or fallback
      } finally {
        setWalletLoading(false);
      }
    }

    fetchWallet();
  }, []); // Empty deps means run once on mount

  // Refetch wallet data (used after successful withdrawal).
  // Silent mode refreshes in the background without flashing stale
  // prop data (walletLoading swaps the display source — see below).
  const refetchWallet = async (silent = false) => {
    if (!silent) setWalletLoading(true);
    try {
      const response = await fetch(`/api/wallet`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch wallet: ${response.status}`);
      }
      const json = await response.json();
      setWalletData(json);
    } catch {
      if (!silent) setWalletData(null);
    } finally {
      if (!silent) setWalletLoading(false);
    }
  };

  function formatINR(amount: number): string {
    const formatted = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
    return `₹${formatted}`;
  }

  // Handle withdrawal form submission
  const handleWithdrawalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setWithdrawalError(null);
    setWithdrawalSuccess(false);
    setWithdrawalLoading(true);

    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount < 500) {
      setWithdrawalError("Amount must be at least 500");
      setWithdrawalLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/wallet/withdrawal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Withdrawal failed");
      }

      // Success: patch the displayed balance instantly from the server's
      // authoritative new balance, then quietly refresh transactions behind it.
      const result = await response.json();
      if (typeof result.newBalance === "number") {
        const patched = formatINR(result.newBalance);
        setWalletData((prev) => (prev ? { ...prev, balance: patched } : prev));
      }
      setWithdrawalSuccess(true);
      setWithdrawalAmount("");
      void refetchWallet(true);
    } catch (err: unknown) {
      setWithdrawalError(getErrorMessage(err));
    } finally {
      setWithdrawalLoading(false);
    }
  };

  // Determine wallet balance and transactions to use
  // If we have fetched data, use it; otherwise, fall back to data prop or FALLBACK
  let balanceToDisplay = "₹0";
  let transactionsToDisplay: DevTransaction[] = [];
  if (!walletLoading && walletData) {
    // We have fetched data
    balanceToDisplay = walletData.balance;
    transactionsToDisplay = walletData.transactions;
  } else if (walletLoading && data) {
    // Still loading, use data from prop for now
    balanceToDisplay = data.stats.walletBalance;
    transactionsToDisplay = data.transactions;
  } else if (data) {
    // Error or no fetched data, fallback to data prop
    balanceToDisplay = data.stats.walletBalance;
    transactionsToDisplay = data.transactions;
  } else {
    // No data prop, use FALLBACK
    balanceToDisplay = FALLBACK.stats.walletBalance;
    transactionsToDisplay = FALLBACK.transactions;
  }

  // Create merged data object with overridden wallet balance and transactions
  const mergedData: DeveloperDashboardData = {
    ...(data ?? FALLBACK),
    stats: { ...(data ?? FALLBACK).stats, walletBalance: balanceToDisplay },
    transactions: transactionsToDisplay,
    walletTxCount: transactionsToDisplay.length,
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: BG_PAGE, color: CHARCOAL }}>
      <style>{`
        @media (max-width: 1024px) {
          .dev-metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 900px) {
          .profile-hero-card { flex-direction: column !important; }
          .profile-hero-left { width: 100% !important; min-width: 100% !important; }
          .profile-lower-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .dev-page-wrap { padding: 20px 16px 64px !important; }
          .dev-metrics-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .profile-stats-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .profile-hero-row { flex-direction: column !important; align-items: center !important; text-align: center !important; }
          .contrib-footer { grid-template-columns: minmax(0, 1fr) !important; }
          .contrib-footer > div { border-right: none !important; border-top: 1px solid rgba(255,255,255,0.10); }
          .contrib-footer > div:first-child { border-top: none; }
        }
      `}</style>
      <div className="dev-page-wrap" style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 36px 80px" }}>
        {activeTab === "profile" ? null : (
          <DevHeader
            displayName={profileState.username || mergedData.displayName}
            handle={profileState.handle || mergedData.handle}
            activeTab={activeTab}
            githubHandle={profileState.github_handle || mergedData.githubHandle}
          />
        )}
        <TabContent
          activeTab={activeTab}
          data={mergedData}
          issuePool={issuePool}
          walletBalance={balanceToDisplay}
          transactions={transactionsToDisplay}
          withdrawalAmount={withdrawalAmount}
          setWithdrawalAmount={setWithdrawalAmount}
          withdrawalLoading={withdrawalLoading}
          withdrawalError={withdrawalError}
          withdrawalSuccess={withdrawalSuccess}
          handleWithdrawalSubmit={handleWithdrawalSubmit}
          profileState={profileState}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          formValues={formValues}
          setFormValues={setFormValues}
          savingProfile={savingProfile}
          profileSuccess={profileSuccess}
          profileError={profileError}
          handleSaveProfile={handleSaveProfile}
        />
      </div>
    </div>
  );
}