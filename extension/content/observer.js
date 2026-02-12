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
  const MUTATION_DEBOUNCE_DEFAULT = 3000;  // Default MutationObserver debounce
  const MUTATION_DEBOUNCE_YOUTUBE = 10000; // YouTube-specific: 10s debounce (YouTube constantly mutates DOM)
  const MIN_SNAPSHOT_INTERVAL = 12000;     // Minimum time between any two snapshots
  const BLOCKED_PAUSE_MS = 15000;          // Pause sending events for 15s after a BLOCK decision

  let lastScrollTime = 0;
  let scrollCount = 0;
  let pageStartTime = Date.now();
  let snapshotTimer = null;
  let isActive = true;
  let lastSnapshotTime = 0;           // Timestamp of last snapshot sent
  let lastBlockDecisionTime = 0;       // Timestamp of last BLOCK decision received
  let lastBlockDecisionPath = null;    // Path that was blocked
  let lastDecisionForwardTime = 0;     // Dedup: timestamp of last forwarded decision

  // ── Context validity check ──────────────────────────────────
  function isContextValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // ── Should we pause event sending? ─────────────────────────
  // After a BLOCK decision, pause periodic events (snapshots, ticks, scrolls)
  // to prevent re-triggering the pipeline. Resume when the URL path changes
  // (user navigated away) or after the pause window expires.

  function shouldPauseEvents() {
    if (!lastBlockDecisionTime) return false;
    const now = Date.now();
    const elapsed = now - lastBlockDecisionTime;
    // If user navigated away from the blocked path, stop pausing
    if (lastBlockDecisionPath && window.location.pathname !== lastBlockDecisionPath) {
      lastBlockDecisionTime = 0;
      lastBlockDecisionPath = null;
      return false;
    }
    // Pause for BLOCKED_PAUSE_MS after a block decision on the same path
    return elapsed < BLOCKED_PAUSE_MS;
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

      if (response?.decision) {
        handleDecision(response.decision);
      }
    } catch (e) {
      // Extension might not be ready or context invalidated
    }
  }

  // ── Handle decision from background ─────────────────────────

  function handleDecision(decision) {
    if (!decision || decision.action === 'ALLOW') return;

    // Dedup: don't forward multiple decisions within 1s (a single background
    // decision can arrive via both the sendEvent response AND the
    // PHYLAX_ENFORCE_DECISION message from onCompleted/onCommitted).
    const now = Date.now();
    if (now - lastDecisionForwardTime < 1000) return;
    lastDecisionForwardTime = now;

    // Track BLOCK decisions so we can pause event sending
    if (decision.action === 'BLOCK') {
      lastBlockDecisionTime = now;
      lastBlockDecisionPath = window.location.pathname;
    }

    // Forward to enforcer (runs in same content script context)
    window.dispatchEvent(new CustomEvent('phylax-decision', {
      detail: decision,
    }));
  }

  // ── YouTube metadata extraction ─────────────────────────────
  // Extracts structured content object: video title, channel, description, tags

  function extractYouTubeMetadata() {
    const meta = {};

    // Video title — try structured element first, then document title
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer yt-formatted-string');
    meta.videoTitle = titleEl?.textContent?.trim() || document.title?.replace(/ - YouTube$/, '').trim() || '';

    // Channel name
    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a, #owner #text a');
    meta.channel = channelEl?.textContent?.trim() || '';

    // Description
    const descEl = document.querySelector('#description-inner, ytd-text-inline-expander #content, [id="description"] yt-formatted-string');
    meta.description = descEl?.textContent?.trim()?.slice(0, 2000) || '';

    // Tags from meta
    const tagMeta = document.querySelector('meta[name="keywords"]');
    meta.tags = tagMeta?.content || '';

    // Category from meta
    const catMeta = document.querySelector('meta[property="og:video:tag"], meta[itemprop="genre"]');
    meta.category = catMeta?.content || '';

    return meta;
  }

  function buildYouTubeText(meta) {
    // Combine metadata into a rich text representation for the classifier
    const parts = [meta.videoTitle];
    if (meta.channel) parts.push('channel: ' + meta.channel);
    if (meta.description) parts.push(meta.description);
    if (meta.tags) parts.push(meta.tags);
    if (meta.category) parts.push(meta.category);
    return parts.join(' ');
  }

  // ── PAGE_LOAD event ─────────────────────────────────────────

  function onPageLoad() {
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const contentTypeHint = detectContentTypeHint();

    // YouTube: extract structured video metadata
    let text = title + ' ' + metaDesc;
    let ytMeta = null;
    if (isYouTube && window.location.pathname === '/watch') {
      ytMeta = extractYouTubeMetadata();
      text = buildYouTubeText(ytMeta);
    }

    sendEvent('PAGE_LOAD', {
      title,
      text,
      lang: document.documentElement.lang || 'unknown',
      content_type_hint: contentTypeHint,
      ...(ytMeta ? { youtube: ytMeta } : {}),
    });
  }

  // ── DOM_TEXT_SNAPSHOT event ──────────────────────────────────

  function takeSnapshot() {
    if (!isActive) return;

    // Don't send snapshots while paused after a BLOCK decision
    if (shouldPauseEvents()) return;

    // Enforce minimum interval between snapshots (prevents MutationObserver flood)
    const now = Date.now();
    if (now - lastSnapshotTime < MIN_SNAPSHOT_INTERVAL) return;

    const text = extractVisibleText();
    if (text.length < 10) return; // Skip near-empty pages

    lastSnapshotTime = now;

    // YouTube: use structured metadata instead of raw DOM text
    let snapshotText = text;
    let ytMeta = null;
    if (isYouTube && window.location.pathname === '/watch') {
      ytMeta = extractYouTubeMetadata();
      snapshotText = buildYouTubeText(ytMeta);
    }

    sendEvent('DOM_TEXT_SNAPSHOT', {
      text: snapshotText.slice(0, MAX_TEXT_LENGTH),
      title: document.title || '',
      lang: document.documentElement.lang || 'unknown',
      content_type_hint: detectContentTypeHint(),
      ...(ytMeta ? { youtube: ytMeta } : {}),
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

    // Don't send scroll events while paused after a BLOCK decision
    if (shouldPauseEvents()) return;

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
  const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
  const mutationDebounceMs = isYouTube ? MUTATION_DEBOUNCE_YOUTUBE : MUTATION_DEBOUNCE_DEFAULT;

  const observer = new MutationObserver(() => {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      // Re-snapshot after significant DOM changes
      // (takeSnapshot() has its own MIN_SNAPSHOT_INTERVAL guard)
      takeSnapshot();
    }, mutationDebounceMs);
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
    // Don't send ticks while paused after a BLOCK decision
    if (shouldPauseEvents()) return;
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

    // YouTube SPA navigation: re-evaluate when navigating between videos
    if (isYouTube) {
      let lastYTPath = window.location.href;
      const ytNavObserver = new MutationObserver(() => {
        if (window.location.href !== lastYTPath) {
          lastYTPath = window.location.href;
          // Reset block state on navigation
          lastBlockDecisionTime = 0;
          lastBlockDecisionPath = null;
          // Wait for YouTube to render new video metadata
          setTimeout(onPageLoad, 1500);
        }
      });
      const ytContainer = document.querySelector('title') || document.head;
      if (ytContainer) {
        ytNavObserver.observe(ytContainer, { childList: true, subtree: true, characterData: true });
      }
    }

    console.log('[Phylax Observer] Active on:', window.location.hostname);
  }

  init();
})();
