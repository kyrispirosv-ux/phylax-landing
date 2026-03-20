"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // every hour

        // Listen for new service worker activation
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "activated" &&
              navigator.serviceWorker.controller
            ) {
              // New version available - could show update banner
              console.log("[Phylax SW] New version available");
            }
          });
        });
      })
      .catch((err) => {
        console.error("[Phylax SW] Registration failed:", err);
      });

    // Listen for background sync messages
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_COMPLETE") {
        // Trigger a re-render/refresh when sync completes
        window.dispatchEvent(new CustomEvent("phylax-sync", { detail: event.data.payload }));
      }
    });
  }, []);

  return null;
}
