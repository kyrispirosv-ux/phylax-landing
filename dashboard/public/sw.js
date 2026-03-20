/// <reference lib="webworker" />

const CACHE_VERSION = "phylax-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg",
  "/manifest.json",
];

// Patterns that should NEVER be cached
const NO_CACHE_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /supabase/,
  /_next\/data/,
  /\.(json)$/,
];

// Patterns for cache-first strategy (static assets)
const CACHE_FIRST_PATTERNS = [
  /\/_next\/static\//,
  /\.(?:css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$/,
];

// ─── Install ───
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ───
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("phylax-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Never cache auth or API routes
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) return;

  // Cache-first for static assets
  if (CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for navigation and other requests
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // If this is a navigation request, show offline page
    if (request.mode === "navigate") {
      const offlinePage = await caches.match("/offline.html");
      if (offlinePage) return offlinePage;
    }

    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}

// ─── Push Notifications ───
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Phylax Alert",
      body: event.data.text(),
      icon: "/icons/icon-192x192.svg",
      badge: "/icons/icon-192x192.svg",
      tag: "phylax-alert",
    };
  }

  const { title, body, icon, badge, tag, data, actions } = payload;

  const options = {
    body: body || "New alert from Phylax",
    icon: icon || "/icons/icon-192x192.svg",
    badge: badge || "/icons/icon-192x192.svg",
    tag: tag || "phylax-alert",
    data: data || { url: "/dashboard/alerts" },
    vibrate: [200, 100, 200],
    requireInteraction: payload.severity === "critical",
    actions: actions || [
      { action: "view", title: "View Details" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title || "Phylax", options));
});

// ─── Notification Click ───
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard/alerts";

  if (event.action === "dismiss") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ─── Background Sync ───
self.addEventListener("sync", (event) => {
  if (event.tag === "phylax-sync-alerts") {
    event.waitUntil(syncPendingAlerts());
  }
  if (event.tag === "phylax-sync-subscription") {
    event.waitUntil(syncPushSubscription());
  }
});

async function syncPendingAlerts() {
  // Re-fetch alerts when connectivity returns
  try {
    const response = await fetch("/api/extension/alerts");
    if (response.ok) {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "SYNC_COMPLETE", payload: "alerts" });
      }
    }
  } catch {
    // Will retry on next sync event
  }
}

async function syncPushSubscription() {
  // Re-register push subscription after coming back online
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    }
  } catch {
    // Will retry
  }
}
