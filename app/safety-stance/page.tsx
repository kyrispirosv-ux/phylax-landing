import Link from 'next/link';
import { GreekKeyLogo } from '@/components/GreekKeyLogo';

export const metadata = {
    title: 'Phylax — Safety Stance',
    description: "Phylax's commitment to child safety and privacy. Learn how we protect your family's data.",
};

export default function SafetyStance() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#070A12] to-[#0A1022] text-white">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#070A12]/80 border-b border-white/10">
                <div className="max-w-[900px] mx-auto px-6 h-18 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <GreekKeyLogo className="w-8 h-8 group-hover:opacity-80 transition-opacity" />
                        <span className="text-base font-bold text-white">Phylax</span>
                    </Link>
                    <div>
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center px-4 py-2 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                        >
                            Back to Home
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-[900px] mx-auto px-6 py-20">
                <h1 className="text-4xl md:text-[42px] font-bold mb-6 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                    Our Safety Stance
                </h1>
                <p className="text-lg text-white/70 mb-12 max-w-2xl leading-relaxed">
                    At Phylax, we believe that protecting children online shouldn't mean sacrificing their privacy.
                    We are building a safety tool, not a surveillance tool.
                </p>

                <section className="mb-16">
                    <h2 className="text-2xl md:text-[28px] font-bold text-white mb-4">Privacy by Design</h2>
                    <p className="text-lg text-white/70 leading-relaxed">
                        Traditional safety tools send every URL visited to the cloud for analysis. This creates a massive
                        database of user activity. Phylax takes a different approach. We've optimized our AI models to
                        run locally on the device (Edge AI). This means the analysis happens on your computer, and the
                        raw data stays there.
                    </p>

                    <div className="mt-10 p-8 rounded-[18px] bg-white/[0.06] border border-white/10">
                        <h3 className="text-xl font-bold text-[#22D3EE] mb-2 mt-0">The &quot;No Spy&quot; Guarantee</h3>
                        <p className="text-lg text-white/90 leading-relaxed m-0">
                            We do not log your child&#39;s browsing history to our servers. We only sync high-level risk events
                            (e.g., &quot;Blocked gambling site&quot;) to the parent dashboard so you can take action.
                        </p>
                    </div>
                </section>

                <section className="mb-16">
                    <h2 className="text-2xl md:text-[28px] font-bold text-white mb-4">Data Ownership</h2>
                    <p className="text-lg text-white/70 mb-6 leading-relaxed">
                        You own your family&#39;s data. We differ from &quot;free&quot; safety products that monetize your data by
                        selling it to advertisers or brokers. Phylax is a paid product because <strong>you are the customer,
                            not the product.</strong>
                    </p>
                    <ul className="list-disc pl-6 space-y-3 text-lg text-white/70">
                        <li>We never sell user data.</li>
                        <li>We do not use your private data to train public AI models.</li>
                        <li>You can delete your account and all associated data at any time.</li>
                    </ul>
                </section>

                <section className="mb-16">
                    <h2 className="text-2xl md:text-[28px] font-bold text-white mb-4">Transparency</h2>
                    <p className="text-lg text-white/70 leading-relaxed">
                        Trust is earned through transparency. We are committed to open-sourcing key components of our
                        analysis engine so specifically technical parents can verify our claims. We clearly document
                        what data is collected, why it is needed, and how long it is kept.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl md:text-[28px] font-bold text-white mb-4">Safety vs. Surveillance</h2>
                    <p className="text-lg text-white/70 leading-relaxed">
                        There is a fine line between keeping a child safe and invading their privacy. Surveillance erodes
                        trust. Safety builds it. Phylax is designed to intervene only when necessary, allowing children
                        the freedom to explore the internet safely while giving parents peace of mind.
                    </p>
                </section>
            </main>

            <footer className="border-t border-white/10 py-10 text-center text-white/55 text-sm">
                <p>&copy; {new Date().getFullYear()} Phylax Inc. All rights reserved.</p>
            </footer>
        </div>
    );
}
