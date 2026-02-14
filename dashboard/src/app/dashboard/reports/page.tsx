"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo } from "@/lib/supabase/helpers";

type Child = { id: string; name: string };
type DomainCount = { domain: string; count: number };
type CategoryCount = { category: string; count: number };
type Summary = {
  period_start: string;
  total_events: number;
  blocked_count: number;
  allowed_count: number;
  request_access_count: number;
  top_blocked_domains: DomainCount[];
  top_categories: CategoryCount[];
};

export default function ReportsPage() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => { loadChildren(); }, []);
  useEffect(() => { if (children.length) loadReports(); }, [selectedChild, days]);

  async function loadChildren() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;
    const { data } = await supabase
      .from("children")
      .select("id, name")
      .eq("family_id", parent.family_id)
      .order("created_at");
    setChildren((data as Child[]) ?? []);
    setLoading(false);
  }

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days), period: "daily" });
    if (selectedChild) params.set("child_id", selectedChild);

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.summaries ?? []);
    }
    setLoading(false);
  }

  // Aggregate totals
  const totalBlocked = summaries.reduce((s, d) => s + d.blocked_count, 0);
  const totalAllowed = summaries.reduce((s, d) => s + d.allowed_count, 0);
  const totalRequests = summaries.reduce((s, d) => s + d.request_access_count, 0);
  const totalEvents = summaries.reduce((s, d) => s + d.total_events, 0);

  // Merge top domains across days
  const domainMap: Record<string, number> = {};
  const categoryMap: Record<string, number> = {};
  for (const s of summaries) {
    for (const d of (s.top_blocked_domains ?? [])) {
      domainMap[d.domain] = (domainMap[d.domain] || 0) + d.count;
    }
    for (const c of (s.top_categories ?? [])) {
      categoryMap[c.category] = (categoryMap[c.category] || 0) + c.count;
    }
  }
  const topDomains = Object.entries(domainMap).sort(([,a],[,b]) => b - a).slice(0, 8);
  const topCategories = Object.entries(categoryMap).sort(([,a],[,b]) => b - a).slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-white/40 text-sm mt-1">Activity summaries and trends</p>
        </div>
        <div className="flex gap-3">
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
          >
            <option value="">All Children</option>
            {children.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-white/30 text-sm">Loading...</div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Events", value: totalEvents, color: "from-[#7C5CFF] to-[#22D3EE]" },
              { label: "Blocked", value: totalBlocked, color: "from-[#FF5050] to-[#FF8C42]" },
              { label: "Allowed", value: totalAllowed, color: "from-[#34D399] to-[#22D3EE]" },
              { label: "Access Requests", value: totalRequests, color: "from-[#FBBF24] to-[#F59E0B]" },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                <p className="text-white/40 text-xs font-medium mb-2">{s.label}</p>
                <p className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Daily bar chart (text-based) */}
          <h2 className="text-lg font-semibold mb-4">Daily Activity</h2>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-8">
            {summaries.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">No activity data for this period.</p>
            ) : (
              <div className="space-y-3">
                {summaries.map(s => {
                  const max = Math.max(...summaries.map(d => d.total_events), 1);
                  const blockedPct = (s.blocked_count / max) * 100;
                  const allowedPct = (s.allowed_count / max) * 100;
                  return (
                    <div key={s.period_start} className="flex items-center gap-3">
                      <span className="text-xs text-white/40 w-20 shrink-0">
                        {new Date(s.period_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex-1 flex gap-0.5 h-5">
                        <div className="bg-red-500/60 rounded-l" style={{ width: `${blockedPct}%` }} />
                        <div className="bg-green-500/40 rounded-r" style={{ width: `${allowedPct}%` }} />
                      </div>
                      <span className="text-xs text-white/30 w-12 text-right">{s.total_events}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 mt-3 pt-3 border-t border-white/[0.06]">
              <span className="flex items-center gap-1.5 text-xs text-white/40">
                <span className="w-3 h-3 rounded bg-red-500/60" /> Blocked
              </span>
              <span className="flex items-center gap-1.5 text-xs text-white/40">
                <span className="w-3 h-3 rounded bg-green-500/40" /> Allowed
              </span>
            </div>
          </div>

          {/* Top blocked domains + categories side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Top Blocked Domains</h2>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                {topDomains.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-4">No blocked domains yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topDomains.map(([domain, count]) => (
                      <div key={domain} className="flex items-center justify-between">
                        <span className="text-sm text-white/70 truncate">{domain}</span>
                        <span className="text-xs text-white/30 ml-2 shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-4">Top Categories</h2>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                {topCategories.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-4">No category data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topCategories.map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between">
                        <span className="text-sm text-white/70 capitalize">{cat.replace(/_/g, " ")}</span>
                        <span className="text-xs text-white/30 ml-2 shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
