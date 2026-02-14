// Phylax Engine — Content Observer v3.0 (Low-Latency ContentObject Extraction + Chat Sender Attribution)
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

  // ── Exempt email / productivity domains ────────────────────────
  // Email is personal communication — scanning it produces rampant
  // false positives (spam summaries, phishing warnings, marketing
  // emails all contain scam/violence/drug keywords).
  const EXEMPT_DOMAINS = [
    'mail.google.com', 'inbox.google.com',
    'outlook.live.com', 'outlook.office.com', 'outlook.office365.com',
    'mail.yahoo.com',
    'mail.proton.me', 'mail.protonmail.com',
    'mail.zoho.com',
    'mail.aol.com',
    'fastmail.com',
    'calendar.google.com', 'contacts.google.com',
    'drive.google.com', 'docs.google.com',
    'sheets.google.com', 'slides.google.com',
  ];
  if (EXEMPT_DOMAINS.some(d => host === d || host.endsWith('.' + d))) return;

  // ── Config (tuned for <1s blocking) ─────────────────────────────
  const SNAPSHOT_INTERVAL = 5000;
  const SCROLL_DEBOUNCE = 2000;
  const MAX_TEXT_LENGTH = 8000;
  const MUTATION_DEBOUNCE_MS = 400;
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

  // YouTube SPA navigation tracking
  let lastYouTubeVideoId = null;
  let lastYouTubeDescription = '';
  let youtubeContentUpdateTimer = null;

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
      chat: null,
    };
    co.content_type = inferContentType(co);

    // YouTube video: use targeted extraction to avoid stale sidebar/recommendation content.
    // The generic extractMainText() walks the entire <main> element which on YouTube includes
    // the recommendation sidebar (#secondary) and comments — these contain text from OTHER
    // videos and cause false positives (e.g., gambling recs bleeding into a music video's score).
    if (co.platform?.name === 'youtube' &&
        (co.content_type === 'video' || co.platform?.object_kind === 'video' || co.platform?.object_kind === 'short')) {
      const ytText = extractYouTubeMainText();
      if (ytText.length > 0) {
        co.main_text = ytText;
      }
    }

    // If this is a chat context, extract sender-attributed messages
    if (co.content_type === 'chat') {
      co.chat = extractChatMessages();
      // Override main_text with contact-only text for grooming detection.
      // The pipeline should score the CONTACT's words, not the child's.
      if (co.chat && co.chat.contact_text) {
        co.main_text = co.chat.contact_text;
      }
    }

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

    // Cache visibility per element to avoid repeated getComputedStyle calls.
    // getComputedStyle forces layout recalculation — on large pages (1000+ text nodes)
    // this is the single biggest latency hotspot (50-200ms).
    const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'path', 'nav', 'footer', 'header']);
    const visibilityCache = new WeakMap();

    function isVisible(el) {
      if (visibilityCache.has(el)) return visibilityCache.get(el);
      // Walk up the tree — if any ancestor is hidden, all descendants are hidden
      let node = el;
      let visible = true;
      const uncached = [];
      while (node && node !== root) {
        if (visibilityCache.has(node)) {
          visible = visibilityCache.get(node);
          break;
        }
        uncached.push(node);
        if (SKIP_TAGS.has(node.tagName?.toLowerCase())) { visible = false; break; }
        try {
          const s = window.getComputedStyle(node);
          if (s.display === 'none' || s.visibility === 'hidden') { visible = false; break; }
        } catch { /* ignore */ }
        node = node.parentElement;
      }
      // Cache the result for all nodes we traversed
      for (const n of uncached) visibilityCache.set(n, visible);
      return visible;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName?.toLowerCase())) return NodeFilter.FILTER_REJECT;
        const text = node.textContent?.trim();
        if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
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
    // Try semantic elements first, then broader containers.
    // innerText is simpler than TreeWalker and works reliably on JS-rendered pages.
    const candidates = [
      document.querySelector('main'),
      document.querySelector('article'),
      document.querySelector('[role="main"]'),
      document.querySelector('.content'),
      document.querySelector('#content'),
      document.querySelector('#main-content'),
      document.querySelector('.post-content'),
      document.querySelector('.article-body'),
      document.querySelector('.entry-content'),
      document.body,
    ];
    for (const el of candidates) {
      if (!el) continue;
      const text = (el.innerText || '').trim();
      if (text.length > 100) return text.slice(0, 3000);
    }
    return '';
  }

  // ═════════════════════════════════════════════════════════════════
  // CHAT MESSAGE EXTRACTION — sender-attributed DM/chat messages
  // ═════════════════════════════════════════════════════════════════

  // Platform-specific selectors for chat message containers.
  // Each platform renders sent vs received messages differently.
  // We detect sender via alignment, CSS classes, or data attributes.
  const CHAT_PLATFORM_SELECTORS = {
    'instagram.com': {
      // Instagram web DMs: messages are in a scrollable thread container.
      // Sent messages are right-aligned (child), received are left-aligned (contact).
      messageContainer: '[role="listbox"], [role="grid"], [class*="x1n2onr6"] > div > div',
      // Instagram uses flexbox alignment: sent = row-reverse/flex-end, received = row/flex-start
      senderDetect: 'alignment',
    },
    'discord.com': {
      // Discord: each message group has a data attribute or class with author info.
      // The current user's messages can be identified by comparing author to the logged-in user.
      messageContainer: '[class*="message-"]',
      senderDetect: 'discord',
    },
    'web.whatsapp.com': {
      // WhatsApp Web: message-in = received, message-out = sent
      messageContainer: '.message-in, .message-out',
      senderDetect: 'whatsapp',
    },
    'web.telegram.org': {
      // Telegram Web: messages have .message class, own messages have a specific modifier
      messageContainer: '.message',
      senderDetect: 'alignment',
    },
    'messenger.com': {
      // Messenger: similar to Instagram, uses alignment-based rendering
      messageContainer: '[role="row"]',
      senderDetect: 'alignment',
    },
    'twitter.com': {
      messageContainer: '[data-testid="messageEntry"]',
      senderDetect: 'alignment',
    },
    'x.com': {
      messageContainer: '[data-testid="messageEntry"]',
      senderDetect: 'alignment',
    },
  };

  /**
   * Extract chat messages with sender attribution.
   * Returns { messages: [{sender, text}], contact_text, child_text } or null if not a chat page.
   *
   * sender = "CONTACT" | "CHILD" | "UNKNOWN"
   *
   * Detection strategies:
   * 1. Platform-specific class/attribute selectors
   * 2. Alignment heuristic: right-aligned = CHILD (sent), left-aligned = CONTACT (received)
   * 3. WhatsApp-specific: .message-in / .message-out classes
   */
  function extractChatMessages() {
    const domain = window.location.hostname;
    const path = window.location.pathname;

    // Only run on DM/chat paths
    if (!isChatContext(domain, path)) return null;

    // Find platform config
    let config = null;
    for (const [platformDomain, cfg] of Object.entries(CHAT_PLATFORM_SELECTORS)) {
      if (domain.includes(platformDomain)) { config = cfg; break; }
    }

    const messages = [];
    const MAX_MESSAGES = 100;
    const MAX_CHAT_TEXT = 10000;
    let totalTextLen = 0;

    if (config) {
      messages.push(...extractWithConfig(config, MAX_MESSAGES));
    }

    // Fallback: if platform-specific extraction found nothing, try generic approach
    if (messages.length === 0) {
      messages.push(...extractGenericChat(MAX_MESSAGES));
    }

    // Build separated text for contact vs child
    let contactText = '';
    let childText = '';
    for (const msg of messages) {
      if (totalTextLen >= MAX_CHAT_TEXT) break;
      if (msg.sender === 'CONTACT') {
        contactText += msg.text + ' ';
      } else if (msg.sender === 'CHILD') {
        childText += msg.text + ' ';
      } else {
        // UNKNOWN — include in contact text for safety (score it)
        contactText += msg.text + ' ';
      }
      totalTextLen += msg.text.length;
    }

    return {
      messages: messages.slice(0, MAX_MESSAGES),
      contact_text: contactText.trim(),
      child_text: childText.trim(),
      message_count: messages.length,
      contact_message_count: messages.filter(m => m.sender === 'CONTACT').length,
      child_message_count: messages.filter(m => m.sender === 'CHILD').length,
      unknown_message_count: messages.filter(m => m.sender === 'UNKNOWN').length,
    };
  }

  /**
   * Determine if the current page is a DM/chat context.
   */
  function isChatContext(domain, path) {
    // Instagram DMs
    if (domain.includes('instagram.com') && path.startsWith('/direct')) return true;
    // Discord channels (DMs are at /channels/@me/)
    if (domain.includes('discord.com') && path.includes('/channels/')) return true;
    // WhatsApp Web (always chat)
    if (domain.includes('web.whatsapp.com')) return true;
    // Telegram Web
    if (domain.includes('web.telegram.org')) return true;
    // Messenger
    if (domain.includes('messenger.com')) return true;
    // Twitter/X DMs
    if ((domain.includes('twitter.com') || domain.includes('x.com')) && path.includes('/messages')) return true;
    return false;
  }

  /**
   * Extract messages using platform-specific config.
   */
  function extractWithConfig(config, maxMessages) {
    const messages = [];

    if (config.senderDetect === 'whatsapp') {
      // WhatsApp: explicit in/out classes
      const incoming = document.querySelectorAll('.message-in');
      const outgoing = document.querySelectorAll('.message-out');
      const allMsgs = [];
      incoming.forEach(el => {
        const text = extractMessageText(el);
        if (text) allMsgs.push({ el, sender: 'CONTACT', text });
      });
      outgoing.forEach(el => {
        const text = extractMessageText(el);
        if (text) allMsgs.push({ el, sender: 'CHILD', text });
      });
      // Sort by DOM order (vertical position)
      allMsgs.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
      messages.push(...allMsgs.slice(-maxMessages));
    } else if (config.senderDetect === 'discord') {
      // Discord: check for data attributes that indicate the current user
      const msgEls = document.querySelectorAll('[id^="chat-messages-"] > div');
      for (const el of Array.from(msgEls).slice(-maxMessages)) {
        const text = extractMessageText(el);
        if (!text) continue;
        // Discord marks the current user's messages with a specific class
        const isOwn = el.querySelector('[class*="mentioned"]') !== null ||
                      el.classList.toString().includes('backgroundFlash');
        messages.push({ sender: isOwn ? 'CHILD' : 'CONTACT', text });
      }
      // If we couldn't reliably detect ownership, fall back to alignment
      if (messages.length === 0) {
        messages.push(...extractByAlignment(config.messageContainer, maxMessages));
      }
    } else {
      // Default: alignment-based detection
      messages.push(...extractByAlignment(config.messageContainer, maxMessages));
    }

    return messages;
  }

  /**
   * Alignment-based sender detection.
   * Most chat UIs render:
   *   - Sent messages (CHILD): right-aligned, margin-left: auto, or flex-end
   *   - Received messages (CONTACT): left-aligned, margin-right: auto, or flex-start
   *
   * Works for: Instagram, Telegram, Messenger, Twitter/X DMs
   */
  function extractByAlignment(containerSelector, maxMessages) {
    const messages = [];

    // Try to find the chat scroll container
    const chatRoot = findChatScrollContainer();
    if (!chatRoot) return messages;

    // Use direct children first (faster), fall back to shallow query.
    // Avoids querySelectorAll('div, span') which returns thousands of elements.
    let candidates = chatRoot.children;
    if (candidates.length < 3) {
      // If container has few direct children, go one level deeper
      candidates = chatRoot.querySelectorAll(':scope > * > *');
    }

    const seen = new Set();
    const viewportCenter = window.innerWidth / 2; // compute once
    const maxWidth = window.innerWidth * 0.7;     // compute once
    const alignCache = new WeakMap();              // cache getComputedStyle results

    for (let i = 0; i < candidates.length && messages.length < maxMessages; i++) {
      const el = candidates[i];

      const text = el.innerText?.trim();
      if (!text || text.length < 2 || text.length > 2000) continue;
      if (seen.has(text)) continue;

      // Heuristic: message elements are leaf-ish — check childElementCount (O(1))
      // instead of querySelectorAll('div').length (O(n))
      if (el.childElementCount > 10) continue;

      // Determine sender via alignment (uses cached computed styles)
      const sender = detectSenderByAlignment(el, viewportCenter, maxWidth, alignCache);
      if (sender === null) continue;

      seen.add(text);
      messages.push({ sender, text: text.slice(0, 500) });
    }

    return messages;
  }

  /**
   * Detect sender by checking the horizontal alignment of the element.
   * Returns "CHILD" (right-aligned/sent), "CONTACT" (left-aligned/received), or null.
   * Caches getComputedStyle results per element via alignCache.
   */
  function detectSenderByAlignment(el, viewportCenter, maxWidth, alignCache) {
    try {
      // Get or cache computed style for this element
      let style = alignCache?.get(el);
      if (!style) {
        style = window.getComputedStyle(el);
        if (alignCache) alignCache.set(el, style);
      }

      // Check direct margin-based alignment
      const ml = style.marginLeft;
      const mr = style.marginRight;
      if (ml === 'auto' && mr !== 'auto') return 'CHILD';
      if (mr === 'auto' && ml !== 'auto') return 'CONTACT';

      // Check flex alignment on parent
      const parent = el.parentElement;
      if (parent) {
        let parentStyle = alignCache?.get(parent);
        if (!parentStyle) {
          parentStyle = window.getComputedStyle(parent);
          if (alignCache) alignCache.set(parent, parentStyle);
        }
        const justify = parentStyle.justifyContent;
        const direction = parentStyle.flexDirection;
        if (justify === 'flex-end' || direction === 'row-reverse') return 'CHILD';
        if (justify === 'flex-start' || direction === 'row') return 'CONTACT';
      }

      // Check text-align
      if (style.textAlign === 'right') return 'CHILD';
      if (style.textAlign === 'left') return 'CONTACT';

      // Check position relative to viewport center (uses pre-computed values)
      const rect = el.getBoundingClientRect();
      if (rect.width < maxWidth) {
        const elCenter = rect.left + rect.width / 2;
        if (elCenter > viewportCenter + 50) return 'CHILD';
        if (elCenter < viewportCenter - 50) return 'CONTACT';
      }
    } catch { /* ignore */ }

    return null; // can't determine
  }

  /**
   * Find the scrollable chat container on the page.
   * Chat UIs typically have one tall scrollable div containing messages.
   */
  function findChatScrollContainer() {
    // Try known selectors first
    const knownSelectors = [
      '[role="listbox"]',                // Instagram DMs
      '[role="log"]',                    // Accessibility-tagged chat logs
      '[data-testid="conversation"]',    // Twitter/X
      '.conversation-container',
      '.chat-container',
      '.message-list',
    ];
    for (const sel of knownSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }

    // Fallback: find the largest scrollable container in the main area
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    if (!main) return null;

    let best = null;
    let bestHeight = 0;
    const divs = main.querySelectorAll('div');
    for (const div of divs) {
      if (div.scrollHeight > div.clientHeight + 100 &&
          div.scrollHeight > bestHeight &&
          div.childElementCount > 3) {
        bestHeight = div.scrollHeight;
        best = div;
      }
    }
    return best || main;
  }

  /**
   * Generic chat extraction fallback — no platform-specific logic.
   * Finds message-like text blocks and uses alignment to attribute sender.
   */
  function extractGenericChat(maxMessages) {
    return extractByAlignment(null, maxMessages);
  }

  /**
   * Extract clean text content from a message element.
   */
  function extractMessageText(el) {
    // Get text, stripping timestamps and UI chrome
    let text = el.innerText?.trim() || '';
    // Remove common timestamp patterns (HH:MM, HH:MM AM/PM)
    text = text.replace(/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*$/gm, '').trim();
    if (text.length < 2) return '';
    return text.slice(0, 500);
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
    if (domain.includes('instagram.com')) return { name: 'instagram', object_kind: path.startsWith('/direct') ? 'dm' : path.includes('/reel') ? 'short' : path.includes('/p/') ? 'post' : 'profile' };
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
    const path = content.url ? (new URL(content.url).pathname || '') : '';
    if (platform?.name === 'youtube') { return platform.object_kind === 'search' ? 'search' : platform.object_kind === 'channel' ? 'feed' : 'video'; }
    if (platform?.name === 'tiktok') return 'video';
    if (['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com'].some(d => domain.includes(d)) && url.includes('q=')) return 'search';
    // Chat/DM detection MUST come before feed/article — DMs can look like feeds
    if (platform?.name === 'instagram' && platform?.object_kind === 'dm') return 'chat';
    if (domain.includes('instagram.com') && path.startsWith('/direct')) return 'chat';
    if (['discord.com', 'whatsapp.com', 'web.whatsapp.com', 'telegram.org', 'web.telegram.org', 'messenger.com'].some(d => domain.includes(d))) return 'chat';
    if ((domain.includes('twitter.com') || domain.includes('x.com')) && path.includes('/messages')) return 'chat';
    if (ui?.infinite_scroll && hasRepeatedCards(8)) return 'feed';
    if ((content.main_text || '').split(/\s+/).length > 250) return 'article';
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

    // Check if this is a blocked conversation (instant block, no scoring needed)
    checkBlockedConversation();

    const content = extractContentObject();
    sendContentEvent(content, 'full');

    // Phase 2b: Deferred re-extraction for JS-heavy/SPA pages.
    // Many modern article sites (React, Vue, Next.js) render content AFTER
    // DOMContentLoaded. The initial extraction may get empty or minimal text.
    // Schedule a follow-up extraction after JavaScript has had time to render.
    // Only fires if the initial extraction got insufficient text.
    const mainLen = (content.main_text || '').length;
    const visLen = (content.visible_text_sample || '').length;
    const totalText = mainLen + visLen;

    if (totalText < 200 && !isPlatformPage()) {
      // Insufficient text on a non-platform page — likely JS-rendered.
      // Re-extract after a delay to catch client-side rendered content.
      setTimeout(() => {
        if (shouldPauseEvents()) return;
        const deferred = extractContentObject();
        const deferredLen = (deferred.main_text || '').length + (deferred.visible_text_sample || '').length;
        // Only send if we got substantially more text
        if (deferredLen > totalText + 100) {
          sendContentEvent(deferred, 'deferred');
        }
      }, 1500);
    }
  }

  /**
   * Check if the current page is a known platform (YouTube, Instagram, etc.).
   * Platform pages have their own extraction timing (e.g., YouTube SPA watcher).
   * Deferred re-extraction is only needed for generic web pages.
   */
  function isPlatformPage() {
    const d = host;
    return d.includes('youtube.com') || d.includes('youtu.be') ||
           d.includes('tiktok.com') || d.includes('instagram.com') ||
           d.includes('twitter.com') || d.includes('x.com') ||
           d.includes('reddit.com') || d.includes('discord.com') ||
           d.includes('facebook.com') || d.includes('twitch.tv');
  }

  /**
   * Check if the current DM conversation has been previously blocked.
   * If so, immediately fire a block decision without waiting for pipeline scoring.
   */
  function checkBlockedConversation() {
    const domain = window.location.hostname;
    const path = window.location.pathname;
    if (!isChatContext(domain, path)) return;

    try {
      chrome.runtime.sendMessage({
        type: 'PHYLAX_CHECK_CONVERSATION_BLOCKED',
        domain: domain,
        path: path,
      }, (response) => {
        if (response?.blocked) {
          // This conversation was previously flagged — block immediately
          window.dispatchEvent(new CustomEvent('phylax-decision', {
            detail: {
              decision: 'BLOCK',
              action: 'BLOCK',
              reason_code: 'BLOCKED_CONVERSATION',
              confidence: 1.0,
              evidence: ['This conversation was previously flagged for safety concerns.'],
              enforcement: { layer: 'RENDER', technique: 'chat_block' },
            },
          }));
        }
      });
    } catch { /* extension not ready */ }
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

  function extractYouTubeVideoId() {
    try {
      return new URLSearchParams(window.location.search).get('v') || null;
    } catch { return null; }
  }

  /**
   * YouTube-specific main text extraction.
   * Only extracts the actual video content (title, description, channel name).
   * Excludes sidebar recommendations, comments, and other unrelated content
   * that can cause false positives when stale from SPA navigation.
   */
  function extractYouTubeMainText() {
    const parts = [];

    // Video title (from YouTube's own element, not document.title)
    const titleEl = document.querySelector(
      'ytd-watch-metadata h1 yt-formatted-string, ' +
      'h1.ytd-video-primary-info-renderer yt-formatted-string, ' +
      '#title h1 yt-formatted-string'
    );
    if (titleEl?.textContent) parts.push(titleEl.textContent.trim());

    // Video description
    const descEl = document.querySelector(
      'ytd-text-inline-expander#description-inline-expander, ' +
      'ytd-expander.ytd-video-secondary-info-renderer #description, ' +
      '#description-inner'
    );
    if (descEl?.innerText) parts.push(descEl.innerText.trim().slice(0, 3000));

    // Channel name
    const channelEl = document.querySelector(
      '#channel-name a, ytd-channel-name a, #owner-name a'
    );
    if (channelEl?.textContent) parts.push(channelEl.textContent.trim());

    // EXCLUDED: #secondary (sidebar/recommendations), #comments, ytd-compact-video-renderer
    // These contain content from OTHER videos and cause false positives

    return parts.join(' ').slice(0, MAX_TEXT_LENGTH);
  }

  /**
   * Wait for YouTube's DOM to actually update after SPA navigation.
   * YouTube takes 500-2000ms to update video description after client-side nav.
   * We poll for the description element to change before doing full extraction.
   * This prevents extracting stale content from the previous video.
   */
  function waitForYouTubeContentUpdate(callback) {
    if (youtubeContentUpdateTimer) {
      clearTimeout(youtubeContentUpdateTimer);
      youtubeContentUpdateTimer = null;
    }

    const maxWait = 2000;
    const checkInterval = 250;
    const startTime = Date.now();
    const prevDescription = lastYouTubeDescription;

    function check() {
      const descEl = document.querySelector(
        'ytd-text-inline-expander#description-inline-expander, ' +
        'ytd-expander.ytd-video-secondary-info-renderer #description, ' +
        '#description-inner'
      );
      const currentDesc = (descEl?.innerText || '').trim().slice(0, 200);
      const elapsed = Date.now() - startTime;

      // Description changed from previous video, or timeout reached
      if (elapsed >= maxWait || (currentDesc.length > 0 && currentDesc !== prevDescription)) {
        lastYouTubeDescription = currentDesc;
        callback();
      } else {
        youtubeContentUpdateTimer = setTimeout(check, checkInterval);
      }
    }

    // Start checking after 300ms (give YouTube minimal time to start updating)
    youtubeContentUpdateTimer = setTimeout(check, 300);
  }

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
        lastYouTubeVideoId = extractYouTubeVideoId();
        // Classify with title + meta immediately (fast path for obvious blocks)
        onHeadReady();
        // Wait for YouTube DOM to actually update before full extraction.
        // YouTube takes 500-2000ms to update description/sidebar after SPA nav.
        // A static 150ms delay caused stale content from the previous video
        // to be extracted, leading to false positives and false negatives.
        waitForYouTubeContentUpdate(() => onPageLoad());
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

    console.log('[Phylax Observer v3.0] Active on:', host);
  }

  init();
})();
