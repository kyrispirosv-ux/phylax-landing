// Phylax Safety Pipeline — LLM Observer v1.0
//
// Content script for LLM sites (ChatGPT, Claude, Gemini).
// Captures incoming responses and outgoing prompts, normalizes them
// into ContentSignal objects via signal-capture.js, and emits to the
// background service worker for pipeline evaluation.
//
// Key features:
//   - MutationObserver-based response detection
//   - Streaming token buffering with sentence-boundary evaluation
//   - "Phylax is reviewing..." spinner overlay while buffering
//   - Prompt interception (outgoing messages)
//   - DOM selector fallback chain (CSS → aria/role → heuristic → network)
//   - Self-reporting selector failures for diagnostics
//
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  if (window.location.protocol === 'chrome-extension:') return;

  const host = window.location.hostname;

  // Only activate on supported LLM platforms
  const LLM_HOSTS = [
    'chat.openai.com', 'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
  ];

  const isLLMSite = LLM_HOSTS.some(h => host === h || host.endsWith('.' + h));
  if (!isLLMSite) return;

  // ── Wait for signal-capture.js to load ────────────────────────────

  /**
   * Get the signal capture API, waiting briefly if not yet loaded.
   * signal-capture.js is injected before this script in the manifest.
   * @returns {Object|null}
   */
  function getSignalAPI() {
    return window.__phylaxSignalCapture || null;
  }

  // ── Context validity ──────────────────────────────────────────────

  function isContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  // ── Platform detection ────────────────────────────────────────────

  /**
   * Determine which LLM platform we are on.
   * @returns {'chatgpt'|'claude'|'gemini'|null}
   */
  function detectLLMPlatform() {
    if (host === 'chat.openai.com' || host === 'chatgpt.com') return 'chatgpt';
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'claude';
    if (host === 'gemini.google.com') return 'gemini';
    return null;
  }

  const platform = detectLLMPlatform();
  if (!platform) return;

  // ═════════════════════════════════════════════════════════════════
  // DOM SELECTOR CONFIGURATION
  // ═════════════════════════════════════════════════════════════════

  /**
   * Platform-specific DOM selectors with fallback chains.
   * Each platform defines:
   *   responseContainer — selects assistant response elements
   *   inputArea         — selects the user input/prompt field
   *   submitButton      — selects the send/submit button
   *
   * Each selector set is an ordered array: primary first, then fallbacks.
   */
  const SELECTORS = {
    chatgpt: {
      responseContainer: [
        '[data-message-author-role="assistant"]',                   // Primary: data attribute
        '[role="presentation"] .markdown',                          // Fallback 1: role-based
        '.agent-turn .markdown',                                    // Fallback 2: class-based
      ],
      inputArea: [
        '#prompt-textarea',                                         // Primary: ID
        'textarea[placeholder]',                                    // Fallback 1: generic textarea
        '[contenteditable="true"]',                                 // Fallback 2: contenteditable
      ],
      submitButton: [
        'button[data-testid="send-button"]',                        // Primary: test ID
        'form button[type="submit"]',                               // Fallback
        'button[aria-label="Send prompt"]',                         // Aria
      ],
    },
    claude: {
      responseContainer: [
        '.font-claude-message',                                     // Primary: Claude-specific class
        '[data-is-streaming]',                                      // Fallback 1: streaming attribute
        '.prose',                                                   // Fallback 2: prose container
      ],
      inputArea: [
        '[contenteditable="true"]',                                 // Primary: contenteditable in composer
        '.ProseMirror',                                             // Fallback 1: ProseMirror editor
        'textarea',                                                 // Fallback 2: plain textarea
      ],
      submitButton: [
        'button[aria-label="Send Message"]',                        // Primary: aria
        'button[type="submit"]',                                    // Fallback
        'fieldset button:last-of-type',                             // Heuristic
      ],
    },
    gemini: {
      responseContainer: [
        'message-content',                                          // Primary: custom element
        '.response-content',                                        // Fallback 1: class
        '.model-response-text',                                     // Fallback 2: class
      ],
      inputArea: [
        '.ql-editor',                                               // Primary: Quill editor
        'textarea',                                                 // Fallback 1: textarea
        '[contenteditable="true"]',                                 // Fallback 2: contenteditable
        'rich-textarea',                                            // Fallback 3: custom element
      ],
      submitButton: [
        'button[aria-label="Send message"]',                        // Primary: aria
        'button.send-button',                                       // Fallback 1
        '.input-area button',                                       // Fallback 2
      ],
    },
  };

  // ── Selector resolution with fallback chain ───────────────────────

  /** @type {Object<string, {selector: string, method: string}>} Cache of resolved selectors */
  const resolvedSelectors = {};

  /** @type {Array<Object>} Selector failure log for diagnostics */
  const selectorFailures = [];

  /**
   * Attempt to find an element using the platform's fallback selector chain.
   *
   * Strategy order:
   *   1. CSS selectors (from SELECTORS config)
   *   2. aria/role attribute matching
   *   3. Text content heuristic (largest new text block)
   *
   * @param {string} selectorKey — 'responseContainer' | 'inputArea' | 'submitButton'
   * @param {Object} [opts]
   * @param {boolean} [opts.all=false] — Return all matches (querySelectorAll)
   * @param {Element} [opts.root=document] — Root element to search within
   * @returns {Element|NodeList|null}
   */
  function resolveSelector(selectorKey, opts) {
    const options = opts || {};
    const root = options.root || document;
    const selectors = SELECTORS[platform]?.[selectorKey];
    if (!selectors) return null;

    // Strategy 1: CSS selector chain
    for (const sel of selectors) {
      try {
        if (options.all) {
          const els = root.querySelectorAll(sel);
          if (els.length > 0) {
            resolvedSelectors[selectorKey] = { selector: sel, method: 'css' };
            return els;
          }
        } else {
          const el = root.querySelector(sel);
          if (el) {
            resolvedSelectors[selectorKey] = { selector: sel, method: 'css' };
            return el;
          }
        }
      } catch { /* invalid selector — continue */ }
    }

    // Strategy 2: aria/role attribute matching
    const ariaResult = resolveByAria(selectorKey, root, options.all);
    if (ariaResult) {
      resolvedSelectors[selectorKey] = { selector: 'aria/role', method: 'aria' };
      return ariaResult;
    }

    // Strategy 3: Text content heuristic (only for responseContainer)
    if (selectorKey === 'responseContainer' && !options.all) {
      const heuristicResult = resolveByHeuristic(root);
      if (heuristicResult) {
        resolvedSelectors[selectorKey] = { selector: 'heuristic', method: 'heuristic' };
        return heuristicResult;
      }
    }

    // All strategies failed — log for diagnostics
    reportSelectorFailure(selectorKey);
    return null;
  }

  /**
   * Fallback 1: Resolve element by aria/role attributes.
   *
   * @param {string} selectorKey
   * @param {Element} root
   * @param {boolean} all
   * @returns {Element|NodeList|null}
   */
  function resolveByAria(selectorKey, root, all) {
    const ariaMap = {
      responseContainer: [
        { attr: 'role', value: 'article' },
        { attr: 'role', value: 'region' },
        { attr: 'aria-label', pattern: /response|answer|reply|assistant/i },
      ],
      inputArea: [
        { attr: 'role', value: 'textbox' },
        { attr: 'aria-label', pattern: /message|prompt|input|chat/i },
      ],
      submitButton: [
        { attr: 'role', value: 'button' },
        { attr: 'aria-label', pattern: /send|submit/i },
      ],
    };

    const candidates = ariaMap[selectorKey];
    if (!candidates) return null;

    for (const candidate of candidates) {
      try {
        let els;
        if (candidate.value) {
          els = root.querySelectorAll(`[${candidate.attr}="${candidate.value}"]`);
        } else if (candidate.pattern) {
          // Must iterate all elements with that attribute
          els = root.querySelectorAll(`[${candidate.attr}]`);
          els = Array.from(els).filter(el => {
            const val = el.getAttribute(candidate.attr) || '';
            return candidate.pattern.test(val);
          });
        }

        if (els && (els.length || els.length === undefined)) {
          const arr = Array.from(els instanceof NodeList ? els : els);
          if (arr.length > 0) {
            return all ? arr : arr[0];
          }
        }
      } catch { /* continue */ }
    }

    return null;
  }

  /**
   * Fallback 2: Heuristic — find the largest new text block after user input.
   * Scans all block-level elements and returns the one with the most text
   * that appeared recently (not in the initial snapshot).
   *
   * @param {Element} root
   * @returns {Element|null}
   */
  function resolveByHeuristic(root) {
    const candidates = root.querySelectorAll('div, section, article, p, pre');
    let best = null;
    let bestLength = 0;

    for (const el of candidates) {
      // Skip tiny elements, navigation, headers, footers
      if (el.closest('nav, header, footer, aside, [role="navigation"]')) continue;
      const text = (el.innerText || '').trim();
      if (text.length > 100 && text.length > bestLength) {
        // Heuristic: the element should contain paragraph-style content
        // (not a list of links or menu items)
        const linkRatio = el.querySelectorAll('a').length / Math.max(text.length / 50, 1);
        if (linkRatio < 2) {
          best = el;
          bestLength = text.length;
        }
      }
    }

    return best;
  }

  /**
   * Self-report a selector failure for diagnostics.
   * Logged locally and sent to background for aggregated telemetry.
   *
   * @param {string} selectorKey
   */
  function reportSelectorFailure(selectorKey) {
    const failure = {
      platform,
      selectorKey,
      url: window.location.href,
      timestamp: Date.now(),
      resolvedSelectors: { ...resolvedSelectors },
    };

    selectorFailures.push(failure);

    // Cap stored failures to prevent memory leak
    if (selectorFailures.length > 50) {
      selectorFailures.splice(0, selectorFailures.length - 50);
    }

    console.warn(`[Phylax LLM Observer] Selector failure: ${selectorKey} on ${platform}`, failure);

    // Report to background for telemetry
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SELECTOR_FAILURE',
          failure,
        });
      } catch { /* silent */ }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // STREAMING TOKEN BUFFER
  // ═════════════════════════════════════════════════════════════════

  /**
   * Sentence boundary pattern.
   * Matches sentence-ending punctuation followed by whitespace or end-of-string.
   * Used to determine when to evaluate buffered streaming tokens.
   */
  const SENTENCE_BOUNDARY = /[.?!]\s+|\n\n/;

  /**
   * Per-response streaming buffer state.
   * Tracks the currently streaming response for sentence-boundary evaluation.
   */
  class StreamingBuffer {
    constructor(responseElement) {
      /** @type {Element} The response container DOM element */
      this.element = responseElement;
      /** @type {string} Accumulated text content since stream started */
      this.bufferedText = '';
      /** @type {number} Index of last evaluated sentence boundary */
      this.lastEvalIndex = 0;
      /** @type {boolean} Whether the stream has completed */
      this.isComplete = false;
      /** @type {Element|null} The review spinner overlay */
      this.spinnerOverlay = null;
      /** @type {string|null} The original visibility style */
      this.originalVisibility = null;
      /** @type {string} Unique ID for this buffer instance */
      this.bufferId = crypto.randomUUID();
      /** @type {number} Timestamp when buffering started */
      this.startTime = Date.now();
      /** @type {Array<string>} Sentences that have been evaluated and approved */
      this.approvedSentences = [];
    }

    /**
     * Update the buffer with the latest text from the streaming element.
     * @param {string} currentText — Current full text of the response element
     */
    update(currentText) {
      this.bufferedText = currentText;
    }

    /**
     * Check if there is new content at a sentence boundary ready for evaluation.
     * @returns {string|null} New sentence(s) to evaluate, or null if none ready
     */
    getEvaluationChunk() {
      const text = this.bufferedText;
      if (text.length <= this.lastEvalIndex) return null;

      const unprocessed = text.slice(this.lastEvalIndex);

      // Look for sentence boundaries in the unprocessed text
      const match = SENTENCE_BOUNDARY.exec(unprocessed);
      if (!match) return null;

      // Extract up to and including the sentence boundary
      const endIndex = this.lastEvalIndex + match.index + match[0].length;
      const chunk = text.slice(this.lastEvalIndex, endIndex).trim();
      this.lastEvalIndex = endIndex;

      return chunk.length > 0 ? chunk : null;
    }

    /**
     * Get all remaining text that hasn't been evaluated (on stream complete).
     * @returns {string|null}
     */
    getRemaining() {
      if (this.lastEvalIndex >= this.bufferedText.length) return null;
      const remaining = this.bufferedText.slice(this.lastEvalIndex).trim();
      this.lastEvalIndex = this.bufferedText.length;
      return remaining.length > 0 ? remaining : null;
    }

    /**
     * Show the "Phylax is reviewing..." spinner over the response container.
     */
    showSpinner() {
      if (this.spinnerOverlay) return;

      // Hide the response content while reviewing
      this.originalVisibility = this.element.style.visibility || '';
      this.element.style.visibility = 'hidden';
      this.element.style.position = 'relative';

      const overlay = document.createElement('div');
      overlay.className = 'phylax-review-spinner';
      overlay.dataset.phylaxBufferId = this.bufferId;
      overlay.style.cssText = `
        position: absolute;
        top: 0; left: 0; right: 0;
        min-height: 48px;
        background: transparent;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: rgba(124, 92, 255, 0.8);
        z-index: 100;
        visibility: visible;
      `;

      // Animated spinner
      const spinnerStyle = document.createElement('style');
      spinnerStyle.textContent = `
        @keyframes phylaxSpin {
          to { transform: rotate(360deg); }
        }
      `;
      overlay.appendChild(spinnerStyle);

      const spinner = document.createElement('div');
      spinner.style.cssText = `
        width: 16px; height: 16px;
        border: 2px solid rgba(124, 92, 255, 0.2);
        border-top-color: rgba(124, 92, 255, 0.8);
        border-radius: 50%;
        animation: phylaxSpin 0.8s linear infinite;
        flex-shrink: 0;
      `;

      const text = document.createElement('span');
      text.textContent = 'Phylax is reviewing...';

      overlay.appendChild(spinner);
      overlay.appendChild(text);

      // Insert overlay relative to the response element
      this.element.parentNode.insertBefore(overlay, this.element);
      this.spinnerOverlay = overlay;
    }

    /**
     * Remove the spinner and restore the response container visibility.
     */
    hideSpinner() {
      if (this.spinnerOverlay) {
        this.spinnerOverlay.remove();
        this.spinnerOverlay = null;
      }
      if (this.element) {
        this.element.style.visibility = this.originalVisibility || '';
      }
    }

    /**
     * Clean up this buffer instance.
     */
    destroy() {
      this.hideSpinner();
      this.isComplete = true;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // PROMPT INTERCEPTION
  // ═════════════════════════════════════════════════════════════════

  /**
   * Hook the user input area to capture outgoing prompts.
   * Intercepts submission via Enter key and submit button clicks.
   */
  let promptHooked = false;

  function hookPromptInput() {
    if (promptHooked) return;

    const inputEl = resolveSelector('inputArea');
    if (!inputEl) return;

    const submitBtn = resolveSelector('submitButton');

    // Capture prompt text on submission
    function capturePrompt() {
      let promptText = '';

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        promptText = inputEl.value?.trim() || '';
      } else {
        // contenteditable or custom element
        promptText = (inputEl.innerText || inputEl.textContent || '').trim();
      }

      if (!promptText || promptText.length < 2) return;

      const api = getSignalAPI();
      if (!api) return;

      api.captureAndEmit({
        source_type: api.SOURCE_TYPES.LLM_RESPONSE,
        content: api.truncateContent(promptText, 5000),
        direction: api.DIRECTIONS.OUTGOING,
        platform: platform,
        modality: api.MODALITIES.TEXT,
        author_role: api.AUTHOR_ROLES.USER,
        thread_id: extractThreadId(),
        conversation_history: [],
        platform_features: [],
      });
    }

    // Hook Enter key (with no Shift for most LLMs)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Small delay to let the input value be set before capture
        setTimeout(capturePrompt, 0);
      }
    }, true);

    // Hook submit button click
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        setTimeout(capturePrompt, 0);
      }, true);
    }

    // Hook form submission if there is a form
    const form = inputEl.closest('form');
    if (form && !form.dataset.phylaxHooked) {
      form.dataset.phylaxHooked = 'true';
      form.addEventListener('submit', () => {
        setTimeout(capturePrompt, 0);
      }, true);
    }

    promptHooked = true;
    console.log(`[Phylax LLM Observer] Prompt input hooked on ${platform}`);
  }

  // ── Thread ID extraction ──────────────────────────────────────────

  /**
   * Extract a conversation/thread ID from the current URL.
   * Each LLM platform encodes the conversation ID differently.
   * @returns {string|null}
   */
  function extractThreadId() {
    const path = window.location.pathname;
    try {
      switch (platform) {
        case 'chatgpt': {
          // URL: /c/uuid or /g/uuid
          const match = path.match(/\/[cg]\/([a-f0-9-]+)/i);
          return match ? match[1] : null;
        }
        case 'claude': {
          // URL: /chat/uuid
          const match = path.match(/\/chat\/([a-f0-9-]+)/i);
          return match ? match[1] : null;
        }
        case 'gemini': {
          // URL: /app/uuid
          const match = path.match(/\/app\/([a-f0-9]+)/i);
          return match ? match[1] : null;
        }
        default:
          return null;
      }
    } catch { return null; }
  }

  // ═════════════════════════════════════════════════════════════════
  // RESPONSE OBSERVATION
  // ═════════════════════════════════════════════════════════════════

  /** @type {Map<Element, StreamingBuffer>} Active streaming buffers keyed by response element */
  const activeBuffers = new Map();

  /** @type {Set<Element>} Response elements that have been fully processed */
  const processedResponses = new Set();

  /** @type {number|null} Polling interval for streaming buffer updates */
  let bufferPollInterval = null;

  /**
   * Check if a response element is currently streaming (incomplete).
   * Uses platform-specific heuristics.
   *
   * @param {Element} el — Response container element
   * @returns {boolean}
   */
  function isStreaming(el) {
    if (!el) return false;

    switch (platform) {
      case 'chatgpt': {
        // ChatGPT shows a "stop generating" button during streaming
        const stopBtn = document.querySelector('button[aria-label="Stop generating"]');
        if (stopBtn) return true;
        // Check for the streaming indicator (animated cursor)
        const cursor = el.querySelector('.result-streaming, .streaming-dot');
        if (cursor) return true;
        return false;
      }
      case 'claude': {
        // Claude uses data-is-streaming attribute
        if (el.hasAttribute('data-is-streaming')) return true;
        // Check for stop button
        const stopBtn = document.querySelector('button[aria-label="Stop Response"]');
        if (stopBtn) return true;
        return false;
      }
      case 'gemini': {
        // Gemini shows a loading indicator during streaming
        const loading = document.querySelector('.loading-indicator, .response-loading');
        if (loading) return true;
        // Check for stop button
        const stopBtn = document.querySelector('button[aria-label="Stop"]');
        if (stopBtn) return true;
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Get all current assistant response elements on the page.
   * @returns {Element[]}
   */
  function getResponseElements() {
    const result = resolveSelector('responseContainer', { all: true });
    if (!result) return [];
    return Array.from(result instanceof NodeList ? result : (Array.isArray(result) ? result : [result]));
  }

  /**
   * Process a completed response element — extract text and emit signal.
   *
   * @param {Element} responseEl
   * @param {StreamingBuffer} [buffer] — If from a streaming buffer
   */
  function processCompletedResponse(responseEl, buffer) {
    if (processedResponses.has(responseEl)) return;
    processedResponses.add(responseEl);

    const api = getSignalAPI();
    if (!api) return;

    const text = api.extractText(responseEl);
    if (!text || text.length < 5) return;

    // Detect platform features
    const features = [];
    if (buffer) features.push('streaming');
    if (responseEl.querySelector('pre, code')) features.push('code_block');
    if (responseEl.querySelector('img')) features.push('image');
    if (responseEl.querySelector('table')) features.push('table');
    if (responseEl.querySelector('ol, ul')) features.push('list');
    if (responseEl.querySelector('[data-math], .katex, .mathjax')) features.push('math');

    api.captureAndEmit({
      source_type: api.SOURCE_TYPES.LLM_RESPONSE,
      content: api.truncateContent(text, 10000),
      direction: api.DIRECTIONS.INCOMING,
      platform: platform,
      modality: api.MODALITIES.TEXT,
      author_role: api.AUTHOR_ROLES.ASSISTANT,
      thread_id: extractThreadId(),
      conversation_history: collectConversationHistory(responseEl),
      platform_features: features,
    });

    // Clean up buffer if present
    if (buffer) {
      buffer.destroy();
      activeBuffers.delete(responseEl);
    }
  }

  /**
   * Collect recent conversation history for context.
   * Extracts the last few user/assistant turns before the given element.
   *
   * @param {Element} currentResponseEl — The response element to get history for
   * @returns {Array<{role: string, content: string}>}
   */
  function collectConversationHistory(currentResponseEl) {
    const history = [];
    const api = getSignalAPI();
    if (!api) return history;

    try {
      const allResponses = getResponseElements();
      const currentIndex = allResponses.indexOf(currentResponseEl);
      if (currentIndex < 0) return history;

      // Collect up to 3 prior turns (alternating user/assistant)
      const maxHistory = 3;
      let count = 0;

      for (let i = Math.max(0, currentIndex - maxHistory); i < currentIndex && count < maxHistory; i++) {
        const el = allResponses[i];
        const text = api.extractText(el);
        if (text && text.length > 5) {
          history.push({
            role: 'assistant',
            content: api.truncateContent(text, 500),
          });
          count++;
        }
      }
    } catch { /* silent — history is optional context */ }

    return history;
  }

  // ═════════════════════════════════════════════════════════════════
  // STREAMING BUFFER POLLING
  // ═════════════════════════════════════════════════════════════════

  /**
   * Poll active streaming buffers for new sentence-boundary content.
   * Called periodically while any stream is active.
   */
  function pollStreamingBuffers() {
    if (activeBuffers.size === 0) {
      if (bufferPollInterval) {
        clearInterval(bufferPollInterval);
        bufferPollInterval = null;
      }
      return;
    }

    const api = getSignalAPI();

    for (const [el, buffer] of activeBuffers) {
      // Update buffer with current element text
      const currentText = (el.innerText || el.textContent || '').trim();
      buffer.update(currentText);

      // Check if streaming has completed
      if (!isStreaming(el)) {
        buffer.isComplete = true;

        // Process any remaining text
        const remaining = buffer.getRemaining();
        if (remaining && api) {
          emitStreamChunk(remaining, buffer, true);
        }

        // Process the full completed response
        processCompletedResponse(el, buffer);
        continue;
      }

      // Stream still active — evaluate at sentence boundaries
      let chunk;
      while ((chunk = buffer.getEvaluationChunk()) !== null) {
        if (api) {
          emitStreamChunk(chunk, buffer, false);
        }
      }
    }
  }

  /**
   * Emit a streaming chunk signal for evaluation.
   *
   * @param {string} chunk — The text chunk to evaluate
   * @param {StreamingBuffer} buffer — The source buffer
   * @param {boolean} isFinal — Whether this is the final chunk
   */
  function emitStreamChunk(chunk, buffer, isFinal) {
    const api = getSignalAPI();
    if (!api || !chunk) return;

    api.captureAndEmit({
      source_type: api.SOURCE_TYPES.LLM_RESPONSE,
      content: chunk,
      direction: api.DIRECTIONS.INCOMING,
      platform: platform,
      modality: api.MODALITIES.TEXT,
      author_role: api.AUTHOR_ROLES.ASSISTANT,
      thread_id: extractThreadId(),
      conversation_history: [],
      platform_features: isFinal ? ['streaming', 'stream_complete'] : ['streaming', 'stream_chunk'],
    });
  }

  /**
   * Start polling streaming buffers if not already running.
   */
  function startBufferPolling() {
    if (bufferPollInterval) return;
    bufferPollInterval = setInterval(pollStreamingBuffers, 300);
  }

  // ═════════════════════════════════════════════════════════════════
  // MUTATION OBSERVER — detect new responses
  // ═════════════════════════════════════════════════════════════════

  /** @type {MutationObserver|null} */
  let responseObserver = null;

  /** @type {number} Debounce timer for mutation processing */
  let mutationDebounceTimer = null;

  /**
   * Process DOM mutations to detect new assistant responses.
   * Debounced to avoid excessive processing during rapid DOM updates.
   */
  function onMutations() {
    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(scanForNewResponses, 200);
  }

  /**
   * Scan the page for new response elements.
   * If a response is streaming, set up a buffer.
   * If a response is complete, process it immediately.
   */
  function scanForNewResponses() {
    const responses = getResponseElements();

    for (const el of responses) {
      // Skip already-processed responses
      if (processedResponses.has(el)) continue;

      // Skip responses we're already buffering
      if (activeBuffers.has(el)) continue;

      if (isStreaming(el)) {
        // New streaming response — set up buffer and spinner
        const buffer = new StreamingBuffer(el);
        activeBuffers.set(el, buffer);
        buffer.showSpinner();
        startBufferPolling();
      } else {
        // Completed response — process immediately
        const text = (el.innerText || el.textContent || '').trim();
        if (text.length > 5) {
          processCompletedResponse(el);
        }
      }
    }

    // Re-check for prompt input hook (SPA may have re-rendered the input)
    if (!promptHooked) {
      hookPromptInput();
    }
  }

  /**
   * Start the MutationObserver on the document body.
   */
  function startObserving() {
    if (responseObserver) return;

    const target = document.body;
    if (!target) return;

    responseObserver = new MutationObserver(onMutations);
    responseObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial scan for any responses already present
    scanForNewResponses();
  }

  // ═════════════════════════════════════════════════════════════════
  // NETWORK INTERCEPTION (Fallback 3)
  // ═════════════════════════════════════════════════════════════════

  /**
   * Fallback 3: Intercept network responses via fetch/XHR monkeypatching.
   * Used when DOM selectors fail to find response containers.
   * Only activates if all DOM-based strategies fail.
   *
   * This patches window.fetch and XMLHttpRequest to inspect responses
   * from known LLM API endpoints.
   */
  let networkInterceptActive = false;

  /** @type {RegExp} URL patterns for LLM API endpoints */
  const API_PATTERNS = {
    chatgpt: /\/backend-api\/conversation/,
    claude:  /\/api\/(organizations|chat_conversations|completion)/,
    gemini:  /\/batchexecute|GenerateContent/,
  };

  function activateNetworkIntercept() {
    if (networkInterceptActive) return;
    networkInterceptActive = true;

    const apiPattern = API_PATTERNS[platform];
    if (!apiPattern) return;

    // Patch fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

      if (apiPattern.test(url)) {
        try {
          // Clone the response so we can read it without consuming the stream
          const clone = response.clone();
          clone.text().then(body => {
            processNetworkResponse(body, url);
          }).catch(() => { /* silent */ });
        } catch { /* silent */ }
      }

      return response;
    };

    // Patch XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._phylaxUrl = url;
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (this._phylaxUrl && apiPattern.test(this._phylaxUrl)) {
        this.addEventListener('load', function () {
          try {
            processNetworkResponse(this.responseText, this._phylaxUrl);
          } catch { /* silent */ }
        });
      }
      return originalXHRSend.apply(this, args);
    };

    console.log(`[Phylax LLM Observer] Network intercept activated for ${platform}`);
  }

  /**
   * Process a network response body from an LLM API call.
   * Extracts the assistant message text and emits a signal.
   *
   * @param {string} body — Response body text
   * @param {string} url — Request URL
   */
  function processNetworkResponse(body, url) {
    if (!body || body.length < 10) return;

    const api = getSignalAPI();
    if (!api) return;

    let extractedText = '';

    try {
      switch (platform) {
        case 'chatgpt': {
          // ChatGPT streams data: lines with JSON payloads
          const lines = body.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            const jsonStr = line.slice(6); // Remove 'data: '
            if (jsonStr === '[DONE]') break;
            try {
              const data = JSON.parse(jsonStr);
              const content = data?.message?.content?.parts?.join('') ||
                              data?.choices?.[0]?.delta?.content || '';
              if (content) extractedText += content;
            } catch { /* skip malformed JSON lines */ }
          }
          break;
        }
        case 'claude': {
          // Claude also uses SSE-style streaming
          const lines = body.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              const content = data?.completion || data?.delta?.text || '';
              if (content) extractedText += content;
            } catch { /* skip */ }
          }
          break;
        }
        case 'gemini': {
          // Gemini uses a different response format
          try {
            const data = JSON.parse(body);
            extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          } catch {
            // May be wrapped in array or different structure
            const textMatch = body.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (textMatch) extractedText = JSON.parse('"' + textMatch[1] + '"');
          }
          break;
        }
      }
    } catch { /* silent */ }

    if (extractedText && extractedText.length > 5) {
      api.captureAndEmit({
        source_type: api.SOURCE_TYPES.LLM_RESPONSE,
        content: api.truncateContent(extractedText, 10000),
        direction: api.DIRECTIONS.INCOMING,
        platform: platform,
        modality: api.MODALITIES.TEXT,
        author_role: api.AUTHOR_ROLES.ASSISTANT,
        thread_id: extractThreadId(),
        conversation_history: [],
        platform_features: ['network_intercept'],
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // SPA NAVIGATION TRACKING
  // ═════════════════════════════════════════════════════════════════

  let lastHref = window.location.href;

  /**
   * Handle SPA navigation — reset state when the conversation changes.
   */
  function onNavigationChange() {
    const currentHref = window.location.href;
    if (currentHref === lastHref) return;
    lastHref = currentHref;

    // New conversation — reset processed responses
    processedResponses.clear();

    // Clean up any active streaming buffers
    for (const [, buffer] of activeBuffers) {
      buffer.destroy();
    }
    activeBuffers.clear();

    // Reset prompt hook (SPA re-renders the input)
    promptHooked = false;

    // Re-scan after a short delay for the new page content to load
    setTimeout(scanForNewResponses, 1000);
    setTimeout(hookPromptInput, 1000);
  }

  // ═════════════════════════════════════════════════════════════════
  // INIT
  // ═════════════════════════════════════════════════════════════════

  function init() {
    // Wait for signal-capture.js to be ready
    if (!getSignalAPI()) {
      // Retry up to 10 times (signal-capture.js should load before us)
      let attempts = 0;
      const waitInterval = setInterval(() => {
        attempts++;
        if (getSignalAPI() || attempts > 10) {
          clearInterval(waitInterval);
          if (!getSignalAPI()) {
            console.warn('[Phylax LLM Observer] signal-capture.js not found — running in degraded mode');
          }
          startInit();
        }
      }, 200);
      return;
    }
    startInit();
  }

  function startInit() {
    // Start observing when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startObserving();
        hookPromptInput();
      });
    } else {
      startObserving();
      hookPromptInput();
    }

    // URL change polling for SPA navigation
    setInterval(() => {
      onNavigationChange();
    }, 1000);

    // Activate network intercept as a persistent fallback
    // It runs alongside DOM observation — if DOM selectors work, network
    // data is simply additional confirmation. If DOM selectors fail,
    // network intercept becomes the primary capture method.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activateNetworkIntercept);
    } else {
      activateNetworkIntercept();
    }

    console.log(`[Phylax LLM Observer v1.0] Active on ${platform} (${host})`);
  }

  init();
})();
