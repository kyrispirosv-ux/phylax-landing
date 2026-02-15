// Phylax SafeGuard — YouTube Search Result Scanner v1.0
//
// Element-level YouTube video blocking.
// Scans each video card on search result pages and classifies independently.
// Does NOT block youtube.com itself — only individual harmful videos.
//
// Flow:
//   1. Detect YouTube search result page
//   2. Extract metadata per video card (title, channel, description, badges)
//   3. Send each video to background for classification via risk-classifier
//   4. Apply visual treatment per-card: blur thumbnail, disable click, overlay label
//
// This is a content script — no ES module imports allowed.

(function () {
  'use strict';

  const host = window.location.hostname;
  if (!host.includes('youtube.com') && !host.includes('youtu.be')) return;
  if (window.location.protocol === 'chrome-extension:') return;

  // ── Config ──────────────────────────────────────────────────────
  const SCAN_DEBOUNCE_MS = 800;
  const RESCAN_INTERVAL_MS = 3000;
  const MAX_VIDEOS_PER_SCAN = 50;

  let scanTimer = null;
  let rescanInterval = null;
  let processedVideoIds = new Set();
  let isSearchPage = false;

  // ── Context validity ────────────────────────────────────────────
  function isContextValid() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  // ═════════════════════════════════════════════════════════════════
  // YOUTUBE SEARCH RESULT DETECTION
  // ═════════════════════════════════════════════════════════════════

  function checkIfSearchPage() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    return path === '/results' && params.has('search_query');
  }

  function getSearchQuery() {
    try {
      return new URLSearchParams(window.location.search).get('search_query') || '';
    } catch { return ''; }
  }

  // ═════════════════════════════════════════════════════════════════
  // VIDEO CARD EXTRACTION
  // ═════════════════════════════════════════════════════════════════

  /**
   * Find all video renderer elements on the current YouTube page.
   * Works on: search results, home page, channel pages, playlist pages.
   */
  function findVideoCards() {
    // Search results use ytd-video-renderer
    // Home page uses ytd-rich-item-renderer > ytd-rich-grid-media
    // Shorts shelf uses ytd-reel-item-renderer
    const selectors = [
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',      // sidebar recommendations
      'ytd-grid-video-renderer',          // channel page grid
    ];

    const cards = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        cards.push(el);
      }
    }
    return cards;
  }

  /**
   * Extract metadata from a single video card element.
   * Returns null if the element doesn't contain enough info.
   */
  function extractVideoMetadata(cardElement) {
    // Title
    const titleEl = cardElement.querySelector(
      '#video-title, ' +
      'a#video-title-link, ' +
      'yt-formatted-string#video-title, ' +
      'h3 a#video-title, ' +
      '.title-and-badge a'
    );
    const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';
    if (!title || title.length < 3) return null;

    // Video URL & ID
    const linkEl = cardElement.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    const href = linkEl?.getAttribute('href') || '';
    let videoId = '';
    try {
      if (href.includes('/watch?v=')) {
        videoId = new URL('https://youtube.com' + href).searchParams.get('v') || '';
      } else if (href.includes('/shorts/')) {
        videoId = href.split('/shorts/')[1]?.split(/[?#]/)[0] || '';
      }
    } catch { /* ignore */ }

    if (!videoId) return null;

    // Channel name
    const channelEl = cardElement.querySelector(
      'ytd-channel-name a, ' +
      '.ytd-channel-name a, ' +
      '#channel-info a, ' +
      '#text.ytd-channel-name, ' +
      'yt-formatted-string.ytd-channel-name'
    );
    const channel = channelEl?.textContent?.trim() || '';

    // Description snippet (search results include a snippet)
    const descEl = cardElement.querySelector(
      '.metadata-snippet-text, ' +
      'yt-formatted-string.metadata-snippet-text, ' +
      '#description-text, ' +
      '.style-scope.ytd-video-renderer #description-text'
    );
    const description = descEl?.textContent?.trim() || '';

    // Badges (e.g., "Live", "New", etc.)
    const badgeEls = cardElement.querySelectorAll(
      'ytd-badge-supported-renderer, ' +
      '.badge-style-type-simple, ' +
      '.ytd-badge-supported-renderer'
    );
    const badges = Array.from(badgeEls).map(b => b.textContent?.trim()).filter(Boolean);

    // View count & publish date (for context)
    const metaEl = cardElement.querySelector(
      '#metadata-line, ' +
      '.inline-metadata-item, ' +
      'ytd-video-meta-block'
    );
    const metaText = metaEl?.textContent?.trim() || '';

    // Thumbnail element (for blur treatment)
    const thumbnail = cardElement.querySelector(
      'ytd-thumbnail, ' +
      '#thumbnail, ' +
      'a.ytd-thumbnail'
    );

    return {
      videoId,
      title,
      channel,
      description,
      badges,
      metaText,
      href,
      element: cardElement,
      thumbnailElement: thumbnail,
      titleElement: titleEl,
      linkElement: linkEl,
    };
  }

  // ═════════════════════════════════════════════════════════════════
  // CLASSIFICATION — send to background for risk analysis
  // ═════════════════════════════════════════════════════════════════

  /**
   * Classify a single video by sending its metadata to the background
   * service worker for evaluation through the risk-classifier pipeline.
   */
  async function classifyVideo(metadata) {
    if (!isContextValid()) return null;

    // Build combined content text for classification
    const contentText = [
      metadata.title,
      metadata.description,
      metadata.channel,
      metadata.badges.join(' '),
    ].filter(Boolean).join(' | ');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_CLASSIFY_VIDEO',
        video: {
          videoId: metadata.videoId,
          title: metadata.title,
          channel: metadata.channel,
          description: metadata.description,
          badges: metadata.badges,
          contentText,
        },
        searchQuery: getSearchQuery(),
      });

      return response?.classification || null;
    } catch (err) {
      console.warn('[Phylax YT Scanner] Classification failed:', err.message);
      return null;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // UI TREATMENT — apply visual blocking per video card
  // ═════════════════════════════════════════════════════════════════

  /**
   * Apply visual treatment to a video card based on its classification.
   *
   * BLOCK: blur thumbnail, disable click, overlay "Blocked by Phylax"
   * WARN:  subtle yellow shield icon with tooltip
   * ALLOW: no visual change
   */
  function applyVideoTreatment(metadata, classification) {
    if (!classification) return;

    const card = metadata.element;
    if (!card) return;

    // Prevent double-treatment
    if (card.dataset.phylaxScanned === 'true') return;
    card.dataset.phylaxScanned = 'true';
    card.dataset.phylaxDecision = classification.decision;

    if (classification.decision === 'block') {
      applyBlockTreatment(card, metadata, classification);
    } else if (classification.decision === 'warn') {
      applyWarnTreatment(card, metadata, classification);
    }
    // 'allow': do nothing — video behaves normally
  }

  /**
   * BLOCK treatment: blur thumbnail, disable click, show overlay label.
   */
  function applyBlockTreatment(card, metadata, classification) {
    // 1. Blur the thumbnail
    const thumbnail = metadata.thumbnailElement || card.querySelector('ytd-thumbnail, #thumbnail');
    if (thumbnail) {
      thumbnail.style.filter = 'blur(20px) grayscale(1)';
      thumbnail.style.pointerEvents = 'none';
      thumbnail.style.position = 'relative';
    }

    // 2. Disable all links inside the card
    const links = card.querySelectorAll('a');
    for (const link of links) {
      link.addEventListener('click', preventClick, true);
      link.style.pointerEvents = 'none';
    }

    // 3. Add overlay label
    const overlay = document.createElement('div');
    overlay.className = 'phylax-video-block-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(10, 10, 20, 0.88);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
      border-radius: 12px;
      pointer-events: auto;
      cursor: default;
    `;

    // Shield icon
    const shield = document.createElement('div');
    shield.style.cssText = `
      width: 36px; height: 36px;
      background: linear-gradient(135deg, #7C5CFF, #22D3EE);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 8px;
      box-shadow: 0 4px 12px rgba(124, 92, 255, 0.4);
    `;
    shield.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

    // Label text
    const label = document.createElement('div');
    label.style.cssText = `
      color: white;
      font-size: 12px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      line-height: 1.4;
      padding: 0 12px;
      max-width: 200px;
    `;
    label.textContent = 'Blocked by Phylax — Restricted Topic';

    // Category badge
    const badge = document.createElement('div');
    badge.style.cssText = `
      margin-top: 6px;
      padding: 3px 10px;
      background: rgba(124, 92, 255, 0.25);
      border: 1px solid rgba(124, 92, 255, 0.4);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 10px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    badge.textContent = classification.category || 'restricted';

    overlay.appendChild(shield);
    overlay.appendChild(label);
    overlay.appendChild(badge);

    // Position overlay relative to thumbnail
    if (thumbnail) {
      thumbnail.style.position = 'relative';
      thumbnail.appendChild(overlay);
    } else {
      card.style.position = 'relative';
      card.appendChild(overlay);
    }

    // 4. Dim the metadata (title, channel, etc.)
    const metaArea = card.querySelector('#meta, #details, .text-wrapper');
    if (metaArea) {
      metaArea.style.opacity = '0.3';
      metaArea.style.pointerEvents = 'none';
    }

    console.log(`[Phylax YT Scanner] BLOCKED: "${metadata.title}" (${classification.category}, risk: ${classification.risk_score})`);
  }

  /**
   * WARN treatment: subtle yellow shield icon with tooltip.
   * Video is still accessible but flagged.
   */
  function applyWarnTreatment(card, metadata, classification) {
    const thumbnail = metadata.thumbnailElement || card.querySelector('ytd-thumbnail, #thumbnail');
    if (!thumbnail) return;

    thumbnail.style.position = 'relative';

    // Yellow shield icon (subtle, top-right corner)
    const shield = document.createElement('div');
    shield.className = 'phylax-video-warn-shield';
    shield.style.cssText = `
      position: absolute;
      top: 8px; right: 8px;
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #F59E0B, #EAB308);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      z-index: 10;
      cursor: help;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.5);
      transition: transform 0.2s ease;
    `;
    shield.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      background: #1a1a2e;
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      color: white;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.4;
      white-space: nowrap;
      z-index: 11;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      max-width: 250px;
      white-space: normal;
    `;
    tooltip.textContent = 'Early-stage manipulation pattern detected.';

    shield.appendChild(tooltip);
    shield.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      shield.style.transform = 'scale(1.1)';
    });
    shield.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      shield.style.transform = 'scale(1)';
    });

    thumbnail.appendChild(shield);

    console.log(`[Phylax YT Scanner] WARN: "${metadata.title}" (${classification.category}, risk: ${classification.risk_score})`);
  }

  /**
   * Prevent click on blocked video links.
   */
  function preventClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }

  // ═════════════════════════════════════════════════════════════════
  // SCAN ORCHESTRATION
  // ═════════════════════════════════════════════════════════════════

  /**
   * Main scan function: finds all video cards, extracts metadata,
   * classifies each one, and applies visual treatments.
   */
  async function scanVideoCards() {
    if (!isContextValid()) return;

    const cards = findVideoCards();
    let scannedCount = 0;

    for (const card of cards) {
      if (scannedCount >= MAX_VIDEOS_PER_SCAN) break;

      // Skip already-scanned cards
      if (card.dataset.phylaxScanned === 'true') continue;

      const metadata = extractVideoMetadata(card);
      if (!metadata) continue;

      // Skip already-processed video IDs
      if (processedVideoIds.has(metadata.videoId)) {
        card.dataset.phylaxScanned = 'true';
        continue;
      }

      processedVideoIds.add(metadata.videoId);
      scannedCount++;

      // Classify (async, non-blocking per card)
      classifyVideo(metadata).then(classification => {
        if (classification) {
          applyVideoTreatment(metadata, classification);
        }
      });
    }

    if (scannedCount > 0) {
      console.log(`[Phylax YT Scanner] Scanned ${scannedCount} new videos on "${getSearchQuery()}"`);
    }
  }

  /**
   * Debounced scan trigger — called on mutations and navigation.
   */
  function debouncedScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVideoCards, SCAN_DEBOUNCE_MS);
  }

  // ═════════════════════════════════════════════════════════════════
  // NAVIGATION & MUTATION TRACKING
  // ═════════════════════════════════════════════════════════════════

  /**
   * YouTube SPA navigation handler.
   * YouTube uses client-side navigation — we detect page changes
   * via title observer and yt-navigate-finish events.
   */
  function onNavigationChange() {
    const wasSearchPage = isSearchPage;
    isSearchPage = checkIfSearchPage();

    if (isSearchPage) {
      // New search page — reset and scan
      if (!wasSearchPage || window.location.search !== lastSearch) {
        processedVideoIds.clear();
        // Remove existing overlays from previous search
        document.querySelectorAll('[data-phylax-scanned]').forEach(el => {
          el.removeAttribute('data-phylax-scanned');
          el.removeAttribute('data-phylax-decision');
        });
        document.querySelectorAll('.phylax-video-block-overlay, .phylax-video-warn-shield').forEach(el => el.remove());
      }
      debouncedScan();
      startRescanInterval();
    } else {
      stopRescanInterval();
    }

    lastSearch = window.location.search;
  }

  let lastSearch = window.location.search;

  function startRescanInterval() {
    if (rescanInterval) return;
    rescanInterval = setInterval(() => {
      if (checkIfSearchPage()) {
        debouncedScan();
      }
    }, RESCAN_INTERVAL_MS);
  }

  function stopRescanInterval() {
    if (rescanInterval) {
      clearInterval(rescanInterval);
      rescanInterval = null;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // INIT
  // ═════════════════════════════════════════════════════════════════

  function init() {
    isSearchPage = checkIfSearchPage();

    // YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', onNavigationChange);
    window.addEventListener('yt-page-data-updated', onNavigationChange);

    // URL change polling (fallback for SPA)
    let lastHref = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        onNavigationChange();
      }
    }, 1000);

    // MutationObserver for dynamically loaded video cards
    const observer = new MutationObserver((mutations) => {
      if (!isSearchPage) return;
      // Only trigger scan if new video elements were added
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && (
            node.tagName === 'YTD-VIDEO-RENDERER' ||
            node.tagName === 'YTD-RICH-ITEM-RENDERER' ||
            node.querySelector?.('ytd-video-renderer, ytd-rich-item-renderer')
          )) {
            debouncedScan();
            return;
          }
        }
      }
    });

    // Start observing once body is available
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    // Initial scan if already on search page
    if (isSearchPage) {
      // Wait for YouTube to render search results
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(scanVideoCards, 1500);
          startRescanInterval();
        });
      } else {
        setTimeout(scanVideoCards, 1500);
        startRescanInterval();
      }
    }

    console.log('[Phylax YT Scanner v1.0] Active — element-level video classification');
  }

  init();
})();
