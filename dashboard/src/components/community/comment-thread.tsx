"use client";

import { useState } from "react";
import { VoteButton } from "./vote-button";

type Comment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
  author_name: string;
  is_anonymous: boolean;
  upvotes: number;
  user_vote: number;
  is_own: boolean;
  created_at: string;
};

type Props = {
  postId: string;
  comments: Comment[];
  onCommentAdded: () => void;
};

export function CommentThread({ postId, comments, onCommentAdded }: Props) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const rootComments = comments.filter((c) => !c.parent_comment_id);
  const childMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const existing = childMap.get(c.parent_comment_id) || [];
      existing.push(c);
      childMap.set(c.parent_comment_id, existing);
    }
  }

  async function submitComment(body: string, parentId: string | null) {
    if (!body.trim() || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), parent_comment_id: parentId, is_anonymous: isAnonymous }),
      });
      if (res.ok) {
        setNewComment("");
        setReplyBody("");
        setReplyTo(null);
        onCommentAdded();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function renderComment(comment: Comment, depth: number) {
    return (
      <div key={comment.id} className={`${depth > 0 ? "ml-6 border-l border-white/[0.06] pl-4" : ""}`}>
        <div className="py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white/40 text-xs font-medium">
              {comment.is_anonymous ? "A Phylax Parent" : comment.author_name}
            </span>
            <span className="text-white/20 text-xs">{getTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">{comment.body}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <VoteButton
              targetType="comment"
              targetId={comment.id}
              upvotes={comment.upvotes}
              userVote={comment.user_vote}
            />
            {depth < 3 && (
              <button
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Reply
              </button>
            )}
          </div>

          {replyTo === comment.id && (
            <div className="mt-2 flex gap-2">
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                onKeyDown={(e) => e.key === "Enter" && submitComment(replyBody, comment.id)}
              />
              <button
                onClick={() => submitComment(replyBody, comment.id)}
                disabled={submitting}
                className="px-3 py-2 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}
        </div>

        {(childMap.get(comment.id) || []).map((child) => renderComment(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
            onKeyDown={(e) => e.key === "Enter" && submitComment(newComment, null)}
          />
          <button
            onClick={() => submitComment(newComment, null)}
            disabled={submitting}
            className="px-4 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            Comment
          </button>
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded border-white/20 bg-white/[0.05]"
          />
          <span className="text-xs text-white/40">Post anonymously</span>
        </label>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {rootComments.map((c) => renderComment(c, 0))}
      </div>

      {comments.length === 0 && (
        <p className="text-center text-white/30 text-sm py-6">No comments yet.</p>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
