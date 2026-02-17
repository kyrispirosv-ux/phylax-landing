// Phylax SafeGuard — Search Query Interceptor v1.0
//
// Intercepts search queries on major search engines BEFORE execution.
// Classifies the query and blocks harmful-intent searches.
//
// Flow:
//   1. Detect search engine page (Google, Bing, YouTube, DuckDuckGo, Yahoo)
//   2. Hook search form submission and URL navigation
//   3. Send query to background for classification via classify_search_risk
//   4. If blocked: prevent search, show overlay, notify parent
//   5. If allowed: search proceeds normally
//
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;
  const host = window.location.hostname;

  // Only activate on search engines
  const SEARCH_ENGINES = {
    'www.google.com':       { formSel: 'form[action="/search"]', inputSel: 'input[name="q"], textarea[name="q"]', param: 'q' },
    'google.com':           { formSel: 'form[action="/search"]', inputSel: 'input[name="q"], textarea[name="q"]', param: 'q' },
    'www.bing.com':         { formSel: 'form#sb_form',           inputSel: 'input[name="q"]',  param: 'q' },
    'bing.com':             { formSel: 'form#sb_form',           inputSel: 'input[name="q"]',  param: 'q' },
    'duckduckgo.com':       { formSel: 'form#search_form',      inputSel: 'input[name="q"]',  param: 'q' },
    'www.duckduckgo.com':   { formSel: 'form#search_form',      inputSel: 'input[name="q"]',  param: 'q' },
    'search.yahoo.com':     { formSel: 'form',                  inputSel: 'input[name="p"]',  param: 'p' },
    'www.youtube.com':      { formSel: 'form#search-form',      inputSel: 'input#search',     param: 'search_query' },
    'youtube.com':          { formSel: 'form#search-form',      inputSel: 'input#search',     param: 'search_query' },
  };

  const config = SEARCH_ENGINES[host];
  if (!config) return; // Not a search engine — exit

  // ── Context validity ────────────────────────────────────────────
  function isContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  // ── State ───────────────────────────────────────────────────────
  let isIntercepting = false;
  let blockOverlay = null;
  let lastBlockedQuery = null;

  // ═════════════════════════════════════════════════════════════════
  // SEARCH FORM INTERCEPTION
  // ═════════════════════════════════════════════════════════════════

  /**
   * Extract the current search query from the input field.
   */
  function getCurrentQuery() {
    const input = document.querySelector(config.inputSel);
    return input?.value?.trim() || '';
  }

  /**
   * Extract search query from the URL (for page-load interception).
   */
  function getQueryFromURL() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(config.param)?.trim() || '';
    } catch { return ''; }
  }

  /**
   * Send the query to background for classification.
   * Returns { decision, risk_score, category, reasoning, blocked_reason }.
   */
  async function classifyQuery(query) {
    if (!isContextValid()) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_CLASSIFY_SEARCH',
        query,
      });
      return response?.classification || null;
    } catch (err) {
      console.warn('[Phylax Search] Classification failed:', err.message);
      return null;
    }
  }

  /**
   * Intercept form submission.
   * If the query is harmful, prevent submission and show block overlay.
   */
  async function onFormSubmit(event) {
    const query = getCurrentQuery();
    if (!query || query.length < 3) return; // Too short — let it through
    if (query === lastBlockedQuery) {
      // Same query was already blocked — prevent re-submission
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    // Prevent the form from submitting while we classify
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    isIntercepting = true;

    const classification = await classifyQuery(query);
    if (!classification || classification.decision === 'allow' || classification.decision === 'warn') {
      // Allow the search — resubmit the form
      isIntercepting = false;
      const form = event.target.closest('form') || document.querySelector(config.formSel);
      if (form) {
        // Use native submit to bypass our listener
        const nativeSubmit = HTMLFormElement.prototype.submit;
        nativeSubmit.call(form);
      }
      return;
    }

    // BLOCKED — show overlay
    isIntercepting = false;
    lastBlockedQuery = query;
    showBlockOverlay(query, classification);

    // Notify background to alert parent
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SEARCH_BLOCKED',
          query: query.slice(0, 200), // Truncate for privacy
          classification,
          url: window.location.href,
          domain: host,
        });
      } catch { /* silent */ }
    }
  }

  /**
   * Hook the search form's submit event.
   */
  function hookSearchForm() {
    const forms = config.formSel
      ? document.querySelectorAll(config.formSel)
      : document.querySelectorAll('form');

    for (const form of forms) {
      if (form.dataset.phylaxHooked) continue;
      form.dataset.phylaxHooked = 'true';
      form.addEventListener('submit', onFormSubmit, true); // Capture phase
    }

    // Also hook keyboard Enter on the search input
    const inputs = document.querySelectorAll(config.inputSel);
    for (const input of inputs) {
      if (input.dataset.phylaxHooked) continue;
      input.dataset.phylaxHooked = 'true';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const fakeEvent = {
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
            stopImmediatePropagation: () => e.stopImmediatePropagation(),
            target: input,
          };
          onFormSubmit(fakeEvent);
        }
      }, true);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // PAGE-LOAD INTERCEPTION (for direct URL navigation / back button)
  // ═════════════════════════════════════════════════════════════════

  /**
   * Check the current URL's search query on page load.
   * If the user navigated directly to a blocked search, show overlay.
   */
  async function checkCurrentURL() {
    const query = getQueryFromURL();
    if (!query || query.length < 3) return;

    const classification = await classifyQuery(query);
    if (!classification || classification.decision !== 'block') return;

    lastBlockedQuery = query;
    showBlockOverlay(query, classification);

    // Notify background
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SEARCH_BLOCKED',
          query: query.slice(0, 200),
          classification,
          url: window.location.href,
          domain: host,
        });
      } catch { /* silent */ }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // BLOCK OVERLAY UI
  // ═════════════════════════════════════════════════════════════════

  /**
   * Show the block overlay for a harmful search query.
   * Covers the search results area (not full page if possible).
   */
  function showBlockOverlay(query, classification) {
    dismissOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'phylax-search-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(5, 5, 10, 0.96); backdrop-filter: blur(16px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes phylaxFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      #phylax-search-card { animation: phylaxFadeIn 0.3s ease; }
    `;
    overlay.appendChild(style);

    const reasonText = classification.blocked_reason || 'harmful content detected';
    const categoryText = classification.category || 'restricted';

    const card = document.createElement('div');
    card.id = 'phylax-search-card';
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(255,80,80,0.3);
      border-radius: 24px; padding: 48px; max-width: 420px; width: 90%;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    card.innerHTML = `
      <div style="width:72px;height:72px;margin:0 auto 24px;">
        <svg width="72" height="72" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="phylax-bg-s" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
            <linearGradient id="phylax-spiral-s" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
            <linearGradient id="phylax-text-s" x1="120" y1="420" x2="392" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#E8D5A0"/><stop offset="0.5" stop-color="#C9A84C"/><stop offset="1" stop-color="#E8D5A0"/></linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#phylax-bg-s)"/>
          <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
          <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-s)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
          <text x="256" y="425" text-anchor="middle" font-family="'Palatino Linotype','Book Antiqua',Palatino,Georgia,'Times New Roman',serif" font-weight="600" font-size="56" letter-spacing="18" fill="url(#phylax-text-s)">PHYLAX</text>
        </svg>
      </div>
      <h2 style="font-size:22px;font-weight:700;color:white;margin:0 0 12px;">Search Blocked</h2>
      <p style="font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;margin:0 0 8px;">
        Reason: <span style="color:rgba(255,255,255,0.7);font-weight:600;">${escapeHTML(reasonText)}</span>
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.35);margin:0 0 32px;">
        Parent notified
      </p>
      <button id="phylax-search-back" style="
        padding:12px 32px;border-radius:12px;font-size:15px;font-weight:600;
        cursor:pointer;border:none;
        background:linear-gradient(135deg,#7C5CFF,rgba(124,92,255,0.8));
        color:white;box-shadow:0 4px 16px rgba(124,92,255,0.3);
        font-family:inherit;transition:all 0.2s;
      ">Go Back</button>
    `;

    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);
    blockOverlay = overlay;

    // Go back button
    overlay.querySelector('#phylax-search-back').addEventListener('click', () => {
      dismissOverlay();
      // Clear the search input
      const input = document.querySelector(config.inputSel);
      if (input) {
        input.value = '';
        input.focus();
      }
      lastBlockedQuery = null;
    });
  }

  function dismissOverlay() {
    if (blockOverlay) {
      blockOverlay.remove();
      blockOverlay = null;
    }
  }

  function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ═════════════════════════════════════════════════════════════════
  // INIT
  // ═════════════════════════════════════════════════════════════════

  function init() {
    // Hook search forms after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        hookSearchForm();
        checkCurrentURL();
      });
    } else {
      hookSearchForm();
      checkCurrentURL();
    }

    // Re-hook on mutations (search engines are SPAs)
    const observer = new MutationObserver(() => {
      hookSearchForm();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    // URL change tracking for SPA navigation
    let lastHref = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        lastBlockedQuery = null;
        dismissOverlay();
        hookSearchForm();
        checkCurrentURL();
      }
    }, 1000);

    console.log('[Phylax Search Interceptor v1.0] Active on ' + host);
  }

  init();
})();
