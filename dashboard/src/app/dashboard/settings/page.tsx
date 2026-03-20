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
  const [shareSafetyInsights, setShareSafetyInsights] = useState(false);
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
      .select("name, share_safety_insights")
      .eq("id", parent.family_id)
      .single();

    const f = family as { name: string; share_safety_insights: boolean } | null;
    setFamilyName(f?.name ?? "");
    setShareSafetyInsights(f?.share_safety_insights ?? false);
  }

  async function save() {
    setSaving(true);

    const db = getMutationClient(supabase);
    await Promise.all([
      db.from("parents").update({ display_name: displayName }).eq("id", parentId),
      db.from("families").update({ name: familyName, share_safety_insights: shareSafetyInsights }).eq("id", familyId),
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

        {/* Safety Insights Sharing */}
        <div className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.03]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white mb-1">Community Safety Insights</h3>
              <p className="text-white/40 text-xs leading-relaxed">
                Help improve child safety for all families by sharing anonymized safety patterns.
                We only share structured metadata (topics, risk levels, platforms) — never message
                content, names, URLs, or any personally identifiable information.
              </p>
              <div className="mt-3 space-y-1.5">
                <p className="text-white/40 text-[11px] flex items-center gap-1.5">
                  <span className="text-emerald-400">&#10003;</span> Anonymized topic categories and risk levels
                </p>
                <p className="text-white/40 text-[11px] flex items-center gap-1.5">
                  <span className="text-emerald-400">&#10003;</span> Platform-level trends (not specific pages)
                </p>
                <p className="text-white/40 text-[11px] flex items-center gap-1.5">
                  <span className="text-emerald-400">&#10003;</span> Decision patterns (block/allow counts)
                </p>
                <p className="text-white/40 text-[11px] flex items-center gap-1.5">
                  <span className="text-rose-400">&#10007;</span> No message content, usernames, or URLs
                </p>
                <p className="text-white/40 text-[11px] flex items-center gap-1.5">
                  <span className="text-rose-400">&#10007;</span> No exact timestamps or location data
                </p>
              </div>
            </div>
            <button
              onClick={() => setShareSafetyInsights(!shareSafetyInsights)}
              className={`mt-1 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                shareSafetyInsights ? "bg-[#22D3EE]" : "bg-white/[0.08]"
              }`}
              role="switch"
              aria-checked={shareSafetyInsights}
              aria-label="Share safety insights"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  shareSafetyInsights ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {shareSafetyInsights && (
            <p className="mt-3 text-[11px] text-[#C9A84C]/70 border-t border-white/[0.06] pt-3">
              Thank you for helping protect children everywhere. You can access Community Safety
              Insights on your dashboard while sharing is enabled.
            </p>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-[#7C5CFF] to-[#7C5CFF]/80 text-white text-sm font-medium rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
