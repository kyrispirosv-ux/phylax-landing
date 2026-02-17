import Link from 'next/link';
import { GreekKeyLogo } from '@/components/GreekKeyLogo';
import { Shield, ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Phylax — Privacy Policy',
    description: "Phylax's Privacy Policy. Transparent, simple, and parent-friendly.",
};

export default function PrivacyPolicy() {
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
                            className="inline-flex items-center justify-center px-4 py-2 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Home
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-[900px] mx-auto px-6 py-20">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#34D399]/20 bg-[#34D399]/5 text-sm text-[#34D399] mb-8">
                    <Shield className="w-4 h-4" />
                    <span>Privacy First</span>
                </div>

                <h1 className="text-4xl md:text-[42px] font-bold mb-6 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                    Phylax Privacy Policy
                </h1>
                <p className="text-lg text-white/50 mb-12">
                    Effective Date: February 16, 2026
                </p>

                <div className="prose prose-invert max-w-none text-white/70 leading-relaxed space-y-12">
                    <section>
                        <p className="text-lg">
                            Phylax ("we," "our," or "us") provides a browser extension and parent dashboard designed to help families protect children from harmful online content. This Privacy Policy explains what information we collect, how we use it, and how we protect it.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
                        <p className="mb-4">Phylax collects only the data necessary to provide core child-safety functionality.</p>

                        <h3 className="text-lg font-semibold text-white mt-6 mb-2">A. Account Information (Parent Dashboard)</h3>
                        <p className="mb-4">When a parent creates an account, we collect:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Name (optional)</li>
                            <li>Email address</li>
                            <li>Encrypted password</li>
                            <li>Subscription status (if applicable)</li>
                        </ul>
                        <p>This information is used for authentication and account management only.</p>

                        <h3 className="text-lg font-semibold text-white mt-6 mb-2">B. Child Browser Activity (Processed for Safety Filtering)</h3>
                        <p className="mb-4">The Phylax browser extension may process:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Website URLs</li>
                            <li>Page titles</li>
                            <li>On-page text content</li>
                            <li>YouTube video metadata</li>
                            <li>Social media message content (for safety analysis only)</li>
                        </ul>
                        <p className="mb-4">This information is processed to:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Detect inappropriate content</li>
                            <li>Identify grooming patterns</li>
                            <li>Enforce parent-defined rules</li>
                            <li>Generate safety alerts</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-white mt-6 mb-2">C. Safety Alerts & Reports</h3>
                        <p className="mb-4">We may store:</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Flagged content summaries</li>
                            <li>Risk classification scores</li>
                            <li>Time and domain of flagged events</li>
                        </ul>
                        <p className="mt-4">We do <strong>not</strong> store full browsing histories unless required for a triggered safety event.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Information</h2>
                        <p className="mb-4">We use collected data solely to:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-6">
                            <li>Provide real-time content filtering</li>
                            <li>Detect potentially harmful interactions</li>
                            <li>Enforce parental control settings</li>
                            <li>Improve detection accuracy</li>
                            <li>Provide safety notifications to parents</li>
                        </ul>

                        <div className="p-6 rounded-xl bg-white/[0.03] border-l-4 border-[#34D399]">
                            <h3 className="text-white font-bold mb-2">We do NOT:</h3>
                            <ul className="list-disc pl-6 space-y-1 text-white/80">
                                <li>Sell user data</li>
                                <li>Use data for advertising</li>
                                <li>Build marketing profiles</li>
                                <li>Transfer data to data brokers</li>
                                <li>Use data for creditworthiness or lending purposes</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">3. Data Processing & AI Analysis</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Phylax uses AI models to analyze content for safety risks.</li>
                            <li>Content is analyzed for risk classification only.</li>
                            <li>AI processing is limited to safety detection.</li>
                            <li>Data is not used to train public AI models.</li>
                            <li>No personally identifiable data is sold or shared.</li>
                            <li>Where possible, analysis occurs in a minimized and secure format.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">4. Data Storage & Security</h2>
                        <p className="mb-4">We implement industry-standard security measures, including:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Encrypted HTTPS transmission</li>
                            <li>Encrypted database storage</li>
                            <li>Role-based access controls</li>
                            <li>Secure authentication mechanisms</li>
                        </ul>
                        <p>Access to stored safety data is restricted to the parent account holder.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">5. Data Sharing</h2>
                        <p className="mb-4">We do not sell or rent user data. We may share limited information only:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>With service providers necessary to operate Phylax (e.g., secure hosting providers)</li>
                            <li>If required by law</li>
                        </ul>
                        <p>All service providers are contractually obligated to maintain confidentiality.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">6. Children's Privacy</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Phylax is designed for parental supervision use.</li>
                            <li>We do not knowingly collect personal information directly from children for independent use.</li>
                            <li>All accounts are created and managed by parents or legal guardians.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">7. Data Retention</h2>
                        <p className="mb-4">We retain data only as long as necessary to:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Provide safety services</li>
                            <li>Maintain account functionality</li>
                            <li>Comply with legal obligations</li>
                        </ul>
                        <p>Parents may request deletion of their account and associated data at any time.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">8. User Rights & Data Deletion</h2>
                        <p className="mb-4">Parents may:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Access stored safety reports</li>
                            <li>Modify safety settings</li>
                            <li>Request permanent deletion of account data</li>
                        </ul>
                        <p>To request deletion, contact: <a href="mailto:kyrispirosv@gmail.com" className="text-[#34D399] hover:underline">kyrispirosv@gmail.com</a></p>
                        <p>All data will be permanently deleted within a reasonable timeframe.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">9. Chrome Extension Permissions</h2>
                        <p className="mb-4">Phylax requests certain browser permissions solely to provide core safety functionality, including:</p>
                        <ul className="list-disc pl-6 space-y-1 mb-4">
                            <li>Access to page content for safety analysis</li>
                            <li>Access to tabs for URL detection</li>
                            <li>Storage for parent settings</li>
                            <li>Network access for secure backend communication</li>
                        </ul>
                        <p>Permissions are used exclusively for safety enforcement and not for advertising or profiling.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">10. Changes to This Policy</h2>
                        <p>We may update this Privacy Policy periodically. Updates will be reflected with a revised effective date.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">11. Contact</h2>
                        <p className="mb-2">For questions regarding privacy or data practices:</p>
                        <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                            <p className="font-bold text-white">Phylax</p>
                            <p className="text-white/70">Email: <a href="mailto:kyrispirosv@gmail.com" className="text-[#34D399] hover:underline">kyrispirosv@gmail.com</a></p>
                            <p className="text-white/70">Website: <a href="https://phylaxsafety.com" target="_blank" rel="noopener noreferrer" className="text-[#34D399] hover:underline">https://phylaxsafety.com</a></p>
                        </div>
                    </section>
                </div>
            </main>

            <footer className="border-t border-white/10 py-10 text-center text-white/55 text-sm">
                <div className="flex flex-col items-center gap-4">
                    <p>&copy; {new Date().getFullYear()} Phylax Inc. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
