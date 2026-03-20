"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";

const AGE_PROFILES = [
  {
    tier: "early_years",
    label: "Early Years",
    subtitle: "Max Protection",
    ageRange: "Under 5",
    rules: [
      { text: "Block all social media platforms", scope: "site" as const, target: null },
      { text: "Block all messaging and chat", scope: "site" as const, target: null },
      { text: "Block all video comments", scope: "content" as const, target: null },
      { text: "Block all AI chatbots", scope: "site" as const, target: null },
    ],
  },
  {
    tier: "young_explorers",
    label: "Young Explorers",
    subtitle: "High Protection",
    ageRange: "5\u20138",
    rules: [
      { text: "Block social media platforms", scope: "site" as const, target: null },
      { text: "Block violent and scary content", scope: "content" as const, target: null },
      { text: "Block YouTube comments section", scope: "content" as const, target: "youtube.com" },
      { text: "Block AI chatbots from inappropriate topics", scope: "llm" as const, target: null },
    ],
  },
  {
    tier: "growing_up",
    label: "Growing Up",
    subtitle: "Guided Internet",
    ageRange: "8\u201311",
    rules: [
      { text: "Filter explicit content on all platforms", scope: "content" as const, target: null },
      { text: "Block TikTok and Snapchat", scope: "site" as const, target: null },
      { text: "Block gambling sites", scope: "site" as const, target: null },
      { text: "Block AI jailbreak attempts", scope: "llm" as const, target: null },
      { text: "Block dating sites", scope: "site" as const, target: null },
    ],
  },
  {
    tier: "pre_teen",
    label: "Pre-Teen",
    subtitle: "Supervised Independence",
    ageRange: "11\u201314",
    rules: [
      { text: "Block pornographic content", scope: "content" as const, target: null },
      { text: "Block gambling sites", scope: "site" as const, target: null },
      { text: "Block drug-related content", scope: "content" as const, target: null },
      { text: "Alert on grooming-pattern conversations", scope: "content" as const, target: null },
      { text: "Block AI persona jailbreaks", scope: "llm" as const, target: null },
    ],
  },
  {
    tier: "teen",
    label: "Teen / Young Adult",
    subtitle: "Intelligent Guardian",
    ageRange: "14+",
    rules: [
      { text: "Block pornographic content", scope: "content" as const, target: null },
      { text: "Block drug marketplace sites", scope: "site" as const, target: null },
      { text: "Alert on suspicious conversation patterns", scope: "content" as const, target: null },
    ],
  },
];

const CONTENT_CATEGORIES = [
  { key: "adult", label: "Adult & Pornography", description: "Explicit vision & text detection", defaultOn: true,
    rules: [
      { text: "Block all pornographic content", scope: "content" as const, target: null },
      { text: "Block adult websites", scope: "site" as const, target: null },
    ],
  },
  { key: "gambling", label: "Gambling / High Risk", description: "Poker, betting, crypto scams", defaultOn: true,
    rules: [
      { text: "Block gambling sites", scope: "site" as const, target: null },
      { text: "Block crypto scam content", scope: "content" as const, target: null },
    ],
  },
  { key: "weapons", label: "Weapons / Violence", description: "Graphic imagery & shopping", defaultOn: false,
    rules: [
      { text: "Block weapon shopping sites", scope: "site" as const, target: null },
      { text: "Block graphic violence content", scope: "content" as const, target: null },
    ],
  },
  { key: "drugs", label: "Drugs / Vaping", description: "Promotion of illicit substances", defaultOn: true,
    rules: [
      { text: "Block drug-related content", scope: "content" as const, target: null },
      { text: "Block vaping promotion content", scope: "content" as const, target: null },
    ],
  },
  { key: "self_harm", label: "Self Harm / Suicide", description: "Content promoting self-injury", defaultOn: true,
    rules: [
      { text: "Block self-harm content", scope: "content" as const, target: null },
      { text: "Block suicide promotion content", scope: "content" as const, target: null },
    ],
  },
  { key: "grooming", label: "Grooming / Predators", description: "Suspicious contact patterns", defaultOn: true,
    rules: [
      { text: "Alert on grooming-pattern conversations", scope: "content" as const, target: null },
      { text: "Block dating sites and apps", scope: "site" as const, target: null },
    ],
  },
  { key: "social_media", label: "Social Media", description: "Platform access controls", defaultOn: false,
    rules: [
      { text: "Block TikTok", scope: "site" as const, target: "tiktok.com" },
      { text: "Block Snapchat", scope: "site" as const, target: "snapchat.com" },
      { text: "Block Instagram", scope: "site" as const, target: "instagram.com" },
    ],
  },
];

