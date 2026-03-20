"use client";

import { useState } from "react";

type Props = {
  targetType: "post" | "comment" | "preset";
  targetId: string;
  onClose: () => void;
};

const REASONS = [
  "Spam or misleading",
  "Inappropriate content",
  "Harassment or bullying",
  "Contains personal information",
  "Other",
];

export function ReportModal({ targetType, targetId, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    const finalReason = reason === "Other" ? custom.trim() : reason;
    if (!finalReason) return;
    setSubmitting(true);

    const res = await fetch("/api/community/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason: finalReason }),
    });

    setSubmitting(false);
    if (res.ok || res.status === 409) setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <p className="text-white font-medium">Report submitted</p>
            <p className="text-white/40 text-sm mt-1">Thank you for helping keep our community safe.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-white/[0.08] text-white rounded-lg text-sm hover:bg-white/[0.12] transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-white font-semibold mb-4">Report {targetType}</h3>
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    reason === r ? "bg-white/[0.08] text-white" : "text-white/50 hover:bg-white/[0.03]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 mb-4 resize-none h-20"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/50 transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!reason || (reason === "Other" && !custom.trim()) || submitting}
                className="px-4 py-2 bg-rose-500/20 text-rose-300 rounded-lg text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
