"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import BizHeader from "@/components/dashboard/BizHeader";
import SectionHeading from "@/components/dashboard/SectionHeading";
import TaskTable from "@/components/dashboard/TaskTable";
import TalentCard from "@/components/dashboard/TalentCard";
import EscrowCard from "@/components/dashboard/EscrowCard";
import Card from "@/components/dashboard/Card";
import IssuePool from "@/components/dashboard/IssuePool";
import SubmissionsReviewPanel from "@/components/dashboard/SubmissionsReviewPanel";
import GitHubImportModal from "@/components/dashboard/GitHubImportModal";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import type { IssuePoolData } from "@/lib/dashboard-data";
import { type SubmissionReview, cleanGithubHandle } from "@/lib/db-operations";
import { getSavedTasks } from "@/lib/saved-tasks";

const BG_PAGE = "#fbfcfb";
const CHARCOAL = "#151b1d";
const BORDER = "#e4e4e7";
const MUTED = "#71717b";
const GREEN = "#257b5a";
const MINT = "#00c950";
const CARD_SHADOW = "0 8px 24px rgba(37, 123, 90, 0.06)";

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

type BizTab = "dashboard" | "tasks-backlog" | "issue-pool" | "talent-pool" | "workspace" | "billing" | "profile";

export interface BizMetric {
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}

export interface BizTask {
  id: string;
  title: string;
  repo: string;
  budget: string;
  applicantsCount: number;
  status: "Active" | "Reviewing" | "Open for Bids" | "Queued";
  assignee?: string;
  priority: "Critical" | "High" | "Standard";
  targetRelease: string;
}

export interface BizContributor {
  id: string;
  name: string;
  githubHandle: string;
  reputation: number;
  mergedPRs: number;
  specialties: string[];
  status: "Available" | "Assigned" | "Top Contributor";
}

export interface BizDisbursal {
  id: string;
  date: string;
  recipient: string;
  taskTitle: string;
  amount: string;
  status: "Settled" | "Processing";
  txHash: string;
}

export interface BusinessDashboardData {
  displayName: string;
  displayEmail: string;
  githubHandle?: string | null;
  company?: string | null;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  metrics: BizMetric[];
  backlogTasks: BizTask[];
  talentPool: BizContributor[];
  disbursals: BizDisbursal[];
}

export interface BusinessDashboardProps {
  data?: BusinessDashboardData;
  issuePool?: IssuePoolData;
  reviews?: SubmissionReview[];
}

const FALLBACK: BusinessDashboardData = {
  displayName: "Business Account",
  displayEmail: "",
  company: null,
  bio: null,
  location: null,
  avatar_url: null,
  metrics: [
    { label: "Active Engineering Bounties", value: "—", subtext: "No active bounties yet", highlight: true },
    { label: "Vetted Talent Pool", value: "—", subtext: "No contributors yet" },
    { label: "Escrow Vault Secured", value: "—", subtext: "Held in escrow" },
    { label: "Avg PR Merge Velocity", value: "—", subtext: "No data yet" },
  ],
  backlogTasks: [],
  talentPool: [],
  disbursals: [],
};

function createEmptyBizIssuePool(): IssuePoolData {
  return {
    role: "business",
    displayName: "Business Account",
    initials: "CO",
    company: null,
    issues: [],
    openCount: 0,
    claimedByMe: 0,
    claimedTotal: 0,
    rewardTotal: 0,
    rewardCurrency: "INR",
    matchScore: "0%",
    matchLabel: "Engagement",
    matchSub: "of your issues claimed by devs",
    recommended: [],
    journey: [
      { num: 1, title: "Post issue", desc: "Create a task spec with clear acceptance criteria" },
      { num: 2, title: "Fund escrow", desc: "Rewards stay locked in the vault until verified" },
      { num: 3, title: "Review PRs", desc: "Inspect pull requests and accept merged work" },
      { num: 4, title: "Pay out", desc: "Verified contributions disburse straight to devs" },
    ],
  };
}

