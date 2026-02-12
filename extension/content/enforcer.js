// Phylax Engine — Enforcer (Intervention UI)
// Injected on ALL pages. Renders block/warn/nudge/friction/cooldown/redirect overlays.
// Listens for decisions from observer.js or background.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  let currentOverlay = null;
  let frictionTimer = null;

  // ── Listen for decisions ────────────────────────────────────

  window.addEventListener('phylax-decision', (e) => {
    enforce(e.detail);
  });

  // Also listen for direct messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') {
      enforce(message.decision);
    }
  });

  // ── Main enforcement dispatcher ─────────────────────────────

  function enforce(decision) {
    if (!decision) return;

    // Check if this is a content-level block (not domain-level)
    const isContentRule = decision.hard_trigger === 'content_rule' ||
      decision.top_reasons?.some(r => r.startsWith('content_rule:') || r.startsWith('content_warn:'));

    switch (decision.action) {
      case 'BLOCK':
        if (isContentRule) {
          showContentBlock(decision);
        } else {
          showBlock(decision);
        }
        break;
      case 'WARN':         showWarn(decision); break;
      case 'NUDGE':        showNudge(decision); break;
      case 'FRICTION':     showFriction(decision); break;
      case 'COOLDOWN':     showCooldown(decision); break;
      case 'REDIRECT':     showRedirect(decision); break;
      case 'ALERT_PARENT': showBlock(decision); break; // Block + alert
      default: break;
    }
  }

  // ── BLOCK overlay ───────────────────────────────────────────

  function showBlock(decision) {
    removeOverlay();

    document.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Phylax SafeGuard</title>
        <style>${baseStyles()}</style>
      </head>
      <body>
        <div class="container">
          <div class="shield">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1>Phylax is here to help</h1>
          <p>This page has been blocked by your family's safety settings. If you think this is a mistake, talk to your parent or guardian.</p>
          <div class="actions">
            <button class="btn-primary" onclick="history.back()">Go Back</button>
          </div>
        </div>
      </body>
    `;
    window.stop();
  }

  // ── CONTENT BLOCK overlay (does NOT replace the whole page) ─

  function showContentBlock(decision) {
    removeOverlay();
    const overlay = createOverlay('content-block');

    overlay.innerHTML = `
      <div class="phylax-card" style="border-color: rgba(124,92,255,0.3);">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #7C5CFF, #22D3EE);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 class="phylax-title">Phylax is here to help</h2>
        <p class="phylax-text">This content has been blocked by your family's safety settings. If you think this is a mistake, talk to your parent or guardian.</p>
        <div class="phylax-actions">
          <button class="phylax-btn phylax-btn-primary" id="phylaxGoBack">Go Back</button>
        </div>
      </div>
    `;

    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    overlay.querySelector('#phylaxGoBack').addEventListener('click', () => {
      history.back();
    });
  }

  // ── WARN overlay ────────────────────────────────────────────

  function showWarn(decision) {
    removeOverlay();
    const overlay = createOverlay('warn');
    overlay.innerHTML = `
      <div class="phylax-card" style="border-color: rgba(251,191,36,0.3);">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #FBBF24, #F59E0B);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 class="phylax-title">Phylax wants you to be careful</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'This content might not be right for you. Think before you continue.')}</p>
        <div class="phylax-actions">
          <button class="phylax-btn phylax-btn-primary" id="phylaxGoBack">Go Back</button>
          <button class="phylax-btn phylax-btn-muted" id="phylaxContinue">Continue Anyway</button>
        </div>
      </div>
    `;

    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    overlay.querySelector('#phylaxGoBack').addEventListener('click', () => {
      history.back();
    });
    overlay.querySelector('#phylaxContinue').addEventListener('click', () => {
      removeOverlay();
    });
  }

  // ── NUDGE overlay ───────────────────────────────────────────

  function showNudge(decision) {
    removeOverlay();
    const nudge = document.createElement('div');
    nudge.id = 'phylax-nudge';
    nudge.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      background: rgba(10, 16, 34, 0.95); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px; padding: 16px 20px; max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: white; box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      animation: phylaxSlideUp 0.3s ease;
    `;
    nudge.innerHTML = `
      <style>
        @keyframes phylaxSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      </style>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #7C5CFF, #22D3EE); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">&#x1f6e1;</div>
        <div style="font-size: 14px; font-weight: 600;">Phylax</div>
        <div id="phylaxDismissNudge" style="margin-left: auto; cursor: pointer; color: rgba(255,255,255,0.4); font-size: 18px;">&times;</div>
      </div>
      <p style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.5; margin: 0;">
        ${escapeHtml(decision.message_child || 'Maybe take a break?')}
      </p>
    `;

    safeAppendOverlay(nudge);
    currentOverlay = nudge;

    nudge.querySelector('#phylaxDismissNudge').addEventListener('click', () => {
      nudge.remove();
      currentOverlay = null;
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (nudge.parentNode) {
        nudge.remove();
        currentOverlay = null;
      }
    }, 10000);
  }

  // ── FRICTION overlay ────────────────────────────────────────

  function showFriction(decision) {
    removeOverlay();
    const overlay = createOverlay('friction');
    let countdown = 10; // 10 second forced pause

    overlay.innerHTML = `
      <div class="phylax-card" style="border-color: rgba(124,92,255,0.3);">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #7C5CFF, #22D3EE);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 class="phylax-title">Phylax says take a moment</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'Think about what you want to do before continuing.')}</p>
        <div class="phylax-countdown" id="phylaxCountdown" style="font-size: 48px; font-weight: 700; color: #22D3EE; margin: 16px 0;">${countdown}</div>
        <button class="phylax-btn phylax-btn-primary" id="phylaxFrictionContinue" disabled style="opacity: 0.3;">
          Wait ${countdown}s...
        </button>
      </div>
    `;

    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    const countdownEl = overlay.querySelector('#phylaxCountdown');
    const btnEl = overlay.querySelector('#phylaxFrictionContinue');

    frictionTimer = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (btnEl) btnEl.textContent = countdown > 0 ? `Wait ${countdown}s...` : 'Continue';

      if (countdown <= 0) {
        clearInterval(frictionTimer);
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.style.opacity = '1';
        }
      }
    }, 1000);

    btnEl.addEventListener('click', () => {
      if (!btnEl.disabled) removeOverlay();
    });
  }

  // ── COOLDOWN overlay ────────────────────────────────────────

  function showCooldown(decision) {
    removeOverlay();
    const seconds = decision.cooldown_seconds || 300;
    let remaining = seconds;

    const overlay = createOverlay('cooldown');
    overlay.innerHTML = `
      <div class="phylax-card" style="border-color: rgba(124,92,255,0.3);">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #7C5CFF, #22D3EE);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 class="phylax-title">Phylax says take a break</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'Time to step away from the screen for a bit.')}</p>
        <div id="phylaxCooldownTimer" style="font-size: 48px; font-weight: 700; color: #22D3EE; margin: 16px 0; font-variant-numeric: tabular-nums;">
          ${formatTime(remaining)}
        </div>
        <p class="phylax-text" style="font-size: 13px; color: rgba(255,255,255,0.4);">
          Browsing will resume when the timer ends.
        </p>
      </div>
    `;

    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    const timerEl = overlay.querySelector('#phylaxCooldownTimer');
    const cooldownInterval = setInterval(() => {
      remaining--;
      if (timerEl) timerEl.textContent = formatTime(remaining);
      if (remaining <= 0) {
        clearInterval(cooldownInterval);
        removeOverlay();
      }
    }, 1000);
  }

  // ── REDIRECT overlay (supportive) ───────────────────────────

  function showRedirect(decision) {
    removeOverlay();
    const resources = decision.redirect_resources || [];
    const overlay = createOverlay('redirect');

    overlay.innerHTML = `
      <div class="phylax-card" style="border-color: rgba(52, 211, 153, 0.3);">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #34D399, #10B981);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>
        <h2 class="phylax-title">Phylax is here for you</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'You are not alone. Help is available if you need it.')}</p>
        ${resources.length > 0 ? `
          <div style="margin: 16px 0; text-align: left;">
            ${resources.map(r => `
              <div style="padding: 12px; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.15); border-radius: 10px; margin-bottom: 8px;">
                <div style="font-size: 12px; color: #34D399; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(r.label)}</div>
                <div style="font-size: 16px; color: white; font-weight: 600; margin-top: 4px;">${escapeHtml(r.value)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="phylax-actions">
          <button class="phylax-btn phylax-btn-primary" id="phylaxRedirectBack">Go Back</button>
          <button class="phylax-btn phylax-btn-muted" id="phylaxRedirectContinue">I Understand</button>
        </div>
      </div>
    `;

    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    overlay.querySelector('#phylaxRedirectBack').addEventListener('click', () => {
      history.back();
    });
    overlay.querySelector('#phylaxRedirectContinue').addEventListener('click', () => {
      removeOverlay();
    });
  }

  // ── Safe DOM append (guards against null document.body) ─────

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

  // ── Overlay helpers ─────────────────────────────────────────

  function createOverlay(type) {
    const overlay = document.createElement('div');
    overlay.id = 'phylax-overlay';
    overlay.setAttribute('data-phylax-type', type);
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(5, 5, 10, 0.92); backdrop-filter: blur(8px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; animation: phylaxFadeIn 0.3s ease;
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes phylaxFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .phylax-card {
        background: #0f1525; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 24px; padding: 40px; max-width: 440px; width: 90%;
        text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      }
      .phylax-icon {
        width: 64px; height: 64px; border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 20px; font-size: 28px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
      .phylax-title {
        font-size: 24px; font-weight: 700; color: white; margin: 0 0 12px;
      }
      .phylax-text {
        font-size: 15px; color: rgba(255,255,255,0.6); line-height: 1.6; margin: 0 0 8px;
      }
      .phylax-score {
        font-size: 13px; color: rgba(255,255,255,0.3); margin: 12px 0;
      }
      .phylax-actions {
        display: flex; gap: 12px; margin-top: 24px; justify-content: center;
      }
      .phylax-btn {
        padding: 10px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;
        cursor: pointer; border: 1px solid rgba(255,255,255,0.15);
        transition: all 0.2s; font-family: inherit;
      }
      .phylax-btn:hover { transform: translateY(-1px); }
      .phylax-btn-primary {
        background: linear-gradient(135deg, #7C5CFF, rgba(124,92,255,0.8));
        color: white; border-color: rgba(255,255,255,0.2);
      }
      .phylax-btn-secondary {
        background: rgba(255,255,255,0.08); color: white;
      }
      .phylax-btn-muted {
        background: transparent; color: rgba(255,255,255,0.4);
        border-color: rgba(255,255,255,0.08);
      }
      .phylax-btn:disabled { cursor: not-allowed; }
    `;
    overlay.appendChild(style);
    return overlay;
  }

  function removeOverlay() {
    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }
    if (frictionTimer) {
      clearInterval(frictionTimer);
      frictionTimer = null;
    }
    // Also remove any fullpage block
    const existing = document.getElementById('phylax-overlay');
    if (existing) existing.remove();
  }

  function baseStyles() {
    return `
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
      h1 { font-size: 26px; font-weight: 700; margin-bottom: 14px; letter-spacing: -0.3px; }
      p { color: rgba(255,255,255,0.55); font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
      .actions { margin-top: 28px; }
      .btn-primary {
        padding: 12px 32px; border-radius: 12px; font-size: 15px; font-weight: 600;
        cursor: pointer; border: none;
        background: linear-gradient(135deg, #7C5CFF, rgba(124,92,255,0.8));
        color: white; box-shadow: 0 4px 16px rgba(124,92,255,0.3);
        transition: all 0.2s; font-family: inherit;
      }
      .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,92,255,0.4); }
    `;
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  console.log('[Phylax Enforcer] Ready on:', window.location.hostname);
})();
