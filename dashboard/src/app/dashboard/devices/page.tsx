"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo } from "@/lib/supabase/helpers";

type Child = { id: string; name: string; tier: string };
type Device = {
  id: string;
  child_id: string;
  device_name: string;
  platform: string;
  status: string;
  extension_version: string | null;
  last_heartbeat: string | null;
  created_at: string;
};
type PairingToken = {
  token_id: string;
  secret: string;
  short_code: string;
  install_link: string;
  expires_at: string;
  child_id: string;
};

export default function DevicesPage() {
  const supabase = createClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingToken, setPairingToken] = useState<PairingToken | null>(null);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string>("");

  useEffect(() => { load(); }, []);

  async function load() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;

    const [deviceRes, childRes] = await Promise.all([
      supabase.from("devices").select("*").eq("family_id", parent.family_id).order("created_at", { ascending: false }),
      supabase.from("children").select("id, name, tier").eq("family_id", parent.family_id).order("created_at"),
    ]);

    setDevices((deviceRes.data as Device[]) ?? []);
    const kids = (childRes.data as Child[]) ?? [];
    setChildren(kids);
    if (kids.length && !selectedChild) {
      setSelectedChild(kids[0].id);
    }
    setLoading(false);
  }

  async function generateToken() {
    if (!selectedChild) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/pairing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child_id: selectedChild }),
      });
      const data = await res.json();
      if (res.ok) {
        setPairingToken(data);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  }

  function timeAgo(ts: string | null): string {
    if (!ts) return "Never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  if (loading) return <div className="text-white/30 text-sm">Loading...</div>;

  const childName = (id: string) => children.find(c => c.id === id)?.name ?? "Unknown";

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-white/40 text-sm mt-1">Manage paired devices and set up new ones</p>
        </div>
      </div>

      {/* Pairing section */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Pair a New Device</h2>
        <p className="text-white/40 text-sm mb-4">
          Generate a pairing code or link to connect a child&apos;s Chrome browser.
        </p>

        <div className="flex gap-3 mb-4">
          <select
            value={selectedChild}
            onChange={(e) => { setSelectedChild(e.target.value); setPairingToken(null); }}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
          >
            {children.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={generateToken}
            disabled={generating || !selectedChild}
            className="px-5 py-2.5 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl hover:bg-[#7C5CFF]/90 transition disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Pairing Code"}
          </button>
        </div>

        {pairingToken && (
          <div className="bg-white/[0.03] border border-[#7C5CFF]/20 rounded-xl p-5 space-y-4">
            {/* 6-digit code */}
            <div>
              <p className="text-white/40 text-xs font-medium mb-1">6-Digit Code (enter on child&apos;s device)</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold tracking-[0.3em] text-white">
                  {pairingToken.short_code}
                </span>
                <button
                  onClick={() => copyToClipboard(pairingToken.short_code, "code")}
                  className="text-xs text-[#7C5CFF] hover:text-[#7C5CFF]/80"
                >
                  {copied === "code" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Install link */}
            <div>
              <p className="text-white/40 text-xs font-medium mb-1">Install Link (send to child or open on their device)</p>
              <div className="flex items-center gap-3">
                <code className="text-xs text-white/60 bg-white/5 px-3 py-2 rounded-lg flex-1 truncate">
                  {pairingToken.install_link}
                </code>
                <button
                  onClick={() => copyToClipboard(pairingToken.install_link, "link")}
                  className="text-xs text-[#7C5CFF] hover:text-[#7C5CFF]/80 shrink-0"
                >
                  {copied === "link" ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* QR Code placeholder */}
            <div>
              <p className="text-white/40 text-xs font-medium mb-1">QR Code</p>
              <div className="w-40 h-40 bg-white rounded-xl flex items-center justify-center">
                <div className="text-center p-2">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4zm12 4h4v-4h-4v4zM8 4h2v2H8V4zm6 0h2v2h-2V4zM4 8h2v2H4V8zm14 0h2v2h-2V8zM8 16h2v2H8v-2zm6 0h2v2h-2v-2z" />
                  </svg>
                  <p className="text-[10px] text-gray-500">Scan with phone camera</p>
                </div>
              </div>
            </div>

            <p className="text-amber-400/70 text-xs">
              Expires in 10 minutes. One-time use only.
            </p>
          </div>
        )}
      </div>

      {/* Device list */}
      <h2 className="text-lg font-semibold mb-4">Paired Devices</h2>
      <div className="space-y-3">
        {devices.map((device) => (
          <div key={device.id} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-6 py-5">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              device.status === "active" ? "bg-green-500/20" : "bg-white/10"
            }`}>
              <svg className={`w-5 h-5 ${device.status === "active" ? "text-green-400" : "text-white/40"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-white font-medium">{device.device_name || "Chrome Browser"}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  device.status === "active" ? "bg-green-500/20 text-green-400" :
                  device.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                  "bg-white/10 text-white/40"
                }`}>
                  {device.status}
                </span>
              </div>
              <p className="text-white/30 text-xs">
                {childName(device.child_id)} &middot; {device.extension_version ? `v${device.extension_version}` : "Unknown version"} &middot; Last seen {timeAgo(device.last_heartbeat)}
              </p>
            </div>
          </div>
        ))}
        {devices.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No devices paired yet. Generate a pairing code above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
