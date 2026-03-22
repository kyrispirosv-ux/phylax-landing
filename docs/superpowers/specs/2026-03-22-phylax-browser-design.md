# Phylax Browser — Design Spec

**Date:** 2026-03-22
**Status:** Approved

## Summary

Replace the Chrome extension with a standalone Electron-based browser for kids. Parents control the browser remotely via the existing Phylax dashboard. The browser ships on Mac and Windows, uses a light Firefox-style UI with the Phylax gold shield logo, and adapts its lockdown level per child's age tier.

## Architecture

### Components

1. **Phylax Browser (Electron app)** — Chromium-based desktop browser that kids use. All web traffic runs through the Phylax safety engine natively. Light UI, tabs, address bar, standard browsing experience.

2. **Parent Dashboard (existing)** — Web app at phylax-app.vercel.app. Parents manage rules, view alerts, control lockdown, and generate installer downloads with embedded pairing tokens. Minor addition: "Download Browser" button that produces a pre-paired installer.

3. **Supabase Backend (existing)** — Auth, rules, alerts, events, devices. No schema changes needed. The browser uses the same API routes the extension currently uses (`/api/extension/sync`, `/api/extension/events`, `/api/extension/alerts`, etc.).

4. **Safety Engine (ported from extension)** — The 10-step deterministic pipeline, grooming detector, LLM enforcer, rule compiler, risk classifier — all existing JS code. Runs in Electron's main process with direct access to all web requests and DOM content, eliminating extension API limitations.

### What carries over vs. what's new

