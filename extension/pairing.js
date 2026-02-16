/**
 * Phylax pairing page — handles both manual code entry and auto-pair from install link.
 */

const API_BASE = 'https://tzvvvvkwpstukliklbnx.supabase.co'; // Will be replaced with actual dashboard URL
const DASHBOARD_API = ''; // Set at runtime

// ── UI Elements ──
const digits = document.querySelectorAll('.code-digit');
const pairBtn = document.getElementById('pair-btn');
const statusEl = document.getElementById('status');
const formSection = document.getElementById('form-section');
const pairedCard = document.getElementById('paired-card');
const pairedMessage = document.getElementById('paired-message');

// ── Code input behavior ──
digits.forEach((input, i) => {
  input.addEventListener('input', (e) => {
    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    e.target.value = val;
    if (val && i < digits.length - 1) {
      digits[i + 1].focus();
    }
    updatePairButton();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && i > 0) {
      digits[i - 1].focus();
    }
  });

  // Handle paste of full code
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    for (let j = 0; j < Math.min(paste.length, 6); j++) {
      digits[j].value = paste[j];
    }
    if (paste.length >= 6) digits[5].focus();
    updatePairButton();
  });
});

function getCode() {
  return Array.from(digits).map(d => d.value).join('');
}

function updatePairButton() {
  pairBtn.disabled = getCode().length !== 6;
}

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (type || '');
}

// ── Pairing logic ──
async function getApiBase() {
  // Try to find the dashboard URL from storage
  const stored = await chrome.storage.local.get(['phylaxDashboardUrl']);
  if (stored.phylaxDashboardUrl) return stored.phylaxDashboardUrl;

  // Default API endpoints to try
  const candidates = [
    'https://app.phylax.ai',
    'https://phylax2.vercel.app',
    'https://phylax-landing.vercel.app',
    'http://localhost:3000',
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/extension/ping`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        await chrome.storage.local.set({ phylaxDashboardUrl: url });
        return url;
      }
    } catch { /* try next */ }
  }

  return candidates[0]; // fallback
}

async function consumeToken(payload) {
  const base = await getApiBase();
  const res = await fetch(`${base}/api/pairing/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

async function pair(payload) {
  setStatus('Pairing...', 'loading');

  try {
    const result = await consumeToken(payload);

    // Store device info + auth token
    await chrome.storage.local.set({
      phylaxDeviceId: result.device_id,
      phylaxChildId: result.child_id,
      phylaxFamilyId: result.family_id,
      phylaxPolicyVersion: result.policy_version,
      phylaxAuthToken: result.auth_token || null,
      phylaxPaired: true,
    });

    // If we got a policy pack, store the rules
    if (result.policy_pack) {
      const rules = result.policy_pack.rules.map(r => r.text);
      await chrome.storage.local.set({
        phylaxRules: JSON.stringify(rules),
        phylaxProfile: result.policy_pack.tier,
        phylaxPolicyPack: JSON.stringify(result.policy_pack),
      });

      // Notify background to rebuild policy
      try {
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SYNC_RULES',
          rules: rules,
        });
      } catch { /* background may not be ready */ }
    }

    // Show success
    formSection.classList.add('hidden');
    pairedCard.classList.add('visible');
    pairedMessage.textContent = result.policy_pack?.child_name
      ? `${result.policy_pack.child_name}'s device is now protected by Phylax.`
      : 'Your device is now protected by Phylax.';

  } catch (err) {
    setStatus(err.message || 'Pairing failed', 'error');
  }
}

// ── Manual code pairing ──
pairBtn.addEventListener('click', () => {
  const code = getCode();
  if (code.length === 6) {
    pair({ short_code: code, device_name: 'Chrome Browser', platform: 'chrome' });
  }
});

// ── Auto-pair from install link ──
async function checkAutoPair() {
  // Check if we're on a page with pairing data (install link opened this)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    // Check URL fragment for token
    const url = new URL(tab.url);
    if (url.pathname === '/pair' && url.hash) {
      const params = new URLSearchParams(url.hash.slice(1));
      const tokenId = params.get('token');
      const secret = params.get('secret');

      if (tokenId && secret) {
        pair({
          token_id: tokenId,
          secret: secret,
          device_name: 'Chrome Browser',
          platform: 'chrome',
        });
        return;
      }
    }
  } catch { /* not in tab context */ }

  // Also check if the install link page has a hidden element with pairing data
  // This is the bridge from /pair page → extension content script → here
  try {
    const stored = await chrome.storage.local.get(['phylaxPendingToken']);
    if (stored.phylaxPendingToken) {
      const pending = JSON.parse(stored.phylaxPendingToken);
      await chrome.storage.local.remove('phylaxPendingToken');
      pair({
        token_id: pending.token_id,
        secret: pending.secret,
        device_name: 'Chrome Browser',
        platform: 'chrome',
      });
    }
  } catch { /* no pending token */ }
}

// Check if already paired
async function checkAlreadyPaired() {
  const stored = await chrome.storage.local.get(['phylaxPaired', 'phylaxChildId']);
  if (stored.phylaxPaired) {
    formSection.classList.add('hidden');
    pairedCard.classList.add('visible');
    pairedMessage.textContent = 'This device is already paired and protected.';
  }
}

// Initialize
checkAlreadyPaired();
checkAutoPair();
digits[0].focus();
