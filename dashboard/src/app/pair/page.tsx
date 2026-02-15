"use client";

import { useEffect, useState } from "react";

/**
 * /pair — Public install link landing page.
 * Token is in the URL fragment: /pair#token=xxx&secret=yyy
 * This page instructs the user to install the extension, then the extension
 * reads the token from this page and auto-pairs.
 */
export default function PairPage() {
  const [tokenId, setTokenId] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    setTokenId(params.get("token") || "");
    setSecret(params.get("secret") || "");
  }, []);

  return (
    <div className="min-h-screen bg-[#070A12] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
            </svg>
          </div>
          <span className="text-white font-bold text-xl">Phylax</span>
        </div>

        <h1 className="text-2xl font-bold mb-2">Set Up Protection</h1>
        <p className="text-white/50 text-sm mb-8">
          Your parent has invited you to connect this device to Phylax SafeGuard.
        </p>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#7C5CFF] flex items-center justify-center text-xs font-bold">1</div>
            <h2 className="font-semibold">Install the Phylax Extension</h2>
          </div>
          <p className="text-white/40 text-sm mb-3">Click below to install from the Chrome Web Store.</p>
          <a
            href="https://chromewebstore.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-5 py-2.5 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl hover:bg-[#7C5CFF]/90 transition"
          >
            Install Phylax Extension
          </a>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#7C5CFF]/50 flex items-center justify-center text-xs font-bold">2</div>
            <h2 className="font-semibold">Automatic Pairing</h2>
          </div>
          <p className="text-white/40 text-sm">
            After installing, the extension will automatically detect this page and pair your device.
          </p>
          {tokenId && (
            <p className="text-green-400/70 text-xs mt-2">Pairing token detected — the extension will auto-pair when installed.</p>
          )}
        </div>

        <button
          onClick={() => setShowManual(!showManual)}
          className="text-white/30 text-xs hover:text-white/50 transition mb-4"
        >
          {showManual ? "Hide manual pairing" : "Having trouble? Try manual pairing"}
        </button>

        {showManual && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-white/40 text-sm">
              If automatic pairing doesn&apos;t work, open the Phylax extension and enter the
              6-character code your parent gave you.
            </p>
          </div>
        )}

        {/* Hidden data for extension to read */}
        <div id="phylax-pairing-data" data-token-id={tokenId} data-secret={secret} style={{ display: "none" }} />
      </div>
    </div>
  );
}
