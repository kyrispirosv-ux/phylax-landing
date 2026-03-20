"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo } from "@/lib/supabase/helpers";

type LlmEvent = {
  id: number;
  event_type: string;
  domain: string | null;
  url: string | null;
  category: string | null;
  reason_code: string | null;
  confidence: number | null;
  metadata: {
    platform?: string;
    action?: string;
    snippet?: string | null;
    explanation?: string | null;
  } | null;
  child_id: string | null;
  created_at: string;
};

type Child = {
  id: string;
  name: string;
};

type PlatformStats = {
  platform: string;
  total: number;
  blocked: number;
  allowed: number;
  patterns: number;
};

const LLM_EVENT_TYPES = [
  "llm_prompt_blocked",
  "llm_response_blocked",
  "llm_allowed",
  "llm_pattern_detected",
  "llm_blur_revealed",
];

const PLATFORM_DISPLAY: Record<string, { label: string; color: string }> = {
  chatgpt: { label: "ChatGPT", color: "bg-emerald-500" },
  claude: { label: "Claude", color: "bg-orange-500" },
  gemini: { label: "Gemini", color: "bg-blue-500" },
  copilot: { label: "Copilot", color: "bg-cyan-500" },
  poe: { label: "Poe", color: "bg-purple-500" },
  perplexity: { label: "Perplexity", color: "bg-teal-500" },
};

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  llm_prompt_blocked: { label: "Prompt blocked", color: "text-red-400" },
  llm_response_blocked: { label: "Response filtered", color: "text-red-400" },
  llm_allowed: { label: "Allowed", color: "text-emerald-400" },
  llm_pattern_detected: { label: "Pattern detected", color: "text-amber-400" },
  llm_blur_revealed: { label: "Blur revealed", color: "text-blue-400" },
};

