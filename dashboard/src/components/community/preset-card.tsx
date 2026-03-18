import Link from "next/link";

type PresetCardProps = {
  id: string;
  name: string;
  description: string;
  age_range: string;
  tier: string;
  rules: { text: string }[];
  adoption_count: number;
  rating_avg: number;
  rating_count: number;
  author_name: string;
};

const TIER_LABELS: Record<string, string> = {
  kid_10: "Ages 8-10",
  tween_13: "Ages 11-13",
  teen_16: "Ages 14-16",
};

export function PresetCard({
  id, name, description, age_range, tier, rules,
  adoption_count, rating_avg, rating_count, author_name,
}: PresetCardProps) {
  return (
    <Link
      href={`/dashboard/community/presets/${id}`}
      className="block bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.05] transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-white font-medium text-[15px]">{name}</h3>
          <p className="text-white/40 text-xs mt-0.5">by {author_name}</p>
        </div>
        <span className="px-2 py-0.5 rounded bg-white/[0.06] text-white/50 text-[11px] font-medium">
          {TIER_LABELS[tier] || age_range || tier}
        </span>
      </div>

      {description && (
        <p className="text-white/50 text-sm line-clamp-2 mb-3">{description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {rules.slice(0, 4).map((r, i) => (
          <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px]">
            {r.text.length > 35 ? r.text.slice(0, 35) + "..." : r.text}
          </span>
        ))}
        {rules.length > 4 && (
          <span className="text-white/30 text-[11px] self-center">+{rules.length - 4} more</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-white/40">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
          {adoption_count} adopted
        </span>
        {rating_count > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {rating_avg.toFixed(1)} ({rating_count})
          </span>
        )}
      </div>
    </Link>
  );
}
