"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function PresetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [preset, setPreset] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/community/presets/${id}`)
      .then((r) => r.json())
      .then((d) => { setPreset(d.preset); setReviews(d.reviews || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleAdopt() {
    setAdopting(true);
    const res = await fetch(`/api/community/presets/${id}/adopt`, { method: "POST" });
    if (res.ok) setAdopted(true);
    setAdopting(false);
  }

  async function handleReview() {
    if (!reviewRating) return;
    setReviewSubmitting(true);
    const res = await fetch(`/api/community/presets/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: reviewRating, body: reviewBody }),
    });
    if (res.ok) {
      const d = await (await fetch(`/api/community/presets/${id}`)).json();
      setPreset(d.preset);
      setReviews(d.reviews || []);
      setReviewRating(0);
      setReviewBody("");
    }
    setReviewSubmitting(false);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" /></div>;
  }
  if (!preset) return <p className="text-center text-white/40 py-12">Preset not found.</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/dashboard/community/presets" className="text-white/40 hover:text-white/60 text-sm mb-4 inline-block transition-colors">
        &larr; Back to presets
      </Link>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">{preset.name}</h1>
            <p className="text-white/40 text-sm mt-1">by {preset.author_name} &middot; {preset.adoption_count} adoptions</p>
          </div>
          {preset.rating_count > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span className="text-sm font-medium">{preset.rating_avg.toFixed(1)}</span>
              <span className="text-white/30 text-xs">({preset.rating_count})</span>
            </div>
          )}
        </div>

        {preset.description && <p className="text-white/60 text-sm mb-4">{preset.description}</p>}

        <div className="space-y-2 mb-6">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Rules in this preset</p>
          {(preset.rules || []).map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center font-medium">{i + 1}</span>
              <span className="text-white/70 text-sm">{r.text}</span>
              {r.target && <span className="text-white/30 text-xs ml-auto">{r.target}</span>}
            </div>
          ))}
        </div>

        <button
          onClick={handleAdopt}
          disabled={adopting || adopted}
          className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
            adopted
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          } disabled:opacity-60`}
        >
          {adopted ? "Rules Added to Your Setup" : adopting ? "Adding..." : `Adopt ${(preset.rules || []).length} Rules`}
        </button>
      </div>

      <div className="mt-6">
        <h2 className="text-white font-semibold mb-4">Reviews</h2>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                <svg className={`w-5 h-5 ${s <= reviewRating ? "text-amber-400" : "text-white/20"}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            ))}
          </div>
          <textarea
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Write a review (optional)..."
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 resize-none h-16 mb-2"
          />
          <button
            onClick={handleReview}
            disabled={!reviewRating || reviewSubmitting}
            className="px-4 py-2 bg-white/[0.08] text-white rounded-lg text-sm hover:bg-white/[0.12] transition-colors disabled:opacity-50"
          >
            Submit Review
          </button>
        </div>

        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? "text-amber-400" : "text-white/20"}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
                <span className="text-white/40 text-xs">{r.author_name}</span>
              </div>
              {r.body && <p className="text-white/60 text-sm">{r.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