function Metrics({ metrics }: { metrics: BizMetric[] }) {
  return (
    <div className="biz-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
      {metrics.map((metric) => (
        <div key={metric.label} style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>{metric.label}</p>
            <p style={{ margin: "8px 0 0", fontSize: "2.25rem", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.1, color: metric.highlight ? GREEN : CHARCOAL }}>{metric.value}</p>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>{metric.subtext}</p>
        </div>
      ))}
    </div>
  );
}

interface ProfileState {
  company: string;
  displayName: string;
  displayEmail: string;
  githubHandle: string;
  bio: string;
  location: string;
  avatar_url: string | null;
}

function EditBusinessModal({
  isOpen,
  onClose,
  profileForm,
  setProfileForm,
  onSave,
  saving,
  error,
  initials,
}: {
  isOpen: boolean;
  onClose: () => void;
  profileForm: ProfileState;
  setProfileForm: React.Dispatch<React.SetStateAction<ProfileState>>;
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
              Edit Company Profile
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>
              Update company identity, mission, headquarters, and GitHub organization
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

          {/* Circular Company Logo Preview & Input */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {profileForm.avatar_url ? (
              <img
                src={profileForm.avatar_url}
                alt="Logo preview"
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
                  backgroundColor: "#151b1d",
                  border: `2px solid ${MINT}`,
                  color: MINT,
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
                Company Logo / Avatar URL
              </label>
              <input
                type="text"
                value={profileForm.avatar_url || ""}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, avatar_url: e.target.value }))}
                placeholder="https://images.unsplash.com/... or logo image"
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

          {/* Company Name & GitHub Organization */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Company Name
              </label>
              <input
                type="text"
                value={profileForm.company || ""}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, company: e.target.value, displayName: e.target.value }))}
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
                GitHub Organization
              </label>
              <input
                type="text"
                value={profileForm.githubHandle || ""}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, githubHandle: e.target.value }))}
                placeholder="e.g. acme-corp"
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

          {/* Mission / Bio */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
              Company Mission / Overview
            </label>
            <textarea
              value={profileForm.bio || ""}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
              rows={3}
              placeholder="Describe your organization and the open source software you sponsor..."
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

          {/* Location & Admin Email */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: CHARCOAL, fontWeight: 600 }}>
                Headquarters / Location
              </label>
              <input
                type="text"
                value={profileForm.location || ""}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="e.g. San Francisco, CA / Remote"
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
                Admin Email (Read-only)
              </label>
              <input
                type="text"
                value={profileForm.displayEmail}
                disabled
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  backgroundColor: "#f4f4f5",
                  color: MUTED,
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

