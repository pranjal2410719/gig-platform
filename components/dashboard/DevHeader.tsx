"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cleanGithubHandle } from "@/lib/db-operations";
import { getSavedTasks } from "@/lib/saved-tasks";

const BORDER = "#e4e4e7";
const CHARCOAL = "#151b1d";
const MUTED = "#71717b";
const MINT = "#00c950";
const MINT_SOFT = "rgba(0, 201, 80, 0.10)";
const MINT_BDR = "rgba(0, 201, 80, 0.20)";
const MINT_FG = "#f0fdf4";
const GREEN = "#257b5a";

interface DevHeaderProps {
  displayName: string;
  handle: string;
  activeTab: "dashboard" | "tasks" | "issues" | "prs" | "wallet" | "profile";
  githubHandle?: string | null;
}

function MintPill({ dot, children }: { dot?: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 9999,
        backgroundColor: MINT_SOFT,
        border: `1px solid ${MINT_BDR}`,
        color: GREEN,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 9999, backgroundColor: MINT, flexShrink: 0 }} />
      )}
      {children}
    </span>
  );
}

function isActive(activeTab: string, tab: string): boolean {
  return activeTab === tab;
}

export default function DevHeader({ displayName, handle, activeTab, githubHandle }: DevHeaderProps) {
  const cleanHandle = cleanGithubHandle(githubHandle);
  const [savedCount, setSavedCount] = useState<number>(0);

  useEffect(() => {
    setSavedCount(getSavedTasks().length);
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.count === "number") {
        setSavedCount(detail.count);
      } else {
        setSavedCount(getSavedTasks().length);
      }
    };
    window.addEventListener("gig_tasks_updated", handleUpdate);
    return () => window.removeEventListener("gig_tasks_updated", handleUpdate);
  }, []);

  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <MintPill>TIER 2 CONTRIBUTOR · GIG VERIFIED</MintPill>
          <MintPill dot>VERIFIED</MintPill>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {cleanHandle ? (
            <a
              href={`https://github.com/${cleanHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 44,
                padding: "0 20px",
                borderRadius: 6,
                backgroundColor: MINT_SOFT,
                border: `1.5px solid ${MINT_BDR}`,
                color: GREEN,
                fontWeight: 700,
                fontSize: 14,
                whiteSpace: "nowrap",
                letterSpacing: "0.01em",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 12l2 2 4-4" /><path d="M12 22a10 9 0 1 0 0-18 10 9 0 0 0 0 18z" /></svg>
              @{cleanHandle}
            </a>
          ) : (
            <a
              href="/api/auth/github?mode=link"
              style={{
                height: 44,
                padding: "0 20px",
                borderRadius: 6,
                backgroundColor: "transparent",
                border: `1.5px solid ${CHARCOAL}`,
                color: CHARCOAL,
                fontWeight: 700,
                fontSize: 14,
                whiteSpace: "nowrap",
                letterSpacing: "0.01em",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
              Connect GitHub
            </a>
          )}
          <Link
            href="/dashboard/developer?tab=dashboard"
            className="inline-flex items-center justify-center gap-2"
            style={{
              height: 44,
              padding: "0 18px",
              borderRadius: 6,
              backgroundColor: isActive(activeTab, "dashboard") ? MINT : "transparent",
              border: `1.5px solid ${isActive(activeTab, "dashboard") ? MINT : CHARCOAL}`,
              color: isActive(activeTab, "dashboard") ? MINT_FG : CHARCOAL,
              fontWeight: 700,
              fontSize: 14,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/developer?tab=tasks"
            className="inline-flex items-center justify-center gap-2"
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 6,
              backgroundColor: isActive(activeTab, "tasks") ? MINT : "transparent",
              border: `1.5px solid ${isActive(activeTab, "tasks") ? MINT : CHARCOAL}`,
              color: isActive(activeTab, "tasks") ? MINT_FG : CHARCOAL,
              fontWeight: 700,
              fontSize: 14,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            Tasks
            {savedCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 20,
                  padding: "0 6px",
                  borderRadius: 9999,
                  backgroundColor: isActive(activeTab, "tasks") ? "#ffffff" : MINT,
                  color: isActive(activeTab, "tasks") ? GREEN : "#ffffff",
                  fontSize: 11,
                  fontWeight: 800,
                  marginLeft: 4,
                }}
              >
                {savedCount}
              </span>
            )}
          </Link>
          <Link
            href="/dashboard/developer?tab=issues"
            className="inline-flex items-center justify-center gap-2"
            style={{
              height: 44,
              padding: "0 18px",
              borderRadius: 6,
              backgroundColor: isActive(activeTab, "issues") ? MINT : "transparent",
              border: `1.5px solid ${isActive(activeTab, "issues") ? MINT : CHARCOAL}`,
              color: isActive(activeTab, "issues") ? MINT_FG : CHARCOAL,
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            Issue Pool
          </Link>
          <Link
            href="/dashboard/developer?tab=profile"
            className="inline-flex items-center justify-center gap-2"
            style={{
              height: 44,
              padding: "0 18px",
              borderRadius: 6,
              backgroundColor: isActive(activeTab, "profile") ? MINT : "transparent",
              border: `1.5px solid ${isActive(activeTab, "profile") ? MINT : CHARCOAL}`,
              color: isActive(activeTab, "profile") ? MINT_FG : CHARCOAL,
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            Profile
          </Link>
          <Link
            href="/dashboard/developer?tab=wallet"
            className="inline-flex items-center justify-center gap-2"
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 6,
              backgroundColor: isActive(activeTab, "wallet") ? MINT : "transparent",
              border: `1.5px solid ${isActive(activeTab, "wallet") ? MINT : CHARCOAL}`,
              color: isActive(activeTab, "wallet") ? MINT_FG : CHARCOAL,
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            UPI Disbursals
          </Link>
        </div>
      </div>

      {/* Title block with bottom divider */}
      <div id="profile" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 24, scrollMarginTop: 24 }}>
        <h1
          style={{
            fontSize: "2.25rem",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            color: CHARCOAL,
            margin: 0,
          }}
        >
          {displayName}
        </h1>
        <p
          style={{
            marginTop: 8,
            maxWidth: 680,
            fontSize: "0.875rem",
            lineHeight: 1.6,
            color: MUTED,
          }}
        >
          Engineering Record for{' '}
          <strong style={{ color: CHARCOAL, fontWeight: 600 }}>{handle}</strong>
          {' · Backed by inspectable GitHub pull requests, maintainer code reviews, and direct UPI bank disbursals.'}
        </p>
      </div>
    </header>
  );
}