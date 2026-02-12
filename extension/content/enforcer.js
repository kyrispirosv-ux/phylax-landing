// Phylax SafeGuard — Enforcer
// Injected on ALL pages. Shows a single block screen when content is restricted.
// Phylax quietly protects. That's it.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  let currentOverlay = null;
  let blockedUrl = null;        // URL that triggered the current overlay
  let mediaKillInterval = null; // interval that keeps killing media
  let navCleanupFns = [];       // listeners to tear down on dismiss
  const dismissedUrls = {};     // url → timestamp — recently dismissed, don't re-block

  // ── Listen for decisions ────────────────────────────────────
  // Only listen on ONE channel to avoid duplicates.
  // The observer already forwards background PHYLAX_ENFORCE_DECISION messages
  // as phylax-decision window events, so we only need the window listener.
  // We also keep the chrome.runtime listener for direct background → enforcer
  // messages, but dedup via the enforce() guards.

  window.addEventListener('phylax-decision', (e) => {
    enforce(e.detail);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') {
      enforce(message.decision);
    }
  });

  // ── Enforce: route decisions to the right block type ─────────
  // Full-page block (DOM replacement): ONLY for explicit parent BLOCK_DOMAIN rules.
  // Overlay block (floats over page): content-scoped parent rules + harm scorer.
  // This ensures the generic harm scorer never independently triggers domain-level blocks.

  function enforce(decision) {
    if (!decision) return;
    if (decision.action === 'ALLOW') return;

    const url = window.location.href;

    // Already showing overlay for this exact URL — don't recreate (prevents flash)
    if (currentOverlay && blockedUrl === url) return;

    // Recently dismissed this URL — don't re-block for 30s (prevents flash after Go Back)
    const dismissedAt = dismissedUrls[url];
    if (dismissedAt && Date.now() - dismissedAt < 30000) return;

    // Full-page block is reserved for explicit parent domain blocks only
    const isParentDomainBlock = decision.hard_trigger === 'parent_rule';

    if (isParentDomainBlock) {
      showFullBlock();
    } else {
      // Content overlay only on actual content pages, not search/browse
      if (!isContentPage()) return;
      showOverlayBlock();
    }
  }

  // ── Content page detection ────────────────────────────────────
  // Overlay blocks only fire on pages where the user is consuming content
  // (e.g. watching a video). Search results, homepages, and channel pages
  // are browse/discovery — blocking those would block the whole site.

  function isContentPage() {
    const path = window.location.pathname;
    const host = window.location.hostname;

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return path.startsWith('/watch') || path.startsWith('/shorts');
    }

    // Other sites: allow content blocks anywhere
    return true;
  }

  // ── Full-page block (replaces the page entirely) ────────────

  function showFullBlock() {
    dismissOverlay();
    document.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Phylax SafeGuard</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #070A12; color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; text-align: center; padding: 24px;
          }
          .container { max-width: 400px; }
          .shield {
            width: 80px; height: 80px;
            background: linear-gradient(135deg, #7C5CFF, #22D3EE);
            border-radius: 20px; display: flex; align-items: center; justify-content: center;
            margin: 0 auto 28px;
            box-shadow: 0 12px 40px rgba(124, 92, 255, 0.35);
          }
          h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
          p { color: rgba(255,255,255,0.5); font-size: 15px; line-height: 1.7; }
          .btn {
            margin-top: 32px; padding: 12px 32px; border-radius: 12px;
            font-size: 15px; font-weight: 600; cursor: pointer; border: none;
            background: linear-gradient(135deg, #7C5CFF, rgba(124,92,255,0.8));
            color: white; box-shadow: 0 4px 16px rgba(124,92,255,0.3);
            font-family: inherit; transition: all 0.2s;
          }
          .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,92,255,0.4); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="shield">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
              <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
            </svg>
          </div>
          <h1>Phylax is here to help</h1>
          <p>This isn't allowed by your family's safety settings.</p>
          <button class="btn" onclick="history.back()">Go Back</button>
        </div>
      </body>
    `;
    window.stop();
  }

  // ── Overlay block (floats over the page for content blocks) ─

  function showOverlayBlock() {
    dismissOverlay();

    blockedUrl = window.location.href;

    const overlay = document.createElement('div');
    overlay.id = 'phylax-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(5, 5, 10, 0.95); backdrop-filter: blur(12px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; animation: phylaxFadeIn 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes phylaxFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    overlay.appendChild(style);

    const card = document.createElement('div');
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(124,92,255,0.25);
      border-radius: 24px; padding: 40px; max-width: 400px; width: 90%;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    card.innerHTML = `
      <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#7C5CFF,#22D3EE);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 8px 24px rgba(0,0,0,0.3);">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
          <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
        </svg>
      </div>
      <h2 style="font-size:22px;font-weight:700;color:white;margin:0 0 12px;">Phylax is here to help</h2>
      <p style="font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;margin:0 0 28px;">This isn't allowed by your family's safety settings.</p>
      <button id="phylaxGoBack" style="padding:12px 32px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;border:none;background:linear-gradient(135deg,#7C5CFF,rgba(124,92,255,0.8));color:white;box-shadow:0 4px 16px rgba(124,92,255,0.3);font-family:inherit;transition:all 0.2s;">Go Back</button>
    `;

    overlay.appendChild(card);
    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    // Aggressively kill all media — YouTube recreates video elements,
    // so we poll every 300ms while the overlay is visible.
    killAllMedia();
    mediaKillInterval = setInterval(killAllMedia, 300);

    // "Go Back" = dismiss overlay + navigate back so user stays on YouTube
    overlay.querySelector('#phylaxGoBack').addEventListener('click', () => {
      dismissOverlay();
      history.back();
    });

    // Auto-dismiss when the user navigates away from the blocked URL.
    // YouTube is a SPA — it fires popstate + custom yt-navigate-finish events
    // instead of full page loads.
    watchForNavigation();
  }

  // ── Aggressive media killer ───────────────────────────────────
  // YouTube's player restarts video elements after a simple pause().
  // We pause, mute, and blank the src on every video/audio element.

  function killAllMedia() {
    document.querySelectorAll('video, audio').forEach(el => {
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
        // Remove source so YouTube can't restart playback
        if (el.src) {
          el.removeAttribute('src');
          el.load(); // forces the element to drop its media resource
        }
      } catch {}
    });
  }

  // ── SPA navigation watcher ────────────────────────────────────
  // Detects when the URL changes (YouTube SPA navigation) and
  // auto-dismisses the overlay so the user can keep browsing.

  function watchForNavigation() {
    teardownNavWatchers();

    const onNav = () => {
      if (currentOverlay && window.location.href !== blockedUrl) {
        dismissOverlay();
      }
    };

    // YouTube fires this custom event on SPA navigation
    window.addEventListener('yt-navigate-finish', onNav);
    navCleanupFns.push(() => window.removeEventListener('yt-navigate-finish', onNav));

    // Standard browser history navigation
    window.addEventListener('popstate', onNav);
    navCleanupFns.push(() => window.removeEventListener('popstate', onNav));

    // Fallback: poll for URL changes every 500ms (covers pushState)
    let lastHref = window.location.href;
    const pollId = setInterval(() => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        onNav();
      }
      // Stop polling once overlay is gone
      if (!currentOverlay) clearInterval(pollId);
    }, 500);
    navCleanupFns.push(() => clearInterval(pollId));
  }

  function teardownNavWatchers() {
    navCleanupFns.forEach(fn => fn());
    navCleanupFns = [];
  }

  // ── Helpers ─────────────────────────────────────────────────

  function safeAppendOverlay(overlay) {
    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(overlay);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        (document.body || document.documentElement).appendChild(overlay);
      }, { once: true });
    }
  }

  function dismissOverlay() {
    // Remember this URL so we don't re-block it immediately (prevents flash loop)
    if (blockedUrl) {
      dismissedUrls[blockedUrl] = Date.now();
    }

    // Stop killing media
    if (mediaKillInterval) {
      clearInterval(mediaKillInterval);
      mediaKillInterval = null;
    }
    teardownNavWatchers();
    blockedUrl = null;

    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }
    const existing = document.getElementById('phylax-overlay');
    if (existing) existing.remove();
  }

  console.log('[Phylax Enforcer] Ready on:', window.location.hostname);
})();