function TabContent({
  activeTab,
  data,
  issuePool,
  reviews,
  onOpenImportModal,
  profileState,
  isEditingProfile,
  setIsEditingProfile,
  profileForm,
  setProfileForm,
  savingProfile,
  profileSuccess,
  profileError,
  handleSaveProfile,
}: {
  activeTab: BizTab;
  data: BusinessDashboardData;
  issuePool?: IssuePoolData;
  reviews?: SubmissionReview[];
  onOpenImportModal: () => void;
  profileState: ProfileState;
  isEditingProfile: boolean;
  setIsEditingProfile: (val: boolean) => void;
  profileForm: ProfileState;
  setProfileForm: React.Dispatch<React.SetStateAction<ProfileState>>;
  savingProfile: boolean;
  profileSuccess: string | null;
  profileError: string | null;
  handleSaveProfile: () => Promise<void>;
}) {
  const { metrics, backlogTasks, talentPool, disbursals } = data;

  switch (activeTab) {
    case "dashboard":
      return (
        <ActivityFeed
          role="business"
          savedTasks={getSavedTasks()}
          claimedTasks={backlogTasks.map((t) => ({
            id: t.id,
            title: t.title,
            repo: t.repo,
            status: "Locked",
            assignee: t.assignee || "Unassigned",
            lockedAmount: t.budget || "—",
            lockExpiry: "48h",
          }))}
          verifiedPRs={[]}
          transactions={disbursals.map((d) => ({
            id: d.id,
            date: d.date,
            description: d.recipient,
            amount: d.amount,
            type: "debit",
            status: "Completed",
          }))}
          githubHandle={profileState.githubHandle}
          displayName={profileState.company || profileState.displayName}
        />
      );

    case "issue-pool":
      return (
        <IssuePool
          data={issuePool ?? createEmptyBizIssuePool()}
          role="business"
          onOpenImportModal={onOpenImportModal}
        />
      );

    case "tasks-backlog": {
      const savedTasksList = getSavedTasks();
      const savedBizTasks: BizTask[] = savedTasksList.map((st) => ({
        id: st.id,
        title: st.title,
        repo: st.repo,
        budget: `₹${(st.reward || 0).toLocaleString("en-IN")}`,
        applicantsCount: 1,
        status: "Active",
        priority: "High",
        targetRelease: "v0.2.0",
      }));
      const combinedBacklog = [...savedBizTasks, ...backlogTasks];

      return (
        <>
          <section id="overview" style={{ marginBottom: 40, scrollMarginTop: 24 }}>
            <SectionHeading title="Workspace Overview & Metrics" sub="Real-time telemetry across all active bounties and contributors" />
            <Metrics metrics={metrics} />
          </section>

          <section id="tasks" style={{ marginBottom: 40, scrollMarginTop: 24 }}>
            <SectionHeading
              title="Task Backlog & Post a Task"
              sub="Production task specifications, contributor assignments, and milestone deliverables"
              right={
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={onOpenImportModal}
                    style={{
                      height: 40,
                      padding: "0 18px",
                      borderRadius: 8,
                      backgroundColor: GREEN,
                      border: "none",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    + Import from GitHub
                  </button>
                </div>
              }
            />
            <Card><TaskTable tasks={combinedBacklog} isBusiness={true} /></Card>
          </section>
        </>
      );
    }

    case "talent-pool":
      return (
        <section id="talent" style={{ marginBottom: 40, scrollMarginTop: 24 }}>
          <SectionHeading title="Contributor Talent Pool" sub="Verified top-tier software engineers with tamper-proof pull request track records" right={<span style={{ fontSize: 12, color: MUTED }}>{talentPool.length} Active Contributors Matched</span>} />
          <div className="biz-talent-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            {talentPool.map((contributor) => <TalentCard key={contributor.id} contributor={contributor} />)}
          </div>
        </section>
      );

    case "workspace":
      return (
        <>
          <section id="overview" style={{ marginBottom: 40, scrollMarginTop: 24 }}>
            <SectionHeading title="Workspace Overview & Metrics" sub="Real-time telemetry across all active bounties and contributors" />
            <Metrics metrics={metrics} />
          </section>

          <section id="reviews" style={{ marginBottom: 40, scrollMarginTop: 24 }}>
            <SectionHeading title="Incoming Submissions" sub="Review pull requests and release escrow funds to verified contributors" />
            <SubmissionsReviewPanel reviews={reviews ?? []} />
          </section>

          <section id="activity" style={{ scrollMarginTop: 24 }}>
            <SectionHeading title="Recent Workspace Activity" sub="Latest updates across bounties, contributors, and disbursals" />
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, backgroundColor: "rgba(0,0,0,0.02)" }}><h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: CHARCOAL }}>Activity Feed</h3></div>
              <div style={{ padding: 20 }}>
                {disbursals.length === 0 ? (
                  <p style={{ margin: 0, color: MUTED }}>No disbursal activity yet.</p>
                ) : (
                  disbursals.slice(0, 4).map((d) => (
                    <div key={d.id} style={{ padding: "12px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: CHARCOAL }}>{d.recipient}</span> — {d.taskTitle}
                      <span style={{ color: MUTED }}> · {d.amount}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      );

    case "billing":
      return (
        <section id="billing" style={{ scrollMarginTop: 24 }}>
          <SectionHeading title="Escrow Account & Billing / Disbursals" sub="Deterministic escrow management, automated bounty disbursals, and secure audit records" />
          <EscrowCard disbursals={disbursals} vaultAmount="14,200" lockedAmount="4,800 Coins" disbursedAmount="9,400 Coins" nextInvoiceDate="Monthly (Next: Oct 1)" />
        </section>
      );

    case "profile": {
      const [shareToast, setShareToast] = useState(false);
      const cleanGithub = cleanGithubHandle(profileState.githubHandle);
      const companyDisplayName = profileState.company || profileState.displayName || "Business Account";
      const companyInitials = companyDisplayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const hasOrgGithub = Boolean(cleanGithub);
      const hasOrgBio = Boolean(profileState.bio && profileState.bio.trim().length > 0);
      const hasOrgLocation = Boolean(profileState.location && profileState.location.trim().length > 0);
      const hasEscrowActive = true;
      const completedCount = [hasOrgGithub, hasOrgBio, hasOrgLocation, hasEscrowActive].filter(Boolean).length;
      const completenessPercentage = Math.max(25, Math.round((completedCount / 4) * 100));

      const handleShareProfile = async () => {
        try {
          if (typeof window !== "undefined") {
            await navigator.clipboard.writeText(window.location.href);
            setShareToast(true);
            setTimeout(() => setShareToast(false), 3000);
          }
        } catch {
          setShareToast(true);
          setTimeout(() => setShareToast(false), 3000);
        }
      };

      const displayDisbursals: BizDisbursal[] = disbursals;

      return (
        <section id="biz-profile" style={{ marginTop: 24, scrollMarginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
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
                BUSINESS TIER 1 · GIG VERIFIED
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
                MULTI-SIG ESCROW ACTIVE
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
            className="biz-hero-card"
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              boxShadow: CARD_SHADOW,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {/* Hero Left: Escrow Vault & Trust Rating */}
            <div
              className="biz-hero-left"
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
                  ORGANIZATION TRUST RATING
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, marginBottom: 8 }}>
                  <span style={{ fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: "#ffffff" }}>
                    100%
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
                    TIER 1 SPONSOR
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 24 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#a1a1aa" }}>
                  Funds held in escrow
                </p>
                <div style={{ height: 8, backgroundColor: "rgba(255, 255, 255, 0.12)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "100%", backgroundColor: MINT, borderRadius: 9999 }} />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 10, color: "#71717b" }}>
                  Escrow Active
                </p>
              </div>
            </div>

            {/* Hero Right: Organization Details */}
            <div
              className="biz-hero-right"
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
              <div className="biz-hero-row" style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
                {/* CIRCULAR PROFILE PICTURE (140x140) */}
                {profileState.avatar_url ? (
                  <img
                    src={profileState.avatar_url}
                    alt={companyDisplayName}
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
                      backgroundColor: "#151b1d",
                      border: "3px solid #ffffff",
                      color: MINT,
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
                    {companyInitials}
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
                    {companyDisplayName}
                  </h1>

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 13, color: MUTED }}>
                    <span style={{ fontFamily: "monospace", color: CHARCOAL, fontWeight: 600 }}>
                      {profileState.displayEmail}
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
                      <span>{profileState.location || "San Francisco, CA"}</span>
                    </span>
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
                    {profileState.bio || "Building next-generation open source distributed infrastructure and high-assurance web platforms."}
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
                    <span>Business Account</span>
                  </div>
                </div>
              </div>

              {/* Hero Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #f4f4f5", paddingTop: 18 }}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileForm({ ...profileState });
                    setIsEditingProfile(true);
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
                  Edit company profile
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
                    <span>View GitHub organization</span>
                    <span style={{ fontSize: 14 }}>↗</span>
                  </a>
                ) : (
                  <a
                     href="/api/auth/github?mode=link&role=business"
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
                    <span>Connect GitHub organization</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Three Stat Cards Grid */}
          <div
            className="biz-stats-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
            }}
          >
            {/* Card 1: Active Bounties */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                ACTIVE BOUNTIES
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: CHARCOAL, lineHeight: 1.1 }}>
                {backlogTasks.length}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                4 in progress, 4 accepting bids
              </span>
            </div>

            {/* Card 2: Connected Repositories */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                CONNECTED REPOSITORIES
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: CHARCOAL, lineHeight: 1.1 }}>
                {cleanGithub ? "4" : "0"}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                {cleanGithub ? "GitHub organization verified" : "Connect GitHub organization"}
              </span>
            </div>

            {/* Card 3: Escrow Vault Secured */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", boxShadow: CARD_SHADOW, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                ESCROW VAULT SECURED
              </span>
              <span style={{ fontSize: "2.25rem", fontWeight: 800, color: GREEN, lineHeight: 1.1 }}>
                —
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                Funds held in escrow
              </span>
            </div>
          </div>

          {/* Two-Column Lower Section */}
          <div
            className="biz-lower-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "360px 1fr",
              gap: 20,
              alignItems: "start",
            }}
          >
            {/* Left Column: Scope & Completeness */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Card 1: Enterprise Engineering Scope */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, backgroundColor: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Enterprise engineering scope
                  </h3>
                  <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>ESCROW ACTIVE</span>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.55 }}>
                    Funds are held in escrow and released upon verified contribution.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #f4f4f5", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: CHARCOAL }}>Next.js 16 Runtime</span>
                      <span style={{ color: MUTED }}>Active Focus</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: CHARCOAL }}>ZK-SNARKs Protocol</span>
                      <span style={{ color: MUTED }}>Verification</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: CHARCOAL }}>Distributed Storage Mesh</span>
                      <span style={{ color: MUTED }}>Production</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Organization Completeness */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Organization completeness
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, backgroundColor: "rgba(0, 201, 80, 0.10)", padding: "2px 8px", borderRadius: 9999 }}>
                    {completenessPercentage}%
                  </span>
                </div>
                <div style={{ height: 8, backgroundColor: "#f4f4f5", borderRadius: 9999, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ height: "100%", width: `${completenessPercentage}%`, backgroundColor: MINT, borderRadius: 9999 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasOrgGithub ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasOrgGithub ? MINT : "#d1d5db", fontWeight: 700 }}>{hasOrgGithub ? "✓" : "○"}</span>
                    <span>GitHub organization connected</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasOrgBio ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasOrgBio ? MINT : "#d1d5db", fontWeight: 700 }}>{hasOrgBio ? "✓" : "○"}</span>
                    <span>Company mission & details added</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasOrgLocation ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasOrgLocation ? MINT : "#d1d5db", fontWeight: 700 }}>{hasOrgLocation ? "✓" : "○"}</span>
                    <span>Headquarters / Location specified</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: hasEscrowActive ? CHARCOAL : MUTED }}>
                    <span style={{ color: hasEscrowActive ? MINT : "#d1d5db", fontWeight: 700 }}>{hasEscrowActive ? "✓" : "○"}</span>
                    <span>Multi-sig escrow vault funded</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileForm({ ...profileState });
                    setIsEditingProfile(true);
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

            {/* Right Column: Bounties & Escrow Timeline */}
            <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, backgroundColor: "rgba(0,0,0,0.02)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: CHARCOAL }}>
                    Bounties & escrow timeline
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>
                    Recent task assignments, milestone completions, and settled disbursals
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenImportModal}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    backgroundColor: GREEN,
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  + Import Repo
                </button>
              </div>

              <div>
                {displayDisbursals.map((dis, idx) => (
                  <div
                    key={dis.id}
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
                        <p style={{ margin: 0, fontWeight: 700, color: CHARCOAL, fontSize: 14 }}>
                          {dis.taskTitle}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: MUTED }}>
                          Contributor: <span style={{ fontWeight: 600, color: CHARCOAL }}>{dis.recipient}</span> · Settled {dis.date}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>
                          {dis.amount}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: "rgba(0, 201, 80, 0.10)",
                            color: GREEN,
                          }}
                        >
                          Settled
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: MUTED }}>
                      <span style={{ fontFamily: "monospace" }}>Tx: {dis.txHash}</span>
                      <span style={{ color: GREEN, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {checkIcon} Verified
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Bounty Lifecycle */}
              <div style={{ padding: "16px 20px", backgroundColor: "#fafafa", borderTop: `1px solid ${BORDER}` }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>
                    Bounty Lifecycle:
                  </span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Task spec
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Fund escrow
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 600, color: CHARCOAL }}>
                    Review PR
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>→</span>
                  <span style={{ padding: "4px 12px", borderRadius: 6, backgroundColor: MINT, color: "#ffffff", fontSize: 11, fontWeight: 700 }}>
                    Automated payout
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
                Scale engineering output with verified talent
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a1a1aa" }}>
                Deterministic escrow contracts, automated test validation, and verified contributors.
              </p>
            </div>
            <Link
              href="/dashboard/business?tab=issue-pool"
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

          {/* Edit Company Profile Modal */}
          <EditBusinessModal
            isOpen={isEditingProfile}
            onClose={() => setIsEditingProfile(false)}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onSave={handleSaveProfile}
            saving={savingProfile}
            error={profileError}
            initials={companyInitials}
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

