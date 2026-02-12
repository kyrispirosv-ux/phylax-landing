// Phylax SafeGuard — Enforcer (v3: Kids-Only Action Space)
// Action space: ALLOW | BLOCK | LIMIT  (no WARN, no interstitials)
//
// BLOCK enforcement:
//   - NETWORK/cancel_request → Full-page block (DOM replacement)
//   - RENDER/overlay → Overlay block with evidence
//
// LIMIT enforcement:
//   - FEATURE/scroll_gate → Scroll limiter (take a break)
//   - FEATURE/time_gate → Session time limit
//   - FEATURE/pause_autoplay → Disable autoplay

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  let currentOverlay = null;
  let currentLimitBanner = null;
  let blockedUrl = null;
  let mediaKillInterval = null;
  let navCleanupFns = [];
  const dismissedPaths = {};
  let lastEnforceTime = 0;

  const DISMISS_COOLDOWN_MS = 60000;
  const ENFORCE_DEDUP_MS = 2000;

  // ── Listen for decisions ────────────────────────────────────

  window.addEventListener('phylax-decision', (e) => {
    enforce(e.detail);
  });

  // ── Enforce: route decisions to enforcement technique ───────

  function enforce(decision) {
    if (!decision) return;

    // Normalize: pipeline uses 'decision', legacy uses 'action'
    const action = decision.decision || decision.action;
    if (action === 'ALLOW') return;

    const path = window.location.pathname + window.location.search.split('&t=')[0];
    const now = Date.now();

    // Dedup guard
    if (now - lastEnforceTime < ENFORCE_DEDUP_MS) return;

    // Already showing overlay for this page
    if (currentOverlay && blockedUrl === path) return;

    // Recently dismissed
    const dismissedAt = dismissedPaths[path];
    if (dismissedAt && now - dismissedAt < DISMISS_COOLDOWN_MS) return;

    if (action === 'BLOCK') {
      const layer = decision.enforcement?.layer;
      const technique = decision.enforcement?.technique;

      if (layer === 'NETWORK' || technique === 'cancel_request' || decision.hard_trigger === 'parent_rule') {
        lastEnforceTime = now;
        showFullBlock(decision);
      } else {
        if (!isContentPage()) return;
        lastEnforceTime = now;
        showOverlayBlock(decision);
      }
    } else if (action === 'LIMIT') {
      lastEnforceTime = now;
      applyLimit(decision);
    }
  }

  // ── Content page detection ──────────────────────────────────

  function isContentPage() {
    const path = window.location.pathname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return path.startsWith('/watch') || path.startsWith('/shorts');
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // BLOCK — Full page (replaces DOM)
  // ═══════════════════════════════════════════════════════════════

  function showFullBlock(decision) {
    dismissOverlay();
    const evidence = decision.evidence || [];
    const reasonText = evidence[0] || 'This site is blocked by your family\'s safety rules.';

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
          .container { max-width: 420px; }
          .shield {
            width: 80px; height: 80px;
            background: linear-gradient(135deg, #7C5CFF, #22D3EE);
            border-radius: 20px; display: flex; align-items: center; justify-content: center;
            margin: 0 auto 28px;
            box-shadow: 0 12px 40px rgba(124, 92, 255, 0.35);
          }
          h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
          p { color: rgba(255,255,255,0.5); font-size: 15px; line-height: 1.7; }
          .evidence { color: rgba(255,255,255,0.35); font-size: 13px; margin-top: 8px; font-style: italic; }
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
          <p class="evidence">${escapeHtml(reasonText)}</p>
          <button class="btn" onclick="history.back()">Go Back</button>
        </div>
      </body>
    `;
    window.stop();
  }

  // ═══════════════════════════════════════════════════════════════
  // BLOCK — Overlay (floats over content)
  // ═══════════════════════════════════════════════════════════════

  function showOverlayBlock(decision) {
    dismissOverlay();
    blockedUrl = window.location.pathname + window.location.search.split('&t=')[0];

    const evidence = decision.evidence || [];
    const reasonText = evidence[0] || 'This content has been restricted by your family\'s safety settings.';
    const confidence = decision.confidence ? `${Math.round(decision.confidence * 100)}% confidence` : '';

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

    const card = document.createElement('div');
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(124,92,255,0.25);
      border-radius: 24px; padding: 40px; max-width: 420px; width: 90%;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    card.innerHTML = `
      <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#7C5CFF,#22D3EE);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 8px 24px rgba(0,0,0,0.3);">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
          <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
        </svg>
      </div>
      <h2 style="font-size:22px;font-weight:700;color:white;margin:0 0 12px;">Phylax is here to help</h2>
      <p style="font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;margin:0 0 8px;">${escapeHtml(reasonText)}</p>
      ${confidence ? `<p style="font-size:12px;color:rgba(255,255,255,0.25);margin:0 0 24px;">${escapeHtml(confidence)}</p>` : '<div style="height:16px"></div>'}
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

  // ═══════════════════════════════════════════════════════════════
  // LIMIT — Feature-level enforcement
  // ═══════════════════════════════════════════════════════════════

  function applyLimit(decision) {
    const technique = decision.enforcement?.technique;

    if (technique === 'pause_autoplay') {
      disableAutoplay();
    }

    if (technique === 'scroll_gate') {
      showScrollGate(decision);
    }

    if (technique === 'time_gate') {
      showTimeGate(decision);
    }

    // Always show the limit banner
    showLimitBanner(decision);
  }

  function showLimitBanner(decision) {
    if (currentLimitBanner) currentLimitBanner.remove();

    const evidence = decision.evidence?.[0] || 'Usage pattern detected.';
    const banner = document.createElement('div');
    banner.id = 'phylax-limit-banner';
    banner.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
      background: #1a1a2e; border: 1px solid rgba(124,92,255,0.3);
      border-radius: 16px; padding: 16px 20px; max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: phylaxSlideIn 0.3s ease;
    `;
    banner.innerHTML = `
      <style>@keyframes phylaxSlideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7C5CFF,#22D3EE);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 9v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
        </div>
        <span style="color:white;font-size:14px;font-weight:600;">Take a break</span>
        <button id="phylaxDismissLimit" style="margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;padding:0 4px;">&times;</button>
      </div>
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.5;margin:0;">${escapeHtml(evidence)}</p>
    `;

    safeAppendOverlay(banner);
    currentLimitBanner = banner;

    banner.querySelector('#phylaxDismissLimit').addEventListener('click', () => {
      banner.remove();
      currentLimitBanner = null;
    });

    // Auto-dismiss after 30s
    setTimeout(() => {
      if (currentLimitBanner === banner) {
        banner.remove();
        currentLimitBanner = null;
      }
    }, 30000);
  }

  function disableAutoplay() {
    // Pause all videos and disable autoplay
    document.querySelectorAll('video').forEach(v => {
      try {
        v.pause();
        v.autoplay = false;
      } catch {}
    });
    // YouTube: click the autoplay toggle off
    const autoplayToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (autoplayToggle) autoplayToggle.click();
  }

  function showScrollGate(_decision) {
    // Add scroll limiter — intercept scroll after threshold
    let scrollGateShown = false;
    const gateHandler = () => {
      const scrollDepth = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1);
      if (scrollDepth > 0.7 && !scrollGateShown) {
        scrollGateShown = true;
        showLimitBanner({
          evidence: ['You\'ve been scrolling for a while. Consider taking a break.'],
          enforcement: { technique: 'scroll_gate' },
        });
      }
    };
    window.addEventListener('scroll', gateHandler, { passive: true });
  }

  function showTimeGate(decision) {
    const budgetMs = (decision.budget_minutes || 30) * 60000;
    setTimeout(() => {
      showLimitBanner({
        evidence: ['Your session time budget has been reached.'],
        enforcement: { technique: 'time_gate' },
      });
      disableAutoplay();
    }, budgetMs);
  }

  // ═══════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════

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
      } catch {}
    });
  }

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
      if (currentPath !== lastPath) { lastPath = currentPath; onNav(); }
      if (!currentOverlay) clearInterval(pollId);
    }, 500);
    navCleanupFns.push(() => clearInterval(pollId));
  }

  function teardownNavWatchers() {
    navCleanupFns.forEach(fn => fn());
    navCleanupFns = [];
  }

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
    if (blockedUrl) dismissedPaths[blockedUrl] = Date.now();
    const currentPath = window.location.pathname + window.location.search.split('&t=')[0];
    if (currentPath !== blockedUrl) dismissedPaths[currentPath] = Date.now();

    if (mediaKillInterval) { clearInterval(mediaKillInterval); mediaKillInterval = null; }
    teardownNavWatchers();
    blockedUrl = null;

    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    const existing = document.getElementById('phylax-overlay');
    if (existing) existing.remove();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  console.log('[Phylax Enforcer v3] Ready on:', host);
})();
