"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";

type Rule = {
  id: string;
  text: string;
  active: boolean;
  created_at: string;
};

export default function RulesPage() {
  const supabase = createClient();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState("");
  const [familyId, setFamilyId] = useState<string>("");
  const [parentId, setParentId] = useState<string>("");

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;
    setFamilyId(parent.family_id);
    setParentId(parent.id);

    const { data } = await supabase
      .from("rules")
      .select("*")
      .eq("family_id", parent.family_id)
      .order("sort_order");

    setRules((data as Rule[]) ?? []);
    setLoading(false);
  }

  async function addRule() {
    if (!newRule.trim() || !familyId) return;

    await getMutationClient(supabase).from("rules").insert({
      family_id: familyId,
      text: newRule.trim(),
      created_by: parentId,
    });

    setNewRule("");
    loadRules();
  }

  async function toggleRule(id: string, active: boolean) {
    await getMutationClient(supabase).from("rules").update({ active: !active }).eq("id", id);
    loadRules();
  }

  async function deleteRule(id: string) {
    await getMutationClient(supabase).from("rules").delete().eq("id", id);
    loadRules();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addRule();
    }
  }

  if (loading) {
    return <div className="text-white/30 text-sm">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Safety Rules</h1>
        <p className="text-white/40 text-sm mt-1">
          Write rules in plain English. Phylax&apos;s AI engine compiles them into protection policies.
        </p>
      </div>

      {/* Add rule */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. "Block gambling sites" or "Limit YouTube to 1 hour"'
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50"
          />
          <button
            onClick={addRule}
            className="px-5 py-2.5 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl hover:bg-[#7C5CFF]/90 transition"
          >
            Add Rule
          </button>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-3.5 group">
            <button
              onClick={() => toggleRule(rule.id, rule.active)}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition shrink-0 ${
                rule.active
                  ? "bg-[#7C5CFF] border-[#7C5CFF]"
                  : "border-white/20 hover:border-white/40"
              }`}
            >
              {rule.active && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <p className={`flex-1 text-sm ${rule.active ? "text-white/80" : "text-white/30 line-through"}`}>
              {rule.text}
            </p>
            <button
              onClick={() => deleteRule(rule.id)}
              className="text-white/0 group-hover:text-white/20 hover:!text-red-400 text-xs transition"
            >
              Delete
            </button>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No rules yet. Add your first safety rule above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
