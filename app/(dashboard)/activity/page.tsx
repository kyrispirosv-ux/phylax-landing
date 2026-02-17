'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { AlertTriangle, Clock, Filter, Search } from 'lucide-react';

export default function ActivityPage() {
    const { alerts, fetchAlerts } = useStore();

    useEffect(() => {
        fetchAlerts();
    }, [fetchAlerts]);

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Activity Log</h1>
                <div className="flex gap-2">
                    <button className="bg-white/5 hover:bg-white/10 text-white p-2 rounded-lg border border-white/10">
                        <Search className="w-5 h-5" />
                    </button>
                    <button className="bg-white/5 hover:bg-white/10 text-white p-2 rounded-lg border border-white/10">
                        <Filter className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex items-center gap-4 text-sm font-medium text-white/50">
                    <div className="flex-1">Event</div>
                    <div className="w-32 hidden md:block">Category</div>
                    <div className="w-32 hidden md:block">Action</div>
                    <div className="w-32 text-right">Time</div>
                </div>

                <div>
                    {alerts.map((alert) => (
                        <div key={alert.id} className="group px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    {alert.severity === 'high' && <AlertTriangle className="w-4 h-4 text-[#FB7185]" />}
                                    <span className="text-white font-medium">{alert.title}</span>
                                </div>
                                <p className="text-sm text-white/60">{alert.description}</p>

                                {/* Expanded actions (visible on hover) */}
                                <div className="h-0 group-hover:h-8 overflow-hidden transition-all duration-300 opacity-0 group-hover:opacity-100 flex items-center gap-3 mt-2">
                                    <button className="text-xs font-semibold text-[#7C5CFF] hover:underline">Always allow similar</button>
                                    <button className="text-xs font-semibold text-[#FB7185] hover:underline">Block this source</button>
                                </div>
                            </div>

                            <div className="w-32 hidden md:block text-sm text-white/70 bg-white/5 px-2 py-1 rounded w-fit h-fit">
                                {alert.category}
                            </div>

                            <div className={`w-32 hidden md:block text-sm font-bold uppercase tracking-wider ${alert.actionTaken === 'blocked' ? 'text-[#FB7185]' : 'text-[#FBBF24]'
                                }`}>
                                {alert.actionTaken}
                            </div>

                            <div className="w-32 text-right text-sm text-white/40 flex items-center justify-end gap-1">
                                <Clock className="w-3 h-3" /> {alert.timestamp}
                            </div>
                        </div>
                    ))}
                    {alerts.length === 0 && (
                        <div className="p-12 text-center text-white/30">No activity recorded yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
