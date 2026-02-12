// Phylax Engine — Content Observer
// Injected on ALL pages. Observes DOM, extracts events, sends to background for scoring.
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  // Don't observe extension pages
  if (window.location.protocol === 'chrome-extension:') return;

  // Don't observe the Phylax dashboard
  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  const SNAPSHOT_INTERVAL = 15000;  // DOM text snapshot every 15s
  const SCROLL_DEBOUNCE = 2000;     // Scroll event debounce
  const MAX_TEXT_LENGTH = 5000;     // Max text to extract per snapshot

  let lastScrollTime = 0;
  let scrollCount = 0;
  let pageStartTime = Date.now();
  let snapshotTimer = null;
  let isActive = true;

  // ── Send event to background ────────────────────────────────

  async function sendEvent(eventType, payload = {}) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_PROCESS_EVENT',
        event: {
          event_type: eventType,
          url: window.location.href,
          domain: window.location.hostname,
          payload,
        },
      });

      if (response?.decision) {
        handleDecision(response.decision);
      }
    } catch (e) {
      // Extension might not be ready
    }
  }

  // ── Handle decision from background ─────────────────────────

  function handleDecision(decision) {
    if (!decision || decision.action === 'ALLOW') return;

    // Forward to enforcer (runs in same content script context)
    window.dispatchEvent(new CustomEvent('phylax-decision', {
      detail: decision,
    }));
  }

  // ── PAGE_LOAD event ─────────────────────────────────────────

  function onPageLoad() {
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

    sendEvent('PAGE_LOAD', {
      title,
      text: title + ' ' + metaDesc,
      lang: document.documentElement.lang || 'unknown',
      content_type_hint: detectContentTypeHint(),
    });
  }

  // ── DOM_TEXT_SNAPSHOT event ──────────────────────────────────

  function takeSnapshot() {
    if (!isActive) return;

    const text = extractVisibleText();
    if (text.length < 10) return; // Skip near-empty pages

    sendEvent('DOM_TEXT_SNAPSHOT', {
      text: text.slice(0, MAX_TEXT_LENGTH),
      title: document.title || '',
      lang: document.documentElement.lang || 'unknown',
      content_type_hint: detectContentTypeHint(),
    });
  }

  function extractVisibleText() {
    // Get text from the main content area, avoiding nav/footer/sidebar
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];
    let root = null;

    for (const sel of mainSelectors) {
      root = document.querySelector(sel);
      if (root) break;
    }

    if (!root) root = document.body;
    if (!root) return '';

    // Extract visible text, skipping hidden elements
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip script, style, hidden elements
          const tag = parent.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip hidden elements
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          const text = node.textContent?.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const chunks = [];
    let totalLength = 0;
    let node;

    while ((node = walker.nextNode()) && totalLength < MAX_TEXT_LENGTH) {
      const text = node.textContent.trim();
      if (text) {
        chunks.push(text);
        totalLength += text.length;
      }
    }

    return chunks.join(' ');
  }

  // ── SEARCH_QUERY event ──────────────────────────────────────

  function detectSearchQuery() {
    const url = new URL(window.location.href);
    const searchParams = ['q', 'query', 'search', 'search_query', 'p'];

    for (const param of searchParams) {
      const query = url.searchParams.get(param);
      if (query) {
        sendEvent('SEARCH_QUERY', {
          query,
          text: query,
          engine: window.location.hostname,
        });
        return;
      }
    }
  }

  // ── FEED_SCROLL event ───────────────────────────────────────

  function onScroll() {
    const now = Date.now();
    scrollCount++;

    if (now - lastScrollTime < SCROLL_DEBOUNCE) return;
    lastScrollTime = now;

    const scrollDepth = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1);

    sendEvent('FEED_SCROLL', {
      scroll_depth: Math.round(scrollDepth * 100) / 100,
      scroll_count: scrollCount,
      session_seconds: Math.round((now - pageStartTime) / 1000),
    });
  }

  // ── CLICK / LINK_CLICK events ───────────────────────────────

  function onClick(e) {
    const target = e.target.closest('a');
    if (target?.href) {
      sendEvent('LINK_CLICK', {
        href: target.href,
        text: target.textContent?.trim()?.slice(0, 200) || '',
      });
    }
  }

  // ── FORM_SUBMIT event ───────────────────────────────────────

  function onFormSubmit(e) {
    sendEvent('FORM_SUBMIT', {
      action: e.target.action || '',
      method: e.target.method || 'get',
    });
  }

  // ── IDLE / ACTIVE detection ─────────────────────────────────

  let idleTimer = null;
  const IDLE_TIMEOUT = 120000; // 2 minutes

  function resetIdleTimer() {
    if (!isActive) {
      isActive = true;
      sendEvent('ACTIVE', {});
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      isActive = false;
      sendEvent('IDLE', {
        idle_after_seconds: IDLE_TIMEOUT / 1000,
      });
    }, IDLE_TIMEOUT);
  }

  // ── Content type detection ──────────────────────────────────

  function detectContentTypeHint() {
    const domain = window.location.hostname;
    const url = window.location.href;

    const feedDomains = ['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com'];
    if (feedDomains.some(d => domain.includes(d))) return 'feed';

    const chatDomains = ['discord.com', 'whatsapp.com', 'telegram.org', 'messenger.com'];
    if (chatDomains.some(d => domain.includes(d))) return 'chat';

    const videoDomains = ['youtube.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com'];
    if (videoDomains.some(d => domain.includes(d))) return 'video';

    const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com'];
    if (searchDomains.some(d => domain.includes(d)) && url.includes('q=')) return 'search';

    const gameDomains = ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'];
    if (gameDomains.some(d => domain.includes(d))) return 'game';

    return 'unknown';
  }

  // ── DOM Mutation Observer (for dynamic content) ─────────────

  let mutationDebounce = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      // Re-snapshot after significant DOM changes
      takeSnapshot();
    }, 3000);
  });

  // ── Listen for real-time decisions from background ──────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') {
      handleDecision(message.decision);
    }
    if (message.type === 'PHYLAX_RULES_UPDATED') {
      // Re-evaluate with new rules
      onPageLoad();
    }
  });

  // ── TIME_TICK heartbeat ─────────────────────────────────────

  setInterval(() => {
    if (!isActive) return;
    sendEvent('TIME_TICK', {
      session_seconds: Math.round((Date.now() - pageStartTime) / 1000),
      scroll_count: scrollCount,
    });
  }, 60000); // Every minute

  // ── Initialize ──────────────────────────────────────────────

  function init() {
    // IMMEDIATE check at document_start — block before page renders
    // Send a lightweight PAGE_LOAD event right away (no DOM access needed)
    sendEvent('PAGE_LOAD', {
      title: '',
      text: '',
      lang: 'unknown',
      content_type_hint: detectContentTypeHint(),
    });

    // Full page load event after DOM is ready (for richer content analysis)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onPageLoad);
    } else {
      onPageLoad();
    }

    // Search query detection
    detectSearchQuery();

    // Periodic DOM snapshots
    snapshotTimer = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);

    // Scroll tracking
    window.addEventListener('scroll', onScroll, { passive: true });

    // Click tracking
    document.addEventListener('click', onClick, { capture: true });

    // Form submit tracking
    document.addEventListener('submit', onFormSubmit, { capture: true });

    // Idle detection
    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    // Mutation observer for dynamic content
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: false,
      });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: false,
        });
      });
    }

    console.log('[Phylax Observer] Active on:', window.location.hostname);
  }

  init();
})();
