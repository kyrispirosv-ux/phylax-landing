'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Activity, Shield, AlertTriangle, ArrowRight, CheckCircle2, Copy, RefreshCw, Check, Chrome } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardOverview() {
    const { devices, alerts, pairingCode, generatePairingCode, checkPairingStatus, addDevice } = useStore();
    const activeDeviceCount = devices.length;
    const [copied, setCopied] = useState(false);

    // Initial code generation if needed
    useEffect(() => {
        if (activeDeviceCount === 0 && !pairingCode) {
            generatePairingCode();
        }
    }, [activeDeviceCount, pairingCode, generatePairingCode]);

    // Poll for pairing status
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (activeDeviceCount === 0 && pairingCode) {
            interval = setInterval(async () => {
                await checkPairingStatus(pairingCode);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [activeDeviceCount, pairingCode, checkPairingStatus]);

    const copyCode = () => {
        if (pairingCode) {
            navigator.clipboard.writeText(pairingCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Mock recent alerts
    const recentAlerts = alerts.slice(0, 3);

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Overview</h1>
                <div className="text-sm text-white/40">Last updated: Just now</div>
            </div>

            {/* Pairing / Status Section */}
            {activeDeviceCount === 0 ? (
                <div className="glass-card border border-[#7C5CFF]/30 p-8 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE]" />

                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF] text-xs font-bold uppercase tracking-wider mb-4">
                                <Shield className="w-3 h-3" /> Setup Required
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Connect your first device</h2>
                            <p className="text-white/60 mb-6">
                                To start monitoring, install the Phylax extension on your child's browser and <strong>enter the code displayed here</strong> when prompted.
                            </p>

                            <div className="flex gap-3">
                                <a
                                    href="https://chrome.google.com/webstore"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-5 py-2.5 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-colors flex items-center gap-2 text-sm"
                                >
                                    <Chrome className="w-4 h-4" /> Install Extension
                                </a>
                                <button className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors text-sm">
                                    How it works
                                </button>
                            </div>
                        </div>

                        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 relative group">
                            <div className="text-center mb-2 text-xs text-white/40 uppercase tracking-wider font-bold">Pairing Code</div>
                            <div className="text-5xl font-mono font-bold text-white tracking-wider flex justify-center mb-4">
                                {pairingCode || '------'}
                            </div>

                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={copyCode}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs"
                                >
                                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied' : 'Copy Code'}
                                </button>
                                <button
                                    onClick={generatePairingCode}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs"
                                >
                                    <RefreshCw className="w-3 h-3" /> New Code
                                </button>
                            </div>

                            <div className="mt-8 flex items-center justify-center gap-3 text-white/50 text-sm animate-pulse bg-white/5 py-3 rounded-lg border border-white/5">
                                <div className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                                Waiting for extension to connect...
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="glass-card p-6 rounded-2xl flex items-center gap-4 relative overflow-hidden group">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#34D399]/10 text-[#34D399]">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-sm text-white/50 mb-1">Protection Status</div>
                            <div className="text-xl font-bold text-white">Active</div>
                        </div>
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
            )}

            {/* Recent Activity */}
            <div className={`glass-card rounded-2xl border border-white/10 p-6 ${activeDeviceCount === 0 ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
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
        </div>
    );
}
