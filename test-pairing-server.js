/**
 * Phylax Pairing Test Server
 *
 * Mocks the dashboard API locally so you can test the full extension pairing flow
 * without needing Supabase. After pairing, transitions to a parent dashboard view
 * showing live device status, heartbeats, and events from the extension.
 *
 * Usage:
 *   node test-pairing-server.js
 *
 * Then:
 *   1. Open http://localhost:3000 in your browser — it shows a 6-digit code
 *   2. Load the extension in Chrome (chrome://extensions → Load unpacked → select extension/)
 *   3. Click the Phylax extension icon → enter the 6-digit code → click Connect
 *   4. Watch the page auto-transition to the parent dashboard
 */

import http from 'node:http';
import crypto from 'node:crypto';

// ── In-memory state (replaces Supabase) ──

const activeCodes = new Map();  // short_code → { child_id, family_id, expires_at }
let currentCode = null;

// Paired devices and live telemetry
const pairedDevices = [];       // Array of device objects
const recentEvents = [];        // Last 50 events from extension
const heartbeats = new Map();   // device_id → { last_seen, extension_version, platform }
const MAX_EVENTS = 50;

function generateCode() {
  const code = String(crypto.randomInt(100000, 999999));
  const data = {
    child_id: 'test-child-' + crypto.randomUUID().slice(0, 8),
    family_id: 'test-family-' + crypto.randomUUID().slice(0, 8),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  activeCodes.set(code, data);
  currentCode = code;
  console.log(`\n✅ Generated pairing code: ${code} (expires in 10 minutes)\n`);
  return { code, ...data };
}

// Generate initial code on startup
generateCode();

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  // CORS headers (extension needs these)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── GET / — Dashboard page (pairing → dashboard auto-transition) ──
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML());
    return;
  }

  // ── GET /api/extension/ping ──
  if (url.pathname === '/api/extension/ping' && req.method === 'GET') {
    console.log('📡 Extension pinged the server');
    json(res, { status: 'ok', engine: 'phylax-test-server', timestamp: Date.now() });
    return;
  }

  // ── POST /api/pairing/generate — Generate a new code ──
  if (url.pathname === '/api/pairing/generate' && req.method === 'POST') {
    const result = generateCode();
    json(res, {
      token_id: 'test-token-' + crypto.randomUUID().slice(0, 8),
      secret: crypto.randomBytes(32).toString('hex'),
      short_code: result.code,
      expires_at: result.expires_at,
      child_id: result.child_id,
    });
    return;
  }

  // ── POST /api/pairing/consume — Extension submits code ──
  if (url.pathname === '/api/pairing/consume' && req.method === 'POST') {
    const body = await readBody(req);
    console.log('🔑 Pairing attempt:', JSON.stringify(body));

    const { short_code } = body;

    if (!short_code) {
      json(res, { error: 'short_code required' }, 400);
      return;
    }

    const tokenData = activeCodes.get(short_code);

    if (!tokenData) {
      console.log('❌ Invalid code:', short_code);
      json(res, { error: 'Invalid or expired code' }, 404);
      return;
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      console.log('⏰ Expired code:', short_code);
      activeCodes.delete(short_code);
      json(res, { error: 'Code expired' }, 404);
      return;
    }

    // Code is valid — consume it
    activeCodes.delete(short_code);

    const deviceId = 'device-' + crypto.randomUUID().slice(0, 8);
    const authToken = crypto.randomBytes(32).toString('base64url');

    const response = {
      device_id: deviceId,
      child_id: tokenData.child_id,
      family_id: tokenData.family_id,
      auth_token: authToken,
      policy_version: 1,
      policy_pack: {
        policy_version: 1,
        generated_at: new Date().toISOString(),
        child_id: tokenData.child_id,
        child_name: 'Test Child',
        tier: 'tween_13',
        rules: [
          { id: 'r1', text: 'Block gambling on all sites', scope: 'topic', target: null, sort_order: 1 },
          { id: 'r2', text: 'Block violent content on YouTube', scope: 'topic', target: 'youtube.com', sort_order: 2 },
          { id: 'r3', text: 'Block adult content everywhere', scope: 'topic', target: null, sort_order: 3 },
        ],
      },
    };

    // Track the paired device
    const device = {
      device_id: deviceId,
      child_id: tokenData.child_id,
      child_name: 'Test Child',
      family_id: tokenData.family_id,
      device_name: body.device_name || 'Chrome Browser',
      platform: body.platform || 'chrome',
      status: 'active',
      paired_at: new Date().toISOString(),
      rules_count: response.policy_pack.rules.length,
    };
    pairedDevices.push(device);
    heartbeats.set(deviceId, { last_seen: new Date().toISOString(), extension_version: null, platform: body.platform || 'chrome' });

    console.log(`\n🎉 PAIRING SUCCESSFUL!`);
    console.log(`   Device: ${deviceId}`);
    console.log(`   Child: ${tokenData.child_id}`);
    console.log(`   Family: ${tokenData.family_id}`);
    console.log(`   Rules sent: ${response.policy_pack.rules.length}`);
    console.log(`   Extension is now synced and protected.\n`);

    // Generate a new code for next pairing
    generateCode();

    json(res, response);
    return;
  }

  // ── POST /api/extension/sync — Heartbeat / policy poll ──
  if (url.pathname === '/api/extension/sync') {
    if (req.method === 'GET') {
      console.log('🔄 Policy sync poll from extension');
      json(res, { up_to_date: true });
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      console.log('💓 Heartbeat from device:', body.device_id);
      // Update heartbeat tracking
      if (body.device_id) {
        heartbeats.set(body.device_id, {
          last_seen: new Date().toISOString(),
          extension_version: body.extension_version || null,
          platform: body.platform || 'chrome',
        });
      }
      json(res, { status: 'ok' });
      return;
    }
  }

  // ── POST /api/extension/events — Event flush ──
  if (url.pathname === '/api/extension/events' && req.method === 'POST') {
    const body = await readBody(req);
    const events = body.events || [];
    console.log(`📊 Received ${events.length} events from device: ${body.device_id}`);
    // Store events for dashboard display
    for (const evt of events) {
      recentEvents.unshift({ ...evt, device_id: body.device_id, received_at: new Date().toISOString() });
    }
    // Trim to max
    while (recentEvents.length > MAX_EVENTS) recentEvents.pop();
    json(res, { status: 'ok', received: events.length });
    return;
  }

  // ── GET /api/code — Get current code (for test page refresh) ──
  if (url.pathname === '/api/code' && req.method === 'GET') {
    json(res, { code: currentCode });
    return;
  }

  // ── GET /api/new-code — Generate fresh code ──
  if (url.pathname === '/api/new-code' && req.method === 'GET') {
    const result = generateCode();
    json(res, { code: result.code });
    return;
  }

  // ── GET /api/devices — Return paired devices with live heartbeat data ──
  if (url.pathname === '/api/devices' && req.method === 'GET') {
    const devices = pairedDevices.map(d => {
      const hb = heartbeats.get(d.device_id);
      return {
        ...d,
        last_heartbeat: hb?.last_seen || d.paired_at,
        extension_version: hb?.extension_version || null,
        online: hb ? (Date.now() - new Date(hb.last_seen).getTime() < 2 * 60 * 1000) : false,
      };
    });
    json(res, { devices });
    return;
  }

  // ── GET /api/dashboard — Full dashboard state for polling ──
  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const devices = pairedDevices.map(d => {
      const hb = heartbeats.get(d.device_id);
      return {
        ...d,
        last_heartbeat: hb?.last_seen || d.paired_at,
        extension_version: hb?.extension_version || null,
        online: hb ? (Date.now() - new Date(hb.last_seen).getTime() < 2 * 60 * 1000) : false,
      };
    });
    json(res, {
      paired: pairedDevices.length > 0,
      devices,
      events: recentEvents.slice(0, 20),
      rules: [
        { id: 'r1', text: 'Block gambling on all sites', scope: 'topic', active: true },
        { id: 'r2', text: 'Block violent content on YouTube', scope: 'topic', active: true },
        { id: 'r3', text: 'Block adult content everywhere', scope: 'topic', active: true },
      ],
    });
    return;
  }

  // ── GET /api/pairing/status — Check if any device has been paired ──
  if (url.pathname === '/api/pairing/status' && req.method === 'GET') {
    json(res, { paired: pairedDevices.length > 0, device: pairedDevices[pairedDevices.length - 1] || null });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ── Helpers ──

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Phylax — Parent Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070A12; color: white; font-family: -apple-system, system-ui, sans-serif;
      min-height: 100vh; padding: 0;
    }

    /* ── Layout ── */
    .app { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
    .logo { width: 40px; height: 40px; border-radius: 12px;
      background: linear-gradient(135deg, #7C5CFF, #22D3EE);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(124,92,255,0.3); }
    .logo svg { width: 20px; height: 20px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header-badge { margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .badge-online { background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3); color: #34D399; }
    .badge-pairing { background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); color: #22D3EE; }

    /* ── Pairing View ── */
    .pairing-view { display: flex; flex-direction: column; align-items: center; padding: 60px 0; }
    .pairing-view.hidden { display: none; }
    .pairing-view h2 { font-size: 24px; margin-bottom: 8px; }
    .pairing-view .sub { color: rgba(255,255,255,0.5); margin-bottom: 40px; font-size: 15px; }
    .code-display { display: flex; gap: 12px; margin-bottom: 24px; }
    .digit { width: 64px; height: 80px; background: rgba(255,255,255,0.06);
      border: 2px solid rgba(255,255,255,0.15); border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-size: 36px; font-weight: 700; color: #22D3EE; }
    .hint { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 32px; }
    .btn-secondary { padding: 10px 28px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06); color: white; font-size: 14px; cursor: pointer; }
    .btn-secondary:hover { background: rgba(255,255,255,0.1); }
    .steps { margin-top: 48px; max-width: 480px; text-align: left; width: 100%;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px; padding: 24px; }
    .steps h3 { margin-bottom: 12px; color: rgba(255,255,255,0.6); font-size: 14px; font-weight: 600; }
    .steps ol { padding-left: 20px; }
    .steps li { color: rgba(255,255,255,0.5); margin-bottom: 8px; line-height: 1.5; font-size: 13px; }
    .steps code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 12px; }

    /* ── Dashboard View ── */
    .dashboard-view { display: none; }
    .dashboard-view.visible { display: block; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }

    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px; padding: 20px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .card-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }
    .card-badge { font-size: 11px; padding: 3px 10px; border-radius: 99px; font-weight: 600; }

    /* Hero status card */
    .hero-card { grid-column: 1 / -1; position: relative; overflow: hidden;
      background: linear-gradient(135deg, rgba(52,211,153,0.06), rgba(124,92,255,0.04));
      border-color: rgba(52,211,153,0.15); }
    .hero-card .glow { position: absolute; top: -60px; right: -60px; width: 200px; height: 200px;
      border-radius: 50%; background: rgba(52,211,153,0.08); filter: blur(60px); }
    .hero-status { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .pulse-dot { position: relative; width: 10px; height: 10px; }
    .pulse-dot span:first-child { position: absolute; width: 100%; height: 100%; border-radius: 50%;
      background: #34D399; animation: pulse 2s infinite; }
    .pulse-dot span:last-child { position: relative; display: block; width: 100%; height: 100%;
      border-radius: 50%; background: #34D399; }
    @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0; transform: scale(2.5); } }
    .hero-label { font-size: 14px; font-weight: 600; color: #34D399; }
    .hero-device { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 16px; color: rgba(255,255,255,0.4); font-size: 13px; }
    .hero-meta strong { color: #34D399; font-weight: 600; }

    /* Device card */
    .device-item { display: flex; align-items: center; gap: 12px; padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04); }
    .device-item:last-child { border-bottom: none; }
    .device-icon { width: 36px; height: 36px; border-radius: 10px; display: flex;
      align-items: center; justify-content: center; }
    .device-icon.online { background: rgba(52,211,153,0.15); color: #34D399; }
    .device-icon.offline { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }
    .device-info { flex: 1; }
    .device-name { font-size: 14px; font-weight: 600; }
    .device-detail { font-size: 12px; color: rgba(255,255,255,0.4); }
    .device-status { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
    .device-status.online { background: rgba(52,211,153,0.15); color: #34D399; }
    .device-status.offline { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }

    /* Rules */
    .rule-item { display: flex; align-items: center; gap: 10px; padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
    .rule-item:last-child { border-bottom: none; }
    .rule-dot { width: 6px; height: 6px; border-radius: 50%; background: #7C5CFF; flex-shrink: 0; }
    .rule-text { color: rgba(255,255,255,0.6); flex: 1; }
    .rule-badge { font-size: 10px; padding: 2px 8px; border-radius: 99px;
      background: rgba(124,92,255,0.15); color: #7C5CFF; font-weight: 600; }

    /* Events feed */
    .events-card { grid-column: 1 / -1; }
    .event-item { display: flex; align-items: center; gap: 10px; padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04); }
    .event-item:last-child { border-bottom: none; }
    .event-icon { width: 28px; height: 28px; border-radius: 8px; display: flex;
      align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
    .event-icon.blocked { background: rgba(244,63,94,0.15); color: #F43F5E; }
    .event-icon.allowed { background: rgba(52,211,153,0.15); color: #34D399; }
    .event-icon.heartbeat { background: rgba(56,189,248,0.15); color: #38BDF8; }
    .event-icon.other { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }
    .event-info { flex: 1; min-width: 0; }
    .event-type { font-size: 13px; font-weight: 500; }
    .event-detail { font-size: 11px; color: rgba(255,255,255,0.35); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
    .event-time { font-size: 11px; color: rgba(255,255,255,0.25); flex-shrink: 0; }
    .empty-state { text-align: center; padding: 32px; color: rgba(255,255,255,0.3); font-size: 13px; }

    /* Pair another */
    .pair-another { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
  </style>
</head>
<body>
<div class="app">
  <!-- Header -->
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter">
        <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
      </svg>
    </div>
    <h1>Phylax</h1>
    <div class="header-badge badge-pairing" id="header-badge">
      <span class="pulse-dot"><span></span><span></span></span>
      Waiting for pairing
    </div>
  </div>

  <!-- ═══ PAIRING VIEW ═══ -->
  <div class="pairing-view" id="pairing-view">
    <h2>Connect Your First Device</h2>
    <p class="sub">Enter this code in the Phylax Chrome extension</p>
    <div class="code-display" id="code-display"></div>
    <p class="hint">Code expires in 10 minutes</p>
    <button class="btn-secondary" onclick="newCode()">Generate New Code</button>

    <div class="steps">
      <h3>Setup Steps</h3>
      <ol>
        <li>Open <code>chrome://extensions</code> and enable Developer mode</li>
        <li>Click <strong>Load unpacked</strong> → select the <code>extension/</code> folder</li>
        <li>Click the Phylax extension icon in Chrome toolbar</li>
        <li>Enter the 6-digit code shown above</li>
        <li>Click <strong>Connect Device</strong></li>
      </ol>
    </div>
  </div>

  <!-- ═══ DASHBOARD VIEW ═══ -->
  <div class="dashboard-view" id="dashboard-view">

    <!-- Hero Status -->
    <div class="grid">
      <div class="card hero-card">
        <div class="glow"></div>
        <div style="position:relative;">
          <div class="hero-status">
            <div class="pulse-dot"><span></span><span></span></div>
            <span class="hero-label" id="hero-label">Protected</span>
          </div>
          <div class="hero-device" id="hero-device">Chrome Browser</div>
          <div class="hero-meta">
            <span>Last seen: <strong id="hero-lastseen">Just now</strong></span>
            <span>Risk level: <strong style="color:#34D399;">Low</strong></span>
            <span>Protection: <strong style="color:#34D399;">Active</strong></span>
          </div>
        </div>
      </div>

      <!-- Devices -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Paired Devices</span>
          <span class="card-badge badge-online" id="device-count">0 online</span>
        </div>
        <div id="device-list">
          <div class="empty-state">No devices yet</div>
        </div>
        <div class="pair-another" style="margin-top: 12px;">
          <button class="btn-secondary" style="font-size:12px; padding:8px 16px;" onclick="showPairing()">+ Pair Another Device</button>
        </div>
      </div>

      <!-- Rules -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Active Rules</span>
          <span class="card-badge" style="background:rgba(124,92,255,0.15);color:#7C5CFF;" id="rule-count">3 rules</span>
        </div>
        <div id="rule-list"></div>
      </div>

      <!-- Events Feed -->
      <div class="card events-card">
        <div class="card-header">
          <span class="card-title">Live Activity</span>
          <span style="font-size:11px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.05em;">Real-time</span>
        </div>
        <div id="event-list">
          <div class="empty-state">Waiting for extension activity...<br><span style="font-size:11px;">Events will appear here as the extension monitors browsing.</span></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  // ── State ──
  let isPaired = false;
  let pollTimer = null;

  // ── Pairing View ──
  function showCode(code) {
    const display = document.getElementById('code-display');
    display.innerHTML = code.split('').map(d => '<div class="digit">' + d + '</div>').join('');
  }

  async function newCode() {
    const res = await fetch('/api/new-code');
    const { code } = await res.json();
    showCode(code);
  }

  function showPairing() {
    document.getElementById('pairing-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.remove('visible');
    newCode();
  }

  // ── Dashboard View ──
  function showDashboard(data) {
    document.getElementById('pairing-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('visible');

    const badge = document.getElementById('header-badge');
    const onlineCount = data.devices.filter(d => d.online).length;
    badge.className = 'header-badge ' + (onlineCount > 0 ? 'badge-online' : 'badge-pairing');
    badge.innerHTML = onlineCount > 0
      ? '<span class="pulse-dot"><span></span><span></span></span> ' + onlineCount + ' device' + (onlineCount > 1 ? 's' : '') + ' online'
      : 'Devices offline';

    // Hero
    const primary = data.devices[data.devices.length - 1];
    if (primary) {
      document.getElementById('hero-device').textContent = primary.device_name || 'Chrome Browser';
      document.getElementById('hero-lastseen').textContent = timeAgo(primary.last_heartbeat);
      document.getElementById('hero-label').textContent = primary.online ? 'Protected' : 'Offline';
      document.getElementById('hero-label').style.color = primary.online ? '#34D399' : '#F59E0B';
    }

    // Devices
    document.getElementById('device-count').textContent = onlineCount + ' online';
    const dl = document.getElementById('device-list');
    if (data.devices.length === 0) {
      dl.innerHTML = '<div class="empty-state">No devices yet</div>';
    } else {
      dl.innerHTML = data.devices.map(d => {
        const on = d.online;
        return '<div class="device-item">' +
          '<div class="device-icon ' + (on ? 'online' : 'offline') + '">' +
            '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"/></svg>' +
          '</div>' +
          '<div class="device-info">' +
            '<div class="device-name">' + esc(d.device_name || 'Chrome Browser') + '</div>' +
            '<div class="device-detail">' + esc(d.child_name || 'Test Child') + ' &middot; ' +
              (d.extension_version ? 'v' + esc(d.extension_version) + ' &middot; ' : '') +
              'Last seen ' + timeAgo(d.last_heartbeat) + '</div>' +
          '</div>' +
          '<span class="device-status ' + (on ? 'online' : 'offline') + '">' + (on ? 'Online' : 'Offline') + '</span>' +
        '</div>';
      }).join('');
    }

    // Rules
    const rl = document.getElementById('rule-list');
    document.getElementById('rule-count').textContent = data.rules.length + ' rules';
    rl.innerHTML = data.rules.map(r =>
      '<div class="rule-item">' +
        '<span class="rule-dot"></span>' +
        '<span class="rule-text">' + esc(r.text) + '</span>' +
        '<span class="rule-badge">' + esc(r.scope) + '</span>' +
      '</div>'
    ).join('');

    // Events
    const el = document.getElementById('event-list');
    if (data.events.length === 0) {
      el.innerHTML = '<div class="empty-state">Waiting for extension activity...<br><span style="font-size:11px;">Browse some sites to see events appear here in real-time.</span></div>';
    } else {
      el.innerHTML = data.events.slice(0, 15).map(evt => {
        const type = evt.event_type || 'unknown';
        let iconClass = 'other';
        let label = type.replace(/_/g, ' ');
        if (type === 'blocked' || type === 'BLOCK') { iconClass = 'blocked'; label = 'Blocked'; }
        else if (type === 'allowed' || type === 'ALLOW') { iconClass = 'allowed'; label = 'Allowed'; }
        else if (type === 'device_heartbeat') { iconClass = 'heartbeat'; label = 'Heartbeat'; }
        else if (type === 'PAGE_LOAD') { iconClass = 'allowed'; label = 'Page Load'; }
        else if (type === 'VIDEO_CLASSIFIED') { iconClass = 'other'; label = 'Video Scan'; }

        const iconSvg = iconClass === 'blocked'
          ? '<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>'
          : iconClass === 'allowed'
          ? '<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
          : '<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

        return '<div class="event-item">' +
          '<div class="event-icon ' + iconClass + '">' + iconSvg + '</div>' +
          '<div class="event-info">' +
            '<div class="event-type">' + esc(label) + (evt.domain ? ' <span style="color:rgba(255,255,255,0.3)">&middot; ' + esc(evt.domain) + '</span>' : '') + '</div>' +
            (evt.url ? '<div class="event-detail">' + esc(evt.url) + '</div>' : '') +
          '</div>' +
          '<span class="event-time">' + timeAgo(evt.received_at || evt.timestamp) + '</span>' +
        '</div>';
      }).join('');
    }
  }

  // ── Helpers ──
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function timeAgo(ts) {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 5000) return 'Just now';
    if (diff < 60000) return Math.floor(diff/1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
    return Math.floor(diff/86400000) + 'd ago';
  }

  // ── Initialize ──
  // Load initial code
  fetch('/api/code').then(r => r.json()).then(({ code }) => showCode(code));

  // Check immediately if already paired (e.g. page refresh after pairing)
  fetch('/api/dashboard').then(r => r.json()).then(data => {
    if (data.paired) {
      isPaired = true;
      showDashboard(data);
    }
  });

  // Poll for state changes — pairing detection + live dashboard updates
  setInterval(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.paired) {
        if (!isPaired) isPaired = true;
        showDashboard(data);
      }
    } catch {}
  }, 2000);
</script>
</body>
</html>`;
}

// ── Start ──

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Phylax Pairing Test Server                     ║`);
  console.log(`║   http://localhost:${PORT}                          ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`\nOpen http://localhost:${PORT} to see the pairing code.`);
  console.log(`Then enter it in the Phylax extension popup.\n`);
});
