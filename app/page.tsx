import Link from "next/link";
import { Shield, Lock, Check, ArrowRight, PlayCircle, Smartphone, Download, Globe, Monitor, Bell, Settings, Puzzle, KeyRound, ShieldCheck } from "lucide-react";
import { GreekKeyLogo } from "@/components/GreekKeyLogo";

const DASHBOARD_URL = "https://phylax-app.vercel.app";
const SIGNUP_URL = `${DASHBOARD_URL}/auth/signup`;
const LOGIN_URL = `${DASHBOARD_URL}/auth/login`;

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#0F172A]/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GreekKeyLogo className="w-16 h-16" />
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <Link href="#how-it-works" className="hover:text-white transition-colors">How it Works</Link>
            <Link href="#download" className="hover:text-white transition-colors">Download</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="#faq" className="hover:text-white transition-colors">FAQ</Link>
          </div>

          <div className="flex items-center gap-4">
            <a href={LOGIN_URL} className="hidden md:block text-sm font-medium text-white/70 hover:text-white">Log In</a>
            <a
              href={SIGNUP_URL}
              className="bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl px-5 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 shadow-lg shadow-black/20"
            >
              Get Started
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 px-6 text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-white/70 mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-[#22D3EE] animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            <span>Phylax v1.0 is now available</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent pb-2">
            Protect your child online without blocking the web.
          </h1>

          <p className="text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            Advanced AI that detects grooming, bullying, and harmful content in real-time.
            Parents stay in control with a simple, privacy-focused dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={SIGNUP_URL}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#7C5CFF]/80 text-white font-semibold shadow-lg shadow-[#7C5CFF]/30 hover:shadow-[#7C5CFF]/50 border border-white/20 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              href="https://www.youtube.com/watch?v=gf_uJ2VlB-w"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-5 h-5" /> Watch Demo
            </Link>
          </div>

          <p className="mt-8 text-white/40 text-sm">Works on Chrome, Edge, and Brave. No credit card required.</p>
        </section>

        {/* Feature Grid */}
        <section className="max-w-7xl mx-auto px-6 mb-32">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "YouTube Protection",
                desc: "Blocks specific harmful videos (gambling, violence) while keeping the site open.",
                icon: <PlayCircle className="w-6 h-6 text-[#FF0000]" />
              },
              {
                title: "Instagram Safety",
                desc: "Analyzes DMs for grooming patterns and bullying behavior in real-time.",
                icon: <div className="w-6 h-6 rounded bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500" />
              },
              {
                title: "Self-Harm Detection",
                desc: "Identifies and intervenes on content promoting self-harm or suicide.",
                icon: <Shield className="w-6 h-6 text-[#34D399]" />
              }
            ].map((f, i) => (
              <div key={i} className="glass-card p-8 rounded-[24px] group">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{f.title}</h3>
                <p className="text-white/70 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it Works / Trust */}
        <section id="how-it-works" className="border-t border-white/10 py-24 bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How Phylax Works</h2>
              <p className="text-white/60">Three simple steps to peace of mind.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative">
              {/* Connecting Line (Desktop) */}
              <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent dashed-line" />

              {[
                { step: "01", title: "Create Account", text: "Sign up and get your unique pairing code." },
                { step: "02", title: "Install Extension", text: "Add Phylax to your child's browser." },
                { step: "03", title: "Enter Code", text: "Link the device and controls activate instantly." }
              ].map((s, i) => (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full bg-[#070A12] border border-white/10 flex items-center justify-center mb-6 z-10 shadow-xl shadow-black/50">
                    <span className="text-2xl font-bold bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">{s.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{s.title}</h3>
                  <p className="text-white/60 max-w-xs">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Section */}
        <section className="py-24 px-6 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#34D399]/20 bg-[#34D399]/5 text-sm text-[#34D399] mb-6">
                  <Shield className="w-4 h-4" />
                  <span>Privacy First Design</span>
                </div>
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                  Safety without surveillance.
                </h2>
                <p className="text-xl text-white/70 mb-8 leading-relaxed">
                  Most safety tools spy on your children to protect them. We don&#39;t.
                  Phylax uses Edge AI to analyze content directly on the device,
                  so personal data never leaves your home.
                </p>

                <div className="space-y-6 mb-10">
                  {[
                    { title: "Edge AI Analysis", desc: "All processing happens locally on the device." },
                    { title: "No Data Selling", desc: "You are the customer, not the product." },
                    { title: "Transparent & Open", desc: "Verify our claims with open-source components." }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#34D399]/10">
                        <Check className="h-3.5 w-3.5 text-[#34D399]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{item.title}</h3>
                        <p className="text-sm text-white/60">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  href="/safety-stance"
                  className="group inline-flex items-center gap-2 font-medium text-white transition-colors hover:text-[#34D399]"
                >
                  Read our full Safety Stance
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>

              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#34D399]/20 to-transparent blur-[100px]" />
                <div className="glass-card relative rounded-3xl border-[#34D399]/20 p-8">
                  <div className="mb-8 flex items-center gap-4 border-b border-white/10 pb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#34D399]/10">
                      <Lock className="h-6 w-6 text-[#34D399]" />
                    </div>
                    <div>
                      <div className="font-bold text-white">The &quot;No Spy&quot; Guarantee</div>
                      <div className="text-sm text-white/50">Our commitment to your family</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4">
                      <span className="text-white/80">Browser History</span>
                      <span className="rounded bg-[#34D399]/10 px-2 py-1 font-mono text-sm text-[#34D399]">NEVER LOGGED</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4">
                      <span className="text-white/80">Chat Content</span>
                      <span className="rounded bg-[#34D399]/10 px-2 py-1 font-mono text-sm text-[#34D399]">LOCAL ONLY</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4">
                      <span className="text-white/80">Personal Data</span>
                      <span className="rounded bg-[#34D399]/10 px-2 py-1 font-mono text-sm text-[#34D399]">NOT SOLD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Download / Install Section */}
        <section id="download" className="relative py-24 px-6 border-t border-white/10 overflow-hidden">
          {/* Background glows */}
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#7C5CFF]/15 to-transparent blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-bl from-[#22D3EE]/10 to-transparent blur-[120px] pointer-events-none" />

          <div className="max-w-7xl mx-auto relative z-10">
            {/* Section Header */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#7C5CFF]/20 bg-[#7C5CFF]/5 text-sm text-[#7C5CFF] mb-6">
                <Download className="w-4 h-4" />
                <span>Get Started in Minutes</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                Install Phylax on Every Device
              </h2>
              <p className="text-xl text-white/60 max-w-2xl mx-auto">
                A parent app for you. A browser extension for your kids. Setup takes less than 2 minutes.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Parent App Card */}
              <div className="glass-card rounded-3xl p-8 md:p-10 relative group border-[#7C5CFF]/20 hover:border-[#7C5CFF]/40 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#7C5CFF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="relative z-10">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C5CFF]/10 border border-[#7C5CFF]/20 text-xs font-semibold text-[#7C5CFF] uppercase tracking-wider mb-6">
                    <Smartphone className="w-3.5 h-3.5" />
                    For Parents
                  </div>

                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    Phylax Parent App
                  </h3>
                  <p className="text-white/60 mb-8 leading-relaxed">
                    Install the Phylax parent app on any device &mdash; phone, tablet, or computer. No app store needed.
                  </p>

                  {/* Browser Icons Row */}
                  <div className="flex flex-wrap items-center gap-3 mb-8">
                    {["Chrome", "Edge", "Safari", "Firefox"].map((browser) => (
                      <div
                        key={browser}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70"
                      >
                        <Globe className="w-5 h-5" />
                        <span className="hidden sm:inline">{browser}</span>
                      </div>
                    ))}
                  </div>

                  {/* Feature Highlights */}
                  <div className="space-y-4 mb-8">
                    {[
                      { icon: <Bell className="w-4 h-4 text-[#7C5CFF]" />, text: "Real-time alerts on your phone" },
                      { icon: <Settings className="w-4 h-4 text-[#7C5CFF]" />, text: "Manage rules from any device" },
                      { icon: <Download className="w-4 h-4 text-[#7C5CFF]" />, text: "No app store needed — installs from the browser" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7C5CFF]/10 border border-[#7C5CFF]/20">
                          {item.icon}
                        </div>
                        <span className="text-sm text-white/80">{item.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Dashboard Mockup */}
                  <div className="glass-card rounded-2xl p-4 mb-8 border-[#7C5CFF]/10">
                    <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                      <span className="text-xs text-white/30 ml-2 font-mono">app.phylax.ai/dashboard</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#34D399]/10 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-[#34D399]" />
                          </div>
                          <div>
                            <div className="text-sm text-white/90 font-medium">All devices safe</div>
                            <div className="text-xs text-white/40">3 active devices</div>
                          </div>
                        </div>
                        <span className="text-xs bg-[#34D399]/10 text-[#34D399] px-2 py-1 rounded font-mono">ONLINE</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#7C5CFF]/10 flex items-center justify-center">
                            <Bell className="w-4 h-4 text-[#7C5CFF]" />
                          </div>
                          <div>
                            <div className="text-sm text-white/90 font-medium">2 alerts today</div>
                            <div className="text-xs text-white/40">Tap to review</div>
                          </div>
                        </div>
                        <span className="text-xs bg-[#7C5CFF]/10 text-[#7C5CFF] px-2 py-1 rounded font-mono">NEW</span>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <a
                    href={DASHBOARD_URL}
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#7C5CFF]/80 text-white font-semibold shadow-lg shadow-[#7C5CFF]/30 hover:shadow-[#7C5CFF]/50 border border-white/20 transition-all hover:-translate-y-1"
                  >
                    <Monitor className="w-5 h-5" />
                    Install Parent App
                  </a>
                </div>
              </div>

              {/* Chrome Extension Card */}
              <div className="glass-card rounded-3xl p-8 md:p-10 relative group border-[#22D3EE]/20 hover:border-[#22D3EE]/40 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#22D3EE]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="relative z-10">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-xs font-semibold text-[#22D3EE] uppercase tracking-wider mb-6">
                    <Puzzle className="w-3.5 h-3.5" />
                    For Kids&apos; Devices
                  </div>

                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                    Phylax Browser Extension
                  </h3>
                  <p className="text-white/60 mb-8 leading-relaxed">
                    Add Phylax to your child&apos;s browser for real-time protection powered by edge AI.
                  </p>

                  {/* Compatible Browsers */}
                  <div className="flex items-center gap-2 mb-8 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                    <Globe className="w-5 h-5 text-[#22D3EE]" />
                    <span className="text-sm text-white/70">Works on <span className="text-white font-medium">Chrome</span>, <span className="text-white font-medium">Edge</span>, and <span className="text-white font-medium">Brave</span></span>
                  </div>

                  {/* 3-Step Setup */}
                  <div className="space-y-4 mb-8">
                    {[
                      {
                        step: "1",
                        title: "Install",
                        desc: "Add the extension from the Chrome Web Store",
                        icon: <Download className="w-4 h-4 text-[#22D3EE]" />,
                        color: "#22D3EE",
                      },
                      {
                        step: "2",
                        title: "Enter Code",
                        desc: "Type in the pairing code from your parent dashboard",
                        icon: <KeyRound className="w-4 h-4 text-[#7C5CFF]" />,
                        color: "#7C5CFF",
                      },
                      {
                        step: "3",
                        title: "Protected",
                        desc: "AI protection activates instantly \u2014 you\u2019re done",
                        icon: <ShieldCheck className="w-4 h-4 text-[#34D399]" />,
                        color: "#34D399",
                      },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                          style={{ backgroundColor: `${item.color}10`, borderColor: `${item.color}30` }}
                        >
                          {item.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/50">Step {item.step}</span>
                            <h4 className="font-semibold text-white">{item.title}</h4>
                          </div>
                          <p className="text-sm text-white/60 mt-1">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Extension Preview */}
                  <div className="glass-card rounded-2xl p-4 mb-8 border-[#22D3EE]/10">
                    <div className="flex items-center gap-3 mb-3 border-b border-white/5 pb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22D3EE]/10">
                        <Shield className="w-4 h-4 text-[#22D3EE]" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">Phylax Extension</div>
                        <div className="text-xs text-white/40">v1.0 &mdash; Active</div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <span className="text-xs text-[#34D399] font-medium">Protected</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="text-lg font-bold text-white">0</div>
                        <div className="text-xs text-white/40">Threats blocked</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="text-lg font-bold text-white">24/7</div>
                        <div className="text-xs text-white/40">Monitoring</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="text-lg font-bold text-white">3ms</div>
                        <div className="text-xs text-white/40">Response time</div>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <a
                    href="https://chrome.google.com/webstore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-br from-[#22D3EE] to-[#22D3EE]/80 text-black font-semibold shadow-lg shadow-[#22D3EE]/25 hover:shadow-[#22D3EE]/40 border border-white/20 transition-all hover:-translate-y-1"
                  >
                    <Puzzle className="w-5 h-5" />
                    Add to Chrome &mdash; It&apos;s Free
                  </a>
                </div>
              </div>
            </div>

            {/* Bottom trust note */}
            <p className="text-center text-white/40 text-sm mt-10">
              Both the parent app and extension are free to install. Premium features available with a Guardian or Family plan.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-white/60">Start protecting your family today.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-center">
            {/* Free Tier */}
            <div className="glass-card p-8 rounded-3xl h-full flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Basic</h3>
              <p className="text-white/50 text-sm mb-6">Essential protection</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-white/50">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {['1 Device', 'Basic Blocking', 'Daily Reports'].map(item => (
                  <li key={item} className="flex gap-3 text-sm text-white/70">
                    <Check className="w-5 h-5 text-[#34D399]" /> {item}
                  </li>
                ))}
              </ul>
              <a href={SIGNUP_URL} className="block w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors text-center">
                Get Started
              </a>
            </div>

            {/* Pro Tier */}
            <div className="relative glass-card p-8 rounded-3xl border-[#22D3EE]/30 bg-gradient-to-b from-[#22D3EE]/5 to-transparent transform md:scale-105 shadow-2xl shadow-[#22D3EE]/10 z-10 flex flex-col h-full">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#22D3EE] text-black text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide">
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Guardian</h3>
              <p className="text-[#22D3EE] text-sm mb-6">Complete peace of mind</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$12</span>
                <span className="text-white/50">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {['5 Devices', 'Advanced AI Analysis', 'Real-time Alerts', 'Grooming Detection', 'Priority Support'].map(item => (
                  <li key={item} className="flex gap-3 text-sm text-white/80">
                    <Check className="w-5 h-5 text-[#22D3EE]" /> {item}
                  </li>
                ))}
              </ul>
              <a href={SIGNUP_URL} className="block w-full py-3 rounded-xl bg-[#22D3EE] text-black font-bold hover:bg-[#22D3EE]/90 transition-colors shadow-lg shadow-[#22D3EE]/25 text-center">
                Start Free Trial
              </a>
            </div>

            {/* Family Tier */}
            <div className="glass-card p-8 rounded-3xl h-full flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Family</h3>
              <p className="text-white/50 text-sm mb-6">For larger households</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">$20</span>
                <span className="text-white/50">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {['Unlimited Devices', 'Everything in Guardian', 'Detailed Weekly Reports', 'Account Manager'].map(item => (
                  <li key={item} className="flex gap-3 text-sm text-white/70">
                    <Check className="w-5 h-5 text-[#34D399]" /> {item}
                  </li>
                ))}
              </ul>
              <a href={SIGNUP_URL} className="block w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors text-center">
                Contact Sales
              </a>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 px-6 border-t border-white/10">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
              <p className="text-white/60">Everything you need to know about Phylax.</p>
            </div>

            <div className="space-y-6">
              {[
                {
                  q: "Does Phylax read my child's private messages?",
                  a: "No. Phylax uses on-device AI to detect harmful patterns (like grooming language) without sending message content to any server. We never store or read chat content."
                },
                {
                  q: "Which browsers does Phylax support?",
                  a: "The child protection extension works on Chrome, Edge, and Brave. The parent dashboard is a web app that works on any browser and can be installed as an app on your phone, tablet, or computer."
                },
                {
                  q: "How is this different from other parental controls?",
                  a: "Most tools block websites or spy on everything. Phylax uses AI to detect actual threats — grooming, bullying, harmful content — while keeping the web open. We protect without surveillance."
                },
                {
                  q: "Can my child uninstall the extension?",
                  a: "The extension can be managed via Chrome's enterprise policy settings, making it difficult for children to remove. You'll also receive an alert if the extension is disabled."
                },
                {
                  q: "Is there a free plan?",
                  a: "Yes. The Basic plan is free forever and includes 1 device with essential protection. Upgrade to Guardian or Family for advanced AI analysis, real-time alerts, and more devices."
                },
                {
                  q: "Do I need to install an app from the App Store?",
                  a: "No. The Phylax parent dashboard is a Progressive Web App (PWA) — just visit the dashboard in your browser and tap 'Install' when prompted. No app store needed."
                },
              ].map((item, i) => (
                <details key={i} className="group glass-card rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer p-6 text-white font-medium hover:bg-white/[0.02] transition-colors">
                    <span className="pr-4">{item.q}</span>
                    <span className="text-white/30 group-open:rotate-45 transition-transform text-xl shrink-0">+</span>
                  </summary>
                  <div className="px-6 pb-6 text-white/60 leading-relaxed text-sm">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-12 text-center text-white/40 text-sm">
        <div className="flex flex-col items-center gap-4">
          <Link href="/privacy-policy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <p>&copy; {new Date().getFullYear()} Phylax Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
