"use client";

import { useState, useEffect } from "react";
import { CommunityNav } from "@/components/community/community-nav";
import { PresetCard } from "@/components/community/preset-card";

export default function PresetsPage() {
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState("popular");

  useEffect(() => {
    const params = new URLSearchParams();
    if (tier) params.set("tier", tier);
    params.set("sort", sort);

    fetch(`/api/community/presets?${params}`)
      .then((r) => r.json())
      .then((d) => { setPresets(d.presets || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tier, sort]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Safety Presets</h1>
        <p className="text-white/40 text-sm mt-1">Ready-made rule sets shared by other parents.</p>
      </div>
      <CommunityNav />

      <div className="flex flex-wrap gap-2 mb-4">
        {[{ v: "", l: "All Ages" }, { v: "kid_10", l: "Ages 8-10" }, { v: "tween_13", l: "Ages 11-13" }, { v: "teen_16", l: "Ages 14-16" }].map((t) => (
          <button
            key={t.v}
            onClick={() => setTier(t.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tier === t.v ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <p className="text-center text-white/40 text-sm py-12">No presets yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.map((p) => <PresetCard key={p.id} {...p} />)}
        </div>
      )}
    </div>
  );
}
