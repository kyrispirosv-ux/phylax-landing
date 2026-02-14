import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardOverview() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id, display_name")
    .eq("id", user!.id)
    .single() as { data: { family_id: string; display_name: string } | null };

  const familyId = parent?.family_id;

  type RecentAlert = { id: string; title: string; severity: string; domain: string | null; created_at: string };

  const [childRes, ruleRes, alertRes, deviceRes, recentRes] = await Promise.all([
    supabase.from("children").select("*", { count: "exact", head: true }).eq("family_id", familyId!),
    supabase.from("rules").select("*", { count: "exact", head: true }).eq("family_id", familyId!),
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("family_id", familyId!).eq("read", false),
    supabase.from("devices").select("*", { count: "exact", head: true }).eq("family_id", familyId!).eq("status", "active"),
    supabase.from("alerts").select("id, title, severity, domain, created_at").eq("family_id", familyId!).order("created_at", { ascending: false }).limit(5),
  ]);

  const childCount = childRes.count ?? 0;
  const ruleCount = ruleRes.count ?? 0;
  const alertCount = alertRes.count ?? 0;
  const deviceCount = deviceRes.count ?? 0;
  const recentAlerts = (recentRes.data ?? []) as RecentAlert[];

  const stats = [
    { label: "Children", value: childCount, color: "from-[#7C5CFF] to-[#22D3EE]", href: "/dashboard/children" },
    { label: "Devices", value: deviceCount, color: "from-[#22D3EE] to-[#34D399]", href: "/dashboard/devices" },
    { label: "Active Rules", value: ruleCount, color: "from-[#34D399] to-[#22D3EE]", href: "/dashboard/rules" },
    { label: "Unread Alerts", value: alertCount, color: alertCount ? "from-[#FF5050] to-[#FF8C42]" : "from-[#34D399] to-[#22D3EE]", href: "/dashboard/alerts" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Welcome back, {parent?.display_name}</h1>
      <p className="text-white/40 text-sm mb-8">Here&apos;s your family&apos;s safety overview.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition">
            <p className="text-white/40 text-xs font-medium mb-2">{stat.label}</p>
            <p className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
              {stat.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      {childCount > 0 && deviceCount === 0 && (
        <Link
          href="/dashboard/devices"
          className="block bg-[#7C5CFF]/10 border border-[#7C5CFF]/20 rounded-2xl p-5 mb-8 hover:bg-[#7C5CFF]/15 transition"
        >
          <p className="text-[#7C5CFF] font-medium text-sm">Pair your first device</p>
          <p className="text-white/40 text-xs mt-1">Generate a pairing code to connect your child&apos;s Chrome browser.</p>
        </Link>
      )}

      {/* Recent Alerts */}
      <h2 className="text-lg font-semibold mb-4">Recent Alerts</h2>
      {recentAlerts && recentAlerts.length > 0 ? (
        <div className="space-y-2">
          {recentAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-3.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                alert.severity === "critical" ? "bg-red-500" :
                alert.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 truncate">{alert.title}</p>
                <p className="text-xs text-white/30">{alert.domain}</p>
              </div>
              <p className="text-xs text-white/20 shrink-0">
                {new Date(alert.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
          <p className="text-white/30 text-sm">No alerts yet. Phylax is watching.</p>
        </div>
      )}
    </div>
  );
}
