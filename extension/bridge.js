// Phylax SafeGuard — Bridge Content Script
// Injected ONLY on the Phylax web app (phylax-landing.vercel.app, localhost)
// Bridges messages between the web page and the extension's background service worker

(function () {
  'use strict';

  console.log('[Phylax Bridge] Content script loaded on:', window.location.origin);

  // ── Listen for postMessage from the web page ──────────────────

  window.addEventListener('message', async (event) => {
    // Only accept messages from this same window/origin
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;
    if (!event.data.type.startsWith('PHYLAX_')) return;

    console.log('[Phylax Bridge] Received postMessage:', event.data.type);

    try {
      // Forward to background service worker
      const response = await chrome.runtime.sendMessage(event.data);
      console.log('[Phylax Bridge] Background response:', response);

      // Send response back to the web page
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        ...response
      }, '*');
    } catch (e) {
      console.error('[Phylax Bridge] Error forwarding message:', e);
      window.postMessage({
        type: event.data.type + '_RESPONSE',
        success: false,
        error: e.message
      }, '*');
    }
  });

  // ── Announce extension presence to the web page ───────────────

  // Let the web page know the extension is installed
  window.postMessage({
    type: 'PHYLAX_EXTENSION_READY',
    version: chrome.runtime.getManifest().version
  }, '*');

  // Also inject a flag into the DOM so the page can detect the extension
  document.documentElement.setAttribute('data-phylax-extension', 'true');

  // ── Watch for localStorage changes (fallback sync) ────────────

  // If the web page updates rules via localStorage without postMessage,
  // detect it and sync to the extension
  let lastKnownRules = localStorage.getItem('phylaxRules') || '[]';

  const storageObserver = setInterval(() => {
    const currentRules = localStorage.getItem('phylaxRules') || '[]';
    if (currentRules !== lastKnownRules) {
      lastKnownRules = currentRules;
      console.log('[Phylax Bridge] Detected localStorage rule change, syncing...');
      try {
        const rules = JSON.parse(currentRules);
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SYNC_RULES',
          rules: rules
        });
      } catch (e) {
        console.error('[Phylax Bridge] Error parsing localStorage rules:', e);
      }
    }
  }, 1000); // Check every second

  // Also listen for the storage event (fires when OTHER tabs change localStorage)
  window.addEventListener('storage', (event) => {
    if (event.key === 'phylaxRules') {
      console.log('[Phylax Bridge] Storage event detected for phylaxRules');
      try {
        const rules = JSON.parse(event.newValue || '[]');
        chrome.runtime.sendMessage({
          type: 'PHYLAX_SYNC_RULES',
          rules: rules
        });
        lastKnownRules = event.newValue || '[]';
      } catch (e) {
        console.error('[Phylax Bridge] Error handling storage event:', e);
      }
    }
  });

  console.log('[Phylax Bridge] Bridge active — monitoring for rule changes');
})();
