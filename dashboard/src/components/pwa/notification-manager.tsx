"use client";

import { useEffect, useState, useCallback } from "react";

const NOTIFICATION_ASKED_KEY = "phylax-notification-asked";

export function NotificationManager() {
  const [showRequest, setShowRequest] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    // Already granted — silently register subscription
    if (currentPermission === "granted") {
      registerPushSubscription();
      return;
    }

    // Already denied — nothing to do
    if (currentPermission === "denied") return;

    // Check if we've already asked
    const asked = localStorage.getItem(NOTIFICATION_ASKED_KEY);
    if (asked) return;

    // Show the explanation prompt after a short delay
    const timeout = setTimeout(() => {
      setShowRequest(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  const handleEnable = useCallback(async () => {
    localStorage.setItem(NOTIFICATION_ASKED_KEY, Date.now().toString());
    setShowRequest(false);

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        await registerPushSubscription();
      }
    } catch (err) {
      console.error("[Phylax] Notification permission error:", err);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(NOTIFICATION_ASKED_KEY, Date.now().toString());
    setShowRequest(false);
  }, []);

  if (!showRequest || permission !== "default") return null;

  return (
    <div className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-[400px] z-50">
      <div className="bg-[#0F1320] border border-white/[0.06] rounded-2xl p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-4">
          {/* Bell icon */}
          <div className="w-10 h-10 rounded-xl bg-[#22D3EE]/10 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-[#22D3EE]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-white mb-1">
              Enable Safety Alerts
            </h3>
            <p className="text-[13px] text-white/50 leading-relaxed">
              Get instant notifications when Phylax detects a threat — like grooming attempts or dangerous content. Critical alerts need your immediate attention.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleEnable}
            className="flex-1 px-4 py-2.5 bg-[#22D3EE] text-black text-sm font-semibold rounded-xl hover:bg-[#22D3EE]/90 active:scale-[0.98] transition-all"
          >
            Enable Notifications
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-sm font-medium text-white/40 hover:text-white/50 transition"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Registers the browser push subscription with the Phylax backend.
 * VAPID public key is provided by the server via the subscribe endpoint.
 */
async function registerPushSubscription() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Fetch the VAPID public key from the server
      const keyRes = await fetch("/api/notifications/subscribe", { method: "GET" });
      if (!keyRes.ok) return;

      const { vapidPublicKey } = await keyRes.json();
      if (!vapidPublicKey) return;

      // Convert VAPID key from base64 to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // Send subscription to server
    await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    // Register background sync for subscription renewal
    if ("sync" in registration) {
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("phylax-sync-subscription");
    }
  } catch (err) {
    console.error("[Phylax] Push subscription error:", err);
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