export default function BusinessDashboard({ data = FALLBACK, issuePool, reviews }: BusinessDashboardProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const searchParams = useSearchParams();
  const activeTab: BizTab = (() => {
    const tab = searchParams?.get("tab") as BizTab;
    return tab && ["dashboard", "tasks-backlog", "issue-pool", "talent-pool", "workspace", "billing", "profile"].includes(tab) ? tab : "dashboard";
  })();

  // Company profile state
  const initialGithubHandle = cleanGithubHandle(data.githubHandle) || "";
  const [profileState, setProfileState] = useState<ProfileState>({
    company: data.company || data.displayName || FALLBACK.company || "",
    displayName: data.displayName || FALLBACK.displayName,
    displayEmail: data.displayEmail || FALLBACK.displayEmail,
    githubHandle: initialGithubHandle,
    bio: data.bio || FALLBACK.bio || "",
    location: data.location || FALLBACK.location || "",
    avatar_url: data.avatar_url || null,
  });

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileState>({ ...profileState });

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const cleanHandle = cleanGithubHandle(profileForm.githubHandle);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: profileForm.company,
          username: profileForm.displayName,
          bio: profileForm.bio,
          location: profileForm.location,
          avatar_url: profileForm.avatar_url,
          github_handle: cleanHandle,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to update profile: ${res.status}`);
      }

      setProfileState({ ...profileForm });
      setIsEditingProfile(false);
      setProfileSuccess("Company profile updated successfully!");
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: BG_PAGE, color: CHARCOAL }}>
      <style>{`
        @media (max-width: 1024px) {
          .biz-metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .biz-escrow-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .biz-profile-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 900px) {
          .biz-hero-card { flex-direction: column !important; }
          .biz-hero-left { width: 100% !important; min-width: 100% !important; }
          .biz-lower-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .biz-page-wrap { padding: 20px 16px 64px !important; }
          .biz-metrics-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .biz-stats-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .biz-hero-row { flex-direction: column !important; align-items: center !important; text-align: center !important; }
          .biz-talent-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .biz-profile-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
      <div className="biz-page-wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 36px 80px" }}>
        {activeTab === "profile" ? null : (
          <BizHeader
            displayName={profileState.company || profileState.displayName}
            displayEmail={profileState.displayEmail}
            activeTab={activeTab}
            githubHandle={profileState.githubHandle}
          />
        )}
        <TabContent
          activeTab={activeTab}
          data={data}
          issuePool={issuePool}
          reviews={reviews}
          onOpenImportModal={() => setImportModalOpen(true)}
          profileState={profileState}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          savingProfile={savingProfile}
          profileSuccess={profileSuccess}
          profileError={profileError}
          handleSaveProfile={handleSaveProfile}
        />
      </div>

      <GitHubImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}