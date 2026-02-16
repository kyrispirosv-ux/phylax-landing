'use client';

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>

            <div className="glass-card p-6 rounded-2xl border border-white/10">
                <h2 className="text-xl font-semibold text-white mb-4">Account Settings</h2>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-white/70">Email Notifications</span>
                        <div className="w-12 h-6 bg-[#34D399]/20 rounded-full relative cursor-pointer">
                            <div className="absolute right-1 top-1 w-4 h-4 bg-[#34D399] rounded-full shadow-sm" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-white/70">Weekly Reports</span>
                        <div className="w-12 h-6 bg-[#34D399]/20 rounded-full relative cursor-pointer">
                            <div className="absolute right-1 top-1 w-4 h-4 bg-[#34D399] rounded-full shadow-sm" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-3">
                        <span className="text-white/70">Dark Mode</span>
                        <span className="text-white/40 text-sm">Always On</span>
                    </div>
                </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/10">
                <h2 className="text-xl font-semibold text-white mb-4">Subscription</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white font-medium">Free Plan</p>
                        <p className="text-white/50 text-sm">Basic protection for 1 device</p>
                    </div>
                    <button className="px-4 py-2 bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/20 rounded-lg text-sm font-medium hover:bg-[#7C5CFF]/20 transition-colors">
                        Upgrade to Premium
                    </button>
                </div>
            </div>
        </div>
    );
}
