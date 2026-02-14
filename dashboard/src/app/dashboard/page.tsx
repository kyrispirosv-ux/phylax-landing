import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { LiveDashboard } from "@/components/dashboard/live-dashboard";

export default async function DashboardOverview() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id, display_name")
    .eq("id", user!.id)
    .single() as { data: { family_id: string; display_name: string } | null };

  const familyId = parent?.family_id;

  type ChildRow = { id: string; name: string; tier: string };
  type DeviceRow = { id: string; child_id: string; device_name: string; status: string; last_heartbeat: string | null; extension_version: string | null };
  type AlertRow = { id: string; title: string; severity: string; domain: string | null; alert_type: string; created_at: string; child_id: string | null };
  type EventRow = { id: number; event_type: string; domain: string | null; category: string | null; created_at: string; child_id: string | null };

  const [childRes, deviceRes, alertRes, eventRes, ruleRes, weeklyBlockRes] = await Promise.all([
    supabase.from("children").select("id, name, tier").eq("family_id", familyId!).order("created_at"),
    supabase.from("devices").select("id, child_id, device_name, status, last_heartbeat, extension_version").eq("family_id", familyId!),
    supabase.from("alerts").select("id, title, severity, domain, alert_type, created_at, child_id").eq("family_id", familyId!).order("created_at", { ascending: false }).limit(20),
    supabase.from("events").select("id, event_type, domain, category, created_at, child_id").eq("family_id", familyId!).order("created_at", { ascending: false }).limit(30),
    supabase.from("rules").select("*", { count: "exact", head: true }).eq("family_id", familyId!).eq("active", true),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("family_id", familyId!).eq("event_type", "blocked").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const kids = (childRes.data ?? []) as ChildRow[];
  const devices = (deviceRes.data ?? []) as DeviceRow[];
  const alerts = (alertRes.data ?? []) as AlertRow[];
  const events = (eventRes.data ?? []) as EventRow[];
  const ruleCount = ruleRes.count ?? 0;
  const weeklyBlocked = weeklyBlockRes.count ?? 0;

  const unreadAlerts = alerts.length;
  const accessRequests = alerts.filter(a => a.alert_type === "ACCESS_REQUEST").length;
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;

  // Device health
  const activeDevices = devices.filter(d => d.status === "active");
  const onlineDevices = activeDevices.filter(d => {
    if (!d.last_heartbeat) return false;
    return Date.now() - new Date(d.last_heartbeat).getTime() < 5 * 60 * 1000;
  });

  // Determine overall risk level
  const riskLevel: "low" | "medium" | "high" =
    criticalAlerts > 0 ? "high" :
    weeklyBlocked > 10 ? "medium" : "low";

  return (
    <LiveDashboard
      parentName={parent?.display_name ?? ""}
      children={kids}
      devices={devices}
      alerts={alerts}
      events={events}
      ruleCount={ruleCount}
      weeklyBlocked={weeklyBlocked}
      accessRequests={accessRequests}
      riskLevel={riskLevel}
      onlineDeviceCount={onlineDevices.length}
      activeDeviceCount={activeDevices.length}
    />
  );
}
