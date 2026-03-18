import { CommunityNav } from "@/components/community/community-nav";
import { RuleLeaderboard } from "@/components/community/rule-leaderboard";

export default function LeaderboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Rules Leaderboard</h1>
        <p className="text-white/40 text-sm mt-1">The most popular safety rules across the Phylax community.</p>
      </div>
      <CommunityNav />
      <RuleLeaderboard />
    </div>
  );
}
