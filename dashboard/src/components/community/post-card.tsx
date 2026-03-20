import Link from "next/link";
import { VoteButton } from "./vote-button";

const CATEGORY_COLORS: Record<string, string> = {
  social_media: "bg-blue-500/20 text-blue-300",
  gaming: "bg-purple-500/20 text-purple-300",
  content: "bg-amber-500/20 text-amber-300",
  grooming: "bg-rose-500/20 text-rose-300",
  general: "bg-white/[0.08] text-white/50",
};

type PostCardProps = {
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

export function PostCard({
  id, title, body, category, author_name, is_anonymous,
  upvotes, downvotes, comment_count, created_at, user_vote = 0, rule_snapshot,
}: PostCardProps) {
  const timeAgo = getTimeAgo(created_at);
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.03] transition-colors">
      <div className="flex gap-3">
        <VoteButton
          targetType="post"
          targetId={id}
          upvotes={upvotes}
          downvotes={downvotes}
          userVote={user_vote}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${categoryColor}`}>
              {category.replace("_", " ")}
            </span>
            <span className="text-white/40 text-xs">
              {is_anonymous ? "A Phylax Parent" : author_name}
            </span>
            <span className="text-white/25 text-xs">{timeAgo}</span>
          </div>

          <Link href={`/dashboard/community/post/${id}`} className="block group">
            <h3 className="text-white font-medium text-[15px] leading-snug group-hover:text-emerald-300 transition-colors">
              {title}
            </h3>
            <p className="text-white/50 text-sm mt-1 line-clamp-2">{body}</p>
          </Link>

          {rule_snapshot && rule_snapshot.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {rule_snapshot.slice(0, 3).map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px]">
                  {r.text.length > 40 ? r.text.slice(0, 40) + "..." : r.text}
                </span>
              ))}
              {rule_snapshot.length > 3 && (
                <span className="text-white/40 text-[11px]">+{rule_snapshot.length - 3} more</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2.5">
            <Link
              href={`/dashboard/community/post/${id}`}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/50 text-xs transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {comment_count} {comment_count === 1 ? "comment" : "comments"}
            </Link>
          </div>
        </div>
      </div>
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
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
