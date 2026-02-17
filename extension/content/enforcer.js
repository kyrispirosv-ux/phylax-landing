// Phylax SafeGuard — Enforcer v3.0 (Kids-Only)
// Action space: ALLOW / BLOCK / LIMIT (no WARN, no interstitials)
// If harmful: BLOCK. If addiction pattern: LIMIT.
// Chat-aware: DM threats block conversation area only, not entire platform.
// Phylax quietly protects.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;
  const host = window.location.hostname;
  if (host === 'phylax2.vercel.app' || host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  // ── Exempt email / productivity domains ────────────────────────
  // Email clients must never be blocked — scanning email content
  // produces false positives from spam, phishing warnings, etc.
  const EXEMPT_DOMAINS = [
    // Email clients
    'mail.google.com', 'inbox.google.com',
    'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
    'mail.yahoo.com',
    'mail.proton.me', 'mail.protonmail.com',
    'mail.zoho.com',
    'mail.aol.com',
    'fastmail.com',
    // Google productivity
    'calendar.google.com', 'contacts.google.com',
    'drive.google.com', 'docs.google.com',
    'sheets.google.com', 'slides.google.com',
    // AI assistants
    'chat.openai.com', 'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'copilot.microsoft.com',
    'poe.com',
    'perplexity.ai',
  ];
  if (EXEMPT_DOMAINS.some(d => host === d || host.endsWith('.' + d))) return;

  let currentOverlay = null;
  let blockedUrl = null;
  let mediaKillInterval = null;
  let navCleanupFns = [];
  const dismissedPaths = {};
  let lastEnforceTime = 0;
  let limitOverlay = null; // LIMIT-specific overlay (scroll gate, time gate)
  let overlayGuardObserver = null; // MutationObserver re-attach guard

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

    if (now - lastEnforceTime < ENFORCE_DEDUP_MS) {
      console.log('[Phylax Enforcer] Deduped (too fast)', action, path);
      return;
    }
    if (currentOverlay && blockedUrl === path) {
      console.log('[Phylax Enforcer] Already blocked', path);
      return;
    }

    const dismissedAt = dismissedPaths[path];
    if (dismissedAt && now - dismissedAt < DISMISS_COOLDOWN_MS) {
      console.log('[Phylax Enforcer] Path dismissed recently', path, 'cooldown remaining:', Math.round((DISMISS_COOLDOWN_MS - (now - dismissedAt)) / 1000) + 's');
      return;
    }

    console.log(`[Phylax Enforcer] Enforcing ${action} on ${path} (${decision.reason_code}, technique=${decision.enforcement?.technique})`);

    if (action === 'BLOCK') {
      lastEnforceTime = now;
      const isDomainBlock = decision.hard_trigger === 'parent_rule' ||
        decision.reason_code === 'DOMAIN_BLOCK' ||
        decision.enforcement?.technique === 'cancel_request';
      const technique = decision.enforcement?.technique;

      if (isDomainBlock) {
        showFullBlock();
      } else if (technique === 'chat_block') {
        showChatBlock(decision);
      } else if (technique === 'player_block') {
        showPlayerBlock(decision);
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
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 28px;
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
            <svg width="56" height="56" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="phylax-bg-n" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
                <linearGradient id="phylax-spiral-n" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
                  </defs>
              <rect width="512" height="512" rx="112" fill="url(#phylax-bg-n)"/>
              <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
              <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-n)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
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

    // Prevent scrolling behind the overlay
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'phylax-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      background: rgba(5, 5, 10, 0.98); backdrop-filter: blur(16px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; animation: phylaxFadeIn 0.3s ease;
      overflow: hidden;
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
      <div style="width:64px;height:64px;margin:0 auto 20px;">
        <svg width="64" height="64" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="phylax-bg-o" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
            <linearGradient id="phylax-spiral-o" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#phylax-bg-o)"/>
          <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
          <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-o)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
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

    const goBackBtn = overlay.querySelector('#phylaxGoBack');
    if (goBackBtn) {
      goBackBtn.addEventListener('click', () => {
        dismissOverlay();
        history.back();
      });
    }

    watchForNavigation();
  }

  // ═════════════════════════════════════════════════════════════════
  // BLOCK — Chat/DM specific (blocks conversation area, not platform)
  // ═════════════════════════════════════════════════════════════════

  function showChatBlock(decision) {
    dismissOverlay();
    blockedUrl = window.location.pathname + window.location.search.split('&t=')[0];

    // Prevent scrolling behind the overlay
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Build the overlay — covers the full screen so no content sticks out
    const overlay = document.createElement('div');
    overlay.id = 'phylax-overlay';

    overlay.style.cssText = `
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      background: rgba(5, 5, 10, 0.98); backdrop-filter: blur(16px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; animation: phylaxFadeIn 0.3s ease;
      overflow: hidden;
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes phylaxFadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    overlay.appendChild(style);

    const evidence = (decision.evidence || []).join(' ');

    const card = document.createElement('div');
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(255,80,80,0.35);
      border-radius: 20px; padding: 32px; max-width: 360px; width: 90%;
      text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    `;
    card.innerHTML = `
      <div style="width:56px;height:56px;margin:0 auto 16px;">
        <svg width="56" height="56" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="phylax-bg-e" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
            <linearGradient id="phylax-spiral-e" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#phylax-bg-e)"/>
          <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
          <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-e)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
        </svg>
      </div>
      <h2 style="font-size:18px;font-weight:700;color:white;margin:0 0 8px;">This conversation was flagged</h2>
      <p style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;margin:0 0 8px;">Phylax detected concerning messages in this chat.</p>
      <p style="font-size:13px;color:rgba(255,80,80,0.7);line-height:1.5;margin:0 0 20px;">Your parent has been notified.</p>
      <button id="phylaxChatGoBack" style="padding:10px 28px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:linear-gradient(135deg,#7C5CFF,rgba(124,92,255,0.8));color:white;box-shadow:0 4px 16px rgba(124,92,255,0.3);font-family:inherit;">Close conversation</button>
    `;

    overlay.appendChild(card);
    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    const chatGoBackBtn = overlay.querySelector('#phylaxChatGoBack');
    if (chatGoBackBtn) {
      chatGoBackBtn.addEventListener('click', () => {
        dismissOverlay();
        const domain = window.location.hostname;
        if (domain.includes('instagram.com')) {
          window.location.href = 'https://www.instagram.com/';
        } else if (domain.includes('discord.com')) {
          window.location.href = 'https://discord.com/channels/@me';
        } else {
          history.back();
        }
      });
    }

    // Send parent alert via background script
    notifyParent(decision);

    watchForNavigation();
  }

  /**
   * Find the chat/conversation area element on the page.
   * Used to position the block overlay precisely over the DM area.
   *
   * Platform-specific detection: each platform has its own DOM structure.
   * Returns null if no chat area found — the caller must handle fallback.
   * NEVER returns a full-page element like [role="main"] to avoid
   * violating the "Platform ≠ Content" invariant.
   */
  function findChatArea() {
    const domain = window.location.hostname;
    const path = window.location.pathname;

    // ── Instagram DMs ─────────────────────────────────────────────
    if (domain.includes('instagram.com') && path.includes('/direct')) {
      return findInstagramChatPane();
    }

    // ── WhatsApp Web ──────────────────────────────────────────────
    if (domain.includes('whatsapp.com')) {
      const waPane = document.querySelector('#main .copyable-area') ||
        document.querySelector('#main');
      if (waPane) return waPane;
    }

    // ── Discord ───────────────────────────────────────────────────
    if (domain.includes('discord.com')) {
      const dcChat = document.querySelector('[class*="chatContent-"]') ||
        document.querySelector('[class*="chat-"]');
      if (dcChat) return dcChat;
    }

    // ── Messenger ─────────────────────────────────────────────────
    if (domain.includes('messenger.com')) {
      // Target the message thread, not the entire [role="main"] wrapper
      const msgThread = document.querySelector('[data-scope="messages_table"]') ||
        document.querySelector('[role="main"] [role="grid"]');
      if (msgThread) return msgThread;
    }

    // ── Twitter/X DMs ─────────────────────────────────────────────
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      const dmArea = document.querySelector('[data-testid="DmActivityViewport"]') ||
        document.querySelector('[data-testid="DMConversation"]') ||
        document.querySelector('[data-testid="DmScrollerContainer"]');
      if (dmArea) return dmArea;
    }

    // ── Generic fallback (conservative) ───────────────────────────
    // Find the most likely chat scroll container. Penalize full-width
    // elements since chat threads are typically in a narrow column.
    // Limit search to shallow descendants to avoid scanning every div on the page.
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    if (!main) return null;
    const scrollables = main.querySelectorAll(':scope > div, :scope > div > div, :scope > div > div > div');
    let best = null;
    let bestScore = 0;
    for (const div of scrollables) {
      if (div.scrollHeight > div.clientHeight + 100 && div.childElementCount > 5) {
        const rect = div.getBoundingClientRect();
        // Full-width containers are page wrappers, not chat panes
        const widthPenalty = rect.width > window.innerWidth * 0.9 ? 0.2 : 1;
        const score = div.scrollHeight * div.childElementCount * widthPenalty;
        if (score > bestScore) { bestScore = score; best = div; }
      }
    }
    return best;
  }

  /**
   * Instagram-specific: find the conversation thread panel.
   * Instagram DMs have a multi-column layout: sidebar | conversation-list | thread.
   * We want the rightmost sizable panel that contains the actual messages.
   */
  function findInstagramChatPane() {
    // Strategy 1: Known semantic selectors
    const thread = document.querySelector('[role="listbox"]') ||
      document.querySelector('[role="grid"]');
    if (thread && thread.scrollHeight > 200) return thread;

    // Strategy 2: Layout-based detection
    // Find the conversation column by scanning for tall, right-positioned panels.
    // Limit to shallow descendants (3 levels deep) to avoid scanning thousands of divs.
    const main = document.querySelector('[role="main"]') || document.querySelector('main');
    if (!main) return null;

    const panels = main.querySelectorAll(':scope > div, :scope > div > div, :scope > section, :scope > div > section, :scope > div > div > div');
    let bestPanel = null;
    let bestScore = 0;
    const vw = window.innerWidth;

    for (const el of panels) {
      const rect = el.getBoundingClientRect();
      // Candidate must be: tall (>400px), reasonable width (250-75% viewport),
      // and positioned in the right portion of the screen (left > 25% viewport)
      if (rect.height > 400 && rect.width > 250 &&
        rect.width < vw * 0.75 &&
        rect.left > vw * 0.25) {
        // Prefer scrollable panels (message threads scroll)
        const scrollBonus = el.scrollHeight > el.clientHeight + 50 ? 3 : 1;
        // Prefer panels further right (conversation is rightmost column)
        const posBonus = rect.left / vw;
        const score = rect.height * scrollBonus * (1 + posBonus);
        if (score > bestScore) {
          bestScore = score;
          bestPanel = el;
        }
      }
    }

    return bestPanel; // null if nothing found — caller handles fallback
  }

  // ═════════════════════════════════════════════════════════════════
  // BLOCK — Video/Player specific (blocks player area, not entire page)
  // ═════════════════════════════════════════════════════════════════

  function showPlayerBlock(decision) {
    dismissOverlay();
    blockedUrl = window.location.pathname + window.location.search.split('&t=')[0];

    // Prevent scrolling behind the overlay
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'phylax-overlay';

    // Always cover the full screen — content should not be visible at all
    overlay.style.cssText = `
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      background: rgba(5, 5, 10, 0.98); backdrop-filter: blur(16px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; animation: phylaxFadeIn 0.3s ease;
      overflow: hidden;
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes phylaxFadeIn { from { opacity: 0; } to { opacity: 1; } }`;
    overlay.appendChild(style);

    const card = document.createElement('div');
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(124,92,255,0.25);
      border-radius: 20px; padding: 32px; max-width: 360px; width: 90%;
      text-align: center; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    `;
    card.innerHTML = `
      <div style="width:56px;height:56px;margin:0 auto 16px;">
        <svg width="56" height="56" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="phylax-bg-p" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
            <linearGradient id="phylax-spiral-p" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#phylax-bg-p)"/>
          <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
          <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-p)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
        </svg>
      </div>
      <h2 style="font-size:18px;font-weight:700;color:white;margin:0 0 8px;">Phylax is here to help</h2>
      <p style="font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;margin:0 0 20px;">This video isn't allowed by your family's safety settings.</p>
      <button id="phylaxPlayerGoBack" style="padding:10px 28px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;background:linear-gradient(135deg,#7C5CFF,rgba(124,92,255,0.8));color:white;box-shadow:0 4px 16px rgba(124,92,255,0.3);font-family:inherit;">Go Back</button>
    `;

    overlay.appendChild(card);
    safeAppendOverlay(overlay);
    currentOverlay = overlay;

    killAllMedia();
    mediaKillInterval = setInterval(killAllMedia, 300);

    const playerGoBackBtn = overlay.querySelector('#phylaxPlayerGoBack');
    if (playerGoBackBtn) {
      playerGoBackBtn.addEventListener('click', () => {
        dismissOverlay();
        history.back();
      });
    }

    watchForNavigation();
  }

  /**
   * Find the video player element on the current page.
   * Returns the player container for precise overlay positioning.
   */
  function findVideoPlayer() {
    const domain = window.location.hostname;

    // ── YouTube ───────────────────────────────────────────────────
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      // Shorts: the reel renderer is the player
      if (window.location.pathname.startsWith('/shorts')) {
        const shortsPlayer = document.querySelector('ytd-reel-video-renderer[is-active]') ||
          document.querySelector('ytd-reel-video-renderer');
        if (shortsPlayer) return shortsPlayer;
      }
      // Regular video: find the player container
      const player = document.querySelector('#movie_player') ||
        document.querySelector('ytd-player#ytd-player') ||
        document.querySelector('#player-container-inner') ||
        document.querySelector('#player-container') ||
        document.querySelector('#player');
      if (player) {
        const rect = player.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 150) return player;
      }
    }

    // ── TikTok ────────────────────────────────────────────────────
    if (domain.includes('tiktok.com')) {
      const player = document.querySelector('[class*="DivVideoContainer"]') ||
        document.querySelector('[class*="VideoPlayer"]');
      if (player) return player;
    }

    // ── Generic: find the largest video element's container ───────
    const video = document.querySelector('video');
    if (video) {
      let container = video.parentElement;
      for (let i = 0; i < 5 && container && container !== document.body; i++) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 200) return container;
        container = container.parentElement;
      }
      return video.parentElement;
    }

    return null;
  }

  /**
   * Send a parent alert notification through the background script.
   */
  function notifyParent(decision) {
    try {
      chrome.runtime.sendMessage({
        type: 'PHYLAX_PARENT_ALERT',
        alert: {
          alert_type: 'CHAT_THREAT',
          url: window.location.href,
          domain: window.location.hostname,
          platform: window.location.hostname.replace('www.', '').split('.')[0],
          reason_code: decision.reason_code || 'CHAT_GROOMING_SIGNAL',
          confidence: decision.confidence || 0,
          evidence: decision.evidence || [],
          timestamp: Date.now(),
          path: window.location.pathname,
        },
      });
    } catch { /* background not ready */ }
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
    // Kill all video/audio elements — pause, mute, remove src, and HIDE
    document.querySelectorAll('video, audio').forEach(el => {
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
        el.currentTime = 0;
        if (el.src) {
          el.removeAttribute('src');
          el.load();
        }
        // Remove all source children too
        el.querySelectorAll('source').forEach(s => s.remove());
        // Hide the element to prevent visual playback
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      } catch { /* ignore */ }
    });

    // YouTube-specific: kill mini player, autoplay, and player visibility
    const domain = window.location.hostname;
    if (domain.includes('youtube.com')) {
      try {
        // Dismiss YouTube mini player
        const miniPlayer = document.querySelector('ytd-miniplayer');
        if (miniPlayer) miniPlayer.style.display = 'none';
        // Hide the main player area
        const moviePlayer = document.querySelector('#movie_player');
        if (moviePlayer) {
          moviePlayer.style.visibility = 'hidden';
          // Try to use YouTube's internal API to stop
          if (typeof moviePlayer.stopVideo === 'function') moviePlayer.stopVideo();
          if (typeof moviePlayer.pauseVideo === 'function') moviePlayer.pauseVideo();
        }
        // Hide shorts player
        const shortsPlayer = document.querySelector('ytd-reel-video-renderer[is-active] video');
        if (shortsPlayer) {
          shortsPlayer.pause();
          shortsPlayer.style.display = 'none';
        }
        // Kill autoplay
        const autoplayToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
        if (autoplayToggle) autoplayToggle.click();
      } catch { /* ignore */ }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // SPA NAVIGATION WATCHER
  // ═════════════════════════════════════════════════════════════════

  function watchForNavigation() {
    teardownNavWatchers();

    const onNav = () => {
      const currentPath = window.location.pathname + window.location.search.split('&t=')[0];
      if (currentOverlay && currentPath !== blockedUrl) {
        dismissOverlay(true);
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
    // Start guard: re-attach if page framework removes our overlay
    startOverlayGuard(overlay);
  }

  // ── Overlay persistence guard ────────────────────────────────────
  // Page frameworks (YouTube Polymer, React, Vue) can remove elements
  // they don't own during re-renders. This watches for our overlay
  // being removed and re-attaches it.
  function startOverlayGuard(overlay) {
    stopOverlayGuard();
    overlayGuardObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const removed of m.removedNodes) {
          if (removed === overlay || removed.id === 'phylax-overlay') {
            // Re-attach only if we still consider this path blocked
            if (currentOverlay === overlay && blockedUrl) {
              const target = document.body || document.documentElement;
              if (target) target.appendChild(overlay);
            }
            return;
          }
        }
      }
    });
    const target = document.body || document.documentElement;
    if (target) {
      overlayGuardObserver.observe(target, { childList: true });
    }
  }

  function stopOverlayGuard() {
    if (overlayGuardObserver) {
      overlayGuardObserver.disconnect();
      overlayGuardObserver = null;
    }
  }

  function dismissOverlay(isNavigation) {
    // Only add the BLOCKED path to dismissed — never the new destination.
    // Bug fix: previously, navigating from blocked-A to harmful-B would
    // add B to dismissedPaths, preventing its overlay from ever showing.
    if (blockedUrl) {
      dismissedPaths[blockedUrl] = Date.now();
    }

    if (mediaKillInterval) {
      clearInterval(mediaKillInterval);
      mediaKillInterval = null;
    }
    teardownNavWatchers();
    stopOverlayGuard();
    blockedUrl = null;

    // Restore body scrolling
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    // Restore video/audio element visibility (hidden by killAllMedia)
    document.querySelectorAll('video, audio').forEach(el => {
      el.style.display = '';
      el.style.visibility = '';
    });
    // Restore YouTube-specific elements
    const miniPlayer = document.querySelector('ytd-miniplayer');
    if (miniPlayer) miniPlayer.style.display = '';
    const moviePlayer = document.querySelector('#movie_player');
    if (moviePlayer) moviePlayer.style.visibility = '';

    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }
    const existing = document.getElementById('phylax-overlay');
    if (existing) existing.remove();
  }

  // ═════════════════════════════════════════════════════════════════
  // PREDICTIVE RISK — Yellow shield indicator
  // ═════════════════════════════════════════════════════════════════

  /**
   * Show a subtle yellow shield icon for elevated (not critical) risk.
   * Used by the predictive risk intelligence system (Task 3).
   * Appears as a floating indicator — does NOT block interaction.
   */
  function showPredictiveWarning(decision) {
    // Don't show if a block overlay is already active
    if (currentOverlay) return;

    // Don't duplicate
    if (document.getElementById('phylax-predictive-shield')) return;

    const tooltip = decision.reasoning?.[0] || 'Early-stage manipulation pattern detected.';

    const container = document.createElement('div');
    container.id = 'phylax-predictive-shield';
    container.style.cssText = `
      position: fixed;
      bottom: 20px; right: 20px;
      z-index: 2147483640;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: phylaxShieldSlideIn 0.4s ease;
    `;

    container.innerHTML = `
      <style>
        @keyframes phylaxShieldSlideIn {
          from { transform: translateY(20px) scale(0.8); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes phylaxShieldPulse {
          0%, 100% { box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 4px 24px rgba(245, 158, 11, 0.6); }
        }
        #phylax-shield-btn {
          width: 48px; height: 48px;
          background: linear-gradient(135deg, #F59E0B, #D97706);
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          cursor: help;
          border: 2px solid rgba(255, 255, 255, 0.15);
          animation: phylaxShieldPulse 3s ease-in-out infinite;
          transition: transform 0.2s;
        }
        #phylax-shield-btn:hover { transform: scale(1.1); }
        #phylax-shield-tooltip {
          position: absolute;
          bottom: calc(100% + 12px);
          right: 0;
          background: #1a1a2e;
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-radius: 12px;
          padding: 12px 16px;
          color: white;
          font-size: 13px;
          line-height: 1.5;
          max-width: 280px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }
        #phylax-shield-btn:hover + #phylax-shield-tooltip,
        #phylax-shield-tooltip:hover {
          opacity: 1;
          pointer-events: auto;
        }
      </style>
      <div id="phylax-shield-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div id="phylax-shield-tooltip">
        <div style="font-weight: 600; margin-bottom: 4px; color: #F59E0B;">
          Phylax Safety Notice
        </div>
        <div style="color: rgba(255,255,255,0.7);">
          ${tooltip}
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.35);">
          Risk level: ${decision.risk_level || 'elevated'} &middot; Confidence: ${Math.round((decision.confidence || 0.5) * 100)}%
        </div>
      </div>
    `;

    safeAppendOverlay(container);

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      const el = document.getElementById('phylax-predictive-shield');
      if (el) {
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px) scale(0.8)';
        setTimeout(() => el.remove(), 500);
      }
    }, 15000);
  }

  // Listen for predictive risk warnings from background
  window.addEventListener('phylax-predictive-warning', (e) => {
    showPredictiveWarning(e.detail);
  });

  // Handle predictive warning messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PHYLAX_PREDICTIVE_WARNING') {
      showPredictiveWarning(message.decision);
    }
  });

  console.log('[Phylax Enforcer v3] Ready on:', host);
})();
