import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Phylax — AI-Powered Child Safety for the Modern Web",
  description:
    "Protect your child online without blocking the web. Phylax uses edge AI to detect grooming, bullying, and harmful content in real-time. Privacy-first parental controls.",
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Phylax — AI-Powered Child Safety",
    description:
      "Advanced AI that detects grooming, bullying, and harmful content in real-time. Parents stay in control with a privacy-focused dashboard.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
