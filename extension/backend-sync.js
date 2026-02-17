/**
 * Phylax Backend Sync Module
 * Handles: policy sync, event logging, heartbeat, access requests
 * Imported by background.js as a module.
 */

const SYNC_INTERVAL_MS = 5 * 60 * 1000;   // 5 min policy poll
const HEARTBEAT_INTERVAL_MS = 60 * 1000;   // 1 min heartbeat
const EVENT_FLUSH_INTERVAL_MS = 30 * 1000; // 30s event batch flush
const MAX_EVENT_BUFFER = 200;

let apiBase = null;
let eventBuffer = [];
let syncTimer = null;
let heartbeatTimer = null;
let flushTimer = null;

// ── API Base Discovery ──

async function getApiBase() {
  if (apiBase) return apiBase;
  const stored = await chrome.storage.local.get(['phylaxDashboardUrl']);
  if (stored.phylaxDashboardUrl) { apiBase = stored.phylaxDashboardUrl; return apiBase; }

  const candidates = [
    'https://app.phylax.ai',
    'https://phylax2.vercel.app',
    'https://phylax-landing.vercel.app',
    'http://localhost:3000',
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(`${url}/api/extension/ping`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) { apiBase = url; await chrome.storage.local.set({ phylaxDashboardUrl: url }); return url; }
    } catch { /* next */ }
  }
  apiBase = candidates[0];
  return apiBase;
}

// ── Device Identity ──

export async function getDeviceId() {
  const s = await chrome.storage.local.get(['phylaxDeviceId']);
  return s.phylaxDeviceId || null;
}

async function getAuthToken() {
  const s = await chrome.storage.local.get(['phylaxAuthToken']);
  return s.phylaxAuthToken || null;
}

/** Build headers with auth token for authenticated API calls */
async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function isPaired() {
  const s = await chrome.storage.local.get(['phylaxPaired']);
  return !!s.phylaxPaired;
}

// ── Policy Sync ──

export async function syncPolicy() {
  const deviceId = await getDeviceId();
  if (!deviceId) return null;

  const base = await getApiBase();
  const stored = await chrome.storage.local.get(['phylaxPolicyVersion']);
  const currentVer = stored.phylaxPolicyVersion || 0;

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${base}/api/extension/sync?device_id=${deviceId}&policy_version=${currentVer}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.up_to_date) return null; // no change

    if (data.policy_pack) {
      const pack = data.policy_pack;
      const rules = pack.rules.map(r => r.text);

      await chrome.storage.local.set({
        phylaxPolicyVersion: data.policy_version,
        phylaxPolicyPack: JSON.stringify(pack),
        phylaxRules: JSON.stringify(rules),
        phylaxProfile: pack.tier,
      });

      // Notify background to recompile
      try { chrome.runtime.sendMessage({ type: 'PHYLAX_SYNC_RULES', rules }); } catch { }
      return pack;
    }
  } catch (err) {
    console.warn('[phylax-sync] policy sync failed:', err.message);
  }
  return null;
}

// ── Event Logging ──

export function queueEvent(evt) {
  eventBuffer.push({
    event_type: evt.event_type,
    domain: evt.domain || null,
    url: evt.url || null,
    category: evt.category || null,
    rule_id: evt.rule_id || null,
    reason_code: evt.reason_code || null,
    confidence: evt.confidence || null,
    metadata: evt.metadata || null,
    timestamp: new Date().toISOString(),
  });

  // Instant flush for blocks/alerts to give immediate feedback
  const isUrgent = evt.event_type === 'PARENT_ALERT' ||
    evt.event_type.includes('BLOCK') ||
    (evt.reason_code && evt.reason_code.includes('BLOCK')) ||
    evt.confidence > 0.8;

  if (eventBuffer.length >= MAX_EVENT_BUFFER || isUrgent) {
    flushEvents();
  }
}

export async function flushEvents() {
  if (eventBuffer.length === 0) return;
  const deviceId = await getDeviceId();
  if (!deviceId) {
    console.warn('[Phylax Sync] Cannot flush events: Device not paired. Please pair in extension popup.');
    return;
  }

  const batch = eventBuffer.splice(0, MAX_EVENT_BUFFER);
  const base = await getApiBase();

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${base}/api/extension/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ device_id: deviceId, events: batch }),
    });
    if (!res.ok) {
      // Put events back on failure
      eventBuffer.unshift(...batch);
    }
  } catch {
    eventBuffer.unshift(...batch);
  }
}

// ── Access Request ──

export async function requestAccess(url, domain, ruleId) {
  const deviceId = await getDeviceId();
  if (!deviceId) return { error: 'Not paired' };
  const base = await getApiBase();

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${base}/api/extension/access-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ device_id: deviceId, url, domain, rule_id: ruleId }),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

// ── Heartbeat ──

async function sendHeartbeat() {
  const deviceId = await getDeviceId();
  if (!deviceId) return;
  const base = await getApiBase();

  try {
    const headers = await getAuthHeaders();
    await fetch(`${base}/api/extension/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        device_id: deviceId,
        extension_version: chrome.runtime.getManifest().version,
        platform: 'chrome',
      }),
    });
  } catch { /* ignore */ }
}

// ── Lifecycle ──

export function startSync() {
  if (syncTimer) return; // already running
  syncTimer = setInterval(syncPolicy, SYNC_INTERVAL_MS);
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  flushTimer = setInterval(flushEvents, EVENT_FLUSH_INTERVAL_MS);

  // Initial sync
  syncPolicy();
  sendHeartbeat();
}

export function stopSync() {
  clearInterval(syncTimer); syncTimer = null;
  clearInterval(heartbeatTimer); heartbeatTimer = null;
  clearInterval(flushTimer); flushTimer = null;
}

// Auto-start if paired
isPaired().then(paired => { if (paired) startSync(); });
