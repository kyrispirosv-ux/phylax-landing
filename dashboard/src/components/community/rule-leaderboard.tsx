"use client";

import { useState, useEffect } from "react";

type RuleStat = {
  id: string;
  rule_text_normalized: string;
  category: string;
  adoption_count: number;
  effectiveness_score: number;
  blocked_count_30d: number;
};

export function RuleLeaderboard() {
  const [rules, setRules] = useState<RuleStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/community/leaderboard")
      .then((r) => r.json())
      .then((d) => { setRules(d.rules || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40 text-sm">No rule statistics yet. Rules will appear here as more parents use Phylax.</p>
      </div>
    );
  }

  const maxAdoption = rules[0]?.adoption_count || 1;

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div key={rule.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className={`text-lg font-bold min-w-[2ch] text-right ${
              i < 3 ? "text-emerald-400" : "text-white/30"
            }`}>
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{rule.rule_text_normalized}</p>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-white/40">
                <span>{rule.adoption_count} families</span>
                <span>{rule.blocked_count_30d.toLocaleString()} blocks (30d)</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 text-[10px]">
                  {rule.category}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                  style={{ width: `${Math.min((rule.adoption_count / maxAdoption) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
