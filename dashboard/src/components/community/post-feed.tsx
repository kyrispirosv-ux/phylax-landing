"use client";

import { useState, useEffect, useCallback } from "react";
import { PostCard } from "./post-card";

type Post = {
  id: string;
  title: string;
  body: string;
  category: string;
  author_name: string;
  is_anonymous: boolean;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  user_vote?: number;
  rule_snapshot?: { text: string; scope: string; target: string | null }[] | null;
};

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "social_media", label: "Social Media" },
  { value: "gaming", label: "Gaming" },
  { value: "content", label: "Content" },
  { value: "grooming", label: "Grooming" },
  { value: "general", label: "General" },
];

const SORTS = [
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
  { value: "trending", label: "Trending" },
];

export function PostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("new");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchPosts = useCallback(async (reset = false) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    params.set("sort", sort);
    if (!reset && cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/community/posts?${params}`);
    const data = await res.json();
    const newPosts = data.posts || [];

    if (reset) {
      setPosts(newPosts);
    } else {
      setPosts((prev) => [...prev, ...newPosts]);
    }

    setHasMore(newPosts.length >= 20);
    if (newPosts.length > 0) {
      setCursor(newPosts[newPosts.length - 1].created_at);
    }
    setLoading(false);
  }, [category, sort, cursor]);

  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    fetchPosts(true);
  }, [category, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                category === c.value
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sort === s.value
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post.id} {...post} />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40 text-sm">No posts yet. Be the first to share!</p>
        </div>
      )}

      {!loading && hasMore && posts.length > 0 && (
        <button
          onClick={() => fetchPosts(false)}
          className="w-full py-3 mt-4 text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.03] rounded-lg transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}
