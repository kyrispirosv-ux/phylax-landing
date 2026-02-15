import Link from 'next/link';
import { GreekKeyLogo } from '@/components/GreekKeyLogo';
import { Shield, Lock, Eye, Server, Database, Key } from 'lucide-react';

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
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#34D399]/20 bg-[#34D399]/5 text-sm text-[#34D399] mb-8">
                    <Shield className="w-4 h-4" />
                    <span>Privacy First Architecture</span>
                </div>

                <h1 className="text-4xl md:text-[42px] font-bold mb-6 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                    Our Uncompromising Stance on Safety & Privacy
                </h1>
                <p className="text-lg text-white/70 mb-16 max-w-2xl leading-relaxed">
                    At Phylax, we reject the false dichotomy between child safety and digital privacy.
                    We believe you can—and must—have both. We are building a safety tool, not a surveillance tool.
                </p>

                {/* Core Principles Grid */}
                <div className="grid md:grid-cols-2 gap-6 mb-20">
                    {[
                        {
                            icon: <Server className="w-6 h-6 text-[#22D3EE]" />,
                            title: "Edge AI Processing",
                            desc: "Analysis happens on your device, not our servers."
                        },
                        {
                            icon: <Database className="w-6 h-6 text-[#34D399]" />,
                            title: "Zero Data Sales",
                            desc: "We never sell, trade, or share your family's data."
                        },
                        {
                            icon: <Key className="w-6 h-6 text-[#F472B6]" />,
                            title: "Parent-Owned Keys",
                            desc: "Only you can decrypt sensitive alert details."
                        },
                        {
                            icon: <Eye className="w-6 h-6 text-[#A78BFA]" />,
                            title: "Transparent Logic",
                            desc: "Open-source analysis rules for verification."
                        }
                    ].map((item, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                            <div className="mb-4 p-3 bg-white/5 rounded-xl w-fit">{item.icon}</div>
                            <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-white/60 text-sm">{item.desc}</p>
                        </div>
                    ))}
                </div>

                <section className="mb-20">
                    <h2 className="text-2xl md:text-[32px] font-bold text-white mb-6">Technical Architecture: How Edge AI Works</h2>
                    <div className="prose prose-invert max-w-none text-lg text-white/70 leading-relaxed space-y-6">
                        <p>
                            Traditional safety tools work by routing all your child&#39;s internet traffic through a VPN or proxy server
                            where it is analyzed in the cloud. This means every website visited, every search term, and every image
                            viewed is sent to a third-party server.
                        </p>
                        <p>
                            <strong>Phylax takes a radically different approach.</strong> We have optimized powerful AI models to run
                            efficiently directly on your child&#39;s computer (Edge AI).
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-4 text-white/80">
                            <li><strong>Local Analysis:</strong> The AI scans text and images within the browser on the local machine.</li>
                            <li><strong>No URL Uploads:</strong> Browsing history is not continuously uploaded to our cloud.</li>
                            <li><strong>Privacy Preserving:</strong> Raw data stays on the device. Only high-confidence risk alerts (e.g., &quot;Bullying Detected&quot;) are encrypted and synced to your dashboard.</li>
                        </ul>
                    </div>
                </section>

                <section className="mb-20">
                    <h2 className="text-2xl md:text-[32px] font-bold text-white mb-6">Data Retention & Security</h2>
                    <div className="prose prose-invert max-w-none text-lg text-white/70 leading-relaxed space-y-6">
                        <p>
                            We practice data minimization. We only collect what is strictly necessary to provide the service.
                        </p>

                        <div className="mt-8 grid gap-4">
                            <div className="p-6 rounded-xl bg-white/[0.03] border-l-4 border-[#22D3EE]">
                                <h3 className="text-white font-bold mb-2">Alert Data</h3>
                                <p className="text-sm">
                                    When a safety rule is triggered (e.g. violent content), a snippet of the context is encrypted using
                                    AES-256 encryption. This data is retained for 30 days to allow for parental review and is then
                                    automatically permanently deleted.
                                </p>
                            </div>
                            <div className="p-6 rounded-xl bg-white/[0.03] border-l-4 border-[#34D399]">
                                <h3 className="text-white font-bold mb-2">Usage Statistics</h3>
                                <p className="text-sm">
                                    We collect aggregate, anonymous telemetry (e.g. &quot;10,000 threats blocked today&quot;) to improve our AI models.
                                    This data cannot be traced back to an individual user or family.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-20">
                    <h2 className="text-2xl md:text-[32px] font-bold text-white mb-6">Our Business Model</h2>
                    <p className="text-lg text-white/70 mb-6 leading-relaxed">
                        The most common question we get is: &quot;If I&#39;m not paying with my data, how do you make money?&quot;
                    </p>
                    <p className="text-lg text-white/70 leading-relaxed mb-6">
                        The answer is simple: <strong>Phylax is a paid product.</strong>
                    </p>
                    <p className="text-lg text-white/70 leading-relaxed">
                        By charging a fair subscription fee, we align our incentives with yours. We don&#39;t need to sell your data
                        to advertisers because you are our customer, not the product. This financial independence allows us to
                        build features that prioritize your privacy over profit.
                    </p>
                </section>

                <section className="mb-12">
                    <div className="p-8 rounded-[24px] bg-gradient-to-br from-[#7C5CFF]/10 to-transparent border border-[#7C5CFF]/20">
                        <h2 className="text-2xl md:text-[32px] font-bold text-white mb-4">Safety vs. Surveillance</h2>
                        <p className="text-lg text-white/80 leading-relaxed italic">
                            &quot;There is a fine line between keeping a child safe and invading their privacy. Surveillance erodes
                            trust. Safety builds it.&quot;
                        </p>
                        <p className="text-lg text-white/70 mt-6 leading-relaxed">
                            Phylax is designed to intervene only when necessary, allowing children the freedom to explore the internet
                            safely while giving parents peace of mind that they will be alerted to genuine dangers, not everyday curiosity.
                        </p>
                    </div>
                </section>
            </main>

            <footer className="border-t border-white/10 py-10 text-center text-white/55 text-sm">
                <p>&copy; {new Date().getFullYear()} Phylax Inc. All rights reserved.</p>
            </footer>
        </div>
    );
}
