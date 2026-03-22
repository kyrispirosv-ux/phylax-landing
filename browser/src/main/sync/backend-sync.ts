import { getApiBase, getAuthToken, getDeviceId, updateConfig, getProfileTier } from './auth';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const EVENT_FLUSH_INTERVAL_MS = 30 * 1000;
const MAX_EVENT_BUFFER = 200;

let eventBuffer: any[] = [];
let syncTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;

async function apiFetch(path: string, options: RequestInit = {}): Promise<Record<string, any>> {
  const base = getApiBase();
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${base}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new Error(`API ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<Record<string, any>>;
}

export async function syncPolicy() {
  try {
    const deviceId = getDeviceId();
    const data = await apiFetch(`/api/extension/sync?device_id=${deviceId}`);

    if (data.rules) {
      // Will be wired to updatePolicy when pipeline-runner is integrated
      console.log('[Phylax Sync] Rules received:', data.rules.length);
    }
    if (data.profile_tier) {
      updateConfig({ profileTier: data.profile_tier });
    }

    console.log('[Phylax Sync] Policy synced');
  } catch (err) {
    console.error('[Phylax Sync] Policy sync failed:', err);
  }
}

export async function sendHeartbeat() {
  try {
    await apiFetch('/api/extension/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        device_id: getDeviceId(),
        timestamp: new Date().toISOString(),
        browser_version: '1.0.0',
      }),
    });
  } catch {
    // Silent fail for heartbeat
  }
}

export function queueEvent(event: any) {
  if (eventBuffer.length >= MAX_EVENT_BUFFER) {
    eventBuffer.shift();
  }
  eventBuffer.push(event);
}

export async function flushEvents() {
  if (eventBuffer.length === 0) return;
  const batch = [...eventBuffer];
  eventBuffer = [];

  try {
    await apiFetch('/api/extension/events', {
      method: 'POST',
      body: JSON.stringify({
        device_id: getDeviceId(),
        events: batch,
      }),
    });
  } catch {
    eventBuffer = [...batch, ...eventBuffer].slice(0, MAX_EVENT_BUFFER);
  }
}

export async function sendAlert(alert: any) {
  try {
    await apiFetch('/api/extension/alerts', {
      method: 'POST',
      body: JSON.stringify({
        device_id: getDeviceId(),
        ...alert,
      }),
    });
  } catch (err) {
    console.error('[Phylax Sync] Alert send failed:', err);
  }
}

export function startSync() {
  syncPolicy();
  sendHeartbeat();

  syncTimer = setInterval(syncPolicy, SYNC_INTERVAL_MS);
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  flushTimer = setInterval(flushEvents, EVENT_FLUSH_INTERVAL_MS);

  console.log('[Phylax Sync] Started');
}

export function stopSync() {
  if (syncTimer) clearInterval(syncTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (flushTimer) clearInterval(flushTimer);
}
