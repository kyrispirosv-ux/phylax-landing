"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";
import { RuleAssistant } from "@/components/dashboard/rule-assistant";

type LlmRule = {
  id: string;
  text: string;
  scope: "llm";
  target: string | null;
  llm_platform: string;
  llm_category: string;
  active: boolean;
  created_at: string;
};

const MODELS = [
  { value: "all", label: "All Models", color: "bg-white/[0.08]", textColor: "text-white/60", icon: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  )},
  { value: "chatgpt", label: "ChatGPT", color: "bg-[#10A37F]/10", textColor: "text-[#10A37F]", icon: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )},
  { value: "gemini", label: "Gemini", color: "bg-[#4285F4]/10", textColor: "text-[#4285F4]", icon: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M12 24C12 20.2 11.1 17.4 9.36 15.6C7.56 13.8 4.8 12.9 1 12.84V12.16C4.8 12.1 7.56 11.2 9.36 9.4C11.1 7.56 12 4.76 12 1H12.04C12.04 4.76 12.94 7.56 14.68 9.4C16.48 11.2 19.24 12.1 23.04 12.16V12.84C19.24 12.9 16.48 13.8 14.68 15.6C12.94 17.4 12.04 20.2 12.04 24H12Z" fill="url(#gemini-grad)"/>
      <defs>
        <linearGradient id="gemini-grad" x1="1" y1="1" x2="23" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4"/>
          <stop offset="0.5" stopColor="#9B72CB"/>
          <stop offset="1" stopColor="#D96570"/>
        </linearGradient>
      </defs>
    </svg>
  )},
  { value: "grok", label: "Grok", color: "bg-gray-900/10", textColor: "text-white", icon: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.982 10.622L20.54 3h-1.554l-5.693 6.618L8.745 3H3.5l6.876 10.007L3.5 21h1.554l6.012-6.989L15.868 21h5.245l-7.131-10.378zm-2.128 2.474l-.697-.997L5.657 4.16h2.386l4.474 6.4.697.996 5.815 8.318h-2.387l-4.745-6.787z"/>
    </svg>
  )},
  { value: "claude", label: "Claude", color: "bg-[#D97757]/10", textColor: "text-[#D97757]", icon: (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.957 5.117l-4.17 14.09-1.98-.586 4.17-14.09 1.98.586zM7.146 8.293L2.44 12l4.707 3.707-1.294 1.586L0 12l5.853-5.293 1.293 1.586zM16.854 8.293l1.293-1.586L24 12l-5.853 5.293-1.293-1.586L21.56 12l-4.707-3.707z"/>
    </svg>
  )},
];

const CATEGORIES = [
  { value: "topic_block", label: "Topic Block", description: "Block responses about specific topics" },
  { value: "capability_block", label: "Capability Block", description: "Restrict AI capabilities" },
  { value: "persona_block", label: "Persona Block", description: "Block jailbreaks & unsafe personas" },
];

