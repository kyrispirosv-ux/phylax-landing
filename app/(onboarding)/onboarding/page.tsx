'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { Check, Copy, Laptop, Chrome, ChevronRight, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OnboardingWizard() {
    const router = useRouter();
    const { pairingCode, generatePairingCode, checkPairingStatus, pairingStatus, devices } = useStore();
    const [step, setStep] = useState(1);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!pairingCode) generatePairingCode();
    }, [pairingCode, generatePairingCode]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 2 && pairingCode) {
            interval = setInterval(async () => {
                const isPaired = await checkPairingStatus(pairingCode);
                if (isPaired) {
                    setStep(3);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [step, pairingCode, checkPairingStatus]);

    const copyCode = () => {
        if (pairingCode) {
            navigator.clipboard.writeText(pairingCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-2xl mx-auto">
            {/* Steps Indicator */}
            <div className="flex items-center gap-4 mb-12 w-full max-w-sm">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex-1 flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border transition-colors ${step >= s ? 'bg-[#7C5CFF] border-[#7C5CFF] text-white' : 'bg-transparent border-white/20 text-white/40'}`}>
                            {step > s ? <Check className="w-4 h-4" /> : s}
                        </div>
                        <div className={`h-1 w-full rounded-full ${step >= s ? 'bg-[#7C5CFF]' : 'bg-white/10'}`} />
                    </div>
                ))}
            </div>

            <div className="w-full glass-card border border-white/10 rounded-2xl p-8 md:p-12 text-center">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex flex-col items-center"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-[#7C5CFF]/10 flex items-center justify-center mb-6">
                                <Laptop className="w-8 h-8 text-[#7C5CFF]" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Install Phylax Extension</h2>
                            <p className="text-white/60 mb-8 max-w-md">
                                Phylax runs directly in the browser to protect your child in real-time. Install it on their device to continue.
                            </p>

                            <button
                                onClick={() => setStep(2)}
                                className="px-8 py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-colors flex items-center gap-2 mb-4"
                            >
                                <Chrome className="w-5 h-5" /> Add to Chrome
                            </button>
                            <p className="text-xs text-white/30">Also works on Edge, Brave, and Arc</p>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex flex-col items-center"
                        >
                            <h2 className="text-2xl font-bold text-white mb-3">Link this Device</h2>
                            <p className="text-white/60 mb-8 max-w-md">
                                Open the Phylax extension on your child's browser and enter this code to connect it to your dashboard.
                            </p>

                            <div className="bg-black/40 border border-white/10 rounded-2xl p-6 mb-8 w-full max-w-xs relative group">
                                <div className="text-5xl font-mono font-bold text-white tracking-wider flex justify-center">
                                    {pairingCode}
                                </div>
                                <button
                                    onClick={copyCode}
                                    className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <div className="text-center mt-4 text-xs text-white/30 flex items-center justify-center gap-2">
                                    Expires in 10:00 <button onClick={generatePairingCode}><RefreshCw className="w-3 h-3 hover:text-white" /></button>
                                </div>
                            </div>

                            <div className="flex flex-col items-center animate-pulse">
                                <p className="text-white/40 text-sm mb-2">Waiting for connection...</p>
                                <div className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                            </div>


                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center"
                        >
                            <div className="w-20 h-20 rounded-full bg-[#34D399]/10 border border-[#34D399]/20 flex items-center justify-center mb-6">
                                <Check className="w-10 h-10 text-[#34D399]" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Device Connected!</h2>
                            <p className="text-white/60 mb-8">
                                <span className="text-white font-medium">Chrome on Mac</span> has been successfully linked to your account.
                            </p>

                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-8 py-3 rounded-xl bg-[#7C5CFF] text-white font-bold hover:bg-[#7C5CFF]/90 transition-all shadow-lg shadow-[#7C5CFF]/25 flex items-center gap-2"
                            >
                                Go to Dashboard <ChevronRight className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
