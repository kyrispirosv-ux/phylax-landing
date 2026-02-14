"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";

export default function SettingsPage() {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;

    setDisplayName(parent.display_name ?? "");
    setFamilyId(parent.family_id);
    setParentId(parent.id);

    const { data: family } = await supabase
      .from("families")
      .select("name")
      .eq("id", parent.family_id)
      .single();

    setFamilyName((family as { name: string } | null)?.name ?? "");
  }

  async function save() {
    setSaving(true);

    const db = getMutationClient(supabase);
    await Promise.all([
      db.from("parents").update({ display_name: displayName }).eq("id", parentId),
      db.from("families").update({ name: familyName }).eq("id", familyId),
    ]);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-white/40 text-sm mb-8">Manage your account and family settings</p>

      <div className="max-w-md space-y-6">
        <div>
          <label className="block text-white/50 text-xs font-medium mb-1.5">Your Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50 transition"
          />
        </div>

        <div>
          <label className="block text-white/50 text-xs font-medium mb-1.5">Family Name</label>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50 transition"
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl hover:bg-[#7C5CFF]/90 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
