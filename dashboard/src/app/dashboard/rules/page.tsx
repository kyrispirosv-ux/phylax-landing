"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";
import { RuleAssistant } from "@/components/dashboard/rule-assistant";

type Rule = {
  id: string;
  text: string;
  scope: "site" | "content";
  target: string | null;
  active: boolean;
  created_at: string;
};

export default function RulesPage() {
  const supabase = createClient();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState("");
  const [parentId, setParentId] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [newScope, setNewScope] = useState<"site" | "content">("content");
  const [newTarget, setNewTarget] = useState("");

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;
    setFamilyId(parent.family_id);
    setParentId(parent.id);
    const { data } = await supabase
      .from("rules").select("*")
      .eq("family_id", parent.family_id)
      .in("scope", ["site", "content"])
      .order("sort_order");
    setRules((data as Rule[]) ?? []);
    setLoading(false);
  }

  async function addRule() {
    if (!newRule.trim() || !familyId) return;
    await getMutationClient(supabase).from("rules").insert({
      family_id: familyId, text: newRule.trim(), scope: newScope,
      target: newTarget.trim() || null, created_by: parentId,
    });
    setNewRule(""); setNewTarget(""); setShowAdd(false);
    loadRules();
  }

  async function toggleRule(id: string, active: boolean) {
    await getMutationClient(supabase).from("rules").update({ active: !active }).eq("id", id);
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, active: !active } : r)));
  }

  async function deleteRule(id: string) {
    await getMutationClient(supabase).from("rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    );
  }

  const siteRules = rules.filter((r) => r.scope === "site");
  const contentRules = rules.filter((r) => r.scope === "content");

  return (
    <div className="space-y-6">
      <RuleAssistant context="rules" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Safety Rules</h1>
          <p className="text-white/40 text-sm mt-1">Site blocks & content filters for your family</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#C9A84C]/20 text-[#E8D5A0] text-sm font-medium hover:border-[#C9A84C]/35 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Rule
        </button>
      </div>

      {/* Add rule form */}
      {showAdd && (
        <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as "site" | "content")}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/40"
            >
              <option value="content">Content Filter</option>
              <option value="site">Site Block</option>
            </select>
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder={newScope === "site" ? "e.g. tiktok.com" : "Target (optional)"}
              className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/40"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              placeholder="Describe the rule in plain English..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/40"
            />
            <button
              onClick={addRule}
              disabled={!newRule.trim()}
              className="px-4 py-2 bg-[#0A1628] border border-[#C9A84C]/25 text-[#E8D5A0] text-sm rounded-lg hover:border-[#C9A84C]/40 disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{rules.length}</p>
          <p className="text-[11px] text-white/40 mt-1">Total Rules</p>
        </div>
        <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{siteRules.length}</p>
          <p className="text-[11px] text-white/40 mt-1">Site Blocks</p>
        </div>
        <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{contentRules.length}</p>
          <p className="text-[11px] text-white/40 mt-1">Content Filters</p>
        </div>
      </div>

      {/* Rules list */}
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Active Rules</h2>
        <div className="space-y-1">
          {rules.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-white/40 text-sm">No rules yet. Add a custom rule or apply presets from the Presets tab.</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition group">
                <button
                  onClick={() => toggleRule(rule.id, rule.active)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${rule.active ? "bg-[#22D3EE]" : "bg-white/[0.08]"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${rule.active ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${rule.active ? "text-white/80" : "text-white/40"}`}>{rule.text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${rule.scope === "site" ? "text-red-400/60" : "text-blue-400/60"}`}>
                      {rule.scope === "site" ? "SITE BLOCK" : "CONTENT FILTER"}
                    </span>
                    {rule.target && <span className="text-[10px] text-white/25">{rule.target}</span>}
                  </div>
                </div>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
