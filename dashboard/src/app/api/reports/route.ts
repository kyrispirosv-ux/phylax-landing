import { NextResponse } from "next/server";
import { createServerSupabase, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/reports?period=daily&child_id=xxx&days=7
 * Returns report summaries for the parent's family.
 * Falls back to real-time aggregation from events if summaries don't exist.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single() as { data: { family_id: string } | null };

  if (!parent) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "daily";
  const childId = searchParams.get("child_id");
  const days = parseInt(searchParams.get("days") || "7");

  const db = createServiceClient();

  // Try pre-aggregated summaries first
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = db
    .from("report_summaries")
    .select("*")
    .eq("family_id", parent.family_id)
    .eq("period", period)
    .gte("period_start", cutoff)
    .order("period_start", { ascending: false });

  if (childId) {
    query = query.eq("child_id", childId);
  }

  const { data: summaries } = await query;

  if (summaries && summaries.length > 0) {
    return NextResponse.json({ summaries, source: "aggregated" });
  }

  // Fall back to real-time aggregation from events
  const eventCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let eventQuery = db
    .from("events")
    .select("event_type, domain, category, created_at")
    .eq("family_id", parent.family_id)
    .gte("created_at", eventCutoff)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (childId) {
    eventQuery = eventQuery.eq("child_id", childId);
  }

  const { data: events } = await eventQuery;

  // Aggregate events into daily buckets
  const dailyBuckets: Record<string, {
    total: number;
    blocked: number;
    allowed: number;
    request_access: number;
    domains: Record<string, number>;
    categories: Record<string, number>;
  }> = {};

  for (const evt of events ?? []) {
    const day = evt.created_at.slice(0, 10);
    if (!dailyBuckets[day]) {
      dailyBuckets[day] = { total: 0, blocked: 0, allowed: 0, request_access: 0, domains: {}, categories: {} };
    }
    const bucket = dailyBuckets[day];
    bucket.total++;
    if (evt.event_type === "blocked") bucket.blocked++;
    if (evt.event_type === "allowed") bucket.allowed++;
    if (evt.event_type === "request_access") bucket.request_access++;
    if (evt.domain && evt.event_type === "blocked") {
      bucket.domains[evt.domain] = (bucket.domains[evt.domain] || 0) + 1;
    }
    if (evt.category) {
      bucket.categories[evt.category] = (bucket.categories[evt.category] || 0) + 1;
    }
  }

  const realTimeSummaries = Object.entries(dailyBuckets).map(([day, b]) => ({
    period_start: day,
    period: "daily",
    total_events: b.total,
    blocked_count: b.blocked,
    allowed_count: b.allowed,
    request_access_count: b.request_access,
    top_blocked_domains: Object.entries(b.domains)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count })),
    top_categories: Object.entries(b.categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ category, count })),
  }));

  return NextResponse.json({ summaries: realTimeSummaries, source: "realtime" });
}
