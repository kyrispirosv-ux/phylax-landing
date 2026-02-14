"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";

type Alert = {
  id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  url: string | null;
  domain: string | null;
  reason_code: string | null;
  confidence: number | null;
  read: boolean;
  created_at: string;
};

const SEVERITY_COLORS = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function AlertsPage() {
  const supabase = createClient();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [familyId, setFamilyId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;
    setFamilyId(parent.family_id);

    const { data } = await supabase
      .from("alerts")
      .select("*")
      .eq("family_id", parent.family_id)
      .order("created_at", { ascending: false })
      .limit(100);

    setAlerts((data as Alert[]) ?? []);
    setLoading(false);
  }

  async function markRead(id: string) {
    await getMutationClient(supabase).from("alerts").update({ read: true }).eq("id", id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
  }

  async function markAllRead() {
    if (!familyId) return;

    await getMutationClient(supabase)
      .from("alerts")
      .update({ read: true })
      .eq("family_id", familyId)
      .eq("read", false);

    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }

  if (loading) {
    return <div className="text-white/30 text-sm">Loading...</div>;
  }

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="text-white/40 text-sm mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}`
              : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-white/30 hover:text-white/60 transition"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            onClick={() => !alert.read && markRead(alert.id)}
            className={`flex items-start gap-4 bg-white/[0.03] border rounded-xl px-5 py-4 cursor-pointer transition ${
              alert.read
                ? "border-white/[0.06] opacity-60"
                : "border-white/[0.1]"
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${SEVERITY_COLORS[alert.severity]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 font-medium">{alert.title}</p>
              {alert.body && <p className="text-xs text-white/40 mt-1">{alert.body}</p>}
              <div className="flex items-center gap-3 mt-2">
                {alert.domain && (
                  <span className="text-xs text-white/20">{alert.domain}</span>
                )}
                {alert.reason_code && (
                  <span className="text-xs text-white/20 bg-white/5 px-2 py-0.5 rounded">
                    {alert.reason_code}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-white/20 shrink-0">
              {new Date(alert.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {alerts.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No alerts yet. Phylax is monitoring.</p>
          </div>
        )}
      </div>
    </div>
  );
}
