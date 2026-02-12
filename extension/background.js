// Phylax SafeGuard — Background Service Worker
// Manages blocking rules received from the Phylax web dashboard

const PHYLAX_ORIGINS = [
  'https://phylax-landing.vercel.app',
  'http://localhost',
  'http://127.0.0.1'
];

// ── Rule Storage ────────────────────────────────────────────────

async function getRules() {
  const { phylaxRules } = await chrome.storage.local.get('phylaxRules');
  return phylaxRules || [];
}

async function setRules(rules) {
  await chrome.storage.local.set({ phylaxRules: rules });
  await updateDeclarativeNetRequestRules(rules);
  // Notify all tabs that rules changed (so blocker.js can update)
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'PHYLAX_RULES_UPDATED', rules });
    } catch (_) {
      // Tab might not have content script
    }
  }
}

// ── Declarative Net Request (URL-level blocking) ────────────────

async function updateDeclarativeNetRequestRules(rules) {
  // Remove all existing dynamic rules first
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  // Build new rules from active Phylax rules
  const addRules = [];
  let ruleId = 1;

  for (const rule of rules) {
    if (!rule.active) continue;

    // Extract domain/URL patterns from the rule text
    const patterns = extractBlockPatterns(rule.text);
    for (const pattern of patterns) {
      addRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: '/blocked.html'
          }
        },
        condition: {
          urlFilter: pattern,
          resourceTypes: ['main_frame']
        }
      });
    }
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: addRules
    });
    console.log('[Phylax] Updated declarativeNetRequest rules:', addRules.length, 'active rules');
  } catch (e) {
    console.error('[Phylax] Error updating DNR rules:', e);
  }
}

/**
 * Extract URL filter patterns from a natural language rule.
 * Handles rules like:
 *   "Block YouTube"          -> ["*youtube.com*"]
 *   "No TikTok after 8pm"   -> ["*tiktok.com*"]
 *   "Block poker-online.net" -> ["*poker-online.net*"]
 *   "Block social media"     -> ["*facebook.com*", "*instagram.com*", "*tiktok.com*", "*snapchat.com*", "*twitter.com*"]
 */
function extractBlockPatterns(ruleText) {
  const text = ruleText.toLowerCase();
  const patterns = [];

  // Known category mappings — domains AND keyword patterns
  const CATEGORIES = {
    'social media': {
      domains: ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com', 'x.com', 'reddit.com'],
      keywords: []
    },
    'gambling': {
      domains: ['gambling.com', 'poker.com', 'bet365.com', 'draftkings.com', 'fanduel.com', 'casino.com', 'bovada.lv', 'betway.com', 'williamhill.com', '888casino.com'],
      keywords: ['gambling', 'casino', 'poker', 'betting', 'slots']
    },
    'adult': {
      domains: ['pornhub.com', 'xvideos.com', 'xnxx.com'],
      keywords: ['porn', 'xxx', 'adult']
    },
    'gaming': {
      domains: ['roblox.com', 'minecraft.net', 'fortnite.com', 'steam.com'],
      keywords: []
    },
    'video': {
      domains: ['youtube.com', 'twitch.tv', 'dailymotion.com'],
      keywords: []
    },
    'streaming': {
      domains: ['netflix.com', 'hulu.com', 'disneyplus.com'],
      keywords: []
    }
  };

  // Check for category matches
  for (const [category, { domains, keywords }] of Object.entries(CATEGORIES)) {
    if (text.includes(category)) {
      for (const domain of domains) {
        patterns.push(`*${domain}*`);
      }
      // Also block any URL containing the category keywords
      for (const kw of keywords) {
        const p = `*${kw}*`;
        if (!patterns.includes(p)) patterns.push(p);
      }
    }
  }

  // Keyword-based blocking: extract meaningful words from the rule
  // and match them against URLs (catches sites like gambling.com for "no gambling sites")
  const BLOCK_KEYWORDS = [
    'gambling', 'casino', 'poker', 'betting', 'slots', 'porn', 'xxx',
    'adult', 'drugs', 'weapons', 'gore', 'violence'
  ];
  for (const keyword of BLOCK_KEYWORDS) {
    if (text.includes(keyword)) {
      const p = `*${keyword}*`;
      if (!patterns.includes(p)) patterns.push(p);
    }
  }

  // Check for known site name matches
  const SITE_MAP = {
    'youtube': 'youtube.com',
    'tiktok': 'tiktok.com',
    'instagram': 'instagram.com',
    'facebook': 'facebook.com',
    'twitter': 'twitter.com',
    'reddit': 'reddit.com',
    'snapchat': 'snapchat.com',
    'roblox': 'roblox.com',
    'twitch': 'twitch.tv',
    'discord': 'discord.com',
    'pinterest': 'pinterest.com',
    'tumblr': 'tumblr.com',
    'whatsapp': 'web.whatsapp.com',
    'telegram': 'web.telegram.org',
    'netflix': 'netflix.com',
    'hulu': 'hulu.com',
    'spotify': 'spotify.com',
    'fortnite': 'fortnite.com',
    'minecraft': 'minecraft.net',
    'steam': 'store.steampowered.com',
    'poker': 'poker.com',
    'bet365': 'bet365.com'
  };

  for (const [name, domain] of Object.entries(SITE_MAP)) {
    if (text.includes(name)) {
      const pattern = `*${domain}*`;
      if (!patterns.includes(pattern)) {
        patterns.push(pattern);
      }
    }
  }

  // Try to extract raw domain patterns (e.g. "block poker-online-free.net")
  const domainRegex = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/g;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    const domain = match[1];
    // Skip common non-domain words
    if (['e.g', 'i.e', 'etc.com'].includes(domain)) continue;
    const pattern = `*${domain}*`;
    if (!patterns.includes(pattern)) {
      patterns.push(pattern);
    }
  }

  return patterns;
}

