// Phylax Engine — Event System
// Event-centric model: everything the extension sees becomes an Event

// ── Event types ─────────────────────────────────────────────────

export const EVENT_TYPES = {
  PAGE_LOAD:              'PAGE_LOAD',
  DOM_TEXT_SNAPSHOT:       'DOM_TEXT_SNAPSHOT',
  SEARCH_QUERY:           'SEARCH_QUERY',
  CHAT_MESSAGE_INCOMING:  'CHAT_MESSAGE_INCOMING',
  CHAT_MESSAGE_OUTGOING:  'CHAT_MESSAGE_OUTGOING',
  VIDEO_PLAY:             'VIDEO_PLAY',
  FEED_SCROLL:            'FEED_SCROLL',
  NOTIFICATION_RECEIVED:  'NOTIFICATION_RECEIVED',
  NOTIFICATION_OPENED:    'NOTIFICATION_OPENED',
  TAB_SWITCH:             'TAB_SWITCH',
  IDLE:                   'IDLE',
  ACTIVE:                 'ACTIVE',
  CLICK:                  'CLICK',
  FORM_SUBMIT:            'FORM_SUBMIT',
  DOWNLOAD_INITIATED:     'DOWNLOAD_INITIATED',
  LINK_CLICK:             'LINK_CLICK',
  TIME_TICK:              'TIME_TICK',
};

// ── Content type hints ──────────────────────────────────────────

export const CONTENT_TYPE_HINTS = {
  FEED:    'feed',
  ARTICLE: 'article',
  CHAT:    'chat',
  VIDEO:   'video',
  SEARCH:  'search',
  GAME:    'game',
  SOCIAL:  'social',
  UNKNOWN: 'unknown',
};

// ── Event creation ──────────────────────────────────────────────

let eventCounter = 0;

export function createEvent({
  eventType,
  tabId = null,
  frameId = 0,
  url = '',
  domain = '',
  payload = {},
  profileId = 'default',
  deviceId = null,
}) {
  return {
    event_id: generateEventId(),
    timestamp: Date.now(),
    device_id: deviceId || getDeviceId(),
    profile_id: profileId,
    tab_id: tabId,
    frame_id: frameId,
    source: {
      url,
      domain: domain || extractDomain(url),
      app: 'chrome',
      platform: 'web',
    },
    event_type: eventType,
    payload,
    privacy: {
      redaction_level: 'kids_high',
      pii_redacted: false, // will be set after semantic parse
    },
  };
}

// ── Event buffer for streaming risk ─────────────────────────────

export class EventBuffer {
  constructor(maxSize = 500, maxAgeMs = 3600000) {
    this.events = [];
    this.maxSize = maxSize;
    this.maxAgeMs = maxAgeMs; // 1 hour default
  }

  push(event) {
    this.events.push(event);
    this.prune();
  }

  // Get events within time window
  getRecent(windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.events.filter(e => e.timestamp >= cutoff);
  }

  // Get events for a specific category (from decisions)
  getByCategory(category, windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.events.filter(e =>
      e.timestamp >= cutoff &&
      e._decision &&
      e._decision.top_reasons &&
      e._decision.top_reasons.some(r => r.startsWith(category))
    );
  }

  // Get events for a specific tab
  getByTab(tabId, windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.events.filter(e => e.timestamp >= cutoff && e.tab_id === tabId);
  }

  // Count events of a specific type
  countType(eventType, windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.events.filter(e =>
      e.timestamp >= cutoff && e.event_type === eventType
    ).length;
  }

  prune() {
    const cutoff = Date.now() - this.maxAgeMs;
    this.events = this.events.filter(e => e.timestamp >= cutoff);
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
    }
  }

  clear() {
    this.events = [];
  }

  get size() {
    return this.events.length;
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function generateEventId() {
  eventCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `evt_${ts}_${rand}_${eventCounter}`;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

let _deviceId = null;
function getDeviceId() {
  if (!_deviceId) {
    _deviceId = 'dev_' + Math.random().toString(36).slice(2, 12);
  }
  return _deviceId;
}
