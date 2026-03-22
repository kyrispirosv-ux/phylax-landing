import { session } from 'electron';

let blockedDomains: Set<string> = new Set();

export function updateBlockedDomains(domains: string[]) {
  blockedDomains = new Set(domains);
}

export function setupRequestInterception() {
  const defaultSession = session.defaultSession;

  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);

      if (url.protocol === 'devtools:' || url.protocol === 'chrome-extension:') {
        return callback({});
      }

      if (blockedDomains.has(url.hostname)) {
        console.log('[Phylax] Blocked domain:', url.hostname);
        return callback({ cancel: true });
      }

      if (['chrome:', 'about:', 'file:'].includes(url.protocol)) {
        return callback({ cancel: true });
      }
    } catch {
      // Invalid URL, allow
    }

    callback({});
  });

  defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });
}
