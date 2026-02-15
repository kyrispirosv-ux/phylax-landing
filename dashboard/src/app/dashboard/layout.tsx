import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: parent } = await supabase
    .from("parents")
    .select("display_name, role, family_id")
    .eq("id", user.id)
    .single() as { data: { display_name: string; role: string; family_id: string } | null };

  return (
    <DashboardShell
      user={{ email: user.email ?? "", displayName: parent?.display_name ?? "" }}
    >
      {children}
    </DashboardShell>
  );
}