export default function PresetsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState("");
  const [parentId, setParentId] = useState("");
  const [selectedAge, setSelectedAge] = useState<string | null>(null);
  const [categoryToggles, setCategoryToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    CONTENT_CATEGORIES.forEach((c) => { initial[c.key] = c.defaultOn; });
    return initial;
  });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    (async () => {
      const parent = await getParentInfo(supabase);
      if (!parent) return;
      setFamilyId(parent.family_id);
      setParentId(parent.id);
      setLoading(false);
    })();
  }, []);

  async function applyAgeProfile(tier: string) {
    if (!familyId || applying) return;
    setApplying(true);
    const profile = AGE_PROFILES.find((p) => p.tier === tier);
    if (!profile) return;
    setSelectedAge(tier);
    const inserts = profile.rules.map((r, i) => ({
      family_id: familyId, text: r.text, scope: r.scope, target: r.target,
      active: true, sort_order: 1000 + i, created_by: parentId,
    }));
    await getMutationClient(supabase).from("rules").insert(inserts);
    setApplying(false);
  }

  async function toggleCategory(key: string) {
    if (!familyId) return;
    const newState = !categoryToggles[key];
    setCategoryToggles((prev) => ({ ...prev, [key]: newState }));
    const category = CONTENT_CATEGORIES.find((c) => c.key === key);
    if (!category) return;
    if (newState) {
      const inserts = category.rules.map((r, i) => ({
        family_id: familyId, text: r.text, scope: r.scope, target: r.target,
        active: true, sort_order: 2000 + i, created_by: parentId,
      }));
      await getMutationClient(supabase).from("rules").insert(inserts);
    } else {
      for (const r of category.rules) {
        await getMutationClient(supabase).from("rules").delete()
          .eq("family_id", familyId).eq("text", r.text);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Age Profile */}
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <h2 className="text-lg font-bold text-white">Age Profile</h2>
        </div>
        <div className="space-y-2">
          {AGE_PROFILES.map((profile) => {
            const isSelected = selectedAge === profile.tier;
            return (
              <button
                key={profile.tier}
                onClick={() => applyAgeProfile(profile.tier)}
                disabled={applying}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-xl transition-all ${
                  isSelected
                    ? "bg-[#C9A84C]/10 border-2 border-[#C9A84C]/50 shadow-lg shadow-[#C9A84C]/10"
                    : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.03] hover:border-white/10"
                }`}
              >
                <div className="text-left">
                  <p className={`font-semibold ${isSelected ? "text-white" : "text-white/80"}`}>{profile.label}</p>
                  <p className={`text-sm ${isSelected ? "text-white/50" : "text-white/40"}`}>{profile.subtitle}</p>
                </div>
                <span className={`text-sm font-mono ${isSelected ? "text-white/60" : "text-white/40"}`}>{profile.ageRange}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Categories */}
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Content Categories</h2>
          <span className="px-3 py-1 rounded-full border border-white/[0.06] text-white/40 text-xs font-medium">Standard Mode</span>
        </div>
        <div className="space-y-1">
          {CONTENT_CATEGORIES.map((cat) => {
            const isOn = categoryToggles[cat.key];
            return (
              <div key={cat.key} className="flex items-center justify-between px-4 py-4 rounded-xl hover:bg-white/[0.03] transition">
                <div>
                  <p className="font-semibold text-white/80 text-[15px]">{cat.label}</p>
                  <p className="text-sm text-white/40">{cat.description}</p>
                </div>
                <button
                  onClick={() => toggleCategory(cat.key)}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${isOn ? "bg-[#22D3EE]" : "bg-white/[0.08]"}`}
                >
                  <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${isOn ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            );
          })}
        </div>
        {selectedAge && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-[#C9A84C] text-xs font-semibold tracking-wider uppercase mb-3">
              Age Restricted ({AGE_PROFILES.find((p) => p.tier === selectedAge)?.ageRange})
            </p>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-white/40 text-sm">Harmful Content</span>
              <svg className="w-4 h-4 text-[#C9A84C]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
