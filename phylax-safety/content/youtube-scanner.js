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
  let isWatchPage = false;
  let watchPageBlockOverlay = null;
  let lastCheckedWatchId = null;

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

  function checkIfWatchPage() {
    return window.location.pathname === '/watch' &&
      new URLSearchParams(window.location.search).has('v');
  }

  function getWatchVideoId() {
    try {
      return new URLSearchParams(window.location.search).get('v') || '';
    } catch { return ''; }
  }

  function getSearchQuery() {
    try {
      return new URLSearchParams(window.location.search).get('search_query') || '';
    } catch { return ''; }
  }

  // ═════════════════════════════════════════════════════════════════
  // WATCH PAGE — classify the currently playing video
  // ═════════════════════════════════════════════════════════════════

  /**
   * Extract metadata from the current watch page.
   * Waits for the title to appear (YouTube is a SPA and loads async).
   */
  function extractWatchPageMetadata() {
    const videoId = getWatchVideoId();
    if (!videoId) return null;

    // Primary title selectors (YouTube changes these periodically)
    // Try multiple selector strategies — YouTube's DOM varies across layouts
    const titleSelectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.title yt-formatted-string',
      '#title h1 yt-formatted-string',
      'ytd-watch-metadata h1',
      '#info-contents h1',
      '#above-the-fold h1',
      '#title yt-formatted-string',
      'ytd-watch-metadata yt-formatted-string',
      '#above-the-fold yt-formatted-string.ytd-watch-metadata',
      'h1.ytd-video-primary-info-renderer',
      '#container h1',
    ];
    let title = '';
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        title = el.textContent?.trim() || '';
        if (title.length >= 3) break;
      }
    }

    // Fallback: YouTube sets document.title to "VideoTitle - YouTube"
    if (!title || title.length < 3) {
      const docTitle = document.title || '';
      if (docTitle.endsWith(' - YouTube')) {
        title = docTitle.slice(0, -' - YouTube'.length).trim();
      } else if (docTitle.length > 3 && docTitle !== 'YouTube') {
        title = docTitle.trim();
      }
    }

    if (!title || title.length < 3) return null;

    // Channel name
    const channelEl = document.querySelector(
      'ytd-channel-name yt-formatted-string a, ' +
      '#channel-name a, ' +
      '#owner-name a, ' +
      'ytd-video-owner-renderer a'
    );
    const channel = channelEl?.textContent?.trim() || '';

    // Description (first 300 chars)
    const descEl = document.querySelector(
      'ytd-text-inline-expander, ' +
      '#description-inline-expander, ' +
      '#description yt-formatted-string'
    );
    const description = (descEl?.textContent?.trim() || '').slice(0, 300);

    return { videoId, title, channel, description, badges: [] };
  }

  /**
   * Classify the currently playing video on a watch page.
   * If blocked, shows a full-page overlay covering the video player.
   */
  // Track watch page classification state separately from lastCheckedWatchId.
  // lastCheckedWatchId is ONLY set on successful classification to allow retries.
  let watchPageClassifyAttempts = 0;
  const MAX_WATCH_CLASSIFY_ATTEMPTS = 5;
  let watchPageBlockKillTimer = null;

  /**
   * Aggressively stop ALL media playback on the page.
   * Pauses, mutes, removes src, and calls load() to abort buffering.
   */
  function killAllMedia() {
    document.querySelectorAll('video, audio').forEach(el => {
      try {
        el.pause();
        el.muted = true;
        el.volume = 0;
        el.currentTime = 0;
        if (el.src) {
          el.removeAttribute('src');
          el.load(); // abort buffering
        }
        // Also clear any source elements inside
        el.querySelectorAll('source').forEach(s => s.remove());
        // Hide the element completely
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      } catch { /* ignore */ }
    });
    // Hide the YouTube player to prevent visual playback
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player) {
      player.style.visibility = 'hidden';
      // Use YouTube's internal API
      if (typeof player.stopVideo === 'function') player.stopVideo();
      if (typeof player.pauseVideo === 'function') player.pauseVideo();
    }
    // Kill the mini player
    const miniPlayer = document.querySelector('ytd-miniplayer');
    if (miniPlayer) miniPlayer.style.display = 'none';
    // Kill autoplay
    const autoplayBtn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (autoplayBtn) autoplayBtn.click();
  }

  async function checkWatchPageVideo() {
    if (!isContextValid()) return;
    if (!checkIfWatchPage()) return;

    const videoId = getWatchVideoId();
    if (!videoId) return;

    // Skip if this video was already successfully classified
    if (videoId === lastCheckedWatchId) return;

    watchPageClassifyAttempts++;
    if (watchPageClassifyAttempts > MAX_WATCH_CLASSIFY_ATTEMPTS) return;

    // Wait for title to load (YouTube SPA loads async)
    let metadata = null;
    for (let i = 0; i < 10; i++) {
      metadata = extractWatchPageMetadata();
      if (metadata) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!metadata) {
      console.log('[Phylax YT Scanner] Could not extract watch page metadata (attempt ' + watchPageClassifyAttempts + ')');
      // Schedule retry — don't give up
      if (watchPageClassifyAttempts < MAX_WATCH_CLASSIFY_ATTEMPTS) {
        setTimeout(() => checkWatchPageVideo(), 2000);
      }
      return;
    }

    const contentText = [metadata.title, metadata.description, metadata.channel]
      .filter(Boolean).join(' | ');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PHYLAX_CLASSIFY_VIDEO',
        video: {
          videoId: metadata.videoId,
          title: metadata.title,
          channel: metadata.channel,
          description: metadata.description,
          badges: [],
          contentText,
        },
        searchQuery: '',
      });

      const classification = response?.classification;
      if (!classification) {
        console.warn('[Phylax YT Scanner] No classification returned (attempt ' + watchPageClassifyAttempts + ')');
        // Retry if classification came back null
        if (watchPageClassifyAttempts < MAX_WATCH_CLASSIFY_ATTEMPTS) {
          setTimeout(() => checkWatchPageVideo(), 2000);
        }
        return;
      }

      // SUCCESS — mark this video as classified so we don't recheck
      lastCheckedWatchId = videoId;
      watchPageClassifyAttempts = 0;

      console.log(`[Phylax YT Scanner] Watch page: "${metadata.title}" → ${classification.decision} (${classification.category}, risk: ${classification.risk_score})`);

      if (classification.decision === 'block') {
        showWatchPageBlock(metadata, classification);
      }
    } catch (err) {
      console.warn('[Phylax YT Scanner] Watch page classification failed:', err.message);
      // Retry on error
      if (watchPageClassifyAttempts < MAX_WATCH_CLASSIFY_ATTEMPTS) {
        setTimeout(() => checkWatchPageVideo(), 2000);
      }
    }
  }

  /**
   * Show a full-page overlay blocking the video on a watch page.
   */
  function showWatchPageBlock(metadata, classification) {
    dismissWatchPageBlock();

    // Prevent scrolling behind the overlay
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'phylax-watch-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; width: 100vw; height: 100vh;
      background: rgba(5, 5, 10, 0.98); backdrop-filter: blur(16px);
      z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, sans-serif; overflow: hidden;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes phylaxFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      #phylax-watch-card { animation: phylaxFadeIn 0.3s ease; }
    `;
    overlay.appendChild(style);

    const reasonText = classification.category || 'restricted content';

    const card = document.createElement('div');
    card.id = 'phylax-watch-card';
    card.style.cssText = `
      background: #0f1525; border: 1px solid rgba(255,80,80,0.3);
      border-radius: 24px; padding: 48px; max-width: 420px; width: 90%;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;

    function esc(text) {
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    card.innerHTML = `
      <div style="width:72px;height:72px;margin:0 auto 24px;">
        <svg width="72" height="72" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="phylax-bg-w" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
            <linearGradient id="phylax-spiral-w" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
            <linearGradient id="phylax-text-w" x1="120" y1="420" x2="392" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#E8D5A0"/><stop offset="0.5" stop-color="#C9A84C"/><stop offset="1" stop-color="#E8D5A0"/></linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#phylax-bg-w)"/>
          <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
          <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-w)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
          <text x="256" y="425" text-anchor="middle" font-family="'Palatino Linotype','Book Antiqua',Palatino,Georgia,'Times New Roman',serif" font-weight="600" font-size="56" letter-spacing="18" fill="url(#phylax-text-w)">PHYLAX</text>
        </svg>
      </div>
      <h2 style="font-size:22px;font-weight:700;color:white;margin:0 0 12px;">Video Blocked</h2>
      <p style="font-size:15px;color:rgba(255,255,255,0.5);line-height:1.7;margin:0 0 8px;">
        Category: <span style="color:rgba(255,255,255,0.7);font-weight:600;">${esc(reasonText)}</span>
      </p>
      <p style="font-size:13px;color:rgba(255,255,255,0.35);margin:0 0 32px;">
        Parent notified
      </p>
      <button id="phylax-watch-back" style="
        padding:12px 32px;border-radius:12px;font-size:15px;font-weight:600;
        cursor:pointer;border:none;
        background:linear-gradient(135deg,#7C5CFF,rgba(124,92,255,0.8));
        color:white;box-shadow:0 4px 16px rgba(124,92,255,0.3);
        font-family:inherit;transition:all 0.2s;
      ">Go Back</button>
    `;

    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);
    watchPageBlockOverlay = overlay;

    // Aggressively kill ALL media playback
    killAllMedia();

    // Continuously prevent video from resuming (YouTube tries to auto-play)
    watchPageBlockKillTimer = setInterval(() => {
      if (!watchPageBlockOverlay) {
        clearInterval(watchPageBlockKillTimer);
        watchPageBlockKillTimer = null;
        return;
      }
      killAllMedia();
      // Re-attach overlay if YouTube's SPA removed it
      if (!document.getElementById('phylax-watch-overlay') && watchPageBlockOverlay) {
        document.documentElement.appendChild(watchPageBlockOverlay);
      }
    }, 500);

    // Go back button
    overlay.querySelector('#phylax-watch-back').addEventListener('click', () => {
      dismissWatchPageBlock();
      window.history.back();
    });

    // Notify background to alert parent
    if (isContextValid()) {
      try {
        chrome.runtime.sendMessage({
          type: 'PHYLAX_VIDEO_BLOCKED',
          video: {
            videoId: metadata.videoId,
            title: metadata.title,
            channel: metadata.channel,
          },
          classification,
          url: window.location.href,
          domain: host,
        });
      } catch { /* silent */ }
    }
  }

  function dismissWatchPageBlock() {
    if (watchPageBlockKillTimer) {
      clearInterval(watchPageBlockKillTimer);
      watchPageBlockKillTimer = null;
    }
    if (watchPageBlockOverlay) {
      watchPageBlockOverlay.remove();
      watchPageBlockOverlay = null;
    }
    // Restore body scrolling
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    // Restore video/audio element visibility
    document.querySelectorAll('video, audio').forEach(el => {
      el.style.display = '';
      el.style.visibility = '';
    });
    // Restore player visibility
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player) {
      player.style.visibility = '';
    }
    // Restore mini player
    const miniPlayer = document.querySelector('ytd-miniplayer');
    if (miniPlayer) miniPlayer.style.display = '';
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
   * BLOCK treatment: blur thumbnail, show overlay label.
   * Clicks are ALLOWED — navigating to the video triggers the watch-page
   * block overlay which shows the full alert + notifies parent + logs activity.
   */
  function applyBlockTreatment(card, metadata, classification) {
    // 1. Blur the thumbnail
    const thumbnail = metadata.thumbnailElement || card.querySelector('ytd-thumbnail, #thumbnail');
    if (thumbnail) {
      thumbnail.style.filter = 'blur(20px) grayscale(1)';
      thumbnail.style.position = 'relative';
    }

    // 2. Links remain clickable — watch page will catch & block with full overlay

    // 3. Add overlay label (clicks pass through to the link underneath)
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
      pointer-events: none;
      cursor: pointer;
    `;

    // Phylax logo icon
    const shield = document.createElement('div');
    shield.style.cssText = `
      width: 36px; height: 36px;
      margin-bottom: 8px;
    `;
    shield.innerHTML = `<svg width="36" height="36" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="phylax-bg-c" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
        <linearGradient id="phylax-spiral-c" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
        <linearGradient id="phylax-text-c" x1="120" y1="420" x2="392" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#E8D5A0"/><stop offset="0.5" stop-color="#C9A84C"/><stop offset="1" stop-color="#E8D5A0"/></linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#phylax-bg-c)"/>
      <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
      <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-c)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
      <text x="256" y="425" text-anchor="middle" font-family="'Palatino Linotype','Book Antiqua',Palatino,Georgia,'Times New Roman',serif" font-weight="600" font-size="56" letter-spacing="18" fill="url(#phylax-text-c)">PHYLAX</text>
    </svg>`;

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

    // 4. Dim the metadata (title, channel, etc.) but keep clickable
    const metaArea = card.querySelector('#meta, #details, .text-wrapper');
    if (metaArea) {
      metaArea.style.opacity = '0.3';
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
    isWatchPage = checkIfWatchPage();

    if (isSearchPage) {
      // New search page — reset and scan
      dismissWatchPageBlock();
      if (!wasSearchPage || window.location.search !== lastSearch) {
        processedVideoIds.clear();
        document.querySelectorAll('[data-phylax-scanned]').forEach(el => {
          el.removeAttribute('data-phylax-scanned');
          el.removeAttribute('data-phylax-decision');
        });
        document.querySelectorAll('.phylax-video-block-overlay, .phylax-video-warn-shield').forEach(el => el.remove());
      }
      debouncedScan();
      startRescanInterval();
    } else if (isWatchPage) {
      // Watch page — classify the current video
      stopRescanInterval();
      // Reset retry counter for new navigation
      watchPageClassifyAttempts = 0;
      checkWatchPageVideo();
    } else {
      stopRescanInterval();
      dismissWatchPageBlock();
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
    isWatchPage = checkIfWatchPage();

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

    // MutationObserver for dynamically loaded content
    const observer = new MutationObserver((mutations) => {
      if (isSearchPage) {
        // Scan for new video cards on search page
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
      } else if (isWatchPage) {
        // Watch page: retry classification when DOM updates and video hasn't been classified yet
        const currentVideoId = getWatchVideoId();
        if (currentVideoId && currentVideoId !== lastCheckedWatchId) {
          checkWatchPageVideo();
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

    // Initial check if already on watch page
    if (isWatchPage) {
      watchPageClassifyAttempts = 0;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(checkWatchPageVideo, 1500);
        });
      } else {
        setTimeout(checkWatchPageVideo, 1500);
      }
    }

    console.log('[Phylax YT Scanner v2.0] Active — video + watch page classification');
  }

  init();
})();
