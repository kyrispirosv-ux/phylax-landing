'use client';

import { useStore } from '@/store/useStore';
import { Activity, Shield, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardOverview() {
    const { devices, alerts } = useStore();
    const activeDeviceCount = devices.length;

    // Mock recent alerts
    const recentAlerts = alerts.slice(0, 3);

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Overview</h1>
                <div className="text-sm text-white/40">Last updated: Just now</div>
            </div>

            {/* Status Cards */}
            <div className="grid md:grid-cols-3 gap-6">
                <div className="glass-card p-6 rounded-2xl flex items-center gap-4 relative overflow-hidden group">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeDeviceCount > 0 ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-red-500/10 text-red-500'}`}>
                        {activeDeviceCount > 0 ? <CheckCircle2 className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
                    </div>
                    <div>
                        <div className="text-sm text-white/50 mb-1">Protection Status</div>
                        <div className="text-xl font-bold text-white">
                            {activeDeviceCount > 0 ? 'Active on 1 device' : 'Protection Inactive'}
                        </div>
                    </div>
                    {activeDeviceCount === 0 && (
                        <Link href="/onboarding" className="absolute inset-0 z-10" />
                    )}
                </div>

                <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#FBBF24]/10 text-[#FBBF24] flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-sm text-white/50 mb-1">Today's Alerts</div>
                        <div className="text-xl font-bold text-white">2 Detected</div>
                    </div>
                </div>

                <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#7C5CFF]/10 text-[#7C5CFF] flex items-center justify-center">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-sm text-white/50 mb-1">Scanning</div>
                        <div className="text-xl font-bold text-white">Real-time Analysis</div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card rounded-2xl border border-white/10 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                    <Link href="/activity" className="text-sm text-[#7C5CFF] hover:text-[#7C5CFF]/80 flex items-center gap-1">
                        View All <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="space-y-4">
                    {recentAlerts.map((alert) => (
                        <div key={alert.id} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5">
                            <div className={`mt-1 min-w-[32px] w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${alert.severity === 'high' ? 'bg-[#FB7185]/20 text-[#FB7185]' : 'bg-[#FBBF24]/20 text-[#FBBF24]'
                                }`}>
                                !
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-medium text-white text-sm">{alert.title}</h3>
                                    <span className="text-xs text-white/40">{alert.timestamp}</span>
                                </div>
                                <p className="text-sm text-white/60 mb-2">{alert.description}</p>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-white/10 text-white/50">
                                        {alert.category}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${alert.actionTaken === 'blocked' ? 'bg-[#FB7185]/10 text-[#FB7185]' : 'bg-[#FBBF24]/10 text-[#FBBF24]'
                                        }`}>
                                        {alert.actionTaken}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {recentAlerts.length === 0 && (
                        <div className="text-center py-10 text-white/30 italic">No recent activity detected.</div>
                    )}
                </div>
            </div>

            {/* Setup Guide (if incomplete) */}
            {activeDeviceCount === 0 && (
                <div className="bg-gradient-to-r from-[#7C5CFF]/20 to-[#22D3EE]/20 border border-[#7C5CFF]/30 p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-white mb-1">Complete Setup</h3>
                        <p className="text-sm text-white/70">Connect a child's device to start monitoring.</p>
                    </div>
                    <Link
                        href="/onboarding"
                        className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg text-sm hover:bg-white/90 transition-colors"
                    >
                        Finish Setup
                    </Link>
                </div>
            )}
        </div>
    );
}
