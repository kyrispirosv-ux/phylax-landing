"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityNav } from "@/components/community/community-nav";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "social_media", label: "Social Media Safety" },
  { value: "gaming", label: "Gaming" },
  { value: "content", label: "Age-Appropriate Content" },
  { value: "grooming", label: "Grooming Prevention" },
];

export default function CreatePostPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSubmitting(true);
    setError("");

    const res = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category, is_anonymous: isAnonymous }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/community/post/${data.post_id}`);
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <CommunityNav />
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-6">Create a Post</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    category === c.value
                      ? "bg-white/[0.08] text-white"
                      : "bg-white/[0.03] text-white/40 hover:text-white/60"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-1.5">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your experience, question, or advice..."
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50 resize-none h-40"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-white/20 bg-white/[0.05]"
            />
            <span className="text-sm text-white/50">Post anonymously</span>
            <span className="text-xs text-white/30">(your name won&apos;t be shown)</span>
          </label>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2.5 text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !body.trim() || submitting}
              className="px-6 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
