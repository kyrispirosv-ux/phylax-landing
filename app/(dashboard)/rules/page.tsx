'use client';

import { useState, useEffect } from 'react';
import { Shield, Save, AlertCircle, Check, Sparkles, User, Info, Lock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { AGE_POLICIES, getPolicyForAge, AgeGroup } from '@/lib/policyEngine';

export default function RulesPage() {
    const { ageGroup, setAgeGroup } = useStore();
    const [policy, setPolicy] = useState(getPolicyForAge(ageGroup));
    const [localThreshold, setLocalThreshold] = useState(policy.blockThreshold * 100);
    const [intent, setIntent] = useState('');

    useEffect(() => {
        const newPolicy = getPolicyForAge(ageGroup);
        setPolicy(newPolicy);
        setLocalThreshold(newPolicy.blockThreshold * 100);
    }, [ageGroup]);

    const handleSave = () => {
        // In a real app, we would save overrides here
        console.log("Saving policy overrides for age group", ageGroup);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Protection Policy</h1>
                    <p className="text-white/60 text-sm">Configure safety rules based on developmental stage.</p>
                </div>
                <button
                    onClick={handleSave}
                    className="bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-[#7C5CFF]/20 transition-all"
                >
                    <Save className="w-4 h-4" /> Save Changes
                </button>
            </div>

            {/* Age Group Selector */}
            <div className="glass-card p-2 rounded-2xl border border-white/10 flex p-1.5 overflow-x-auto">
                {Object.values(AGE_POLICIES).map((p) => {
                    const isActive = ageGroup === p.id;
                    return (
                        <button
                            key={p.id}
                            onClick={() => setAgeGroup(p.id)}
                            className={`flex-1 min-w-[140px] px-4 py-4 rounded-xl transition-all relative group ${isActive
                                    ? 'bg-[#7C5CFF] text-white shadow-lg'
                                    : 'hover:bg-white/5 text-white/50 hover:text-white'
                                }`}
                        >
                            <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">{p.range}</div>
                            <div className={`font-bold text-sm ${isActive ? 'text-white' : 'text-white/80'}`}>{p.name}</div>
                            {isActive && (
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Config Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Policy Overview Card */}
                    <div className="glass-card p-8 rounded-2xl border border-white/10 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE]" />

                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF] text-xs font-bold uppercase tracking-wider mb-3">
                                    <Shield className="w-3 h-3" /> {policy.mode}
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">{policy.philosophy}</h2>
                                <p className="text-white/60 text-sm leading-relaxed max-w-xl">
                                    {policy.description}
                                </p>
                            </div>
                            <div className="hidden sm:flex flex-col items-end text-right">
                                <div className="text-xs text-white/40 uppercase font-bold tracking-wider mb-1">Risk Sensitivity</div>
                                <div className="text-2xl font-bold text-[#22D3EE]">{policy.sensitivityMultiplier}x</div>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6 pt-6 border-t border-white/10">
                            <div>
                                <div className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-[#FB7185]" /> Automatically Blocked
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {policy.blockedCategories.map((cat, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-lg bg-[#FB7185]/10 text-[#FB7185] text-xs font-medium border border-[#FB7185]/20">
                                            {cat}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-[#FBBF24]" /> Intervention Style
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-white/50 uppercase font-bold">Action</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded capitalize ${policy.intervention.style === 'block' ? 'bg-red-500/20 text-red-500' :
                                                policy.intervention.style === 'warn' ? 'bg-yellow-500/20 text-yellow-500' :
                                                    'bg-blue-500/20 text-blue-500'
                                            }`}>
                                            {policy.intervention.style}
                                        </span>
                                    </div>
                                    <div className="text-xs text-white/70 italic">
                                        "{policy.intervention.message || 'No direct message shown.'}"
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Configuration */}
                    <div className="glass-card p-8 rounded-2xl border border-white/10">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#7C5CFF]" /> AI Configuration
                        </h3>

                        <div className="space-y-8">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-sm font-medium text-white/70">Blocking Threshold</label>
                                    <span className="text-sm text-[#7C5CFF] font-bold">{localThreshold}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="10" max="90"
                                    value={localThreshold}
                                    onChange={(e) => setLocalThreshold(Number(e.target.value))}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#7C5CFF]"
                                />
                                <div className="flex justify-between text-xs text-white/30 mt-2">
                                    <span>Strict (Blocks more)</span>
                                    <span>Lenient (Blocks less)</span>
                                </div>
                                <p className="text-xs text-white/40 mt-3 bg-white/5 p-3 rounded-lg">
                                    Content with a risk score above <strong>{localThreshold / 100}</strong> will trigger the configured intervention.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                                    Parent Intention <Sparkles className="w-3 h-3 text-[#22D3EE]" />
                                </label>
                                <textarea
                                    rows={3}
                                    value={intent}
                                    onChange={(e) => setIntent(e.target.value)}
                                    placeholder='e.g., "Allow educational YouTube channels but block gaming videos on school nights."'
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#22D3EE] transition-colors resize-none text-sm"
                                />
                                <p className="text-xs text-white/30 mt-2">
                                    Phylax AI interprets this plain text to fine-tune the strictness for this age group.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar / Active Rules */}
                <div className="space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider opacity-70">Active Rules</h3>
                        <div className="space-y-3">
                            {/* Dynamically generated dummy rules based on policy */}
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex gap-3">
                                <div className={`w-1.5 rounded-full ${policy.intervention.style === 'block' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                <div>
                                    <div className="text-sm font-bold text-white mb-0.5">
                                        {policy.intervention.style === 'block' ? 'Block' : 'Filter'} High Risk
                                    </div>
                                    <div className="text-xs text-white/50">
                                        Score &gt; {policy.blockThreshold} on {policy.blockedCategories[0]}
                                    </div>
                                </div>
                            </div>

                            {policy.blockedCategories.slice(1, 4).map((cat, i) => (
                                <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 flex gap-3">
                                    <div className="w-1.5 rounded-full bg-red-500/50" />
                                    <div>
                                        <div className="text-sm font-medium text-white mb-0.5">
                                            Block {cat}
                                        </div>
                                        <div className="text-xs text-white/50">
                                            Auto-enforced by Age Policy
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full mt-4 py-2 rounded-lg border border-dashed border-white/20 text-white/40 text-xs font-medium hover:bg-white/5 hover:text-white transition-colors">
                            + Add Custom Override
                        </button>
                    </div>

                    <div className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-b from-[#7C5CFF]/10 to-transparent">
                        <User className="w-8 h-8 text-[#7C5CFF] mb-3" />
                        <h3 className="text-lg font-bold text-white mb-1">Age Profile: {policy.name}</h3>
                        <p className="text-sm text-white/60 mb-4">
                            You are currently viewing settings for the <strong>{policy.range}</strong> age group.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[#22D3EE] bg-[#22D3EE]/10 p-2 rounded-lg">
                            <Info className="w-4 h-4" />
                            <span>Changes apply to all devices linked to this profile.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
