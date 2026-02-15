/**
 * Phylax Pairing Test Server
 *
 * Mocks the dashboard API locally so you can test the full extension pairing flow
 * without needing Supabase.
 *
 * Usage:
 *   node test-pairing-server.js
 *
 * Then:
 *   1. Open http://localhost:3000 in your browser — it shows a 6-digit code
 *   2. Load the extension in Chrome (chrome://extensions → Load unpacked → select extension/)
 *   3. Click the Phylax extension icon → enter the 6-digit code → click Connect
 *   4. Watch the terminal — you'll see the pairing request come through
 *   5. The extension popup should switch to "Protection Active"
 */

import http from 'node:http';
import crypto from 'node:crypto';

// ── In-memory state (replaces Supabase) ──

const activeCodes = new Map();  // short_code → { child_id, family_id, expires_at }
let currentCode = null;

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

  // ── GET / — Test page with code display ──
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getTestPageHTML());
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

    console.log(`\n🎉 PAIRING SUCCESSFUL!`);
    console.log(`   Device: ${deviceId}`);
    console.log(`   Child: ${tokenData.child_id}`);
    console.log(`   Family: ${tokenData.family_id}`);
    console.log(`   Rules sent: ${response.policy_pack.rules.length}`);
    console.log(`   Extension is now synced and protected.\n`);

    // Generate a new code for next test
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
      json(res, { status: 'ok' });
      return;
    }
  }

  // ── POST /api/extension/events — Event flush ──
  if (url.pathname === '/api/extension/events' && req.method === 'POST') {
    const body = await readBody(req);
    console.log(`📊 Received ${body.events?.length || 0} events from device: ${body.device_id}`);
    json(res, { status: 'ok', received: body.events?.length || 0 });
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

function getTestPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Phylax Pairing Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070A12; color: white; font-family: -apple-system, system-ui, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 40px;
    }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 40px; }
    .code-display {
      display: flex; gap: 12px; margin-bottom: 24px;
    }
    .digit {
      width: 64px; height: 80px; background: rgba(255,255,255,0.06);
      border: 2px solid rgba(255,255,255,0.15); border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      font-size: 36px; font-weight: 700; color: #22D3EE;
    }
    .hint { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 32px; }
    .new-code-btn {
      padding: 12px 32px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06); color: white; font-size: 14px; cursor: pointer;
    }
    .new-code-btn:hover { background: rgba(255,255,255,0.1); }
    .steps {
      margin-top: 48px; max-width: 500px; text-align: left;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 24px;
    }
    .steps h3 { margin-bottom: 16px; color: rgba(255,255,255,0.7); }
    .steps ol { padding-left: 20px; }
    .steps li { color: rgba(255,255,255,0.6); margin-bottom: 8px; line-height: 1.5; }
    .steps code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .log-section {
      margin-top: 32px; max-width: 500px; width: 100%; text-align: left;
    }
    .log-section h3 { color: rgba(255,255,255,0.5); margin-bottom: 8px; font-size: 14px; }
    #log {
      background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px;
      color: rgba(255,255,255,0.5); min-height: 60px; max-height: 200px; overflow-y: auto;
    }
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 99px; font-size: 12px; margin-bottom: 32px;
      background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); color: #22D3EE;
    }
    .status-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: #22D3EE; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="status-badge"><span class="dot"></span> Test Server Running on :3000</div>
  <h1>Parent Pairing Code</h1>
  <p class="subtitle">Enter this code in the Phylax extension</p>
  <div class="code-display" id="code-display"></div>
  <p class="hint">Code expires in 10 minutes</p>
  <button class="new-code-btn" onclick="newCode()">Generate New Code</button>

  <div class="steps">
    <h3>How to test:</h3>
    <ol>
      <li>Open <code>chrome://extensions</code> and enable Developer mode</li>
      <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder</li>
      <li>Click the Phylax extension icon in Chrome toolbar</li>
      <li>Enter the 6-digit code shown above</li>
      <li>Click <strong>Connect Device</strong></li>
      <li>Watch the terminal and this page for confirmation</li>
    </ol>
  </div>

  <div class="log-section">
    <h3>Live Events</h3>
    <div id="log">Waiting for extension to connect...</div>
  </div>

  <script>
    function showCode(code) {
      const display = document.getElementById('code-display');
      display.innerHTML = code.split('').map(d => '<div class="digit">' + d + '</div>').join('');
    }

    async function newCode() {
      const res = await fetch('/api/new-code');
      const { code } = await res.json();
      showCode(code);
      addLog('New code generated: ' + code);
    }

    function addLog(msg) {
      const log = document.getElementById('log');
      const time = new Date().toLocaleTimeString();
      log.innerHTML += '<div>' + time + ' — ' + msg + '</div>';
      log.scrollTop = log.scrollHeight;
    }

    // Load initial code
    fetch('/api/code').then(r => r.json()).then(({ code }) => showCode(code));

    // Poll for events (simple approach)
    setInterval(async () => {
      try {
        const res = await fetch('/api/code');
        const { code } = await res.json();
        // Code changed = something happened
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
