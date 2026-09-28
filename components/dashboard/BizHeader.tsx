"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cleanGithubHandle } from "@/lib/db-operations";
import { getSavedTasks } from "@/lib/saved-tasks";

const CHARCOAL = "#151b1d";
const MINT = "#00c950";
const MINT_SOFT = "rgba(0, 201, 80, 0.10)";
const MINT_BDR = "rgba(0, 201, 80, 0.20)";
const MINT_FG = "#f0fdf4";
const GREEN = "#257b5a";

interface BizHeaderProps {
  displayName: string;
  displayEmail: string;
  activeTab: "dashboard" | "tasks-backlog" | "issue-pool" | "talent-pool" | "workspace" | "billing" | "profile";
  githubHandle?: string | null;
}

function isActive(activeTab: string, tab: string): boolean {
  return activeTab === tab;
}

export default function BizHeader({ displayName, displayEmail, activeTab, githubHandle }: BizHeaderProps) {
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
    <header
      style={{
        backgroundColor: CHARCOAL,
        borderRadius: 12,
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
        marginBottom: 32,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 9999,
              backgroundColor: MINT_SOFT,
              color: GREEN,
              border: `1px solid ${MINT_BDR}`,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            BUSINESS
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 9999, backgroundColor: MINT, display: "inline-block" }} />
            Business Sponsor · Escrow Active
          </span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "2rem",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          {displayName}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.50)" }}>{displayEmail}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {cleanHandle ? (
          <a
            href={`https://github.com/${cleanHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 42,
              padding: "0 16px",
              borderRadius: 6,
              backgroundColor: "rgba(0, 201, 80, 0.10)",
              color: "#257b5a",
              fontWeight: 600,
              fontSize: 13,
              border: "1px solid rgba(0, 201, 80, 0.20)",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 12l2 2 4-4" /><path d="M12 22a10 9 0 1 0 0-18 10 9 0 0 0 0 18z" /></svg>
            @{cleanHandle}
          </a>
        ) : (
          <a
            href="/api/auth/github?mode=link&role=business"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 42,
              padding: "0 16px",
              borderRadius: 6,
              backgroundColor: "transparent",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 13,
              border: `1.5px solid rgba(255,255,255,0.25)`,
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
            Connect GitHub
          </a>
        )}
        <Link
          href="/dashboard/business?tab=dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 42,
            padding: "0 18px",
            borderRadius: 6,
            backgroundColor: isActive(activeTab, "dashboard") ? MINT : "transparent",
            color: isActive(activeTab, "dashboard") ? MINT_FG : "#ffffff",
            border: `1.5px solid ${isActive(activeTab, "dashboard") ? MINT : "rgba(255,255,255,0.25)"}`,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/business?tab=tasks-backlog"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 42,
            padding: "0 20px",
            borderRadius: 6,
            backgroundColor: isActive(activeTab, "tasks-backlog") ? MINT : "transparent",
            color: isActive(activeTab, "tasks-backlog") ? MINT_FG : "#ffffff",
            border: `1.5px solid ${isActive(activeTab, "tasks-backlog") ? MINT : "rgba(255,255,255,0.25)"}`,
            fontWeight: 700,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Tasks Backlog
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
                backgroundColor: isActive(activeTab, "tasks-backlog") ? "#ffffff" : MINT,
                color: isActive(activeTab, "tasks-backlog") ? GREEN : "#ffffff",
                fontSize: 11,
                fontWeight: 800,
                marginLeft: 6,
              }}
            >
              {savedCount}
            </span>
          )}
        </Link>
        <Link
          href="/dashboard/business?tab=issue-pool"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 42,
            padding: "0 18px",
            borderRadius: 6,
            backgroundColor: isActive(activeTab, "issue-pool") ? MINT : "transparent",
            color: isActive(activeTab, "issue-pool") ? MINT_FG : "#ffffff",
            border: `1.5px solid ${isActive(activeTab, "issue-pool") ? MINT : "rgba(255,255,255,0.25)"}`,
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Issue Pool
        </Link>
        <Link
          href="/dashboard/business?tab=profile"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 42,
            padding: "0 18px",
            borderRadius: 6,
            backgroundColor: isActive(activeTab, "profile") ? MINT : "transparent",
            color: isActive(activeTab, "profile") ? MINT_FG : "#ffffff",
            border: `1.5px solid ${isActive(activeTab, "profile") ? MINT : "rgba(255,255,255,0.25)"}`,
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Company Profile
        </Link>
        <Link
          href="/dashboard/business?tab=billing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 42,
            padding: "0 20px",
            borderRadius: 6,
            backgroundColor: isActive(activeTab, "billing") ? MINT : "transparent",
            color: isActive(activeTab, "billing") ? MINT_FG : "#ffffff",
            border: `1.5px solid ${isActive(activeTab, "billing") ? MINT : "rgba(255,255,255,0.25)"}`,
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Fund Escrow
        </Link>
      </div>
    </header>
  );
}