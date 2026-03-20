"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "phylax-pwa-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed within the last 7 days
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION_MS) return;
      localStorage.removeItem(DISMISS_KEY);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detect if installed after prompt
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setInstalled(true);
    }

    setDeferredPrompt(null);
    setVisible(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  if (!visible || installed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[400px] z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A1628] to-[#22D3EE] flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-white mb-1">
              Install Phylax
            </h3>
            <p className="text-[13px] text-white/50 leading-relaxed">
              Get instant safety alerts and offline access. Install the app for the best experience.
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/50 hover:bg-white/[0.03] transition shrink-0 -mt-1 -mr-1"
            aria-label="Dismiss install prompt"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleInstall}
            className="flex-1 px-4 py-2.5 bg-[#7C5CFF] text-white text-sm font-semibold rounded-xl hover:bg-[#7C5CFF]/90 active:scale-[0.98] transition-all"
          >
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-sm font-medium text-white/40 hover:text-white/50 transition"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
