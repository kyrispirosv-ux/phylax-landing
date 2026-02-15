'use client';

import { useState } from 'react';
import { Shield, Save, AlertCircle, Check, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';

export default function RulesPage() {
    const [platform, setPlatform] = useState('any');
    const [category, setCategory] = useState('gambling');
    const [action, setAction] = useState('block');
    const [threshold, setThreshold] = useState(50);
    const [intent, setIntent] = useState('');
    const [showPreview, setShowPreview] = useState(false);

    // Mock translation logic
    const translatedPolicy = intent
        ? `Phylax will monitor ${platform === 'any' ? 'all sites' : platform} for content related to "${category}". If identified with confidence > ${threshold}%, it will be ${action === 'block' ? 'blocked immediately' : action === 'warn' ? 'flagged with a warning' : 'logged silently'}. Exception: "${intent}"`
        : `Phylax will monitor ${platform === 'any' ? 'all sites' : platform} for content related to "${category}". If identified with confidence > ${threshold}%, it will be ${action === 'block' ? 'blocked immediately' : action === 'warn' ? 'flagged with a warning' : 'logged silently'}.`;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Protection Rules</h1>
                    <p className="text-white/60 text-sm">Configure how Phylax protects your child.</p>
                </div>
                <button className="bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-[#7C5CFF]/20 transition-all">
                    <Save className="w-4 h-4" /> Save Changes
                </button>
            </div>

            <div className="glass-card p-8 rounded-2xl border border-white/10">
                <div className="grid md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Platform</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['any', 'youtube', 'instagram', 'reddit'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPlatform(p)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium border capitalize transition-all ${platform === p
                                                ? 'bg-[#7C5CFF]/20 border-[#7C5CFF] text-[#7C5CFF]'
                                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                    >
                                        {p === 'any' ? 'Any Site' : p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Content Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#7C5CFF]"
                            >
                                <option value="gambling">Gambling</option>
                                <option value="self-harm">Self-Harm / Suicide</option>
                                <option value="sexual">Sexual Content</option>
                                <option value="bullying">Bullying & Harassment</option>
                                <option value="drugs">Drugs & Vaping</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Action</label>
                            <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
                                {['block', 'warn', 'allow'].map((a) => (
                                    <button
                                        key={a}
                                        onClick={() => setAction(a)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${action === a
                                                ? 'bg-[#7C5CFF] text-white shadow-md'
                                                : 'text-white/60 hover:text-white'
                                            }`}
                                    >
                                        {a === 'allow' ? 'Notify Only' : a}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-white/70">Severity Threshold</label>
                                <span className="text-sm text-[#7C5CFF] font-bold">{threshold}%</span>
                            </div>
                            <input
                                type="range"
                                min="10" max="90"
                                value={threshold}
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#7C5CFF]"
                            />
                            <div className="flex justify-between text-xs text-white/30 mt-1">
                                <span>Strict (Low Confidence)</span>
                                <span>Lenient (High Confidence)</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                                Parent Intention <Sparkles className="w-3 h-3 text-[#22D3EE]" />
                            </label>
                            <textarea
                                rows={4}
                                value={intent}
                                onChange={(e) => setIntent(e.target.value)}
                                placeholder='e.g., "Block gambling videos on YouTube but don&apos;t block YouTube itself."'
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#22D3EE] transition-colors resize-none text-sm"
                            />
                            <p className="text-xs text-white/30 mt-2">Phylax AI uses this to understand nuances in your rules.</p>
                        </div>
                    </div>
                </div>

                {/* Policy Preview */}
                <div className="bg-gradient-to-r from-[#7C5CFF]/10 to-[#22D3EE]/10 border border-[#7C5CFF]/20 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-[#7C5CFF] mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Policy Preview
                    </h3>
                    <p className="text-white/80 text-sm leading-relaxed">
                        {translatedPolicy}
                    </p>
                </div>
            </div>

            {/* Existing Rules List (Mock) */}
            <h2 className="text-xl font-bold text-white mt-12 mb-4">Active Rules</h2>
            <div className="space-y-4">
                {[
                    { type: 'Blocking', desc: 'Block all Gambling content on Any Site (High Strictness)' },
                    { type: 'Warning', desc: 'Warn on Bullying content on Instagram (Medium Strictness)' }
                ].map((rule, i) => (
                    <div key={i} className="glass-card p-4 rounded-xl flex items-center justify-between group hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${rule.type === 'Blocking' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                            <div>
                                <div className="font-medium text-white">{rule.type} Rule</div>
                                <div className="text-sm text-white/50">{rule.desc}</div>
                            </div>
                        </div>
                        <button className="text-white/30 hover:text-white text-sm">Edit</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
