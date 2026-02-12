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

    switch (decision.action) {
      case 'BLOCK':        showBlock(decision); break;
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
    const ruleText = decision.message_child || 'This content has been blocked.';
    const harmScore = decision.scores?.harm || 0;
    const reasons = decision.top_reasons || [];

    document.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Blocked by Phylax</title>
        <style>${baseStyles()}
          .score-bar { height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-top: 16px; overflow: hidden; }
          .score-fill { height: 100%; background: linear-gradient(90deg, #34D399, #FBBF24, #FB7185); border-radius: 3px; transition: width 0.5s; }
          .reason-tag { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; background: rgba(251,113,133,0.15); color: #FB7185; border: 1px solid rgba(251,113,133,0.2); margin: 3px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="shield">&#x1f6e1;</div>
          <h1>Content Blocked</h1>
          <p>${escapeHtml(ruleText)}</p>
          <div class="score-bar"><div class="score-fill" style="width: ${harmScore}%"></div></div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 8px;">Risk Score: ${harmScore}/100</div>
          ${reasons.length > 0 ? `
            <div style="margin-top: 16px;">
              ${reasons.map(r => `<span class="reason-tag">${escapeHtml(r)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </body>
    `;
    window.stop();
  }

  // ── WARN overlay ────────────────────────────────────────────

  function showWarn(decision) {
    removeOverlay();
    const overlay = createOverlay('warn');
    overlay.innerHTML = `
      <div class="phylax-card">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #FBBF24, #F59E0B);">&#x26A0;&#xFE0F;</div>
        <h2 class="phylax-title">Content Warning</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'This content might not be appropriate.')}</p>
        <div class="phylax-score">Risk: ${decision.scores?.harm || 0}/100</div>
        <div class="phylax-actions">
          <button class="phylax-btn phylax-btn-secondary" id="phylaxGoBack">Go Back</button>
          <button class="phylax-btn phylax-btn-muted" id="phylaxContinue">Continue Anyway</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
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

    document.body.appendChild(nudge);
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
      <div class="phylax-card">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #7C5CFF, #22D3EE);">&#x23F3;</div>
        <h2 class="phylax-title">Take a Moment</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'What\'s your goal right now?')}</p>
        <div class="phylax-countdown" id="phylaxCountdown" style="font-size: 48px; font-weight: 700; color: #22D3EE; margin: 16px 0;">${countdown}</div>
        <p class="phylax-text" style="font-size: 13px;">Think about what you want to achieve before continuing.</p>
        <button class="phylax-btn phylax-btn-primary" id="phylaxFrictionContinue" disabled style="opacity: 0.3;">
          Wait ${countdown}s...
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
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
      <div class="phylax-card">
        <div class="phylax-icon" style="background: linear-gradient(135deg, #FB7185, #F43F5E);">&#x1F6D1;</div>
        <h2 class="phylax-title">Time for a Break</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'Screen time limit reached.')}</p>
        <div id="phylaxCooldownTimer" style="font-size: 48px; font-weight: 700; color: #FB7185; margin: 16px 0; font-variant-numeric: tabular-nums;">
          ${formatTime(remaining)}
        </div>
        <p class="phylax-text" style="font-size: 13px; color: rgba(255,255,255,0.4);">
          Browsing will resume when the timer ends.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);
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
        <div class="phylax-icon" style="background: linear-gradient(135deg, #34D399, #10B981);">&#x1F49A;</div>
        <h2 class="phylax-title">You're Not Alone</h2>
        <p class="phylax-text">${escapeHtml(decision.message_child || 'Help is available if you need it.')}</p>
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
          <button class="phylax-btn phylax-btn-secondary" id="phylaxRedirectBack">Go Back</button>
          <button class="phylax-btn phylax-btn-muted" id="phylaxRedirectContinue">I Understand</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    currentOverlay = overlay;

    overlay.querySelector('#phylaxRedirectBack').addEventListener('click', () => {
      history.back();
    });
    overlay.querySelector('#phylaxRedirectContinue').addEventListener('click', () => {
      removeOverlay();
    });
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
      .container { max-width: 480px; }
      .shield {
        width: 80px; height: 80px;
        background: linear-gradient(135deg, #7C5CFF, #22D3EE);
        border-radius: 20px; display: flex; align-items: center; justify-content: center;
        margin: 0 auto 24px; font-size: 36px;
        box-shadow: 0 10px 40px rgba(124, 92, 255, 0.3);
      }
      h1 { font-size: 28px; margin-bottom: 12px; }
      p { color: rgba(255,255,255,0.6); font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
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
