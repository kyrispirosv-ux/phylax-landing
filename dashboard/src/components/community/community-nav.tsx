"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/community", label: "Feed" },
  { href: "/dashboard/community/leaderboard", label: "Leaderboard" },
  { href: "/dashboard/community/presets", label: "Presets" },
];

export function CommunityNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-3">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/dashboard/community"
            ? pathname === "/dashboard/community"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link
        href="/dashboard/community/create"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all"
      >
        + New Post
      </Link>
    </div>
  );
}
