// Phylax SafeGuard — Bridge Content Script
// Injected ONLY on the Phylax web app (phylax-landing.vercel.app, localhost)
// Bridges messages between the web page and the extension's background service worker

(function () {
  'use strict';

  // ── Context validity check ─────────────────────────────────────
  function isContextValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function safeSendMessage(data) {
    if (!isContextValid()) {
      teardown();
      return Promise.reject(new Error('Extension context invalidated'));
    }
    return chrome.runtime.sendMessage(data);
  }

  console.log('[Phylax Bridge] Content script loaded on:', window.location.origin);

  // ── Listen for postMessage from the web page ──────────────────

  function onMessage(event) {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;
    if (!event.data.type.startsWith('PHYLAX_')) return;

    console.log('[Phylax Bridge] Received postMessage:', event.data.type);

    safeSendMessage(event.data).then(response => {
      console.log('[Phylax Bridge] Background response:', response);
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        ...response
      }, '*');
    }).catch(e => {
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        success: false,
        error: e.message
      }, '*');
    });
  }

  window.addEventListener('message', onMessage);

  // ── Announce extension presence to the web page ───────────────

  if (isContextValid()) {
    try {
      window.postMessage({
        type: 'PHYLAX_EXTENSION_READY',
        version: chrome.runtime.getManifest().version
      }, '*');
    } catch {
      // Context lost before we could announce — silent fail
    }
  }

  document.documentElement.setAttribute('data-phylax-extension', 'true');

  // ── Watch for localStorage changes (fallback sync) ────────────

  let lastKnownRules = null;
  try {
    lastKnownRules = localStorage.getItem('phylaxRules') || '[]';
  } catch {
    lastKnownRules = '[]';
  }

  let storageObserver = setInterval(() => {
    if (!isContextValid()) { teardown(); return; }
    try {
      const currentRules = localStorage.getItem('phylaxRules') || '[]';
      if (currentRules !== lastKnownRules) {
        lastKnownRules = currentRules;
        console.log('[Phylax Bridge] Detected localStorage rule change, syncing...');
        const rules = JSON.parse(currentRules);
        safeSendMessage({ type: 'PHYLAX_SYNC_RULES', rules }).catch(() => {});
      }
    } catch {
      // Silent — will teardown on next tick if context is gone
    }
  }, 1000);

  function onStorageEvent(event) {
    if (event.key !== 'phylaxRules') return;
    if (!isContextValid()) { teardown(); return; }
    try {
      const rules = JSON.parse(event.newValue || '[]');
      safeSendMessage({ type: 'PHYLAX_SYNC_RULES', rules }).catch(() => {});
      lastKnownRules = event.newValue || '[]';
    } catch {
      // Silent
    }
  }

  window.addEventListener('storage', onStorageEvent);

  // ── Teardown on context invalidation ──────────────────────────
  // Uses console.log (not .warn/.error) to avoid Chrome flagging it
  // as an extension error in chrome://extensions.
  function teardown() {
    console.log('[Phylax Bridge] Context invalidated — cleaning up. Reload the page to reconnect.');
    if (storageObserver) { clearInterval(storageObserver); storageObserver = null; }
    window.removeEventListener('storage', onStorageEvent);
    window.removeEventListener('message', onMessage);
    // Signal the web app that the extension disconnected
    window.postMessage({ type: 'PHYLAX_EXTENSION_DISCONNECTED' }, '*');
  }

  console.log('[Phylax Bridge] Bridge active — monitoring for rule changes');
})();
