"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { VoteButton } from "@/components/community/vote-button";
import { CommentThread } from "@/components/community/comment-thread";
import { ReportModal } from "@/components/community/report-modal";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  const fetchPost = useCallback(async () => {
    const [postRes, commentsRes] = await Promise.all([
      fetch(`/api/community/posts/${id}`),
      fetch(`/api/community/posts/${id}/comments`),
    ]);
    const postData = await postRes.json();
    const commentsData = await commentsRes.json();
    setPost(postData.post);
    setComments(commentsData.comments || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return <p className="text-center text-white/40 py-12">Post not found.</p>;
  }

  const CATEGORY_COLORS: Record<string, string> = {
    social_media: "bg-blue-500/20 text-blue-300",
    gaming: "bg-purple-500/20 text-purple-300",
    content: "bg-amber-500/20 text-amber-300",
    grooming: "bg-rose-500/20 text-rose-300",
    general: "bg-white/[0.08] text-white/60",
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/dashboard/community" className="text-white/40 hover:text-white/60 text-sm mb-4 inline-block transition-colors">
        &larr; Back to feed
      </Link>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.general}`}>
            {post.category.replace("_", " ")}
          </span>
          <span className="text-white/40 text-xs">{post.author_name}</span>
          <span className="text-white/20 text-xs">{new Date(post.created_at).toLocaleDateString()}</span>
        </div>

        <h1 className="text-xl font-bold text-white mb-3">{post.title}</h1>
        <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>

        {post.rule_snapshot && post.rule_snapshot.length > 0 && (
          <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
            <p className="text-emerald-300 text-xs font-medium mb-2">Attached Rules</p>
            <div className="space-y-1">
              {post.rule_snapshot.map((r: any, i: number) => (
                <div key={i} className="text-sm text-white/60">
                  {r.text} <span className="text-white/30">({r.scope}{r.target ? ` — ${r.target}` : ""})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
          <VoteButton
            targetType="post"
            targetId={post.id}
            upvotes={post.upvotes}
            downvotes={post.downvotes}
            userVote={post.user_vote || 0}
          />
          <span className="text-white/30 text-xs">{post.comment_count} comments</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowReport(true)}
            className="text-xs text-white/30 hover:text-rose-400 transition-colors"
          >
            Report
          </button>
          {post.is_own && (
            <button
              onClick={async () => {
                if (confirm("Delete this post?")) {
                  await fetch(`/api/community/posts/${id}`, { method: "DELETE" });
                  router.push("/dashboard/community");
                }
              }}
              className="text-xs text-white/30 hover:text-rose-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-white font-semibold mb-4">Comments</h2>
        <CommentThread postId={id} comments={comments} onCommentAdded={fetchPost} />
      </div>

      {showReport && (
        <ReportModal targetType="post" targetId={id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
