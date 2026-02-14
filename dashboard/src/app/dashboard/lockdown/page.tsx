export default function LockdownPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Lock It Down</h1>
      <p className="text-white/40 text-sm mb-8">
        Prevent your child from disabling or removing the Phylax extension.
      </p>

      {/* Mode 1 */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400 text-sm">1</span>
          </div>
          <h2 className="text-lg font-semibold">Mode 1: Consumer Install (Default)</h2>
        </div>
        <p className="text-white/50 text-sm mb-3">
          Standard Chrome Web Store install. Your child can technically remove the extension from chrome://extensions.
          Phylax will detect removal and alert you immediately.
        </p>
        <ul className="text-white/40 text-sm space-y-1 list-disc list-inside">
          <li>Works on any Chrome browser</li>
          <li>Easy setup with pairing code</li>
          <li>Child can disable (but you get an alert)</li>
          <li>Good for trust-based families</li>
        </ul>
      </div>

      {/* Mode 2 */}
      <div className="bg-white/[0.03] border border-[#7C5CFF]/20 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#7C5CFF]/20 flex items-center justify-center">
            <span className="text-[#7C5CFF] text-sm">2</span>
          </div>
          <h2 className="text-lg font-semibold">Mode 2: Managed Install (Recommended)</h2>
        </div>
        <p className="text-white/50 text-sm mb-4">
          Force-install the extension via Chrome management so it cannot be removed.
          This requires a Chromebook with Family Link, or Google Workspace admin access.
        </p>

        {/* Chromebook / Family Link */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 mb-4">
          <h3 className="text-white/80 text-sm font-medium mb-2">Option A: Chromebook with Family Link</h3>
          <ol className="text-white/40 text-sm space-y-1.5 list-decimal list-inside">
            <li>Open Family Link on your phone or families.google.com</li>
            <li>Select your child&apos;s account</li>
            <li>Go to Controls &gt; Content Restrictions &gt; Chrome</li>
            <li>Under &quot;Apps &amp; extensions&quot;, add the Phylax extension ID</li>
            <li>Set to &quot;Force install&quot; so it cannot be removed</li>
            <li>The extension will auto-install on your child&apos;s Chromebook</li>
          </ol>
        </div>

        {/* Google Workspace */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 mb-4">
          <h3 className="text-white/80 text-sm font-medium mb-2">Option B: Google Workspace Admin</h3>
          <ol className="text-white/40 text-sm space-y-1.5 list-decimal list-inside">
            <li>Open admin.google.com</li>
            <li>Navigate to Devices &gt; Chrome &gt; Apps &amp; extensions</li>
            <li>Click the + icon and add Phylax by extension ID</li>
            <li>Set installation policy to &quot;Force install&quot;</li>
            <li>Apply to the OU containing your child&apos;s account</li>
          </ol>
        </div>

        {/* Extension ID */}
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-white/40 text-xs font-medium mb-1">Phylax Extension ID</p>
          <p className="text-white/70 text-sm font-mono">
            Will be available after Chrome Web Store publication
          </p>
        </div>
      </div>

      {/* Tamper detection */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-3">Tamper Detection</h2>
        <p className="text-white/50 text-sm mb-3">
          Regardless of install mode, Phylax includes built-in tamper detection:
        </p>
        <ul className="text-white/40 text-sm space-y-1.5 list-disc list-inside">
          <li>Heartbeat monitoring: dashboard alerts if extension stops checking in</li>
          <li>Extension removal detection via missed heartbeats</li>
          <li>Critical alert sent to parent if device goes offline</li>
        </ul>
      </div>
    </div>
  );
}