// ── Message Handling ────────────────────────────────────────────

// Listen for messages from the Phylax web app (via externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Phylax] External message from:', sender.origin || sender.url, message);

  if (!isPhylaxOrigin(sender.origin || sender.url)) {
    console.warn('[Phylax] Rejected message from unauthorized origin:', sender.origin);
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return;
  }

  handlePhylaxMessage(message, sendResponse);
  return true; // Keep channel open for async response
});

// Listen for messages from content scripts (bridge.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type && message.type.startsWith('PHYLAX_')) {
    console.log('[Phylax] Internal message:', message.type);
    handlePhylaxMessage(message, sendResponse);
    return true;
  }

  // Handle GET_RULES request from blocker.js
  if (message.type === 'GET_PHYLAX_RULES') {
    getRules().then(rules => sendResponse({ rules }));
    return true;
  }
});

async function handlePhylaxMessage(message, sendResponse) {
  try {
    switch (message.type) {
      case 'PHYLAX_SYNC_RULES': {
        // Full sync: replace all rules with what the web app sends
        const rules = message.rules || [];
        await setRules(rules);
        console.log('[Phylax] Rules synced:', rules.length, 'rules');
        sendResponse({ success: true, rulesCount: rules.length });
        break;
      }

      case 'PHYLAX_ADD_RULE': {
        // Add a single rule
        const current = await getRules();
        current.push({ text: message.rule, active: true });
        await setRules(current);
        console.log('[Phylax] Rule added:', message.rule);
        sendResponse({ success: true, rulesCount: current.length });
        break;
      }

      case 'PHYLAX_TOGGLE_RULE': {
        // Toggle a rule's active state
        const rules = await getRules();
        if (rules[message.index]) {
          rules[message.index].active = !rules[message.index].active;
          await setRules(rules);
          console.log('[Phylax] Rule toggled:', message.index, '->', rules[message.index].active);
        }
        sendResponse({ success: true });
        break;
      }

      case 'PHYLAX_CLEAR_RULES': {
        await setRules([]);
        console.log('[Phylax] All rules cleared');
        sendResponse({ success: true });
        break;
      }

      case 'PHYLAX_PING': {
        // Web app checking if extension is installed and active
        sendResponse({ success: true, version: chrome.runtime.getManifest().version });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (e) {
    console.error('[Phylax] Error handling message:', e);
    sendResponse({ success: false, error: e.message });
  }
}

function isPhylaxOrigin(origin) {
  if (!origin) return false;
  return PHYLAX_ORIGINS.some(allowed => origin.startsWith(allowed));
}

// ── Initialization ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Phylax] Extension installed/updated');
  // Load any existing rules and apply them
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
    console.log('[Phylax] Restored', rules.length, 'rules from storage');
  }
});

// Re-apply rules when the service worker wakes up
(async () => {
  const rules = await getRules();
  if (rules.length > 0) {
    await updateDeclarativeNetRequestRules(rules);
  }
})();
