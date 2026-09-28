"use client";

import Link from "next/link";
import { useState } from "react";
import type { Profile, UserProfile, Wallet, WalletTransaction, Contribution, ClaimedTask } from "@/lib/db-operations";
import CreateIssueModal from "@/components/dashboard/CreateIssueModal";

const BORDER = "#e4e4e7";
const CHARCOAL = "#151b1d";
const MUTED = "#71717b";
const GREEN = "#257b5a";
const MINT = "#00c950";
const MINT_SOFT = "rgba(0, 201, 80, 0.10)";
const MINT_BDR = "rgba(0, 201, 80, 0.20)";
const MINT_FG = "#f0fdf4";
const CARD_SHADOW = "0 8px 24px rgba(37, 123, 90, 0.06)";
const BG_PAGE = "#fbfcfb";

type ProfileTab = "overview" | "edit" | "wallet" | "activity";

interface ProfileViewProps {
  initialProfile: Profile;
  transactions?: WalletTransaction[];
  contributions?: Contribution[];
  claimedTasks?: ClaimedTask[];
  role: "developer" | "business";
}

export default function ProfileView({
  initialProfile,
  transactions = [],
  contributions = [],
  claimedTasks = [],
  role,
}: ProfileViewProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Edit Form State
  const user = profile.user;
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [company, setCompany] = useState(user?.company || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [githubHandle, setGithubHandle] = useState(user?.github_handle || "");

  // Saving state
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const wallet = profile.wallet;
  const walletBalance = wallet?.available_balance ?? 0;
  const dashboardHref = role === "business" ? "/dashboard/business" : "/dashboard/developer";

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          company: company.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          github_handle: githubHandle.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: json.error || "Failed to update profile", isError: true });
      } else {
        setStatusMsg({ text: "Profile updated successfully!", isError: false });
        if (json.profile) {
          setProfile(json.profile);
        } else if (json.user) {
          setProfile((prev) => ({ ...prev, user: json.user }));
        }
      }
    } catch {
      setStatusMsg({ text: "Network error updating profile.", isError: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: BG_PAGE, color: CHARCOAL }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        
        {/* Navigation Breadcrumb */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Link
            href={dashboardHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: GREEN,
              textDecoration: "none",
            }}
          >
            ← Back to {role === "business" ? "Business Dashboard" : "Developer Dashboard"}
          </Link>
          
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            style={{
              height: 38,
              padding: "0 18px",
              borderRadius: 8,
              backgroundColor: MINT,
              color: MINT_FG,
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: "pointer",
            }}
          >
            + Post an Issue
          </button>
        </div>

        {/* Profile Banner Card */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 14,
            border: `1px solid ${BORDER}`,
            boxShadow: CARD_SHADOW,
            overflow: "hidden",
            marginBottom: 28,
          }}
        >
          {/* Top colored strip */}
          <div
            style={{
              height: 120,
              background: "linear-gradient(135deg, #151b1d 0%, #257b5a 50%, #00c950 100%)",
            }}
          />

          <div style={{ padding: "0 28px 24px", position: "relative" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 16,
                marginTop: -48,
                marginBottom: 16,
              }}
            >
              {/* Avatar */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 9999,
                    border: "4px solid #ffffff",
                    backgroundColor: MINT_SOFT,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                >
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar_url}
                      alt={user.username || "Profile"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 32, fontWeight: 900, color: GREEN }}>
                      {(user?.username || user?.email || "U").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div style={{ paddingBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: CHARCOAL }}>
                      {user?.username || "Engineering Account"}
                    </h1>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "3px 10px",
                        borderRadius: 9999,
                        backgroundColor: role === "business" ? "rgba(37, 123, 90, 0.1)" : "rgba(96, 72, 168, 0.1)",
                        color: role === "business" ? GREEN : "#6048a8",
                        border: `1px solid ${role === "business" ? MINT_BDR : "rgba(96, 72, 168, 0.2)"}`,
                      }}
                    >
                      {role === "business" ? "Business Sponsor" : "Developer / Contributor"}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>
                    {user?.email} {user?.location ? `· ${user.location}` : ""}
                  </p>
                </div>
              </div>

              {/* GitHub Connected Pill & Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {user?.github_handle ? (
                  <a
                    href={`https://github.com/${user.github_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      borderRadius: 8,
                      backgroundColor: MINT_SOFT,
                      color: GREEN,
                      border: `1px solid ${MINT_BDR}`,
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    @{user.github_handle}
                  </a>
                ) : (
                  <a
                    href="/api/auth/github?mode=link"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      borderRadius: 8,
                      backgroundColor: CHARCOAL,
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Connect GitHub
                  </a>
                )}
                
                <button
                  type="button"
                  onClick={() => setActiveTab("edit")}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    backgroundColor: "#ffffff",
                    color: CHARCOAL,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Edit Profile
                </button>
              </div>
            </div>

            {/* Quick Metrics Pills */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
                paddingTop: 16,
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <div style={{ padding: "8px 12px", backgroundColor: "#fcfdfc", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase" }}>
                  GIG Coins Balance
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: GREEN }}>
                  {walletBalance.toLocaleString()} Coins
                </p>
              </div>

              <div style={{ padding: "8px 12px", backgroundColor: "#fcfdfc", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase" }}>
                  Verified Contributions
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: CHARCOAL }}>
                  {profile.contributions_count}
                </p>
              </div>

              <div style={{ padding: "8px 12px", backgroundColor: "#fcfdfc", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase" }}>
                  PR Submissions
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: CHARCOAL }}>
                  {profile.submissions_count}
                </p>
              </div>

              <div style={{ padding: "8px 12px", backgroundColor: "#fcfdfc", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase" }}>
                  Reputation Score
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: GREEN }}>
                  {profile.contributions_count > 0 ? `${Math.min(100, profile.contributions_count * 15)} / 100` : "— / 100"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: 8,
            borderBottom: `1px solid ${BORDER}`,
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            style={{
              padding: "12px 18px",
              border: "none",
              borderBottom: activeTab === "overview" ? `2.5px solid ${GREEN}` : "2.5px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "overview" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            style={{
              padding: "12px 18px",
              border: "none",
              borderBottom: activeTab === "edit" ? `2.5px solid ${GREEN}` : "2.5px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "edit" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            Edit Profile
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("wallet")}
            style={{
              padding: "12px 18px",
              border: "none",
              borderBottom: activeTab === "wallet" ? `2.5px solid ${GREEN}` : "2.5px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "wallet" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            Wallet & GIG Coins
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            style={{
              padding: "12px 18px",
              border: "none",
              borderBottom: activeTab === "activity" ? `2.5px solid ${GREEN}` : "2.5px solid transparent",
              backgroundColor: "transparent",
              fontWeight: 700,
              fontSize: 14,
              color: activeTab === "activity" ? GREEN : MUTED,
              cursor: "pointer",
            }}
          >
            Activity & Record
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Bio Section */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, boxShadow: CARD_SHADOW }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: CHARCOAL }}>
                  About & Background
                </h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: user?.bio ? CHARCOAL : MUTED }}>
                  {user?.bio || "No professional bio added yet. Click 'Edit Profile' to add your engineering experience and interests."}
                </p>
              </div>

              {/* Verified Activity Summary */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, boxShadow: CARD_SHADOW }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: CHARCOAL }}>
                  Recent Verified Contributions
                </h3>
                {contributions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                    No verified merged pull requests yet. Explore the Issue Pool to claim your first task!
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {contributions.slice(0, 5).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 8,
                          backgroundColor: "#fcfdfc",
                          border: `1px solid ${BORDER}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>
                            Contribution #{c.id.slice(0, 8)}
                          </span>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED }}>
                            Verified by {c.reviewer || "maintainer"} · Status: {c.status}
                          </p>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: 6,
                            backgroundColor: MINT_SOFT,
                            color: GREEN,
                          }}
                        >
                          VERIFIED
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Side Info Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* GitHub Metadata */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, boxShadow: CARD_SHADOW }}>
                <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: CHARCOAL }}>
                  GitHub Telemetry
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: MUTED }}>Handle:</span>
                    <span style={{ fontWeight: 600, color: CHARCOAL }}>@{user?.github_handle || "None"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: MUTED }}>Public Repos:</span>
                    <span style={{ fontWeight: 600, color: CHARCOAL }}>{user?.public_repos_count ?? 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: MUTED }}>Followers:</span>
                    <span style={{ fontWeight: 600, color: CHARCOAL }}>{user?.followers_count ?? 0}</span>
                  </div>
                  {user?.company && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: MUTED }}>Company / Org:</span>
                      <span style={{ fontWeight: 600, color: CHARCOAL }}>{user.company}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Tasks Card */}
              <div style={{ backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, boxShadow: CARD_SHADOW }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: CHARCOAL }}>
                  Active Claimed Tasks
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                  {claimedTasks.length} tasks currently locked in your active sprint.
                </p>
                <Link
                  href={`${dashboardHref}?tab=tasks`}
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    color: GREEN,
                    textDecoration: "none",
                  }}
                >
                  View sprint tasks &rarr;
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Edit Profile */}
        {activeTab === "edit" && (
          <div
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: 28,
              boxShadow: CARD_SHADOW,
              maxWidth: 700,
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: CHARCOAL }}>
              Update Profile Information
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: MUTED }}>
              Information here is visible across the GIG platform and verifiable contributions.
            </p>

            {statusMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 18,
                  backgroundColor: statusMsg.isError ? "rgba(234, 67, 53, 0.1)" : MINT_SOFT,
                  color: statusMsg.isError ? "#ea4335" : GREEN,
                  border: `1px solid ${statusMsg.isError ? "rgba(234, 67, 53, 0.3)" : MINT_BDR}`,
                }}
              >
                {statusMsg.text}
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
                  Display Name / Username *
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  Avatar Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/avatar.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
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
                  Bio & Specialization
                </label>
                <textarea
                  rows={3}
                  placeholder="Senior full-stack engineer specializing in TypeScript, Next.js, and distributed systems..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
                    Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. San Francisco, CA / Bengaluru"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
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
                    Company / Organization
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp / Open Source Guild"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
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
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>
                  GitHub Handle
                </label>
                <input
                  type="text"
                  placeholder="e.g. octocat"
                  value={githubHandle}
                  onChange={(e) => setGithubHandle(e.target.value)}
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
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
                  disabled={saving}
                  style={{
                    height: 40,
                    padding: "0 22px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: MINT,
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving Changes..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Wallet & GIG Coins */}
        {activeTab === "wallet" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                backgroundColor: "#ffffff",
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: CARD_SHADOW,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase" }}>
                  Wallet Escrow & Available Vault
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 900, color: GREEN }}>
                  {walletBalance.toLocaleString()} <span style={{ fontSize: 14, color: CHARCOAL }}>GIG Coins</span>
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>
                  Lifetime Earned: {wallet?.total_earned ? wallet.total_earned.toLocaleString() : 0} Coins
                </p>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <Link
                  href={`${dashboardHref}?tab=billing`}
                  style={{
                    height: 40,
                    padding: "0 18px",
                    borderRadius: 8,
                    backgroundColor: MINT,
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Top Up GIG Coins
                </Link>
                {role === "developer" && (
                  <Link
                    href="/dashboard/developer?tab=wallet"
                    style={{
                      height: 40,
                      padding: "0 18px",
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      backgroundColor: "#ffffff",
                      color: CHARCOAL,
                      fontWeight: 600,
                      fontSize: 13,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    UPI Withdrawal
                  </Link>
                )}
              </div>
            </div>

            {/* Transactions Ledger */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                boxShadow: CARD_SHADOW,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: `1px solid ${BORDER}`,
                  backgroundColor: "rgba(0,0,0,0.02)",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: CHARCOAL }}>
                  Wallet Transaction Ledger
                </h3>
              </div>

              <div>
                {transactions.length === 0 ? (
                  <p style={{ padding: 20, margin: 0, fontSize: 13, color: MUTED }}>
                    No transactions found in this wallet ledger.
                  </p>
                ) : (
                  transactions.map((tx, idx) => (
                    <div
                      key={tx.id}
                      style={{
                        padding: "14px 20px",
                        borderTop: idx === 0 ? "none" : `1px solid ${BORDER}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
                          {tx.type === "TASK_REWARD"
                            ? "Bounty Reward Disbursal"
                            : tx.type === "TOPUP"
                            ? "Purchased GIG Coins Top-Up"
                            : "Withdrawal"}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED }}>
                          {tx.created_at ? tx.created_at.split("T")[0] : "Recently"} · Status: {tx.status}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: tx.amount > 0 ? GREEN : "#ea4335",
                        }}
                      >
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Coins
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Activity & Record */}
        {activeTab === "activity" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                backgroundColor: "#ffffff",
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                boxShadow: CARD_SHADOW,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: `1px solid ${BORDER}`,
                  backgroundColor: "rgba(0,0,0,0.02)",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: CHARCOAL }}>
                  Verified Contributions & Merged PRs ({contributions.length})
                </h3>
              </div>

              <div>
                {contributions.length === 0 ? (
                  <p style={{ padding: 20, margin: 0, fontSize: 13, color: MUTED }}>
                    No verified contributions recorded yet.
                  </p>
                ) : (
                  contributions.map((c, idx) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "14px 20px",
                        borderTop: idx === 0 ? "none" : `1px solid ${BORDER}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
                          Verified Contribution #{c.id.slice(0, 8)}
                        </p>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: MUTED }}>
                          Reviewed by {c.reviewer || "maintainer"} · Merged at {c.merged_at ? c.merged_at.split("T")[0] : "recently"}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 6,
                          backgroundColor: MINT_SOFT,
                          color: GREEN,
                          border: `1px solid ${MINT_BDR}`,
                        }}
                      >
                        VERIFIED
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      <CreateIssueModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        userRole={role}
      />
    </div>
  );
}
