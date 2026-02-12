// Phylax Engine — Content Observer v3 (ContentObject Extraction)
// Injected on ALL pages. Extracts rich ContentObject signals from DOM,
// sends to background pipeline for classification.
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;
  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

  // ── Config ──────────────────────────────────────────────────────
  const SNAPSHOT_INTERVAL = 15000;
  const SCROLL_DEBOUNCE = 2000;
  const MAX_TEXT_LENGTH = 8000;
  const MUTATION_DEBOUNCE_DEFAULT = 3000;
  const MUTATION_DEBOUNCE_YOUTUBE = 10000;
  const MIN_SNAPSHOT_INTERVAL = 12000;
  const BLOCKED_PAUSE_MS = 15000;

  let lastScrollTime = 0;
  let scrollCount = 0;
  let pageStartTime = Date.now();
  let snapshotTimer = null;
  let isActive = true;
  let lastSnapshotTime = 0;
  let lastBlockDecisionTime = 0;
  let lastBlockDecisionPath = null;
  let lastDecisionForwardTime = 0;
  let lastSentContentId = null;

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

  function extractContentObject() {
    const co = {
      url: window.location.href,
      domain: window.location.hostname,
      ts_ms: Date.now(),
      spa_route_key: window.location.pathname + window.location.search,

      // Text signals
      title: extractTitle(),
      description: extractDescription(),
      headings: extractHeadings(),
      main_text: extractMainText(),
      visible_text_sample: extractVisibleTextSample(),

      // Metadata
      og: extractOGMeta(),
      schema_org: extractSchemaOrg(),
      keywords: extractKeywords(),
      language: document.documentElement.lang || 'unknown',

      // Media
      media: detectMedia(),

      // UI patterns
      ui: detectUIPatterns(),

      // Platform-specific
      platform: detectPlatform(),

      // Content type (inferred)
      content_type: 'unknown',
    };

    // Infer content type
    co.content_type = inferContentType(co);

    return co;
  }

  // ── Title extraction ────────────────────────────────────────────
  function extractTitle() {
    // Prefer document.title, fall back to first h1
    const title = document.title || '';
    if (title) return title;
    const h1 = document.querySelector('h1');
    return h1?.textContent?.trim() || '';
  }

  // ── Description extraction ──────────────────────────────────────
  function extractDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta?.content || '';
  }

  // ── Headings extraction ─────────────────────────────────────────
  function extractHeadings() {
    const headings = [];
    const els = document.querySelectorAll('h1, h2, h3');
    for (let i = 0; i < Math.min(els.length, 10); i++) {
      const text = els[i].textContent?.trim();
      if (text && text.length > 2) headings.push(text.slice(0, 200));
    }
    return headings;
  }

  // ── OG meta extraction ─────────────────────────────────────────
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

  // ── Schema.org JSON-LD extraction ───────────────────────────────
  function extractSchemaOrg() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data) return data;
      }
    } catch { /* ignore parse errors */ }
    return null;
  }

  // ── Keywords extraction (cheap) ─────────────────────────────────
  function extractKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    if (meta?.content) {
      return meta.content.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
    return [];
  }

  // ── Main text extraction (readability-style) ────────────────────
  function extractMainText() {
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '#main-content'];
    let root = null;

    for (const sel of mainSelectors) {
      root = document.querySelector(sel);
      if (root) break;
    }
    if (!root) root = document.body;
    if (!root) return '';

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'svg', 'path', 'nav', 'footer', 'header'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip hidden elements
          try {
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
          } catch { /* ignore */ }
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

  // ── Visible text sample (first N chars from main container) ─────
  function extractVisibleTextSample() {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    if (!main) return '';
    return (main.innerText || '').slice(0, 2000);
  }

  // ── Media detection ─────────────────────────────────────────────
  function detectMedia() {
    return {
      has_video: document.querySelectorAll('video').length > 0,
      has_audio: document.querySelectorAll('audio').length > 0,
      image_count: document.querySelectorAll('img').length,
    };
  }

  // ── UI pattern detection ────────────────────────────────────────
  function detectUIPatterns() {
    const body = document.body;
    if (!body) return { infinite_scroll: false, autoplay: false, short_form: false, has_recommendation_rail: false, requires_login: false };

    const url = window.location.href;
    const domain = window.location.hostname;

    // Infinite scroll: check for sentinel elements or very long pages
    const infiniteScroll = body.scrollHeight > window.innerHeight * 4 ||
      !!document.querySelector('[data-infinite-scroll], .infinite-scroll, [infinite-scroll]');

    // Autoplay: check for video elements with autoplay
    const autoplay = !!document.querySelector('video[autoplay]') ||
      (domain.includes('youtube.com') && url.includes('/watch'));

    // Short form: YouTube Shorts, TikTok, Instagram Reels
    const shortForm = url.includes('/shorts') || domain.includes('tiktok.com') ||
      url.includes('/reel');

    // Recommendation rail (YouTube sidebar, etc.)
    const hasRecommendationRail = !!document.querySelector(
      '#related, #secondary, .recommendation, [data-recommendations]'
    );

    // Login wall
    const requiresLogin = !!document.querySelector(
      '[data-login-required], .login-wall, .signup-wall'
    );

    return { infinite_scroll: infiniteScroll, autoplay, short_form: shortForm, has_recommendation_rail: hasRecommendationRail, requires_login: requiresLogin };
  }

  // ── Platform detection ──────────────────────────────────────────
  function detectPlatform() {
    const domain = window.location.hostname;
    const url = window.location.href;
    const path = window.location.pathname;

    // YouTube
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      return extractYouTubePlatform(path, url);
    }

    // TikTok
    if (domain.includes('tiktok.com')) {
      return {
        name: 'tiktok',
        object_kind: path.includes('/video') ? 'video' : path.startsWith('/@') ? 'profile' : 'post',
        channel_or_author: extractTikTokAuthor(),
      };
    }

    // Instagram
    if (domain.includes('instagram.com')) {
      return {
        name: 'instagram',
        object_kind: path.includes('/reel') ? 'short' : path.includes('/p/') ? 'post' : 'profile',
      };
    }

    // Reddit
    if (domain.includes('reddit.com')) {
      return {
        name: 'reddit',
        object_kind: path.includes('/comments/') ? 'comment_thread' : 'post',
      };
    }

    // Twitter/X
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      return {
        name: 'x',
        object_kind: path.includes('/status/') ? 'post' : 'profile',
      };
    }

    return { name: 'none' };
  }

  function extractYouTubePlatform(path, url) {
    let objectKind = 'video';
    if (path.startsWith('/watch')) objectKind = 'video';
    else if (path.startsWith('/shorts')) objectKind = 'short';
    else if (path.startsWith('/channel') || path.startsWith('/@')) objectKind = 'channel';
    else if (path.startsWith('/playlist')) objectKind = 'playlist';
    else if (path.startsWith('/results')) objectKind = 'search';
    else objectKind = 'video';

    const channelEl = document.querySelector(
      '#channel-name a, ytd-channel-name a, #owner-name a, .ytd-video-owner-renderer a'
    );
    const channel = channelEl?.textContent?.trim() || '';

    // Tags from meta
    const tagsMeta = document.querySelector('meta[name="keywords"]');
    const tags = tagsMeta?.content?.split(',').map(t => t.trim()).filter(Boolean) || [];

    return {
      name: 'youtube',
      object_kind: objectKind,
      channel_or_author: channel,
      tags,
    };
  }

  function extractTikTokAuthor() {
    const el = document.querySelector('[data-e2e="user-title"], .author-uniqueId');
    return el?.textContent?.trim() || '';
  }

  // ── Content type inference (deterministic) ──────────────────────
  function inferContentType(content) {
    const platform = content.platform;
    const ui = content.ui;
    const url = content.url;
    const domain = content.domain;

    // Platform-specific
    if (platform?.name === 'youtube') {
      if (platform.object_kind === 'short') return 'video';
      if (platform.object_kind === 'video') return 'video';
      if (platform.object_kind === 'search') return 'search';
      if (platform.object_kind === 'channel') return 'feed';
      return 'video';
    }
    if (platform?.name === 'tiktok') return 'video';

    // Search detection
    const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com'];
    if (searchDomains.some(d => domain.includes(d)) && url.includes('q=')) return 'search';

    // Feed detection: repeated cards + infinite scroll
    if (ui?.infinite_scroll && hasRepeatedCards(8)) return 'feed';

    // Article: substantial main text
    const wordCount = (content.main_text || '').split(/\s+/).length;
    if (wordCount > 250) return 'article';

    // Chat platforms
    const chatDomains = ['discord.com', 'whatsapp.com', 'telegram.org', 'messenger.com'];
    if (chatDomains.some(d => domain.includes(d))) return 'chat';

    // Forum
    const forumDomains = ['reddit.com', 'stackexchange.com', 'stackoverflow.com'];
    if (forumDomains.some(d => domain.includes(d))) return 'forum';

    // Commerce
    const commerceDomains = ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com'];
    if (commerceDomains.some(d => domain.includes(d))) return 'commerce';

    return 'unknown';
  }

  function hasRepeatedCards(minCount) {
    // Heuristic: look for repeated card-like elements
    const selectors = [
      'article', '.card', '[data-card]', '.post', '.item', '.feed-item',
      'ytd-rich-item-renderer', 'ytd-video-renderer',
    ];
    for (const sel of selectors) {
      if (document.querySelectorAll(sel).length >= minCount) return true;
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
    } catch { /* Extension might not be ready */ }
  }

  function handleDecision(decision) {
    if (!decision || decision.decision === 'ALLOW') {
      // Also check legacy 'action' field for backward compat
      if (!decision || decision.action === 'ALLOW') return;
    }

    const now = Date.now();
    if (now - lastDecisionForwardTime < 1000) return;
    lastDecisionForwardTime = now;

    // Track BLOCK decisions for pause logic
    const action = decision.decision || decision.action;
    if (action === 'BLOCK') {
      lastBlockDecisionTime = now;
      lastBlockDecisionPath = window.location.pathname;
    }

    window.dispatchEvent(new CustomEvent('phylax-decision', { detail: decision }));
  }

  // ═════════════════════════════════════════════════════════════════
  // PAGE EVENTS
  // ═════════════════════════════════════════════════════════════════

  function onPageLoad() {
    const content = extractContentObject();
    sendEvent('PAGE_LOAD', {
      content_object: content,
      // Legacy fields for backward compat
      title: content.title,
      text: content.title + ' ' + content.description + ' ' + (content.main_text || '').slice(0, 3000),
      lang: content.language,
      content_type_hint: content.content_type,
    });
  }

  function takeSnapshot() {
    if (!isActive) return;
    if (shouldPauseEvents()) return;

    const now = Date.now();
    if (now - lastSnapshotTime < MIN_SNAPSHOT_INTERVAL) return;

    const content = extractContentObject();
    if ((content.main_text || '').length < 10 && (content.title || '').length < 5) return;

    lastSnapshotTime = now;
    sendEvent('DOM_TEXT_SNAPSHOT', {
      content_object: content,
      // Legacy fields
      text: (content.main_text || '').slice(0, MAX_TEXT_LENGTH),
      title: content.title || '',
      lang: content.language,
      content_type_hint: content.content_type,
    });
  }

  // ── Search query detection ──────────────────────────────────────
  function detectSearchQuery() {
    const url = new URL(window.location.href);
    const searchParams = ['q', 'query', 'search', 'search_query', 'p'];
    for (const param of searchParams) {
      const query = url.searchParams.get(param);
      if (query) {
        sendEvent('SEARCH_QUERY', { query, text: query, engine: window.location.hostname });
        return;
      }
    }
  }

  // ── Scroll tracking ─────────────────────────────────────────────
  function onScroll() {
    const now = Date.now();
    scrollCount++;
    if (now - lastScrollTime < SCROLL_DEBOUNCE) return;
    lastScrollTime = now;
    if (shouldPauseEvents()) return;

    const scrollDepth = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight || 1);
    sendEvent('FEED_SCROLL', {
      scroll_depth: Math.round(scrollDepth * 100) / 100,
      scroll_count: scrollCount,
      session_seconds: Math.round((now - pageStartTime) / 1000),
    });
  }

  // ── Click tracking ──────────────────────────────────────────────
  function onClick(e) {
    const target = e.target.closest('a');
    if (target?.href) {
      sendEvent('LINK_CLICK', {
        href: target.href,
        text: target.textContent?.trim()?.slice(0, 200) || '',
      });
    }
  }

  // ── Form submit tracking ────────────────────────────────────────
  function onFormSubmit(e) {
    sendEvent('FORM_SUBMIT', { action: e.target.action || '', method: e.target.method || 'get' });
  }

  // ── Idle/Active detection ───────────────────────────────────────
  let idleTimer = null;
  const IDLE_TIMEOUT = 120000;

  function resetIdleTimer() {
    if (!isActive) {
      isActive = true;
      sendEvent('ACTIVE', {});
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      isActive = false;
      sendEvent('IDLE', { idle_after_seconds: IDLE_TIMEOUT / 1000 });
    }, IDLE_TIMEOUT);
  }

  // ── YouTube SPA navigation detection ────────────────────────────
  // YouTube is a SPA — watch for title changes to detect video navigation
  let lastObservedTitle = document.title;
  function setupYouTubeTitleObserver() {
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) return;

    const titleEl = document.querySelector('title');
    if (!titleEl) return;

    const titleObserver = new MutationObserver(() => {
      const newTitle = document.title;
      if (newTitle && newTitle !== lastObservedTitle) {
        lastObservedTitle = newTitle;
        // Title changed = new video navigation. Re-extract and re-classify.
        setTimeout(() => {
          lastBlockDecisionTime = 0;
          lastBlockDecisionPath = null;
          onPageLoad();
        }, 500); // Small delay for DOM to settle
      }
    });

    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // ── MutationObserver for dynamic content ────────────────────────
  const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
  const mutationDebounceMs = isYouTube ? MUTATION_DEBOUNCE_YOUTUBE : MUTATION_DEBOUNCE_DEFAULT;
  let mutationDebounce = null;

  const domObserver = new MutationObserver(() => {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      takeSnapshot();
    }, mutationDebounceMs);
  });

  // ── Listen for decisions from background ────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') {
      handleDecision(message.decision);
    }
    if (message.type === 'PHYLAX_RULES_UPDATED') {
      onPageLoad();
    }
  });

  // ── TIME_TICK heartbeat ─────────────────────────────────────────
  setInterval(() => {
    if (!isActive) return;
    if (shouldPauseEvents()) return;
    sendEvent('TIME_TICK', {
      session_seconds: Math.round((Date.now() - pageStartTime) / 1000),
      scroll_count: scrollCount,
    });
  }, 60000);

  // ── Initialize ──────────────────────────────────────────────────
  function init() {
    // Immediate lightweight event at document_start
    sendEvent('PAGE_LOAD', {
      title: '',
      text: '',
      lang: 'unknown',
      content_type_hint: inferContentType({
        platform: detectPlatform(),
        ui: { infinite_scroll: false, autoplay: false, short_form: false },
        url: window.location.href,
        domain: window.location.hostname,
        main_text: '',
      }),
    });

    // Full extraction after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        onPageLoad();
        setupYouTubeTitleObserver();
      });
    } else {
      onPageLoad();
      setupYouTubeTitleObserver();
    }

    detectSearchQuery();
    snapshotTimer = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('submit', onFormSubmit, { capture: true });
    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    // Mutation observer
    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: false });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        domObserver.observe(document.body, { childList: true, subtree: true, characterData: false });
      });
    }

    console.log('[Phylax Observer v3] Active on:', host);
  }

  init();
})();