export default function ActivityPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<LlmEvent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month">("today");

  useEffect(() => {
    loadActivity();
  }, [timeRange, selectedChild]);

  async function loadActivity() {
    setLoading(true);
    const parent = await getParentInfo(supabase);
    if (!parent) return;

    // Load children
    const { data: childData } = await supabase
      .from("children")
      .select("id, name")
      .eq("family_id", parent.family_id)
      .order("created_at");

    setChildren((childData as Child[]) ?? []);

    // Calculate time filter
    const now = new Date();
    let since: Date;
    if (timeRange === "today") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === "week") {
      since = new Date(now.getTime() - 7 * 86400000);
    } else {
      since = new Date(now.getTime() - 30 * 86400000);
    }

    // Load LLM events
    let query = supabase
      .from("events")
      .select("*")
      .eq("family_id", parent.family_id)
      .in("event_type", LLM_EVENT_TYPES)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    if (selectedChild !== "all") {
      query = query.eq("child_id", selectedChild);
    }

    const { data: eventData } = await query;
    setEvents((eventData as LlmEvent[]) ?? []);
    setLoading(false);
  }

  // Compute aggregated stats per platform
  function computePlatformStats(): PlatformStats[] {
    const statsMap = new Map<string, PlatformStats>();

    for (const event of events) {
      const platform = (event.metadata as { platform?: string })?.platform || event.domain || "unknown";
      if (!statsMap.has(platform)) {
        statsMap.set(platform, { platform, total: 0, blocked: 0, allowed: 0, patterns: 0 });
      }
      const stats = statsMap.get(platform)!;
      stats.total++;
      if (event.event_type === "llm_response_blocked" || event.event_type === "llm_prompt_blocked") {
        stats.blocked++;
      } else if (event.event_type === "llm_allowed") {
        stats.allowed++;
      } else if (event.event_type === "llm_pattern_detected") {
        stats.patterns++;
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  }

  function getChildName(childId: string | null): string {
    if (!childId) return "Unknown";
    const child = children.find((c) => c.id === childId);
    return child?.name || "Unknown";
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  const platformStats = computePlatformStats();
  const totalSessions = events.filter((e) => e.event_type === "llm_allowed").length + events.filter((e) => e.event_type === "llm_response_blocked").length;
  const totalBlocked = events.filter((e) => e.event_type === "llm_response_blocked" || e.event_type === "llm_prompt_blocked").length;
  const totalPatterns = events.filter((e) => e.event_type === "llm_pattern_detected").length;

  if (loading) {
    return <div className="text-white/40 text-sm">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">AI Activity</h1>
          <p className="text-white/40 text-sm mt-1">
            Monitor your children&apos;s interactions with AI chatbots
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
          >
            <option value="all">All children</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as "today" | "week" | "month")}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
          >
            <option value="today">Today</option>
            <option value="week">Past 7 days</option>
            <option value="month">Past 30 days</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">AI Sessions</p>
          <p className="text-3xl font-bold text-white">{totalSessions}</p>
          <p className="text-xs text-white/25 mt-1">Total interactions {timeRange === "today" ? "today" : timeRange === "week" ? "this week" : "this month"}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Responses Filtered</p>
          <p className="text-3xl font-bold text-red-400">{totalBlocked}</p>
          <p className="text-xs text-white/25 mt-1">Blocked or redirected by Phylax</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Patterns Detected</p>
          <p className="text-3xl font-bold text-amber-400">{totalPatterns}</p>
          <p className="text-xs text-white/25 mt-1">Flagged for review or warned</p>
        </div>
      </div>

      {/* Per-platform breakdown */}
      {platformStats.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-white/50 mb-3">Platform Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {platformStats.map((stats) => {
              const platformInfo = PLATFORM_DISPLAY[stats.platform] || { label: stats.platform, color: "bg-gray-500" };
              return (
                <div key={stats.platform} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${platformInfo.color}`} />
                    <span className="text-sm font-medium text-white/60">{platformInfo.label}</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <p className="text-xl font-bold text-white">{stats.total}</p>
                      <p className="text-[10px] text-white/25 uppercase">sessions</p>
                    </div>
                    {stats.blocked > 0 && (
                      <div>
                        <p className="text-lg font-semibold text-red-400">{stats.blocked}</p>
                        <p className="text-[10px] text-white/25 uppercase">filtered</p>
                      </div>
                    )}
                    {stats.patterns > 0 && (
                      <div>
                        <p className="text-lg font-semibold text-amber-400">{stats.patterns}</p>
                        <p className="text-[10px] text-white/25 uppercase">flagged</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event timeline */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 mb-3">Recent Activity</h2>
        <div className="space-y-2">
          {events.map((event) => {
            const eventInfo = EVENT_TYPE_LABELS[event.event_type] || { label: event.event_type, color: "text-white/50" };
            const meta = event.metadata as { platform?: string; action?: string; explanation?: string | null; snippet?: string | null } | null;
            const platformInfo = PLATFORM_DISPLAY[meta?.platform || ""] || null;

            return (
              <div
                key={event.id}
                className="flex items-start gap-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4"
              >
                <div className={`text-xs font-medium shrink-0 mt-0.5 ${eventInfo.color}`}>
                  {eventInfo.label}
                </div>
                <div className="flex-1 min-w-0">
                  {meta?.explanation && (
                    <p className="text-sm text-white/60 mb-1">{meta.explanation}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {platformInfo && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/40">
                        {platformInfo.label}
                      </span>
                    )}
                    {event.reason_code && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/25">
                        {event.reason_code}
                      </span>
                    )}
                    {event.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/25">
                        {event.category}
                      </span>
                    )}
                    {selectedChild === "all" && event.child_id && (
                      <span className="text-[10px] text-white/25">
                        {getChildName(event.child_id)}
                      </span>
                    )}
                    {event.confidence !== null && (
                      <span className="text-[10px] text-white/25">
                        {Math.round(event.confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/25 shrink-0">
                  {formatTime(event.created_at)}
                </p>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
              <p className="text-white/40 text-sm">No AI activity recorded yet. Phylax monitors ChatGPT, Claude, Gemini, and other AI platforms.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
