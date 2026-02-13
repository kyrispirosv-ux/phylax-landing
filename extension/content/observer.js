// Phylax Engine — Content Observer v3.1 (Low-Latency ContentObject Extraction)
// Injected on ALL pages at document_start.
// Three-phase extraction for sub-second blocking:
//   Phase 1 (~100-300ms): <head> parsed → title + meta + OG + keywords → classify
//   Phase 2 (DOMContentLoaded): full body content → final classify
//   Phase 3 (periodic): mutation/snapshot re-checks
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;
  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  // ── Config (tuned for <1s blocking) ─────────────────────────────
  const SNAPSHOT_INTERVAL = 5000;
  const SCROLL_DEBOUNCE = 2000;
  const MAX_TEXT_LENGTH = 8000;
  const MUTATION_DEBOUNCE_MS = 800;
  const MIN_SNAPSHOT_INTERVAL = 3000;
  const BLOCKED_PAUSE_MS = 5000;

  let lastScrollTime = 0;
  let scrollCount = 0;
  let pageStartTime = Date.now();
  let snapshotTimer = null;
  let isActive = true;
  let lastSnapshotTime = 0;
  let lastBlockDecisionTime = 0;
  let lastBlockDecisionPath = null;
  let lastDecisionForwardTime = 0;
  let headExtracted = false;
  let fullExtracted = false;

  // ── Context validity ────────────────────────────────────────────
  function isContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  function shouldPauseEvents() {
    if (!lastBlockDecisionTime) return false;
    const now = Date.now();
    if (lastBlockDecisionPath && window.location.pathname !== lastBlockDecisionPath) {
      lastBlockDecisionTime = 0;
      lastBlockDecisionPath = null;
      return false;
    }
    return (now - lastBlockDecisionTime) < BLOCKED_PAUSE_MS;
  }

  // ═════════════════════════════════════════════════════════════════
  // CONTENT OBJECT EXTRACTION
  // ═════════════════════════════════════════════════════════════════

  // Lightweight: only head signals (no body traversal) — fast
  function extractHeadContent() {
    const co = {
      url: window.location.href,
      domain: window.location.hostname,
      ts_ms: Date.now(),
      spa_route_key: window.location.pathname + window.location.search,
      title: document.title || '',
      description: extractDescription(),
      headings: [],
      main_text: '',
      visible_text_sample: '',
      og: extractOGMeta(),
      schema_org: null,
      keywords: extractKeywords(),
      language: document.documentElement.lang || 'unknown',
      media: { has_video: false, has_audio: false, image_count: 0 },
      ui: detectUIPatterns(),
      platform: detectPlatform(),
      content_type: 'unknown',
    };
    co.content_type = inferContentType(co);
    return co;
  }

  // Full extraction: body content included — heavier
  function extractContentObject() {
    const co = {
      url: window.location.href,
      domain: window.location.hostname,
      ts_ms: Date.now(),
      spa_route_key: window.location.pathname + window.location.search,
      title: extractTitle(),
      description: extractDescription(),
      headings: extractHeadings(),
      main_text: extractMainText(),
      visible_text_sample: extractVisibleTextSample(),
      og: extractOGMeta(),
      schema_org: extractSchemaOrg(),
      keywords: extractKeywords(),
      language: document.documentElement.lang || 'unknown',
      media: detectMedia(),
      ui: detectUIPatterns(),
      platform: detectPlatform(),
      content_type: 'unknown',
    };
    co.content_type = inferContentType(co);
    return co;
  }

  // ── Extractors ──────────────────────────────────────────────────

  function extractTitle() {
    const title = document.title || '';
    if (title) return title;
    const h1 = document.querySelector('h1');
    return h1?.textContent?.trim() || '';
  }

  function extractDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta?.content || '';
  }

  function extractHeadings() {
    const headings = [];
    const els = document.querySelectorAll('h1, h2, h3');
    for (let i = 0; i < Math.min(els.length, 10); i++) {
      const text = els[i].textContent?.trim();
      if (text && text.length > 2) headings.push(text.slice(0, 200));
    }
    return headings;
  }

  function extractOGMeta() {
    const og = {};
    const title = document.querySelector('meta[property="og:title"]');
    const desc = document.querySelector('meta[property="og:description"]');
    const type = document.querySelector('meta[property="og:type"]');
    const site = document.querySelector('meta[property="og:site_name"]');
    if (title?.content) og.title = title.content;
    if (desc?.content) og.desc = desc.content;
    if (type?.content) og.type = type.content;
    if (site?.content) og.site = site.content;
    return og;
  }

  function extractSchemaOrg() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data) return data;
      }
    } catch { /* ignore */ }
    return null;
  }

  function extractKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    if (meta?.content) return meta.content.split(',').map(k => k.trim()).filter(k => k.length > 0);
    return [];
  }

  function extractMainText() {
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '#main-content'];
    let root = null;
    for (const sel of mainSelectors) { root = document.querySelector(sel); if (root) break; }
    if (!root) root = document.body;
    if (!root) return '';

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName?.toLowerCase();
        if (['script', 'style', 'noscript', 'svg', 'path', 'nav', 'footer', 'header'].includes(tag)) return NodeFilter.FILTER_REJECT;
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        } catch { /* ignore */ }
        const text = node.textContent?.trim();
        if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const chunks = [];
    let totalLength = 0;
    let node;
    while ((node = walker.nextNode()) && totalLength < MAX_TEXT_LENGTH) {
      const text = node.textContent.trim();
      if (text) { chunks.push(text); totalLength += text.length; }
    }
    return chunks.join(' ');
  }

  function extractVisibleTextSample() {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    if (!main) return '';
    return (main.innerText || '').slice(0, 2000);
  }

  function detectMedia() {
    return {
      has_video: document.querySelectorAll('video').length > 0,
      has_audio: document.querySelectorAll('audio').length > 0,
      image_count: document.querySelectorAll('img').length,
    };
  }

  function detectUIPatterns() {
    const body = document.body;
    if (!body) return { infinite_scroll: false, autoplay: false, short_form: false, has_recommendation_rail: false, requires_login: false };
    const url = window.location.href;
    const domain = window.location.hostname;
    return {
      infinite_scroll: body.scrollHeight > window.innerHeight * 4 || !!document.querySelector('[data-infinite-scroll], .infinite-scroll, [infinite-scroll]'),
      autoplay: !!document.querySelector('video[autoplay]') || (domain.includes('youtube.com') && url.includes('/watch')),
      short_form: url.includes('/shorts') || domain.includes('tiktok.com') || url.includes('/reel'),
      has_recommendation_rail: !!document.querySelector('#related, #secondary, .recommendation, [data-recommendations]'),
      requires_login: !!document.querySelector('[data-login-required], .login-wall, .signup-wall'),
    };
  }

  function detectPlatform() {
    const domain = window.location.hostname;
    const path = window.location.pathname;
    const url = window.location.href;
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) return extractYouTubePlatform(path, url);
    if (domain.includes('tiktok.com')) return { name: 'tiktok', object_kind: path.includes('/video') ? 'video' : path.startsWith('/@') ? 'profile' : 'post', channel_or_author: extractTikTokAuthor() };
    if (domain.includes('instagram.com')) return { name: 'instagram', object_kind: path.includes('/reel') ? 'short' : path.includes('/p/') ? 'post' : 'profile' };
    if (domain.includes('reddit.com')) return { name: 'reddit', object_kind: path.includes('/comments/') ? 'comment_thread' : 'post' };
    if (domain.includes('twitter.com') || domain.includes('x.com')) return { name: 'x', object_kind: path.includes('/status/') ? 'post' : 'profile' };
    return { name: 'none' };
  }

  function extractYouTubePlatform(path, url) {
    let objectKind = 'video';
    if (path.startsWith('/watch')) objectKind = 'video';
    else if (path.startsWith('/shorts')) objectKind = 'short';
    else if (path.startsWith('/channel') || path.startsWith('/@')) objectKind = 'channel';
    else if (path.startsWith('/playlist')) objectKind = 'playlist';
    else if (path.startsWith('/results')) objectKind = 'search';
    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a, #owner-name a, .ytd-video-owner-renderer a');
    const tagsMeta = document.querySelector('meta[name="keywords"]');
    return { name: 'youtube', object_kind: objectKind, channel_or_author: channelEl?.textContent?.trim() || '', tags: tagsMeta?.content?.split(',').map(t => t.trim()).filter(Boolean) || [] };
  }

  function extractTikTokAuthor() {
    const el = document.querySelector('[data-e2e="user-title"], .author-uniqueId');
    return el?.textContent?.trim() || '';
  }

  function inferContentType(content) {
    const platform = content.platform;
    const ui = content.ui;
    const domain = content.domain;
    const url = content.url;
    if (platform?.name === 'youtube') { return platform.object_kind === 'search' ? 'search' : platform.object_kind === 'channel' ? 'feed' : 'video'; }
    if (platform?.name === 'tiktok') return 'video';
    if (['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com'].some(d => domain.includes(d)) && url.includes('q=')) return 'search';
    if (ui?.infinite_scroll && hasRepeatedCards(8)) return 'feed';
    if ((content.main_text || '').split(/\s+/).length > 250) return 'article';
    if (['discord.com', 'whatsapp.com', 'telegram.org', 'messenger.com'].some(d => domain.includes(d))) return 'chat';
    if (['reddit.com', 'stackexchange.com', 'stackoverflow.com'].some(d => domain.includes(d))) return 'forum';
    if (['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com'].some(d => domain.includes(d))) return 'commerce';
    return 'unknown';
  }

  function hasRepeatedCards(n) {
    for (const sel of ['article', '.card', '[data-card]', '.post', '.item', '.feed-item', 'ytd-rich-item-renderer', 'ytd-video-renderer']) {
      if (document.querySelectorAll(sel).length >= n) return true;
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════
  // EVENT SENDING
  // ═════════════════════════════════════════════════════════════════

  async function sendEvent(eventType, payload = {}) {
    if (!isContextValid()) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_PROCESS_EVENT',
        event: { event_type: eventType, url: window.location.href, domain: window.location.hostname, payload },
      });
      if (response?.decision) handleDecision(response.decision);
    } catch { /* Extension might not be ready */ }
  }

  function handleDecision(decision) {
    if (!decision) return;
    const action = decision.decision || decision.action;
    if (action === 'ALLOW') return;
    const now = Date.now();
    if (now - lastDecisionForwardTime < 200) return;
    lastDecisionForwardTime = now;
    if (action === 'BLOCK') { lastBlockDecisionTime = now; lastBlockDecisionPath = window.location.pathname; }
    window.dispatchEvent(new CustomEvent('phylax-decision', { detail: decision }));
  }

  // ═════════════════════════════════════════════════════════════════
  // RESPOND TO BACKGROUND REQUESTS
  // ═════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') handleDecision(message.decision);
    if (message.type === 'PHYLAX_RULES_UPDATED') { fullExtracted = false; headExtracted = false; onPageLoad(); }
    if (message.type === 'PHYLAX_REQUEST_CONTENT') {
      const content = document.body ? extractContentObject() : extractHeadContent();
      sendResponse({ content_object: content });
      return true;
    }
  });

  // ═════════════════════════════════════════════════════════════════
  // THREE-PHASE PAGE LOAD
  // ═════════════════════════════════════════════════════════════════

  function sendContentEvent(content, phase) {
    sendEvent('PAGE_LOAD', {
      content_object: content,
      title: content.title,
      text: content.title + ' ' + content.description + ' ' + (content.og?.desc || '') + ' ' +
            (content.keywords || []).join(' ') + ' ' + (content.main_text || '').slice(0, 3000),
      lang: content.language,
      content_type_hint: content.content_type,
      _phase: phase,
    });
  }

  // Phase 1: <head> parsed — title + meta available (~100-300ms after nav)
  function onHeadReady() {
    if (headExtracted) return;
    if (shouldPauseEvents()) return;
    headExtracted = true;
    const content = extractHeadContent();
    if (content.title || content.description || content.og?.title || content.keywords?.length) {
      sendContentEvent(content, 'head');
    }
  }

  // Phase 2: Full DOM ready — body content
  function onPageLoad() {
    if (shouldPauseEvents()) return;
    fullExtracted = true;
    const content = extractContentObject();
    sendContentEvent(content, 'full');
  }

  function takeSnapshot() {
    if (!isActive || shouldPauseEvents()) return;
    const now = Date.now();
    if (now - lastSnapshotTime < MIN_SNAPSHOT_INTERVAL) return;
    const content = extractContentObject();
    if ((content.main_text || '').length < 10 && (content.title || '').length < 5) return;
    lastSnapshotTime = now;
    sendEvent('DOM_TEXT_SNAPSHOT', {
      content_object: content,
      text: (content.main_text || '').slice(0, MAX_TEXT_LENGTH),
      title: content.title || '',
      lang: content.language,
      content_type_hint: content.content_type,
    });
  }

  function detectSearchQuery() {
    try {
      const url = new URL(window.location.href);
      for (const param of ['q', 'query', 'search', 'search_query', 'p']) {
        const query = url.searchParams.get(param);
        if (query) { sendEvent('SEARCH_QUERY', { query, text: query, engine: window.location.hostname }); return; }
      }
    } catch { /* ignore */ }
  }

  function onScroll() {
    const now = Date.now(); scrollCount++;
    if (now - lastScrollTime < SCROLL_DEBOUNCE) return;
    lastScrollTime = now;
    if (shouldPauseEvents()) return;
    sendEvent('FEED_SCROLL', { scroll_depth: Math.round(window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1) * 100) / 100, scroll_count: scrollCount, session_seconds: Math.round((now - pageStartTime) / 1000) });
  }

  // ═════════════════════════════════════════════════════════════════
  // YOUTUBE SPA — immediate title-change detection
  // ═════════════════════════════════════════════════════════════════

  let lastObservedTitle = document.title;
  function setupYouTubeTitleObserver() {
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) return;
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    const titleObserver = new MutationObserver(() => {
      const newTitle = document.title;
      if (newTitle && newTitle !== lastObservedTitle) {
        lastObservedTitle = newTitle;
        lastBlockDecisionTime = 0;
        lastBlockDecisionPath = null;
        headExtracted = false;
        fullExtracted = false;
        // Classify with title immediately (no delay)
        onHeadReady();
        // Full extraction after minimal DOM settle (150ms)
        setTimeout(() => onPageLoad(), 150);
      }
    });
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // ── <head> observer: fires as soon as title/meta are parsed ─────
  function setupHeadObserver() {
    const head = document.head || document.querySelector('head');
    if (!head) {
      const docObserver = new MutationObserver(() => {
        const h = document.head;
        if (h) { docObserver.disconnect(); watchHead(h); }
      });
      docObserver.observe(document.documentElement, { childList: true });
      return;
    }
    watchHead(head);
  }

  function watchHead(head) {
    if (document.title) { onHeadReady(); return; }
    const headObserver = new MutationObserver(() => {
      if (document.title || document.querySelector('meta[property="og:title"]')) {
        headObserver.disconnect();
        onHeadReady();
      }
    });
    headObserver.observe(head, { childList: true, subtree: true });
    setTimeout(() => { headObserver.disconnect(); if (!headExtracted) onHeadReady(); }, 500);
  }

  // ── MutationObserver for dynamic content ────────────────────────
  let mutationDebounce = null;
  const domObserver = new MutationObserver(() => {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => { takeSnapshot(); }, MUTATION_DEBOUNCE_MS);
  });

  // ── Idle/Active ─────────────────────────────────────────────────
  let idleTimer = null;
  function resetIdleTimer() {
    if (!isActive) { isActive = true; sendEvent('ACTIVE', {}); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { isActive = false; sendEvent('IDLE', { idle_after_seconds: 120 }); }, 120000);
  }

  // ── TIME_TICK ───────────────────────────────────────────────────
  setInterval(() => {
    if (!isActive || shouldPauseEvents()) return;
    sendEvent('TIME_TICK', { session_seconds: Math.round((Date.now() - pageStartTime) / 1000), scroll_count: scrollCount });
  }, 60000);

  // ═════════════════════════════════════════════════════════════════
  // INIT
  // ═════════════════════════════════════════════════════════════════

  function init() {
    // Phase 1: watch <head> for title/meta (fires ~100-300ms)
    setupHeadObserver();

    // Phase 2: full extraction after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { onPageLoad(); setupYouTubeTitleObserver(); });
    } else {
      onPageLoad();
      setupYouTubeTitleObserver();
    }

    detectSearchQuery();
    snapshotTimer = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', (e) => { const t = e.target.closest('a'); if (t?.href) sendEvent('LINK_CLICK', { href: t.href, text: t.textContent?.trim()?.slice(0, 200) || '' }); }, { capture: true });
    document.addEventListener('submit', (e) => { sendEvent('FORM_SUBMIT', { action: e.target.action || '', method: e.target.method || 'get' }); }, { capture: true });
    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => document.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    if (document.body) domObserver.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', () => { domObserver.observe(document.body, { childList: true, subtree: true }); });

    console.log('[Phylax Observer v3.1] Active on:', host);
  }

  init();
})();
