import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/aggregation/community-stats
 * Returns aggregated community safety statistics.
 * All stats are aggregated — never individual family data.
 * Cached server-side, refreshed hourly.
 */

type CommunityStats = {
  total_families_contributing: number;
  this_week: {
    total_blocks: number;
    top_topics: { topic: string; count: number }[];
    top_platforms: { platform: string; count: number }[];
    trending_patterns: { pattern_type: string; count: number }[];
  };
  emerging_threats: {
    platform: string;
    topic: string;
    risk_level: number;
    signal_count: number;
  }[];
  generated_at: string;
};

// Server-side cache
let cachedStats: CommunityStats | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  // Verify the request comes from an authenticated device
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return cached stats if fresh
  if (cachedStats && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedStats, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const stats = await computeCommunityStats();
    cachedStats = stats;
    cacheTimestamp = Date.now();

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[community-stats] Error:", err);
    // Return stale cache on error
    if (cachedStats) {
      return NextResponse.json(cachedStats, {
        headers: { "X-Cache": "STALE" },
      });
    }
    return NextResponse.json(
      { error: "Failed to compute stats" },
      { status: 500 },
    );
  }
}

async function computeCommunityStats(): Promise<CommunityStats> {
  const db = createServiceClient();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Count contributing families (families that have opted in)
  const { count: familyCount } = await db
    .from("families")
    .select("*", { count: "exact", head: true })
    .eq("share_safety_insights", true);

  // Total blocks this week
  const { count: totalBlocks } = await db
    .from("safety_signals")
    .select("*", { count: "exact", head: true })
    .eq("decision", "block")
    .gte("created_at", oneWeekAgo);

  // Top topics this week (using RPC or manual aggregation)
  // Since Supabase JS doesn't support GROUP BY, we fetch recent signals and aggregate in memory
  const { data: recentSignals } = await db
    .from("safety_signals")
    .select("topic, platform, pattern_type, risk_level, decision")
    .gte("created_at", oneWeekAgo)
    .not("topic", "is", null)
    .limit(5000);

  const signals = recentSignals || [];

  // Aggregate top topics
  const topicCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();

  for (const s of signals) {
    if (s.topic) topicCounts.set(s.topic, (topicCounts.get(s.topic) || 0) + 1);
    if (s.platform) platformCounts.set(s.platform, (platformCounts.get(s.platform) || 0) + 1);
    if (s.pattern_type) patternCounts.set(s.pattern_type, (patternCounts.get(s.pattern_type) || 0) + 1);
  }

  const top_topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  const top_platforms = Array.from(platformCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([platform, count]) => ({ platform, count }));

  const trending_patterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern_type, count]) => ({ pattern_type, count }));

  // Emerging threats: high-risk signals on specific platforms this week
  // Group by platform+topic, find combinations with high average risk
  const platformTopicMap = new Map<string, { count: number; totalRisk: number }>();
  for (const s of signals) {
    if (s.platform && s.topic && s.risk_level && s.risk_level >= 0.7) {
      const key = `${s.platform}|${s.topic}`;
      const entry = platformTopicMap.get(key) || { count: 0, totalRisk: 0 };
      entry.count++;
      entry.totalRisk += s.risk_level;
      platformTopicMap.set(key, entry);
    }
  }

  const emerging_threats = Array.from(platformTopicMap.entries())
    .filter(([, v]) => v.count >= 3) // minimum signal threshold
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([key, v]) => {
      const [platform, topic] = key.split("|");
      return {
        platform,
        topic,
        risk_level: Math.round((v.totalRisk / v.count) * 100) / 100,
        signal_count: v.count,
      };
    });

  return {
    total_families_contributing: familyCount || 0,
    this_week: {
      total_blocks: totalBlocks || 0,
      top_topics,
      top_platforms,
      trending_patterns,
    },
    emerging_threats,
    generated_at: new Date().toISOString(),
  };
}
