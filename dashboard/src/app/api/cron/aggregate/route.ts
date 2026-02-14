import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/aggregate
 * Daily aggregation cron job. Call from Vercel Cron or external scheduler.
 * Aggregates yesterday's events into report_summaries for each family+child.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Get all families that had events yesterday
  const { data: families } = await db
    .from("events")
    .select("family_id, child_id")
    .gte("created_at", yesterday)
    .lt("created_at", new Date(yesterday + "T00:00:00Z").getTime() + 86400000)
    .limit(10000);

  if (!families || families.length === 0) {
    return NextResponse.json({ status: "ok", message: "No events to aggregate" });
  }

  // Unique family+child pairs
  const pairs = new Set<string>();
  for (const f of families) {
    pairs.add(`${f.family_id}|${f.child_id || "null"}`);
  }

  let aggregated = 0;
  for (const pair of pairs) {
    const [familyId, childId] = pair.split("|");
    const cid = childId === "null" ? null : childId;

    try {
      await db.rpc("aggregate_daily_report", {
        p_family_id: familyId,
        p_child_id: cid,
        p_date: yesterday,
      });
      aggregated++;
    } catch (err) {
      console.error(`[aggregate] Failed for ${pair}:`, err);
    }
  }

  return NextResponse.json({ status: "ok", aggregated, date: yesterday });
}
