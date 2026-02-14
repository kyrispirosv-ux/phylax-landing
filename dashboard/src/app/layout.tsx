import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phylax — Parent Dashboard",
  description: "AI-powered child safety dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#070A12] text-white font-sans">
        {children}
      </body>
    </html>
  );
}
