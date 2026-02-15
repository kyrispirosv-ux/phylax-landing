"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";

type Child = { id: string; name: string; tier: string };
type Device = { id: string; child_id: string; device_name: string; status: string; last_heartbeat: string | null; extension_version: string | null };
type Alert = { id: string; title: string; severity: string; domain: string | null; alert_type: string; created_at: string; child_id: string | null };
type Event = { id: number; event_type: string; domain: string | null; category: string | null; created_at: string; child_id: string | null };

type Props = {
  parentName: string;
  children: Child[];
  devices: Device[];
  alerts: Alert[];
  events: Event[];
  ruleCount: number;
  weeklyBlocked: number;
  accessRequests: number;
  riskLevel: "low" | "medium" | "high";
  onlineDeviceCount: number;
  activeDeviceCount: number;
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  blocked: { icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636", color: "text-rose-400 bg-rose-400/10" },
  allowed: { icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "text-emerald-400 bg-emerald-400/10" },
  request_access: { icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z", color: "text-amber-400 bg-amber-400/10" },
  device_heartbeat: { icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z", color: "text-sky-400 bg-sky-400/10" },
  policy_applied: { icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", color: "text-violet-400 bg-violet-400/10" },
};

const RISK_CONFIG = {
  low: { label: "Low", color: "text-emerald-400", bg: "bg-emerald-400", glow: "shadow-emerald-500/30", ring: "ring-emerald-500/20" },
  medium: { label: "Elevated", color: "text-amber-400", bg: "bg-amber-400", glow: "shadow-amber-500/30", ring: "ring-amber-500/20" },
  high: { label: "High", color: "text-rose-400", bg: "bg-rose-400", glow: "shadow-rose-500/30", ring: "ring-rose-500/20" },
};

export function LiveDashboard(props: Props) {
  const { parentName, children: kids, devices, alerts, events, ruleCount, weeklyBlocked, accessRequests, riskLevel, onlineDeviceCount, activeDeviceCount } = props;
  const router = useRouter();
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [now, setNow] = useState(Date.now());

  // Onboarding: auto-generate pairing code when no devices exist
  const [onboardCode, setOnboardCode] = useState<{ short_code: string; install_link: string; expires_at: string } | null>(null);
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardCopied, setOnboardCopied] = useState("");

  const autoGeneratePairingCode = useCallback(async () => {
    if (devices.length > 0 || kids.length === 0 || onboardCode || onboardLoading) return;
    setOnboardLoading(true);
    try {
      const res = await fetch("/api/pairing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child_id: kids[0].id }),
      });
      if (res.ok) {
        const data = await res.json();
        setOnboardCode(data);
      }
    } catch { /* ignore */ } finally {
      setOnboardLoading(false);
    }
  }, [devices.length, kids, onboardCode, onboardLoading]);

  useEffect(() => { autoGeneratePairingCode(); }, [autoGeneratePairingCode]);

  // Tick every 30s to keep "time ago" fresh — makes it feel alive
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Poll for newly paired devices while the onboarding card is visible
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (devices.length > 0 || kids.length === 0) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/devices");
        if (!res.ok) return;
        const data = await res.json();
        if (data.devices && data.devices.length > 0) {
          // Device found — refresh the server component data
          if (pollRef.current) clearInterval(pollRef.current);
          router.refresh();
        }
      } catch { /* network error, try again next tick */ }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [devices.length, kids.length, router]);

  const risk = RISK_CONFIG[riskLevel];

  // Filter by selected child
  const filteredEvents = selectedChild
    ? events.filter(e => e.child_id === selectedChild)
    : events;
  const filteredAlerts = selectedChild
    ? alerts.filter(a => a.child_id === selectedChild)
    : alerts;

  // Primary device for hero card
  const primaryDevice = selectedChild
    ? devices.find(d => d.child_id === selectedChild && d.status === "active")
    : devices.find(d => d.status === "active");

  const lastActivity = filteredEvents[0]?.created_at || primaryDevice?.last_heartbeat;

  // AI insights (derived from data)
  const insights: { text: string; type: "safe" | "info" | "warn" }[] = [];
  if (alerts.filter(a => a.severity === "critical").length === 0) {
    insights.push({ text: "No concerning activity detected today", type: "safe" });
  }
  if (weeklyBlocked > 5) {
    insights.push({ text: `${weeklyBlocked} blocked attempts this week — patterns look normal`, type: "info" });
  }
  const lateEvents = events.filter(e => {
    const h = new Date(e.created_at).getHours();
    return h >= 22 || h < 6;
  });
  if (lateEvents.length > 3) {
    insights.push({ text: "Increased late-night browsing pattern detected", type: "warn" });
  }
  if (insights.length === 0) {
    insights.push({ text: "All clear. Phylax is monitoring.", type: "safe" });
  }

  return (
    <div className="space-y-6">

      {/* ─── Child Selector ─── */}
      {kids.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedChild("")}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
              !selectedChild ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            All
          </button>
          {kids.map(child => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                selectedChild === child.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {/* ═══ ONBOARDING: Pairing Code Card (shown when no devices) ═══ */}
      {devices.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-[#7C5CFF]/30 ring-1 ring-[#7C5CFF]/20 bg-gradient-to-br from-[#7C5CFF]/10 to-[#22D3EE]/5 p-6 sm:p-8">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[#7C5CFF] opacity-[0.06] blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center shadow-lg shadow-purple-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Connect Your First Device</h2>
                <p className="text-white/40 text-sm">Enter this code in the Phylax extension to connect this device.</p>
              </div>
            </div>

            {onboardLoading && (
              <div className="flex items-center gap-2 mt-4">
                <div className="w-4 h-4 border-2 border-[#7C5CFF]/30 border-t-[#7C5CFF] rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Generating pairing code...</span>
              </div>
            )}

            {onboardCode && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-white/40 text-xs font-medium mb-2">Your 6-digit pairing code:</p>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-mono font-bold tracking-[0.4em] text-white bg-white/5 px-6 py-3 rounded-xl border border-white/10">
                      {onboardCode.short_code}
                    </span>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(onboardCode.short_code);
                        setOnboardCopied("code");
                        setTimeout(() => setOnboardCopied(""), 2000);
                      }}
                      className="px-4 py-2 bg-[#7C5CFF] text-white text-sm font-medium rounded-lg hover:bg-[#7C5CFF]/80 transition"
                    >
                      {onboardCopied === "code" ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-white/30 text-xs">
                  <svg className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Expires in 10 minutes. Single-use only. Go to <Link href="/dashboard/devices" className="text-[#7C5CFF] hover:underline">Devices</Link> to generate a new code.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 1. HERO STATUS CARD ═══ */}
      <div className={`relative overflow-hidden rounded-2xl border ${risk.ring} ring-1 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-8`}>
        {/* Ambient glow */}
        <div className={`absolute -top-20 -right-20 w-60 h-60 rounded-full ${risk.bg} opacity-[0.04] blur-3xl`} />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              {/* Pulsing status dot */}
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${risk.bg} opacity-50`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${risk.bg}`} />
              </span>
              <span className={`text-sm font-semibold ${risk.color}`}>
                {riskLevel === "low" ? "Protected" : riskLevel === "medium" ? "Attention Needed" : "Action Required"}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1">
              {primaryDevice?.device_name || (kids.length ? `${kids[0].name}'s Device` : "No Device")}
            </h1>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/40">
              <span>Last activity: {lastActivity ? timeAgo(lastActivity) : "No data"}</span>
              <span>Risk level: <span className={`font-medium ${risk.color}`}>{risk.label}</span></span>
              <span>Protection: <span className="text-emerald-400 font-medium">Active</span></span>
            </div>
          </div>

          {/* AI confidence badge */}
          <div className="flex items-center gap-2 bg-white/[0.05] rounded-xl px-4 py-3 self-start">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-white/50">AI Confidence</p>
              <p className="text-sm font-semibold text-white">High</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ═══ LEFT COLUMN (2/3) ═══ */}
        <div className="lg:col-span-2 space-y-6">

          {/* ═══ 2. LIVE ACTIVITY FEED ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white/80">Live Activity</h2>
              <span className="text-[11px] text-white/25 uppercase tracking-wider">Real-time</span>
            </div>
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.05] divide-y divide-white/[0.04]">
              {filteredEvents.length === 0 ? (
                <div className="p-8 text-center text-white/30 text-sm">No activity yet. Events appear here in real-time.</div>
              ) : (
                filteredEvents.slice(0, 8).map((evt, i) => {
                  const cfg = EVENT_ICONS[evt.event_type] || EVENT_ICONS.allowed;
                  return (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70 truncate">
                          {evt.event_type === "blocked" ? "Blocked" :
                           evt.event_type === "allowed" ? "Safe browsing" :
                           evt.event_type === "request_access" ? "Access requested" :
                           evt.event_type === "device_heartbeat" ? "Device online" :
                           evt.event_type === "policy_applied" ? "Policy applied" :
                           evt.event_type}
                          {evt.domain && <span className="text-white/40"> &middot; {evt.domain}</span>}
                        </p>
                        {evt.category && (
                          <p className="text-xs text-white/25 capitalize">{evt.category.replace(/_/g, " ")}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-white/20 shrink-0">{timeAgo(evt.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>
            {filteredEvents.length > 8 && (
              <Link href="/dashboard/reports" className="block mt-2 text-center text-xs text-white/30 hover:text-white/50 transition">
                View all activity
              </Link>
            )}
          </div>

          {/* ═══ 3. AI INSIGHTS PANEL ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <h2 className="text-base font-semibold text-white/80">AI Insights</h2>
            </div>
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                    insight.type === "safe" ? "bg-emerald-500/[0.04] border-emerald-500/10" :
                    insight.type === "warn" ? "bg-amber-500/[0.04] border-amber-500/10" :
                    "bg-white/[0.02] border-white/[0.05]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    insight.type === "safe" ? "bg-emerald-400/20 text-emerald-400" :
                    insight.type === "warn" ? "bg-amber-400/20 text-amber-400" :
                    "bg-white/10 text-white/50"
                  }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      {insight.type === "safe" ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      ) : insight.type === "warn" ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      )}
                    </svg>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN (1/3) ═══ */}
        <div className="space-y-6">

          {/* ═══ 4. QUICK ACTIONS ═══ */}
          <div>
            <h2 className="text-base font-semibold text-white/80 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Block Site", href: "/dashboard/rules", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636", color: "text-rose-400 bg-rose-400/10 hover:bg-rose-400/15" },
                { label: "Add Rule", href: "/dashboard/rules", icon: "M12 4.5v15m7.5-7.5h-15", color: "text-violet-400 bg-violet-400/10 hover:bg-violet-400/15" },
                { label: "View Reports", href: "/dashboard/reports", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z", color: "text-sky-400 bg-sky-400/10 hover:bg-sky-400/15" },
                { label: "Pair Device", href: "/dashboard/devices", icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.915-3.311a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244", color: "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/15" },
              ].map(action => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`flex flex-col items-center gap-2 rounded-xl p-4 border border-white/[0.05] transition-all ${action.color}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                  </svg>
                  <span className="text-xs font-medium text-white/60">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* ═══ 5. PROTECTION COVERAGE ═══ */}
          <div>
            <h2 className="text-base font-semibold text-white/80 mb-3">Protection Status</h2>
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.05] divide-y divide-white/[0.04]">
              {[
                { label: "Browser Protected", ok: activeDeviceCount > 0 },
                { label: "Extension Active", ok: onlineDeviceCount > 0 },
                { label: `${ruleCount} Rules Active`, ok: ruleCount > 0 },
                { label: "AI Monitoring", ok: true },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-white/50">{item.label}</span>
                  {item.ok ? (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      Setup needed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ 6. WEEKLY SUMMARY ═══ */}
          <div>
            <h2 className="text-base font-semibold text-white/80 mb-3">This Week</h2>
            <div className="bg-white/[0.02] rounded-2xl border border-white/[0.05] p-5 space-y-4">
              {[
                { label: "Blocked risks", value: weeklyBlocked, color: "text-rose-400" },
                { label: "Serious alerts", value: alerts.filter(a => a.severity === "critical").length, color: alerts.filter(a => a.severity === "critical").length > 0 ? "text-rose-400" : "text-emerald-400" },
                { label: "Access requests", value: accessRequests, color: "text-amber-400" },
              ].map(stat => (
                <div key={stat.label} className="flex items-center justify-between">
                  <span className="text-sm text-white/40">{stat.label}</span>
                  <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ═══ NO CHILDREN EMPTY STATE ═══ */}
      {kids.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Add your first child</h3>
          <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
            Create a child profile to start protecting their online experience.
          </p>
          <Link
            href="/dashboard/children"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition"
          >
            Add Child
          </Link>
        </div>
      )}
    </div>
  );
}
