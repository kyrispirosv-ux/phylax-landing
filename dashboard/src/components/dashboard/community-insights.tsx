"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo } from "@/lib/supabase/helpers";
import Link from "next/link";

type TopicStat = { topic: string; count: number };
type PlatformStat = { platform: string; count: number };
type PatternStat = { pattern_type: string; count: number };
type EmergingThreat = {
  platform: string;
  topic: string;
  risk_level: number;
  signal_count: number;
};

type CommunityStats = {
  total_families_contributing: number;
  this_week: {
    total_blocks: number;
    top_topics: TopicStat[];
    top_platforms: PlatformStat[];
    trending_patterns: PatternStat[];
  };
  emerging_threats: EmergingThreat[];
  generated_at: string;
};

const TOPIC_LABELS: Record<string, string> = {
  self_harm: "Self-Harm",
  violence: "Violence",
  sexual: "Sexual Content",
  grooming: "Grooming",
  drugs: "Drugs & Substances",
  gambling: "Gambling",
  hate_speech: "Hate Speech",
  bullying: "Bullying",
  weapons: "Weapons",
  extremism: "Extremism",
};

const RISK_COLORS: Record<string, string> = {
  high: "text-rose-400 bg-rose-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  low: "text-emerald-400 bg-emerald-400/10",
};

function riskLabel(level: number): "high" | "medium" | "low" {
  if (level >= 0.8) return "high";
  if (level >= 0.5) return "medium";
  return "low";
}

function formatTopic(topic: string): string {
  return TOPIC_LABELS[topic] || topic.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatPlatform(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export function CommunityInsights() {
  const supabase = createClient();
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState<boolean | null>(null);

  useEffect(() => {
    checkOptInAndLoad();
  }, []);

  async function checkOptInAndLoad() {
    const parent = await getParentInfo(supabase);
    if (!parent) {
      setLoading(false);
      return;
    }

    const { data: family } = await supabase
      .from("families")
      .select("share_safety_insights")
      .eq("id", parent.family_id)
      .single();

    const isOptedIn = (family as { share_safety_insights: boolean } | null)?.share_safety_insights ?? false;
    setOptedIn(isOptedIn);

    if (!isOptedIn) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/aggregation/community-stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  // Not opted in — show opt-in prompt
  if (optedIn === false) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-2">Community Safety Insights</h3>
        <p className="text-white/40 text-xs leading-relaxed mb-4">
          Join other families in building better safety for everyone. Enable anonymous safety
          pattern sharing in your settings to see community-wide threat trends.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#7C5CFF]/10 text-[#7C5CFF] text-xs font-medium rounded-lg hover:bg-[#7C5CFF]/20 transition"
        >
          Enable in Settings
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Community Safety Insights</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-white/[0.03] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // No data yet
  if (!stats || stats.this_week.total_blocks === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-2">Community Safety Insights</h3>
        <p className="text-white/40 text-xs">
          Community data is being collected. Check back soon for aggregated safety trends.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Community Safety Insights</h3>
          <p className="text-white/40 text-[11px] mt-0.5">
            {stats.total_families_contributing} families contributing
          </p>
        </div>
        <div className="text-[10px] text-white/25">
          Updated {new Date(stats.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Weekly summary */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
        <div className="text-xs text-white/50 mb-2">This Week</div>
        <div className="text-2xl font-bold text-white">
          {stats.this_week.total_blocks.toLocaleString()}
        </div>
        <div className="text-[11px] text-white/40">threats blocked across the community</div>
      </div>

      {/* Top blocked topics */}
      {stats.this_week.top_topics.length > 0 && (
        <div>
          <div className="text-xs text-white/50 mb-2.5">Top Blocked Topics</div>
          <div className="space-y-1.5">
            {stats.this_week.top_topics.slice(0, 5).map((t) => {
              const maxCount = stats.this_week.top_topics[0].count;
              const pct = Math.round((t.count / maxCount) * 100);
              return (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="text-xs text-white/60 w-28 truncate">{formatTopic(t.topic)}</span>
                  <div className="flex-1 h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#7C5CFF]/60 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-white/40 w-10 text-right">{t.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform breakdown */}
      {stats.this_week.top_platforms.length > 0 && (
        <div>
          <div className="text-xs text-white/50 mb-2.5">Most Active Platforms</div>
          <div className="flex flex-wrap gap-2">
            {stats.this_week.top_platforms.slice(0, 6).map((p) => (
              <span
                key={p.platform}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.03] rounded-lg text-[11px] text-white/50"
              >
                {formatPlatform(p.platform)}
                <span className="text-white/40">{p.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Emerging threats */}
      {stats.emerging_threats.length > 0 && (
        <div>
          <div className="text-xs text-white/50 mb-2.5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Emerging Threats
          </div>
          <div className="space-y-2">
            {stats.emerging_threats.map((threat, i) => {
              const risk = riskLabel(threat.risk_level);
              const colors = RISK_COLORS[risk];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors}`}>
                      {risk.toUpperCase()}
                    </span>
                    <span className="text-xs text-white/60">
                      {formatTopic(threat.topic)} on {formatPlatform(threat.platform)}
                    </span>
                  </div>
                  <span className="text-[11px] text-white/40">
                    {threat.signal_count} signals
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
