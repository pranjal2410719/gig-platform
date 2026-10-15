import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { expireStaleClaims } from "@/lib/db-operations";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const expected = `Bearer ${cronSecret}`;
  const authBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(expected);

  if (authBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(authBuf, expBuf);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleSweep(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleSweep(req);
}

async function handleSweep(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireStaleClaims();
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Claim expiration failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      expired_claims_count: result.expiredClaimsCount ?? 0,
    });
  } catch (error) {
    console.error("[CRON /api/cron/expire-claims] Execution error:", error);
    return NextResponse.json(
      { error: "Internal server error during claim expiration sweep" },
      { status: 500 }
    );
  }
}
