import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { NotificationManager } from "@/components/pwa/notification-manager";

export const metadata: Metadata = {
  title: "Phylax — Parent Dashboard",
  description: "AI-powered child safety dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Phylax",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#7C5CFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/icons/icon-192x192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.svg" />
      </head>
      <body className="antialiased bg-[#070A12] text-white font-sans">
        {children}
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <NotificationManager />
      </body>
    </html>
  );
}
