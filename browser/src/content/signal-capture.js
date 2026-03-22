// Phylax Safety Pipeline — Content Signal Capture v1.0
//
// Universal signal capture module that normalizes raw activity from ANY
// source into standardized ContentSignal objects. This is Agent 1
// (Environment Capture) of the Semantic Safety Pipeline.
//
// NO judgment — only capture and standardize.
//
// ContentSignal schema:
//   signal_id      — crypto.randomUUID()
//   source_type    — llm_response | browser_page | search_query | chat_message | social_post | video_caption
//   platform       — chatgpt | claude | gemini | discord | instagram | youtube | google
//   modality       — text | image | video | audio
//   direction      — incoming | outgoing
//   content        — the actual text or content payload
//   context        — { url, timestamp, thread_id, conversation_history }
//   metadata       — { author_role, platform_features }
//
// Exports (via window.__phylaxSignalCapture):
//   createSignal()           — factory for ContentSignal objects
//   emitSignal()             — send signal to background via chrome.runtime.sendMessage
//   SOURCE_TYPES             — enum of valid source types
//   PLATFORMS                — enum of valid platforms
//   MODALITIES               — enum of valid modalities
//   DIRECTIONS               — enum of valid directions
//   AUTHOR_ROLES             — enum of valid author roles
//
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  // ── Enums ──────────────────────────────────────────────────────────

  /** @enum {string} Valid source types for ContentSignal */
  const SOURCE_TYPES = Object.freeze({
    LLM_RESPONSE:   'llm_response',
    BROWSER_PAGE:   'browser_page',
    SEARCH_QUERY:   'search_query',
    CHAT_MESSAGE:   'chat_message',
    SOCIAL_POST:    'social_post',
    VIDEO_CAPTION:  'video_caption',
  });

  /** @enum {string} Supported platform identifiers */
  const PLATFORMS = Object.freeze({
    CHATGPT:    'chatgpt',
    CLAUDE:     'claude',
    GEMINI:     'gemini',
    DISCORD:    'discord',
    INSTAGRAM:  'instagram',
    YOUTUBE:    'youtube',
    GOOGLE:     'google',
    BING:       'bing',
    TIKTOK:     'tiktok',
    REDDIT:     'reddit',
    UNKNOWN:    'unknown',
  });

  /** @enum {string} Content modality */
  const MODALITIES = Object.freeze({
    TEXT:   'text',
    IMAGE:  'image',
    VIDEO:  'video',
    AUDIO:  'audio',
  });

  /** @enum {string} Content direction relative to the child */
  const DIRECTIONS = Object.freeze({
    INCOMING: 'incoming',
    OUTGOING: 'outgoing',
  });

  /** @enum {string} Author role for attribution */
  const AUTHOR_ROLES = Object.freeze({
    USER:             'user',
    ASSISTANT:        'assistant',
    UNKNOWN_CONTACT:  'unknown_contact',
    PLATFORM:         'platform',
  });

  // ── Context validity ──────────────────────────────────────────────

  /**
   * Check if the chrome.runtime context is still valid.
   * Content scripts can be orphaned when the extension reloads.
   * @returns {boolean}
   */
  function isContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  // ── Platform detection ────────────────────────────────────────────

  /**
   * Map of hostname patterns to platform identifiers.
   * Checked in order; first match wins.
   * @type {Array<{test: function(string): boolean, platform: string}>}
   */
  const PLATFORM_MATCHERS = [
    { test: h => h === 'chat.openai.com' || h === 'chatgpt.com',   platform: PLATFORMS.CHATGPT },
    { test: h => h === 'claude.ai' || h.endsWith('.claude.ai'),     platform: PLATFORMS.CLAUDE },
    { test: h => h === 'gemini.google.com',                         platform: PLATFORMS.GEMINI },
    { test: h => h.includes('discord.com') || h.includes('discord.gg'), platform: PLATFORMS.DISCORD },
    { test: h => h.includes('instagram.com'),                       platform: PLATFORMS.INSTAGRAM },
    { test: h => h.includes('youtube.com') || h.includes('youtu.be'), platform: PLATFORMS.YOUTUBE },
    { test: h => h.includes('tiktok.com'),                          platform: PLATFORMS.TIKTOK },
    { test: h => h.includes('reddit.com'),                          platform: PLATFORMS.REDDIT },
    { test: h => h.includes('google.com'),                          platform: PLATFORMS.GOOGLE },
    { test: h => h.includes('bing.com'),                            platform: PLATFORMS.BING },
  ];

  /**
   * Detect the platform from the current page hostname.
   * @param {string} [hostname] — override for testing; defaults to window.location.hostname
   * @returns {string} Platform identifier from PLATFORMS enum
   */
  function detectPlatform(hostname) {
    const h = (hostname || window.location.hostname).toLowerCase();
    for (const matcher of PLATFORM_MATCHERS) {
      if (matcher.test(h)) return matcher.platform;
    }
    return PLATFORMS.UNKNOWN;
  }

  // ── Signal factory ────────────────────────────────────────────────

  /**
   * Create a normalized ContentSignal object.
   *
   * @param {Object} params
   * @param {string} params.source_type       — One of SOURCE_TYPES
   * @param {string} params.content           — The actual text/content payload
   * @param {string} params.direction         — 'incoming' or 'outgoing'
   * @param {string} [params.platform]        — Override auto-detected platform
   * @param {string} [params.modality]        — Defaults to 'text'
   * @param {string} [params.author_role]     — One of AUTHOR_ROLES; defaults to 'unknown_contact'
   * @param {string} [params.url]             — Override; defaults to window.location.href
   * @param {string} [params.thread_id]       — Optional conversation/thread ID
   * @param {Array}  [params.conversation_history] — Prior messages for context
   * @param {Array<string>} [params.platform_features] — e.g. ['streaming', 'code_block']
   * @returns {Object} ContentSignal
   */
  function createSignal(params) {
    if (!params || !params.source_type || !params.content) {
      console.warn('[Phylax Signal Capture] createSignal() called with missing required fields');
      return null;
    }

    const now = Date.now();
    const signal = {
      signal_id:    crypto.randomUUID(),
      source_type:  params.source_type,
      platform:     params.platform || detectPlatform(),
      modality:     params.modality || MODALITIES.TEXT,
      direction:    params.direction || DIRECTIONS.INCOMING,
      content:      params.content,
      context: {
        url:                    params.url || window.location.href,
        timestamp:              Math.floor(now / 1000),
        thread_id:              params.thread_id || null,
        conversation_history:   params.conversation_history || [],
      },
      metadata: {
        author_role:        params.author_role || AUTHOR_ROLES.UNKNOWN_CONTACT,
        platform_features:  params.platform_features || [],
      },
    };

    return signal;
  }

  // ── Signal emission ───────────────────────────────────────────────

  /**
   * Emit a ContentSignal to the background service worker for pipeline routing.
   * Uses chrome.runtime.sendMessage with type 'PHYLAX_CONTENT_SIGNAL'.
   *
   * @param {Object} signal — A ContentSignal created by createSignal()
   * @returns {Promise<Object|null>} Response from background, or null on failure
   */
  async function emitSignal(signal) {
    if (!signal || !signal.signal_id) {
      console.warn('[Phylax Signal Capture] emitSignal() called with invalid signal');
      return null;
    }

    if (!isContextValid()) {
      console.warn('[Phylax Signal Capture] Extension context invalidated — signal dropped');
      return null;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_CONTENT_SIGNAL',
        signal,
      });
      return response || null;
    } catch (err) {
      console.warn('[Phylax Signal Capture] Failed to emit signal:', err.message);
      return null;
    }
  }

  /**
   * Convenience: create AND emit a signal in one call.
   *
   * @param {Object} params — Same as createSignal() params
   * @returns {Promise<Object|null>} The created signal (also emitted), or null
   */
  async function captureAndEmit(params) {
    const signal = createSignal(params);
    if (!signal) return null;

    await emitSignal(signal);
    return signal;
  }

  // ── Content sanitization helpers ──────────────────────────────────

  /**
   * Truncate content to a safe maximum length for pipeline processing.
   * Preserves whole words where possible.
   *
   * @param {string} text — Raw text content
   * @param {number} [maxLength=10000] — Maximum character count
   * @returns {string} Truncated text
   */
  function truncateContent(text, maxLength) {
    const limit = maxLength || 10000;
    if (!text || text.length <= limit) return text || '';

    // Cut at last space before limit to preserve whole words
    const truncated = text.slice(0, limit);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > limit * 0.8) {
      return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
  }

  /**
   * Strip HTML tags from text content while preserving meaningful whitespace.
   *
   * @param {string} html — Raw HTML string
   * @returns {string} Plain text
   */
  function stripHTML(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || temp.innerText || '').trim();
  }

  /**
   * Extract visible text from a DOM element, collapsing whitespace.
   *
   * @param {Element} element — DOM element
   * @returns {string} Normalized text content
   */
  function extractText(element) {
    if (!element) return '';
    const raw = element.innerText || element.textContent || '';
    // Collapse runs of whitespace to single spaces, trim
    return raw.replace(/\s+/g, ' ').trim();
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Expose signal capture API on window for other content scripts.
   * Content scripts share the same page context within a single extension,
   * so window.__phylaxSignalCapture is accessible from llm-observer.js, etc.
   */
  window.__phylaxSignalCapture = Object.freeze({
    createSignal,
    emitSignal,
    captureAndEmit,
    detectPlatform,
    truncateContent,
    stripHTML,
    extractText,
    isContextValid,
    SOURCE_TYPES,
    PLATFORMS,
    MODALITIES,
    DIRECTIONS,
    AUTHOR_ROLES,
  });

  console.log('[Phylax Signal Capture v1.0] Ready');
})();
