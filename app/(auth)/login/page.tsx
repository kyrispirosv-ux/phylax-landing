'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { Shield, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { GreekKeyLogo } from '@/components/GreekKeyLogo';

export default function LoginPage() {
    const router = useRouter();
    const login = useStore((state) => state.login);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API call
        setTimeout(() => {
            login('Parent User', 'parent@example.com');
            router.push('/dashboard');
        }, 1500);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 rounded-xl overflow-hidden mx-auto mb-6 shadow-lg shadow-[#7C5CFF]/30">
                        <GreekKeyLogo className="w-full h-full" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
                    <p className="text-white/50">Login to manage your family's protection.</p>
                </div>

                <div className="glass-card p-8 rounded-2xl">
                    <form onSubmit={handleLogin} className="space-y-6">
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
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Log In <ArrowRight className="w-5 h-5" /></>}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/10 text-center">
                        <p className="text-sm text-white/50">
                            Don't have an account? <Link href="/signup" className="text-white hover:underline">Sign up</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
