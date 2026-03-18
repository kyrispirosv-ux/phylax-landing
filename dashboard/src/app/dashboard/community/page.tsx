import { CommunityNav } from "@/components/community/community-nav";
import { PostFeed } from "@/components/community/post-feed";

export default function CommunityPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Community</h1>
        <p className="text-white/40 text-sm mt-1">Connect with other parents. Share rules. Stay safer together.</p>
      </div>
      <CommunityNav />
      <PostFeed />
    </div>
  );
}
