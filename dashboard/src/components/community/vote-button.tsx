"use client";

import { useState } from "react";

type Props = {
  targetType: "post" | "comment";
  targetId: string;
  upvotes: number;
  downvotes?: number;
  userVote: number;
};

export function VoteButton({ targetType, targetId, upvotes, downvotes = 0, userVote: initialVote }: Props) {
  const [vote, setVote] = useState(initialVote);
  const [ups, setUps] = useState(upvotes);
  const [downs, setDowns] = useState(downvotes);
  const [loading, setLoading] = useState(false);

  async function handleVote(value: 1 | -1) {
    if (loading) return;
    setLoading(true);

    const oldVote = vote;
    const oldUps = ups;
    const oldDowns = downs;

    if (vote === value) {
      setVote(0);
      if (value === 1) setUps((u) => u - 1);
      else setDowns((d) => d - 1);
    } else if (vote === 0) {
      setVote(value);
      if (value === 1) setUps((u) => u + 1);
      else setDowns((d) => d + 1);
    } else {
      setVote(value);
      if (value === 1) { setUps((u) => u + 1); setDowns((d) => d - 1); }
      else { setUps((u) => u - 1); setDowns((d) => d + 1); }
    }

    try {
      const res = await fetch("/api/community/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVote(oldVote);
      setUps(oldUps);
      setDowns(oldDowns);
    } finally {
      setLoading(false);
    }
  }

  const score = ups - downs;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleVote(1)}
        className={`p-1.5 rounded transition-colors ${
          vote === 1 ? "text-emerald-400 bg-emerald-400/10" : "text-white/40 hover:text-white/50 hover:bg-white/[0.03]"
        }`}
        aria-label="Upvote"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <span className={`text-sm font-medium min-w-[2ch] text-center ${
        score > 0 ? "text-emerald-400" : score < 0 ? "text-rose-400" : "text-white/40"
      }`}>
        {score}
      </span>
      <button
        onClick={() => handleVote(-1)}
        className={`p-1.5 rounded transition-colors ${
          vote === -1 ? "text-rose-400 bg-rose-400/10" : "text-white/40 hover:text-white/50 hover:bg-white/[0.03]"
        }`}
        aria-label="Downvote"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
