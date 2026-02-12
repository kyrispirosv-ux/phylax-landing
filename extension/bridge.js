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

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;
    if (!event.data.type.startsWith('PHYLAX_')) return;

    console.log('[Phylax Bridge] Received postMessage:', event.data.type);

    try {
      const response = await safeSendMessage(event.data);
      console.log('[Phylax Bridge] Background response:', response);
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        ...response
      }, '*');
    } catch (e) {
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        success: false,
        error: e.message
      }, '*');
    }
  });

  // ── Announce extension presence to the web page ───────────────

  if (isContextValid()) {
    try {
      window.postMessage({
        type: 'PHYLAX_EXTENSION_READY',
        version: chrome.runtime.getManifest().version
      }, '*');
    } catch (e) {
      console.warn('[Phylax Bridge] Could not announce extension:', e.message);
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
    } catch (e) {
      console.error('[Phylax Bridge] Error in storage observer:', e.message);
    }
  }, 1000);

  function onStorageEvent(event) {
    if (event.key !== 'phylaxRules') return;
    if (!isContextValid()) { teardown(); return; }
    try {
      const rules = JSON.parse(event.newValue || '[]');
      safeSendMessage({ type: 'PHYLAX_SYNC_RULES', rules }).catch(() => {});
      lastKnownRules = event.newValue || '[]';
    } catch (e) {
      console.error('[Phylax Bridge] Error handling storage event:', e.message);
    }
  }

  window.addEventListener('storage', onStorageEvent);

  // ── Teardown on context invalidation ──────────────────────────
  function teardown() {
    console.warn('[Phylax Bridge] Tearing down — extension context invalidated');
    if (storageObserver) { clearInterval(storageObserver); storageObserver = null; }
    window.removeEventListener('storage', onStorageEvent);
  }

  console.log('[Phylax Bridge] Bridge active — monitoring for rule changes');
})();