| Component | Status |
|-----------|--------|
| Safety pipeline (10-step) | Carries over |
| Grooming detector | Carries over |
| LLM enforcer | Carries over |
| Rule compiler | Carries over |
| Content scripts (observer, enforcer, youtube-scanner, search-interceptor) | Carries over (injected via Electron webContents) |
| Backend API routes | No changes |
| Supabase DB schema | No changes |
| Parent dashboard | Minor addition (installer download) |
| Electron browser shell | **New** |
| Auto-pairing installer | **New** |
| Parental lock (can't uninstall/close) | **New** |
| Age-tier lockdown modes | **New** |

## Browser UI

### Visual Style
- **Light theme**, Firefox-inspired
- Clean toolbar: back/forward/reload, address bar, Phylax shield icon
- Standard tab bar
- Subtle branding — gold shield logo in toolbar, no heavy "SAFE/BLOCKED" badges
- Kids experience a normal browser; safety runs silently

### Phylax Shield Logo
- Gold Greek key shield (`phylax_symmetrical_greek_shield.jpg`)
- Displayed as a small icon in the browser toolbar
- Clicking it shows protection status and "Request Access" for blocked content

## Lockdown Modes (Parent-Configurable per Child)

Parents set the lockdown level from the dashboard based on the child's age tier.

### Full Lockdown (kid_10)
- No address bar (parent controls allowed sites via whitelist)
- No downloads
- No extensions
- Can't close browser without parent password
- Homepage shows parent-curated bookmarks (Home, Learning, Favorites)
- Kid-friendly larger buttons and icons

### Monitored Freedom (tween_13)
- Normal address bar and tabs
- Safety engine filters all content
- Downloads require parent approval
- Can't disable protections or uninstall without parent password
- Can browse freely within safety rules

### Light Monitoring (teen_16)
- Full browser experience
- Safety engine monitors but intervenes less (higher thresholds)
- Grooming detection and critical content blocking still active
- Activity logged for parent review
- Can't disable protections without parent password

## Pairing Flow

### Parent-initiated install (primary flow)
1. Parent clicks "Add Device" in dashboard
2. Selects child profile and generates installer
3. Dashboard produces a download link: `.dmg` (Mac) or `.exe` (Windows) with pairing token embedded as a config file inside the installer
4. Parent downloads and installs on kid's computer
5. On first launch, browser reads the embedded token, calls `/api/pairing/consume`, auto-pairs
6. Browser is immediately linked to the child profile with correct age tier and rules
7. Zero setup required from the kid

### Fallback: manual code entry
- If parent installs a generic (non-paired) version, browser shows a pairing screen on first launch
- Kid or parent enters the 6-digit code from the dashboard
- Same flow as the current extension pairing

## Safety Engine Integration

### How it runs in Electron

The safety engine runs in Electron's **main process**. Unlike the extension (which uses `chrome.webRequest` and content scripts with Manifest V3 limitations), Electron provides:

- **`session.webRequest`** — intercept all HTTP requests before they reach the renderer. Can block, redirect, or modify requests. Replaces `chrome.webRequest`.
- **`webContents.on('will-navigate')`** — intercept navigation before it happens.
- **`webContents.executeJavaScript()`** — inject content scripts (observer, enforcer) into any page. Replaces `chrome.scripting.executeScript`.
- **`webContents.on('did-finish-load')`** — trigger content analysis after page load.
- **`BrowserWindow` control** — prevent closing, hide DevTools, disable extensions.

### Pipeline flow (same 10 steps)
1. URL/domain gate (block known-bad domains)
2. Content ID hashing
3. Canonical text extraction (via injected observer)
4. URL topic boosting
5. Local prefilter scoring
6. Score merge (local + optional remote LLM)
7. Intent disambiguation
8. Confidence calibration
9. Topic policy evaluation (apply parent rules)
10. Enforcement (overlay, blur, block, alert parent)

### Content script injection
- `observer.js` — injected at `did-finish-load`, extracts page content
- `enforcer.js` — injected when a BLOCK/LIMIT decision is made, renders overlays
- `youtube-scanner.js` — injected on YouTube pages
- `search-interceptor.js` — injected on search engine pages
- `llm-observer.js` — injected on AI chatbot pages

All existing content scripts work as-is. Instead of `chrome.runtime.sendMessage`, they communicate with the main process via Electron's `ipcRenderer`/`ipcMain`.

### Communication bridge
- Content scripts use `contextBridge.exposeInMainWorld()` to safely communicate with the main process
- Preload script bridges `ipcRenderer` calls
- Main process runs the safety pipeline and returns decisions

## Backend Sync

Same as the current extension:
- **Policy sync**: every 5 minutes, GET `/api/extension/sync`
- **Heartbeat**: every 1 minute
- **Event flush**: every 30 seconds or immediate for urgent events
- **Alerts**: POST `/api/extension/alerts` for critical threats (grooming, etc.)
- **Auth**: Bearer token (HMAC-SHA256 signed)

The backend doesn't know or care whether the client is a Chrome extension or an Electron browser — the API contract is identical.

## Parental Lock

### Can't uninstall
- Mac: Browser installs to `/Applications/Phylax.app`. Removal requires admin password (standard macOS behavior for apps). Optional: MDM profile for managed devices.
- Windows: Installer registers in Program Files. Uninstall requires admin/parent password via custom uninstaller prompt.

### Can't close
- In Full Lockdown mode: window close is intercepted, requires parent password
- In Monitored/Light mode: browser can be closed normally, but parent is notified if browser hasn't been opened in 24h

### Can't bypass
- DevTools disabled (unless parent enables for teen_16)
- No incognito/private mode
- No extension installation
- `will-navigate` prevents navigating to `chrome://`, `about:`, etc.

### Auto-restrict other browsers (installer sets up automatically)

During installation (parent enters admin password once), Phylax automatically:

**Mac:**
- Installs a macOS configuration profile (`.mobileconfig`) that restricts app launches to a whitelist (Phylax Browser + parent-approved apps)
- Uses `profiles` CLI tool to install the profile with admin elevation
- Parent can manage the whitelist from the dashboard

**Windows:**
- Configures AppLocker / Software Restriction Policies via PowerShell to block known browser executables (chrome.exe, firefox.exe, msedge.exe, brave.exe, opera.exe)
- Registers policies during install with admin elevation
- Parent can manage exceptions from the dashboard

### Auto-detect other browsers

The Electron main process continuously monitors for bypass attempts:

- **File system watch**: Monitors `/Applications` (Mac) and `Program Files` (Windows) for new browser installations using `fs.watch`
- **Process scanning**: Periodically checks running processes for known browser executables
- **Instant alerts**: If another browser is detected (installed or running), immediately alerts the parent via POST `/api/extension/alerts`
- **Dashboard notification**: Parent sees "Chrome was installed on [child]'s device" with option to remotely block it

## Platforms

- **Mac**: `.dmg` installer, Apple Silicon + Intel universal binary
- **Windows**: `.exe` installer (NSIS or Electron Builder)
- Built from single Electron codebase using `electron-builder`

## Project Structure

```
phylax-landing/
  browser/                    # NEW — Electron browser app
    package.json
    electron-builder.yml      # Build/packaging config
    src/
      main/
        main.ts               # Electron main process
        window.ts             # BrowserWindow management
        safety/               # Safety engine (ported from extension/engine/)
          pipeline.ts         # 10-step pipeline
          grooming.ts         # Grooming detector
          llm-enforcer.ts     # LLM filtering
          rule-compiler.ts    # NL rule compilation
          ...
        sync/
          backend-sync.ts     # API sync (from extension/backend-sync.js)
          auth.ts             # Token management
        lockdown/
          parental-lock.ts    # Close prevention, password gate
          age-modes.ts        # Lockdown mode per age tier
          app-restrictor.ts   # OS-level app restriction (mobileconfig / AppLocker)
          browser-detector.ts # Monitor for other browser installs/processes
      preload/
        preload.ts            # IPC bridge for content scripts
      renderer/
        index.html            # Browser chrome UI
        toolbar.tsx           # Address bar, tabs, nav buttons
        new-tab.tsx           # New tab page
        blocked.tsx           # Blocked content page
        pairing.tsx           # First-launch pairing screen
      content/                # Injected into web pages (ported from extension/content/)
        observer.js
        enforcer.js
        youtube-scanner.js
        search-interceptor.js
        llm-observer.js
    assets/
      icons/                  # App icons (gold shield)
      phylax-shield.png       # Toolbar icon
```

## MVP Scope

### In scope
- Electron browser with tabs, address bar, navigation
- Light Firefox-style UI with Phylax shield logo
- Safety engine (full 10-step pipeline) running in main process
- Content script injection (observer, enforcer, YouTube, search, LLM)
- Backend sync with existing Supabase API
- Auto-pairing via embedded token in installer
- Manual pairing fallback (6-digit code)
- Parent-configurable lockdown modes (Full, Monitored, Light)
- Can't uninstall without admin password
- Can't disable protections
- Auto-restrict other browsers via OS-level policies (set up during install)
- Auto-detect other browser installations and alert parent
- Mac + Windows builds

### Out of scope (future)
- Mobile browser (iOS/Android)
- Browser history visible to parents (privacy concern — keep current approach of alerts-only)
- Custom themes/skins for kids
- Built-in ad blocker (could add later)
- Bookmark sync across devices
- Auto-update mechanism (add in v2)

## Success Criteria
- Browser launches, renders pages correctly
- Safety engine blocks harmful content same as extension
- Parent dashboard controls propagate to browser in real-time
- Pairing works end-to-end (parent generates installer → kid opens browser → auto-paired)
- Lockdown modes work per age tier
- Can't be bypassed by the child (no DevTools, no incognito, no uninstall)
