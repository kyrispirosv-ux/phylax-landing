'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { Shield, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
    const router = useRouter();
    const login = useStore((state) => state.login);
    const [isLoading, setIsLoading] = useState(false);

    const handleSignup = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API call
        setTimeout(() => {
            login('Parent User', 'parent@example.com');
            router.push('/onboarding');
        }, 1500);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center mb-10">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] mx-auto flex items-center justify-center mb-6 shadow-lg shadow-[#7C5CFF]/30">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Create your account</h1>
                    <p className="text-white/50">Start protecting your family in minutes.</p>
                </div>

                <div className="glass-card p-8 rounded-2xl">
                    <form onSubmit={handleSignup} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Email Address</label>
                            <input
                                type="email"
                                required
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#7C5CFF] transition-colors"
                                placeholder="name@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Password</label>
                            <input
                                type="password"
                                required
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-[#7C5CFF] transition-colors"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 rounded-xl bg-[#7C5CFF] text-white font-bold hover:bg-[#7C5CFF]/90 transition-all shadow-lg shadow-[#7C5CFF]/25 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Account <ArrowRight className="w-5 h-5" /></>}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/10 text-center">
                        <p className="text-sm text-white/50">
                            Already have an account? <Link href="/login" className="text-white hover:underline">Log in</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
