// Phylax SafeGuard — Blocker Content Script
// Injected on ALL pages. Checks if the current page should be blocked.

(function () {
  'use strict';

  // Don't block the Phylax dashboard itself
  const currentHost = window.location.hostname;
  if (
    currentHost === 'phylax-landing.vercel.app' ||
    currentHost === 'localhost' ||
    currentHost === '127.0.0.1'
  ) {
    return;
  }

  // Don't block extension pages
  if (window.location.protocol === 'chrome-extension:') return;

  // ── Check rules and block if needed ───────────────────────────

  async function checkAndBlock() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PHYLAX_RULES' });
      if (!response || !response.rules) return;

      const rules = response.rules.filter(r => r.active);
      if (rules.length === 0) return;

      const currentUrl = window.location.href.toLowerCase();
      const currentHostname = window.location.hostname.toLowerCase();

      for (const rule of rules) {
        if (shouldBlock(rule.text, currentUrl, currentHostname)) {
          blockPage(rule.text);
          return;
        }
      }
    } catch (e) {
      // Extension might not be ready yet, ignore
    }
  }

  function shouldBlock(ruleText, url, hostname) {
    const text = ruleText.toLowerCase();

    // Check site name mappings
    const SITE_MAP = {
      'youtube': 'youtube.com',
      'tiktok': 'tiktok.com',
      'instagram': 'instagram.com',
      'facebook': 'facebook.com',
      'twitter': ['twitter.com', 'x.com'],
      'reddit': 'reddit.com',
      'snapchat': 'snapchat.com',
      'roblox': 'roblox.com',
      'twitch': 'twitch.tv',
      'discord': 'discord.com',
      'pinterest': 'pinterest.com',
      'netflix': 'netflix.com',
      'hulu': 'hulu.com',
      'spotify': 'spotify.com',
      'fortnite': 'fortnite.com',
      'minecraft': 'minecraft.net',
      'steam': 'steampowered.com',
      'poker': 'poker.com',
      'bet365': 'bet365.com',
      'whatsapp': 'whatsapp.com',
      'telegram': 'telegram.org'
    };

    // Category mappings
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
        domains: ['roblox.com', 'minecraft.net', 'fortnite.com', 'steampowered.com'],
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

    // Check categories — match both known domains AND keyword in URL/hostname
    for (const [category, { domains, keywords }] of Object.entries(CATEGORIES)) {
      if (text.includes(category)) {
        // Check known domains
        for (const domain of domains) {
          if (hostname.includes(domain.replace('.com', '').replace('.tv', '').replace('.net', '').replace('.org', '').replace('.lv', ''))) {
            return true;
          }
        }
        // Check keywords in URL/hostname (catches gambling.com for "no gambling sites")
        for (const kw of keywords) {
          if (hostname.includes(kw) || url.includes(kw)) return true;
        }
      }
    }

    // Keyword-based blocking: match dangerous keywords from the rule against the URL
    const BLOCK_KEYWORDS = [
      'gambling', 'casino', 'poker', 'betting', 'slots', 'porn', 'xxx',
      'adult', 'drugs', 'weapons', 'gore', 'violence'
    ];
    for (const keyword of BLOCK_KEYWORDS) {
      if (text.includes(keyword) && (hostname.includes(keyword) || url.includes(keyword))) {
        return true;
      }
    }

    // Check individual site names
    for (const [name, domains] of Object.entries(SITE_MAP)) {
      if (text.includes(name)) {
        const domainList = Array.isArray(domains) ? domains : [domains];
        for (const domain of domainList) {
          if (hostname.includes(domain.replace('.com', '').replace('.tv', '').replace('.net', '').replace('.org', ''))) {
            return true;
          }
        }
      }
    }

    // Check for raw domain in rule text
    const domainRegex = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/g;
    let match;
    while ((match = domainRegex.exec(text)) !== null) {
      const ruleDomain = match[1];
      if (hostname.includes(ruleDomain) || url.includes(ruleDomain)) {
        return true;
      }
    }

    return false;
  }

  function blockPage(ruleText) {
    // Replace entire page with a block screen
    document.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Blocked by Phylax</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #070A12;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 24px;
          }
          .container { max-width: 480px; }
          .shield {
            width: 80px; height: 80px;
            background: linear-gradient(135deg, #7C5CFF, #22D3EE);
            border-radius: 20px;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 24px;
            font-size: 36px;
            box-shadow: 0 10px 40px rgba(124, 92, 255, 0.3);
          }
          h1 { font-size: 28px; margin-bottom: 12px; }
          p { color: rgba(255,255,255,0.6); font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
          .rule-text {
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 16px;
            font-size: 14px;
            color: rgba(255,255,255,0.5);
          }
          .rule-label { color: #22D3EE; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="shield">&#x1f6e1;</div>
          <h1>Content Blocked</h1>
          <p>This page has been blocked by your family's Phylax safety policy.</p>
          <div class="rule-text">
            <div class="rule-label">Active Rule</div>
            <div>${ruleText}</div>
          </div>
        </div>
      </body>
    `;

    // Stop any further page loading
    window.stop();
  }

  // ── Listen for real-time rule updates ─────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PHYLAX_RULES_UPDATED') {
      // Re-check blocking with new rules
      const rules = (message.rules || []).filter(r => r.active);
      const currentUrl = window.location.href.toLowerCase();
      const currentHostname = window.location.hostname.toLowerCase();

      for (const rule of rules) {
        if (shouldBlock(rule.text, currentUrl, currentHostname)) {
          blockPage(rule.text);
          return;
        }
      }
    }
  });

  // Run the check
  checkAndBlock();
})();
