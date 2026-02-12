// Phylax Engine — Content Observer (v3: ContentObject Extraction)
// Injected on ALL pages. Builds structured ContentObjects and sends to background.
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  const host = window.location.hostname;
  if (host === 'phylax-landing.vercel.app' || host === 'localhost' || host === '127.0.0.1') return;

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

  const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
  const isTikTok = host.includes('tiktok.com');
  const isReddit = host.includes('reddit.com');

  // ── Context validity check ──────────────────────────────────

  function isContextValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // ── Pause after BLOCK ───────────────────────────────────────

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

  // ── Send event to background ────────────────────────────────

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
      if (response?.decision) handleDecision(response.decision);
    } catch {
      // Extension might not be ready
    }
  }

  // ── Handle decision ─────────────────────────────────────────

  function handleDecision(decision) {
    if (!decision || decision.decision === 'ALLOW' || decision.action === 'ALLOW') return;

    const now = Date.now();
    if (now - lastDecisionForwardTime < 1000) return;
    lastDecisionForwardTime = now;

    if (decision.decision === 'BLOCK' || decision.action === 'BLOCK') {
      lastBlockDecisionTime = now;
      lastBlockDecisionPath = window.location.pathname;
    }

    window.dispatchEvent(new CustomEvent('phylax-decision', { detail: decision }));
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTENT OBJECT EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  function extractContentObject() {
    const url = window.location.href;
    const domain = window.location.hostname;
    const path = window.location.pathname;

    // ── Universal extraction ────────────────────────────────
    const title = extractTitle();
    const description = extractDescription();
    const og = extractOGMeta();
    const schemaOrg = extractSchemaOrg();
    const headings = extractHeadings();
    const mainText = extractMainText();
    const visibleTextSample = mainText.slice(0, 2000);
    const keywords = extractKeywords();
    const language = document.documentElement.lang || 'unknown';
    const media = detectMedia();
    const ui = detectUIPatterns();

    // ── Platform-specific extraction ────────────────────────
    const platform = extractPlatformData(domain, path);

    // ── Content type inference ───────────────────────────────
    const contentType = inferContentType(domain, path, ui, platform, mainText);

    // ── SPA route key ───────────────────────────────────────
    const spaRouteKey = domain + path;

    return {
      url,
      domain,
      ts_ms: Date.now(),
      content_type: contentType,
      spa_route_key: spaRouteKey,
      title,
      description,
      headings,
      main_text: mainText,
      visible_text_sample: visibleTextSample,
      og,
      schema_org: schemaOrg,
      keywords,
      entities: [],
      language,
      media,
      ui,
      platform,
    };
  }

  // ── Title extraction ──────────────────────────────────────

  function extractTitle() {
    // Try structured h1 first, then document.title
    const h1 = document.querySelector('h1');
    const docTitle = document.title || '';

    if (isYouTube) {
      const ytTitle = document.querySelector(
        'h1.ytd-watch-metadata yt-formatted-string, ' +
        'h1.ytd-video-primary-info-renderer yt-formatted-string'
      );
      return ytTitle?.textContent?.trim() || docTitle.replace(/ - YouTube$/, '').trim();
    }

    return h1?.textContent?.trim() || docTitle;
  }

  // ── Description extraction ────────────────────────────────

  function extractDescription() {
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
    return ogDesc || metaDesc;
  }

  // ── OpenGraph meta extraction ─────────────────────────────

  function extractOGMeta() {
    return {
      title: document.querySelector('meta[property="og:title"]')?.content || '',
      desc: document.querySelector('meta[property="og:description"]')?.content || '',
      type: document.querySelector('meta[property="og:type"]')?.content || '',
      site: document.querySelector('meta[property="og:site_name"]')?.content || '',
    };
  }

  // ── Schema.org JSON-LD extraction ─────────────────────────

  function extractSchemaOrg() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        if (data['@type']) return data;
      }
    } catch {}
    return null;
  }

  // ── Headings extraction ───────────────────────────────────

  function extractHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    });
    return headings.slice(0, 20);
  }

  // ── Main text extraction (readability distillation) ───────

  function extractMainText() {
    const mainSelectors = ['main', 'article', '[role="main"]', '#content', '.content'];
    let root = null;
    for (const sel of mainSelectors) {
      root = document.querySelector(sel);
      if (root) break;
    }
    if (!root) root = document.body;
    if (!root) return '';

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName?.toLowerCase();
        if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {}
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
      if (text) {
        chunks.push(text);
        totalLength += text.length;
      }
    }
    return chunks.join(' ');
  }

  // ── Keywords extraction ───────────────────────────────────

  function extractKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    if (!meta?.content) return [];
    return meta.content.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }

  // ── Media detection ───────────────────────────────────────

  function detectMedia() {
    return {
      has_video: document.querySelectorAll('video').length > 0,
      has_audio: document.querySelectorAll('audio').length > 0,
      image_count: document.querySelectorAll('img').length,
    };
  }

  // ── UI pattern detection ──────────────────────────────────

  function detectUIPatterns() {
    const domain = window.location.hostname;
    const path = window.location.pathname;

    // Infinite scroll: feed pages on social platforms
    const feedDomains = ['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com'];
    const infiniteScroll = feedDomains.some(d => domain.includes(d)) ||
      (isYouTube && (path === '/' || path.startsWith('/feed')));

    // Autoplay
    const autoplay = isYouTube || isTikTok || domain.includes('twitch.tv');

    // Short-form content
    const shortForm = (isYouTube && path.startsWith('/shorts')) ||
      isTikTok ||
      (domain.includes('instagram.com') && path.startsWith('/reel'));

    // Recommendation rail
    const hasRecommendationRail = isYouTube && path.startsWith('/watch');

    // Login required
    const requiresLogin = domain.includes('discord.com') || domain.includes('whatsapp.com');

    return {
      infinite_scroll: infiniteScroll,
      autoplay,
      short_form: shortForm,
      has_recommendation_rail: hasRecommendationRail,
      requires_login: requiresLogin,
    };
  }

  // ── Platform-specific data extraction ─────────────────────

  function extractPlatformData(domain, path) {
    // YouTube
    if (isYouTube) {
      let objectKind = 'unknown';
      if (path.startsWith('/watch')) objectKind = 'video';
      else if (path.startsWith('/shorts')) objectKind = 'short';
      else if (path.startsWith('/@') || path.startsWith('/channel')) objectKind = 'channel';
      else if (path.startsWith('/playlist')) objectKind = 'playlist';
      else if (path.startsWith('/results')) objectKind = 'search';

      const channelEl = document.querySelector('#channel-name a, ytd-channel-name a, #owner #text a');
      const descEl = document.querySelector(
        '#description-inner, ytd-text-inline-expander #content, [id="description"] yt-formatted-string'
      );
      const tagMeta = document.querySelector('meta[name="keywords"]');

      return {
        name: 'youtube',
        object_kind: objectKind,
        channel_or_author: channelEl?.textContent?.trim() || '',
        transcript: null, // Future: extract from closed captions
        tags: tagMeta?.content?.split(',').map(t => t.trim()) || [],
        description: descEl?.textContent?.trim()?.slice(0, 2000) || '',
      };
    }

    // TikTok
    if (isTikTok) {
      return {
        name: 'tiktok',
        object_kind: path.includes('/video') ? 'video' : 'profile',
        channel_or_author: document.querySelector('[data-e2e="browse-username"]')?.textContent?.trim() || '',
        transcript: null,
        tags: [],
      };
    }

    // Reddit
    if (isReddit) {
      return {
        name: 'reddit',
        object_kind: path.includes('/comments/') ? 'comment_thread' : 'post',
        channel_or_author: document.querySelector('[data-testid="subreddit-name"]')?.textContent?.trim() || '',
        transcript: null,
        tags: [],
      };
    }

    // Instagram
    if (domain.includes('instagram.com')) {
      return {
        name: 'instagram',
        object_kind: path.startsWith('/reel') ? 'short' : path.startsWith('/p/') ? 'post' : 'profile',
        channel_or_author: '',
        transcript: null,
        tags: [],
      };
    }

    // Twitter/X
    if (domain.includes('twitter.com') || domain.includes('x.com')) {
      return {
        name: 'x',
        object_kind: path.includes('/status/') ? 'post' : 'profile',
        channel_or_author: '',
        transcript: null,
        tags: [],
      };
    }

    return {
      name: 'none',
      object_kind: 'unknown',
      channel_or_author: '',
      transcript: null,
      tags: [],
    };
  }

  // ── Content type inference (deterministic) ────────────────

  function inferContentType(domain, path, ui, platform, mainText) {
    if (platform?.name && (platform.object_kind === 'short' || platform.object_kind === 'video')) {
      return 'video';
    }

    // Search layout
    const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com'];
    if (searchDomains.some(d => domain.includes(d)) && window.location.href.includes('q=')) {
      return 'search';
    }
    if (isYouTube && path.startsWith('/results')) return 'search';

    // Feed
    if (ui.infinite_scroll && !path.startsWith('/watch') && !path.startsWith('/shorts')) {
      return 'feed';
    }

    // Chat
    const chatDomains = ['discord.com', 'whatsapp.com', 'telegram.org', 'messenger.com'];
    if (chatDomains.some(d => domain.includes(d))) return 'chat';

    // Forum
    if (isReddit) return 'forum';

    // Article (long-form text)
    const wordCount = (mainText || '').split(/\s+/).length;
    if (wordCount > 250) return 'article';

    return 'unknown';
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT SENDING
  // ═══════════════════════════════════════════════════════════════

  // ── PAGE_LOAD: send full ContentObject ────────────────────

  function onPageLoad() {
    const contentObject = extractContentObject();

    sendEvent('PAGE_LOAD', {
      content_object: contentObject,
      // Backward compat: keep text/title for legacy pipeline
      title: contentObject.title,
      text: buildCanonicalText(contentObject),
      lang: contentObject.language,
      content_type_hint: contentObject.content_type,
    });
  }

  function buildCanonicalText(co) {
    const parts = [co.title];
    if (co.description) parts.push(co.description);
    if (co.platform?.description) parts.push(co.platform.description);
    if (co.platform?.channel_or_author) parts.push('channel: ' + co.platform.channel_or_author);
    if (co.platform?.tags?.length) parts.push(co.platform.tags.join(', '));
    if (co.headings?.length) parts.push(co.headings.join(' '));
    parts.push(co.main_text);
    return parts.join(' ').slice(0, MAX_TEXT_LENGTH);
  }

  // ── DOM_TEXT_SNAPSHOT: refresh ContentObject ───────────────

  function takeSnapshot() {
    if (!isActive) return;
    if (shouldPauseEvents()) return;

    const now = Date.now();
    if (now - lastSnapshotTime < MIN_SNAPSHOT_INTERVAL) return;

    const contentObject = extractContentObject();
    if (contentObject.main_text.length < 10) return;

    lastSnapshotTime = now;
    sendEvent('DOM_TEXT_SNAPSHOT', {
      content_object: contentObject,
      title: contentObject.title,
      text: buildCanonicalText(contentObject),
      lang: contentObject.language,
      content_type_hint: contentObject.content_type,
    });
  }

  // ── SEARCH_QUERY ──────────────────────────────────────────

  function detectSearchQuery() {
    const url = new URL(window.location.href);
    const searchParams = ['q', 'query', 'search', 'search_query', 'p'];
    for (const param of searchParams) {
      const query = url.searchParams.get(param);
      if (query) {
        sendEvent('SEARCH_QUERY', { query, text: query, engine: host });
        return;
      }
    }
  }

  // ── FEED_SCROLL ───────────────────────────────────────────

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

  // ── LINK_CLICK ────────────────────────────────────────────

  function onClick(e) {
    const target = e.target.closest('a');
    if (target?.href) {
      sendEvent('LINK_CLICK', {
        href: target.href,
        text: target.textContent?.trim()?.slice(0, 200) || '',
      });
    }
  }

  // ── FORM_SUBMIT ───────────────────────────────────────────

  function onFormSubmit(e) {
    sendEvent('FORM_SUBMIT', {
      action: e.target.action || '',
      method: e.target.method || 'get',
    });
  }

  // ── IDLE / ACTIVE ─────────────────────────────────────────

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

  // ── DOM Mutation Observer ─────────────────────────────────

  let mutationDebounce = null;
  const mutationDebounceMs = isYouTube ? MUTATION_DEBOUNCE_YOUTUBE : MUTATION_DEBOUNCE_DEFAULT;

  const domObserver = new MutationObserver(() => {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(takeSnapshot, mutationDebounceMs);
  });

  // ── Listen for decisions from background ──────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_ENFORCE_DECISION') {
      handleDecision(message.decision);
    }
    if (message.type === 'PHYLAX_RULES_UPDATED') {
      onPageLoad();
    }
  });

  // ── TIME_TICK heartbeat ───────────────────────────────────

  setInterval(() => {
    if (!isActive) return;
    if (shouldPauseEvents()) return;
    sendEvent('TIME_TICK', {
      session_seconds: Math.round((Date.now() - pageStartTime) / 1000),
      scroll_count: scrollCount,
    });
  }, 60000);

  // ── Initialize ────────────────────────────────────────────

  function init() {
    // Immediate lightweight check (domain gate — no DOM needed)
    sendEvent('PAGE_LOAD', {
      title: '',
      text: '',
      lang: 'unknown',
      content_type_hint: inferContentType(host, window.location.pathname, {}, {}, ''),
    });

    // Full ContentObject after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onPageLoad);
    } else {
      onPageLoad();
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
      domObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        domObserver.observe(document.body, { childList: true, subtree: true });
      });
    }

    // YouTube SPA navigation detector
    if (isYouTube) {
      let lastYTPath = window.location.href;
      const ytNavObserver = new MutationObserver(() => {
        if (window.location.href !== lastYTPath) {
          lastYTPath = window.location.href;
          lastBlockDecisionTime = 0;
          lastBlockDecisionPath = null;
          setTimeout(onPageLoad, 1500);
        }
      });
      const ytContainer = document.querySelector('title') || document.head;
      if (ytContainer) {
        ytNavObserver.observe(ytContainer, { childList: true, subtree: true, characterData: true });
      }
    }

    console.log('[Phylax Observer v3] Active on:', host);
  }

  init();
})();
