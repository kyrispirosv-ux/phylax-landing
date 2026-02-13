// Phylax SafeGuard — Enforcer v3 (Kids-Only)
// Action space: ALLOW / BLOCK / LIMIT (no WARN, no interstitials)
// If harmful: BLOCK. If addiction pattern: LIMIT.
// Phylax quietly protects.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;
  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  let currentOverlay = null;
  let blockedUrl = null;
  let mediaKillInterval = null;
  let navCleanupFns = [];
  const dismissedPaths = {};
  let lastEnforceTime = 0;
  let limitOverlay = null; // LIMIT-specific overlay (scroll gate, time gate)

  const DISMISS_COOLDOWN_MS = 30000;
  const ENFORCE_DEDUP_MS = 500;

  // ── Listen for decisions ────────────────────────────────────────
  window.addEventListener('phylax-decision', (e) => {
    enforce(e.detail);
  });

  // ── Main enforce router ─────────────────────────────────────────
  function enforce(decision) {
    if (!decision) return;

    // Normalize: support both 'decision' and 'action' fields
    const action = decision.decision || decision.action;
    if (action === 'ALLOW') return;

    const url = window.location.href;
    const path = window.location.pathname + window.location.search.split('&t=')[0];
    const now = Date.now();

    if (now - lastEnforceTime < ENFORCE_DEDUP_MS) return;
    if (currentOverlay && blockedUrl === path) return;

    const dismissedAt = dismissedPaths[path];
    if (dismissedAt && now - dismissedAt < DISMISS_COOLDOWN_MS) return;

    if (action === 'BLOCK') {
      lastEnforceTime = now;
      const isDomainBlock = decision.hard_trigger === 'parent_rule' ||
        decision.reason_code === 'DOMAIN_BLOCK' ||
        decision.enforcement?.technique === 'cancel_request';

      if (isDomainBlock) {
        showFullBlock();
      } else {
        if (!isContentPage()) return;
        showOverlayBlock(decision);
      }
    } else if (action === 'LIMIT') {
      lastEnforceTime = now;
      showLimitOverlay(decision);
    }
  }

  // ── Content page detection ──────────────────────────────────────
  function isContentPage() {
    const path = window.location.pathname;
    const h = window.location.hostname;

    if (h.includes('youtube.com') || h.includes('youtu.be')) {
      return path.startsWith('/watch') || path.startsWith('/shorts');
    }
    return true;
  }

  // ═════════════════════════════════════════════════════════════════
  // BLOCK — Full page (domain-level)
  // ═════════════════════════════════════════════════════════════════

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

  // ═════════════════════════════════════════════════════════════════
  // BLOCK — Overlay (content-level)
  // ═════════════════════════════════════════════════════════════════

  function showOverlayBlock(decision) {
    dismissOverlay();
    blockedUrl = window.location.pathname + window.location.search.split('&t=')[0];

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
    style.textContent = `@keyframes phylaxFadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    overlay.appendChild(style);

    // Build evidence text
    const evidence = (decision.evidence || []).join(' ');
    const reasonText = evidence || "This content isn't allowed by your family's safety settings.";

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

    killAllMedia();
    mediaKillInterval = setInterval(killAllMedia, 300);

    overlay.querySelector('#phylaxGoBack').addEventListener('click', () => {
      dismissOverlay();
      history.back();
    });

    watchForNavigation();
  }

  // ═════════════════════════════════════════════════════════════════
  // LIMIT — Behavior restriction overlays
  // ═════════════════════════════════════════════════════════════════

  function showLimitOverlay(decision) {
    // Don't show LIMIT if we already have a BLOCK overlay
    if (currentOverlay) return;
    if (limitOverlay) return;

    const technique = decision.enforcement?.technique || 'time_gate';
    const reason = (decision.evidence || [])[0] || 'Time for a break!';

    const overlay = document.createElement('div');
    overlay.id = 'phylax-limit-overlay';

    if (technique === 'scroll_gate') {
      // Scroll gate: bar at bottom that blocks further scrolling
      overlay.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%; height: auto;
        background: linear-gradient(to top, rgba(5,5,10,0.98), rgba(5,5,10,0.85), transparent);
        z-index: 2147483646; display: flex; align-items: flex-end;
        justify-content: center; padding: 40px 24px 32px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: phylaxSlideUp 0.4s ease;
      `;
      overlay.innerHTML = `
        <style>
          @keyframes phylaxSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        </style>
        <div style="background:#0f1525;border:1px solid rgba(124,92,255,0.25);border-radius:16px;padding:24px 32px;text-align:center;max-width:500px;width:100%;box-shadow:0 -10px 40px rgba(0,0,0,0.5);">
          <div style="font-size:16px;font-weight:600;color:white;margin-bottom:8px;">Time for a break</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:16px;">${reason}</div>
          <button id="phylaxLimitDismiss" style="padding:10px 28px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:rgba(124,92,255,0.3);color:rgba(255,255,255,0.8);font-family:inherit;">Got it</button>
        </div>
      `;
      // Block further scrolling
      document.body.style.overflow = 'hidden';
    } else if (technique === 'pause_autoplay') {
      // Pause autoplay: kill media and show subtle notification
      killAllMedia();
      overlay.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: phylaxSlideIn 0.3s ease;
      `;
      overlay.innerHTML = `
        <style>
          @keyframes phylaxSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        </style>
        <div style="background:#0f1525;border:1px solid rgba(124,92,255,0.25);border-radius:12px;padding:16px 20px;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:300px;">
          <div style="font-size:14px;font-weight:600;color:white;margin-bottom:4px;">Autoplay paused</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.5);">${reason}</div>
        </div>
      `;
      // Auto-dismiss after 8 seconds
      setTimeout(() => dismissLimitOverlay(), 8000);
    } else {
      // Time gate: full overlay with countdown suggestion
      overlay.style.cssText = `
        position: fixed; bottom: 0; left: 0; width: 100%; height: auto;
        background: linear-gradient(to top, rgba(5,5,10,0.95), transparent);
        z-index: 2147483646; display: flex; align-items: flex-end;
        justify-content: center; padding: 40px 24px 32px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: phylaxSlideUp 0.4s ease;
      `;
      overlay.innerHTML = `
        <style>
          @keyframes phylaxSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        </style>
        <div style="background:#0f1525;border:1px solid rgba(124,92,255,0.25);border-radius:16px;padding:24px 32px;text-align:center;max-width:500px;width:100%;box-shadow:0 -10px 40px rgba(0,0,0,0.5);">
          <div style="font-size:16px;font-weight:600;color:white;margin-bottom:8px;">Time for a break</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:16px;">${reason}</div>
          <button id="phylaxLimitDismiss" style="padding:10px 28px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:rgba(124,92,255,0.3);color:rgba(255,255,255,0.8);font-family:inherit;">Got it</button>
        </div>
      `;
    }

    safeAppendOverlay(overlay);
    limitOverlay = overlay;

    const dismissBtn = overlay.querySelector('#phylaxLimitDismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => dismissLimitOverlay());
    }
  }

  function dismissLimitOverlay() {
    if (limitOverlay) {
      limitOverlay.remove();
      limitOverlay = null;
    }
    document.body.style.overflow = '';
    const existing = document.getElementById('phylax-limit-overlay');
    if (existing) existing.remove();
  }

  // ═════════════════════════════════════════════════════════════════
  // MEDIA KILLER
  // ═════════════════════════════════════════════════════════════════

  function killAllMedia() {
    document.querySelectorAll('video, audio').forEach(el => {
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
        if (el.src) {
          el.removeAttribute('src');
          el.load();
        }
      } catch { /* ignore */ }
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // SPA NAVIGATION WATCHER
  // ═════════════════════════════════════════════════════════════════

  function watchForNavigation() {
    teardownNavWatchers();

    const onNav = () => {
      const currentPath = window.location.pathname + window.location.search.split('&t=')[0];
      if (currentOverlay && currentPath !== blockedUrl) {
        dismissOverlay();
      }
    };

    window.addEventListener('yt-navigate-finish', onNav);
    navCleanupFns.push(() => window.removeEventListener('yt-navigate-finish', onNav));

    window.addEventListener('popstate', onNav);
    navCleanupFns.push(() => window.removeEventListener('popstate', onNav));

    let lastPath = window.location.pathname + window.location.search.split('&t=')[0];
    const pollId = setInterval(() => {
      const currentPath = window.location.pathname + window.location.search.split('&t=')[0];
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        onNav();
      }
      if (!currentOverlay) clearInterval(pollId);
    }, 500);
    navCleanupFns.push(() => clearInterval(pollId));
  }

  function teardownNavWatchers() {
    navCleanupFns.forEach(fn => fn());
    navCleanupFns = [];
  }

  // ═════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════

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
    if (blockedUrl) {
      dismissedPaths[blockedUrl] = Date.now();
    }
    const currentPath = window.location.pathname + window.location.search.split('&t=')[0];
    if (currentPath !== blockedUrl) {
      dismissedPaths[currentPath] = Date.now();
    }

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

  console.log('[Phylax Enforcer v3] Ready on:', host);
})();
