import { NextResponse } from "next/server";

/**
 * GET /api/extension/ping
 * Extension calls this to verify the dashboard API is reachable.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    engine: "phylax-dashboard-v1",
    timestamp: Date.now(),
  });
}