export default function LlmFiltersPage() {
  const supabase = createClient();
  const [rules, setRules] = useState<LlmRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState("");
  const [parentId, setParentId] = useState("");

  const [selectedModel, setSelectedModel] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPlatform, setNewPlatform] = useState("all");
  const [newCategory, setNewCategory] = useState("topic_block");
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
      .eq("scope", "llm")
      .order("created_at", { ascending: false });
    setRules((data as LlmRule[]) ?? []);
    setLoading(false);
  }

  async function addRule() {
    if (!newText.trim() || !familyId) return;
    await getMutationClient(supabase).from("rules").insert({
      family_id: familyId, text: newText.trim(), scope: "llm" as const,
      target: newTarget.trim() || null, llm_platform: newPlatform,
      llm_category: newCategory, created_by: parentId,
    });
    setNewText(""); setNewTarget(""); setShowAdd(false);
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

  const filteredRules = selectedModel === "all"
    ? rules
    : rules.filter((r) => r.llm_platform === selectedModel || r.llm_platform === "all");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RuleAssistant context="llm" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Model Filters</h1>
          <p className="text-white/40 text-sm mt-1">Control what AI chatbots can discuss with your children</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#C9A84C]/20 text-[#E8D5A0] text-sm font-medium hover:border-[#C9A84C]/35 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Filter
        </button>
      </div>

      {/* Model selector */}
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Select AI Platform</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {MODELS.map((model) => {
            const isSelected = selectedModel === model.value;
            const modelRules = model.value === "all"
              ? rules
              : rules.filter((r) => r.llm_platform === model.value || r.llm_platform === "all");
            return (
              <button
                key={model.value}
                onClick={() => setSelectedModel(model.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
                  isSelected
                    ? `${model.color} border-2 border-[#C9A84C]/50 shadow-lg shadow-[#C9A84C]/10`
                    : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.03]"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl ${model.color} flex items-center justify-center ${model.textColor}`}>
                  {model.icon}
                </div>
                <span className={`text-xs font-medium ${isSelected ? "text-white" : "text-white/50"}`}>{model.label}</span>
                <span className="text-[10px] text-white/25">{modelRules.length} rules</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add rule form */}
      {showAdd && (
        <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-5">
          <h3 className="text-sm font-medium text-white/50 mb-3">New AI Filter Rule</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/40"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="Target keyword (optional)"
              className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/40"
            />
          </div>
          <p className="text-xs text-white/25 mb-3">
            {CATEGORIES.find((c) => c.value === newCategory)?.description}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRule()}
              placeholder={
                newCategory === "topic_block" ? 'e.g. "Block responses about weapons"'
                : newCategory === "capability_block" ? 'e.g. "Block code generation for exploits"'
                : 'e.g. "Block DAN and jailbreak prompts"'
              }
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/40"
            />
            <button
              onClick={addRule}
              disabled={!newText.trim()}
              className="px-4 py-2 bg-[#0A1628] border border-[#C9A84C]/25 text-[#E8D5A0] text-sm rounded-lg hover:border-[#C9A84C]/40 disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const count = filteredRules.filter((r) => r.llm_category === cat.value).length;
          return (
            <div key={cat.value} className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-purple-400">{count}</p>
              <p className="text-[11px] text-white/40 mt-1">{cat.label}s</p>
            </div>
          );
        })}
      </div>

      {/* Rules list */}
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            {selectedModel === "all" ? "All AI Rules" : `${MODELS.find((m) => m.value === selectedModel)?.label} Rules`}
          </h2>
          <span className="text-white/40 text-xs">{filteredRules.length} rules</span>
        </div>
        <div className="space-y-1">
          {filteredRules.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-white/40 text-sm">No AI filter rules yet. Add one above to get started.</p>
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition group">
                <button
                  onClick={() => toggleRule(rule.id, rule.active)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${rule.active ? "bg-[#22D3EE]" : "bg-white/[0.08]"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${rule.active ? "left-[18px]" : "left-0.5"}`} />
                </button>
                {/* Platform badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  rule.llm_platform === "chatgpt" ? "bg-green-500/15 text-green-400"
                  : rule.llm_platform === "gemini" ? "bg-blue-500/15 text-blue-400"
                  : rule.llm_platform === "grok" ? "bg-white/[0.08] text-white/60"
                  : rule.llm_platform === "claude" ? "bg-orange-500/15 text-orange-400"
                  : "bg-purple-500/15 text-purple-400"
                }`}>
                  {MODELS.find((m) => m.value === rule.llm_platform)?.label || rule.llm_platform}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${rule.active ? "text-white/80" : "text-white/40"}`}>{rule.text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-purple-400/60 font-medium">
                      {CATEGORIES.find((c) => c.value === rule.llm_category)?.label || rule.llm_category}
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

      {/* Info */}
      <div className="bg-purple-500/5 border border-purple-500/10 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-purple-400 mb-2">How AI Filters Work</h3>
        <div className="space-y-2 text-xs text-white/40">
          <p><strong className="text-white/50">Topic Blocks</strong> prevent AI from discussing specific subjects (weapons, drugs, explicit content).</p>
          <p><strong className="text-white/50">Capability Blocks</strong> restrict what the AI can do (code generation, image creation).</p>
          <p><strong className="text-white/50">Persona Blocks</strong> stop jailbreak attempts (DAN prompts, roleplay bypasses).</p>
          <p className="text-white/25 pt-1">Filters are enforced by the Phylax extension in real-time across ChatGPT, Gemini, Grok, and Claude.</p>
        </div>
      </div>
    </div>
  );
}
