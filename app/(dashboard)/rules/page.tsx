'use client';

import { useState, useEffect, useRef } from 'react';
import { Shield, Save, AlertCircle, Check, Sparkles, User, Info, Lock, Send, Bot, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { AGE_POLICIES, getPolicyForAge, AgeGroup } from '@/lib/policyEngine';

export default function RulesPage() {
    const { ageGroup, setAgeGroup } = useStore();
    const [policy, setPolicy] = useState(getPolicyForAge(ageGroup));
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai', text: string }>>([
        { role: 'ai', text: "Hi, I'm Phylax. I manage your family's safety policy. Determine a new rule in plain English, and I will translate it into enforcement logic." }
    ]);
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Mock category toggles state
    const [categories, setCategories] = useState({
        adult: true,
        gambling: true,
        weapons: false,
        social: false,
        streaming: false
    });

    useEffect(() => {
        const newPolicy = getPolicyForAge(ageGroup);
        setPolicy(newPolicy);

        // Auto-update categories based on age policy
        // This simulates the policy engine controlling the presets
        if (newPolicy.id === 0) { // Under 5
            setCategories({ adult: true, gambling: true, weapons: true, social: true, streaming: true });
        } else if (newPolicy.id === 4) { // 14+
            setCategories({ adult: true, gambling: true, weapons: false, social: false, streaming: false });
        }
        // ... other mapping logic would go here
    }, [ageGroup]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim()) return;

        // Add user message
        const userMsg = inputValue;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInputValue('');

        // Simulate AI processing
        setTimeout(() => {
            setMessages(prev => [...prev, {
                role: 'ai',
                text: `I've processed that rule: "${userMsg}". I've updated the local vector store. The policy is now active.`
            }]);
        }, 1000);
    };

    const handleAgeSelect = (id: AgeGroup) => {
        setAgeGroup(id);
        const name = AGE_POLICIES[id].name;
        setMessages(prev => [...prev, { role: 'ai', text: `Switched mode to ${name}. Global settings updated.` }]);
    };

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6">
            {/* LEFT COLUMN: Presets & Age Control */}
            <div className="w-full lg:w-1/3 flex flex-col gap-6">
                {/* Age Selector Card */}
                <div className="glass-card p-6 rounded-2xl border border-white/10 shrink-0">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-[#7C5CFF]" /> Age Profile
                    </h2>
                    <div className="space-y-2">
                        {Object.values(AGE_POLICIES).map((p) => {
                            const isActive = ageGroup === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => handleAgeSelect(p.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all border ${isActive
                                            ? 'bg-[#7C5CFF]/20 border-[#7C5CFF] text-white'
                                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-sm">{p.name}</span>
                                        <span className="text-xs font-mono opacity-70 bg-black/20 px-1.5 py-0.5 rounded">{p.range}</span>
                                    </div>
                                    <div className="text-xs opacity-60 line-clamp-1">{p.mode}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Categories Presets */}
                <div className="glass-card p-6 rounded-2xl border border-white/10 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-white">Content Categories</h2>
                        <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/50">Standard Mode</span>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-white text-sm">Adult & Pornography</div>
                                <div className="text-xs text-white/50">Explicit vision & text detection</div>
                            </div>
                            <button
                                onClick={() => setCategories(p => ({ ...p, adult: !p.adult }))}
                                className={`w-12 h-6 rounded-full relative transition-colors ${categories.adult ? 'bg-[#22D3EE]' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${categories.adult ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-white text-sm">Gambling / High Risk</div>
                                <div className="text-xs text-white/50">Poker, betting, crypto scams</div>
                            </div>
                            <button
                                onClick={() => setCategories(p => ({ ...p, gambling: !p.gambling }))}
                                className={`w-12 h-6 rounded-full relative transition-colors ${categories.gambling ? 'bg-[#22D3EE]' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${categories.gambling ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-white text-sm">Weapons / Violence</div>
                                <div className="text-xs text-white/50">Graphic imagery & shopping</div>
                            </div>
                            <button
                                onClick={() => setCategories(p => ({ ...p, weapons: !p.weapons }))}
                                className={`w-12 h-6 rounded-full relative transition-colors ${categories.weapons ? 'bg-[#22D3EE]' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${categories.weapons ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="pt-4 border-t border-white/5 opacity-50">
                            <div className="text-xs font-bold text-white/40 mb-3 uppercase">Age Restricted ({policy.range})</div>
                            {policy.blockedCategories.slice(0, 3).map((cat, i) => (
                                <div key={i} className="flex items-center justify-between mb-3 last:mb-0">
                                    <span className="text-sm text-white/60">{cat}</span>
                                    <Lock className="w-3 h-3 text-red-400" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: AI Chat */}
            <div className="w-full lg:w-2/3 h-full flex flex-col">
                <div className="glass-card flex-1 flex flex-col rounded-2xl border border-white/10 overflow-hidden relative">
                    {/* Header */}
                    <div className="p-4 border-b border-white/10 bg-[#0A1022]/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <div className="font-bold text-white text-sm leading-none mb-1">Phylax AI Agent</div>
                                <div className="text-xs text-[#34D399] flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" /> Online
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black/20">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-[#7C5CFF] text-white rounded-br-none'
                                        : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-none'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-white/10 bg-[#0A1022]/80 backdrop-blur-sm">

                        {/* Active Rules Mini-view */}
                        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            <div className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
                                restrict gaming sites on school nights
                                <X className="w-3 h-3 hover:text-white cursor-pointer" />
                            </div>
                            <div className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
                                Block content that promotes self-harm
                                <X className="w-3 h-3 hover:text-white cursor-pointer" />
                            </div>
                        </div>

                        <form onSubmit={handleSendMessage} className="relative">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type a rule..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#7C5CFF] transition-all"
                            />
                            <button
                                type="submit"
                                disabled={!inputValue.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[#7C5CFF] text-white disabled:opacity-50 disabled:bg-transparent disabled:text-white/20 hover:bg-[#7C5CFF]/90 transition-all"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
