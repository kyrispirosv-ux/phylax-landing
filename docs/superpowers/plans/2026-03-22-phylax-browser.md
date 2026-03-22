# Phylax Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Electron-based browser for kids that replaces the Chrome extension, with the full safety engine running natively, parent-configurable lockdown modes, auto-pairing, and OS-level browser restriction.

**Architecture:** Electron app with Chromium renderer. Safety engine (ported from `phylax-safety/`) runs in the main process, intercepting all web requests via `session.webRequest` and injecting content scripts via `webContents.executeJavaScript`. The renderer hosts the browser chrome UI (toolbar, tabs, address bar) built with React. Communication between content scripts and the main process uses Electron's IPC bridge via a preload script.

**Tech Stack:** Electron 34, TypeScript, React 19, electron-builder, Vite (for renderer bundling)

**Source codebase:** All safety engine code lives in `/phylax-safety/` — this is the enhanced version with LLM support, semantic pipeline, and pattern tracking. Port from there, not from `/extension/`.

---

## File Structure

```
browser/
  package.json                    # Electron app dependencies
  tsconfig.json                   # TypeScript config
  electron-builder.yml            # Build/packaging config
  vite.config.ts                  # Vite config for renderer
  src/
    main/
      main.ts                     # Electron entry point
      window-manager.ts           # Tab/BrowserView management
      ipc-handlers.ts             # IPC channel registration
      menu.ts                     # App menu (restricted)
      safety/
        bridge.ts                 # Adapter: chrome.* APIs → Electron equivalents
        pipeline-runner.ts        # Orchestrates the 10-step pipeline
        request-interceptor.ts    # session.webRequest hooks
        content-injector.ts       # Injects content scripts into webContents
        grooming-state.ts         # Conversation state management
      sync/
        backend-sync.ts           # Policy sync, events, heartbeat (ported)
        auth.ts                   # Token/device ID management
        pairing.ts                # Auto-pair + manual code entry
      lockdown/
        parental-lock.ts          # Close prevention, password gate
        age-modes.ts              # Lockdown config per age tier
        app-restrictor.ts         # OS-level browser blocking
        browser-detector.ts       # Watch for other browsers
    preload/
      preload.ts                  # contextBridge IPC for content scripts
    renderer/
      index.html                  # Shell HTML
      main.tsx                    # React entry point
      App.tsx                     # Root component
      components/
        Toolbar.tsx               # Back/forward/reload + address bar + shield
        TabBar.tsx                # Tab strip
        Tab.tsx                   # Individual tab
        ShieldMenu.tsx            # Protection status popup
        BlockedPage.tsx           # Blocked content overlay
        PairingScreen.tsx         # First-launch pairing
        NewTabPage.tsx            # New tab page
        PasswordDialog.tsx        # Parent password prompt
      hooks/
        useTabs.ts                # Tab state management
      styles/
        global.css                # Light theme styles
    content/                      # Copied from phylax-safety/content/ (JS, injected into pages)
      observer.js
      enforcer.js
      youtube-scanner.js
      search-interceptor.js
      llm-observer.js
      signal-capture.js
    engine/                       # Copied from phylax-safety/engine/ (JS, runs in main process)
      pipeline.js
      grooming-detector.js
      rule-compiler.js
      lexicons.js
      intent-classifier.js
      risk-classifier.js
      decision-cache.js
      behavior.js
      compulsion-scorer.js
      harm-scorer.js
      policy-engine.js
      events.js
      logger.js
      semantic-interpreter.js
      llm-rules.js
      pattern-tracker.js
      safety-decision.js
      signal-aggregator.js
      feedback-capture.js
      community-intel.js
      semantic.js
      taxonomy.js
    enforcement/                  # Copied from phylax-safety/enforcement/
      llm-enforcer.js
  assets/
    icons/
      icon.png                    # App icon (gold shield)
      icon.icns                   # macOS icon
      icon.ico                    # Windows icon
    phylax-shield.png             # Toolbar shield icon
```

**Key decision:** The existing engine JS files are large and battle-tested. We copy them as-is into `browser/src/engine/` and `browser/src/content/` rather than rewriting in TypeScript. The new TypeScript code in `main/safety/` acts as a thin adapter layer that imports and orchestrates the JS engine.

---

### Task 1: Project Scaffold & Electron Shell

**Files:**
- Create: `browser/package.json`
- Create: `browser/tsconfig.json`
- Create: `browser/electron-builder.yml`
- Create: `browser/vite.config.ts`
- Create: `browser/src/main/main.ts`

- [ ] **Step 1: Create browser directory and package.json**

```bash
mkdir -p browser/src/main browser/src/preload browser/src/renderer browser/src/content browser/src/engine browser/src/enforcement browser/assets/icons
```

```json
{
  "name": "phylax-browser",
  "version": "1.0.0",
  "description": "Phylax Safe Browser for Kids",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"tsc -p tsconfig.json --watch\" \"electron .\"",
    "build": "vite build && tsc -p tsconfig.json",
    "package": "npm run build && electron-builder",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win"
  },
  "devDependencies": {
    "electron": "^34.0.0",
    "electron-builder": "^25.1.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.1.0"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowJs": true
  },
  "include": ["src/main/**/*", "src/preload/**/*"],
  "exclude": ["src/renderer/**/*", "src/content/**/*"]
}
```

- [ ] **Step 3: Create electron-builder.yml**

```yaml
appId: com.phylax.browser
productName: Phylax Browser
directories:
  output: release
  buildResources: assets
files:
  - dist/**/*
  - src/content/**/*
  - src/engine/**/*
  - src/enforcement/**/*
  - assets/**/*
mac:
  category: public.app-category.utilities
  icon: assets/icons/icon.icns
  target:
    - dmg
    - zip
  hardenedRuntime: true
  arch:
    - universal
win:
  icon: assets/icons/icon.ico
  target:
    - nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: false
  perMachine: true
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
});
```

- [ ] **Step 5: Create minimal main.ts that opens a window**

```typescript
// browser/src/main/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Phylax Browser',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load Vite dev server; in prod, load built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 6: Install dependencies and verify Electron launches**

```bash
cd browser && npm install && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add browser/package.json browser/tsconfig.json browser/electron-builder.yml browser/vite.config.ts browser/src/main/main.ts
git commit -m "feat(browser): scaffold Electron app with build config"
```

---

### Task 2: Renderer — Browser Chrome UI (Light Theme)

**Files:**
- Create: `browser/src/renderer/index.html`
- Create: `browser/src/renderer/main.tsx`
- Create: `browser/src/renderer/App.tsx`
- Create: `browser/src/renderer/styles/global.css`
- Create: `browser/src/renderer/components/Toolbar.tsx`
- Create: `browser/src/renderer/components/TabBar.tsx`
- Create: `browser/src/renderer/components/Tab.tsx`
- Create: `browser/src/renderer/hooks/useTabs.ts`

- [ ] **Step 1: Create index.html shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phylax Browser</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create global.css — light Firefox-inspired theme**

```css
/* browser/src/renderer/styles/global.css */
:root {
  --bg-toolbar: #f0f0f4;
  --bg-tab-active: #ffffff;
  --bg-tab-inactive: transparent;
  --bg-address-bar: #ffffff;
  --bg-content: #ffffff;
  --border-color: #e0e0e4;
  --text-primary: #1a1a2e;
  --text-secondary: #5b5b66;
  --text-muted: #999999;
  --accent-cyan: #22D3EE;
  --accent-gold: #C9A84C;
  --radius-sm: 6px;
  --radius-md: 8px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-toolbar);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
  user-select: none;
  -webkit-app-region: no-drag;
}

#root {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
```

- [ ] **Step 3: Create main.tsx and App.tsx**

`main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`App.tsx`:
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import TabBar from './components/TabBar';
import Toolbar from './components/Toolbar';
import ShieldMenu from './components/ShieldMenu';
import PairingScreen from './components/PairingScreen';
import PasswordDialog from './components/PasswordDialog';
import { useTabs } from './hooks/useTabs';

interface LockdownConfig {
  showAddressBar: boolean;
  allowDownloads: boolean;
  allowClose: boolean;
  requirePasswordToClose: boolean;
}

export default function App() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabs();
  const activeTab = tabs.find(t => t.id === activeTabId);

  const [paired, setPaired] = useState<boolean | null>(null); // null = checking
  const [shieldOpen, setShieldOpen] = useState(false);
  const [shieldStatus, setShieldStatus] = useState<'safe' | 'blocked' | 'monitoring'>('safe');
  const [lockdownConfig, setLockdownConfig] = useState<LockdownConfig | null>(null);
  const [passwordAction, setPasswordAction] = useState<string | null>(null);

  // Check pairing status on mount
  useEffect(() => {
    window.electronAPI?.sendToSafety('check-paired', {}).then((result: any) => {
      setPaired(result?.paired ?? false);
    });
  }, []);

  // Listen for pairing screen request from main
  useEffect(() => {
    const handler = () => setPaired(false);
    window.electronAPI?.onShowPairing?.(handler);
  }, []);

  // Listen for lockdown config from main
  useEffect(() => {
    const handler = (_event: any, config: LockdownConfig) => setLockdownConfig(config);
    window.electronAPI?.onLockdownConfig?.(handler);
  }, []);

  // Listen for password request from main (close prevention)
  useEffect(() => {
    const handler = (_event: any, action: string) => setPasswordAction(action);
    window.electronAPI?.onRequestPassword?.(handler);
  }, []);

  // Listen for shield status updates
  useEffect(() => {
    const handler = (_event: any, status: 'safe' | 'blocked' | 'monitoring') => setShieldStatus(status);
    window.electronAPI?.onShieldStatus?.(handler);
  }, []);

  const handlePaired = useCallback(() => setPaired(true), []);

  // Show pairing screen if not paired
  if (paired === null) return <div style={{ height: '100vh', background: 'var(--bg-toolbar)' }} />;
  if (paired === false) return <PairingScreen onPaired={handlePaired} />;

  const showAddressBar = lockdownConfig?.showAddressBar !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={closeTab}
        onNewTab={addTab}
      />
      <Toolbar
        url={activeTab?.url || ''}
        title={activeTab?.title || ''}
        canGoBack={activeTab?.canGoBack || false}
        canGoForward={activeTab?.canGoForward || false}
        showAddressBar={showAddressBar}
        onNavigate={(url) => window.electronAPI?.navigate(activeTabId, url)}
        onBack={() => window.electronAPI?.goBack(activeTabId)}
        onForward={() => window.electronAPI?.goForward(activeTabId)}
        onReload={() => window.electronAPI?.reload(activeTabId)}
        onShieldClick={() => setShieldOpen(!shieldOpen)}
      />

      <ShieldMenu
        visible={shieldOpen}
        status={shieldStatus}
        onClose={() => setShieldOpen(false)}
        onRequestAccess={() => { /* send IPC to main */ }}
      />

      {passwordAction && (
        <PasswordDialog
          action={passwordAction}
          onVerified={() => {
            setPasswordAction(null);
            if (passwordAction === 'close') {
              window.electronAPI?.sendToSafety('confirmed-close', {});
            }
          }}
          onCancel={() => setPasswordAction(null)}
        />
      )}

      {/* BrowserViews are managed by the main process, not rendered here */}
      <div style={{ flex: 1, background: 'var(--bg-content)' }} />
    </div>
  );
}
```

- [ ] **Step 4: Create useTabs hook**

```typescript
// browser/src/renderer/hooks/useTabs.ts
import { useState, useCallback, useEffect } from 'react';

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export function useTabs() {
  const [tabs, setTabs] = useState<TabInfo[]>([
    { id: 'tab-1', title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false },
  ]);
  const [activeTabId, setActiveTab] = useState('tab-1');

  const addTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id, title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false }]);
    setActiveTab(id);
    window.electronAPI?.createTab(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    window.electronAPI?.closeTab(id);
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        // Don't close last tab, open new one
        const newId = `tab-${Date.now()}`;
        window.electronAPI?.createTab(newId);
        setActiveTab(newId);
        return [{ id: newId, title: 'New Tab', url: '', canGoBack: false, canGoForward: false, loading: false }];
      }
      if (id === activeTabId) setActiveTab(next[next.length - 1].id);
      return next;
    });
  }, [activeTabId]);

  const updateTab = useCallback((id: string, updates: Partial<TabInfo>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  // Listen for tab updates from main process
  useEffect(() => {
    const handler = (_event: any, tabId: string, updates: Partial<TabInfo>) => {
      updateTab(tabId, updates);
    };
    window.electronAPI?.onTabUpdate(handler);
    return () => window.electronAPI?.offTabUpdate(handler);
  }, [updateTab]);

  return { tabs, activeTabId, addTab, closeTab, setActiveTab, updateTab };
}
```

- [ ] **Step 5: Create TabBar component**

```tsx
// browser/src/renderer/components/TabBar.tsx
import React from 'react';
import Tab from './Tab';
import type { TabInfo } from '../hooks/useTabs';

interface Props {
  tabs: TabInfo[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 2,
      padding: '8px 10px 0',
      background: 'var(--bg-toolbar)',
      WebkitAppRegion: 'drag' as any,
    }}>
      {/* macOS traffic lights spacer */}
      {window.electronAPI?.platform === 'darwin' && <div style={{ width: 70 }} />}
      {tabs.map(tab => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onSelect(tab.id)}
          onClose={() => onClose(tab.id)}
        />
      ))}
      <button
        onClick={onNewTab}
        style={{
          background: 'none',
          border: 'none',
          padding: '4px 10px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 16,
          WebkitAppRegion: 'no-drag' as any,
        }}
      >+</button>
    </div>
  );
}
```

- [ ] **Step 6: Create Tab component**

```tsx
// browser/src/renderer/components/Tab.tsx
import React from 'react';
import type { TabInfo } from '../hooks/useTabs';

interface Props {
  tab: TabInfo;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export default function Tab({ tab, isActive, onSelect, onClose }: Props) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: '8px 8px 0 0',
        background: isActive ? 'var(--bg-tab-active)' : 'var(--bg-tab-inactive)',
        border: isActive ? '1px solid var(--border-color)' : '1px solid transparent',
        borderBottom: 'none',
        cursor: 'pointer',
        fontSize: 12,
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: isActive ? 500 : 400,
        maxWidth: 200,
        minWidth: 100,
        WebkitAppRegion: 'no-drag' as any,
      }}
    >
      {tab.loading && <span style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>●</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {tab.title || 'New Tab'}
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
      >×</span>
    </div>
  );
}
```

- [ ] **Step 7: Create Toolbar component**

```tsx
// browser/src/renderer/components/Toolbar.tsx
import React, { useState, useCallback, useRef } from 'react';

interface Props {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  showAddressBar: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onShieldClick: () => void;
}

export default function Toolbar({ url, title, canGoBack, canGoForward, showAddressBar, onNavigate, onBack, onForward, onReload, onShieldClick }: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>();

  const displayUrl = focused ? input : url;

  const handleFocus = useCallback(() => {
    setInput(url);
    setFocused(true);
  }, [url]);

  const handleBlur = useCallback(() => {
    // Delay blur to allow form submit click to fire first
    blurTimeout.current = setTimeout(() => setFocused(false), 150);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(blurTimeout.current);
    let nav = input.trim();
    if (!nav) return;
    if (!/^https?:\/\//i.test(nav)) {
      if (nav.includes('.') && !nav.includes(' ')) {
        nav = 'https://' + nav;
      } else {
        nav = `https://www.google.com/search?q=${encodeURIComponent(nav)}`;
      }
    }
    onNavigate(nav);
    setFocused(false);
  }, [input, onNavigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--bg-tab-active)',
      borderBottom: '1px solid var(--border-color)',
    }}>
      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <NavButton onClick={onBack} disabled={!canGoBack}>←</NavButton>
        <NavButton onClick={onForward} disabled={!canGoForward}>→</NavButton>
        <NavButton onClick={onReload}>↻</NavButton>
      </div>

      {/* Address bar — hidden in Full Lockdown (kid_10) */}
      {showAddressBar && (
        <form onSubmit={handleSubmit} style={{ flex: 1 }}>
          <input
            type="text"
            value={displayUrl}
            onChange={e => setInput(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Search or type a URL..."
            style={{
              width: '100%',
              background: 'var(--bg-toolbar)',
              border: focused ? '2px solid var(--accent-cyan)' : '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              padding: '7px 12px',
              fontSize: 13,
              color: 'var(--text-secondary)',
              outline: 'none',
            }}
          />
        </form>
      )}

      {/* kid_10 label when address bar hidden */}
      {!showAddressBar && (
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          {title || 'Phylax Browser'}
        </div>
      )}

      {/* Phylax shield — click to open ShieldMenu */}
      <div
        onClick={onShieldClick}
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-sm)',
          background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>P</span>
      </div>
    </div>
  );
}

function NavButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#ddd' : 'var(--text-muted)',
        fontSize: 16,
        padding: '2px 4px',
        lineHeight: 1,
      }}
    >{children}</button>
  );
}
```

- [ ] **Step 8: Verify renderer builds with Vite**

```bash
cd browser && npx vite build
```

- [ ] **Step 9: Commit**

```bash
git add browser/src/renderer/
git commit -m "feat(browser): light Firefox-style browser chrome UI with tabs and toolbar"
```

---

### Task 3: Window Manager — Tab Management with BrowserViews

**Files:**
- Create: `browser/src/main/window-manager.ts`
- Create: `browser/src/main/ipc-handlers.ts`
- Create: `browser/src/main/menu.ts`
- Modify: `browser/src/main/main.ts`

- [ ] **Step 1: Create window-manager.ts**

This manages the main BrowserWindow (which hosts the toolbar/tab bar UI) and per-tab `WebContentsView` instances for actual web content.

```typescript
// browser/src/main/window-manager.ts
import { BrowserWindow, WebContentsView, session } from 'electron';
import path from 'path';

interface ManagedTab {
  id: string;
  view: WebContentsView;
}

export class WindowManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, ManagedTab> = new Map();
  private activeTabId: string | null = null;
  private toolbarHeight = 80; // px reserved for toolbar+tabs

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    mainWindow.on('resize', () => this.layoutActiveTab());
  }

  private onTabCreated: ((tabId: string, wc: Electron.WebContents) => void) | null = null;

  /** Register a callback invoked after tab creation but BEFORE loadURL. */
  onNewTab(fn: (tabId: string, wc: Electron.WebContents) => void) {
    this.onTabCreated = fn;
  }

  createTab(tabId: string, url?: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.tabs.set(tabId, { id: tabId, view });

    const wc = view.webContents;

    // Handle window.open() and target="_blank" — open in a new tab instead
    wc.setWindowOpenHandler(({ url: openUrl }) => {
      const newTabId = `tab-${Date.now()}`;
      this.createTab(newTabId, openUrl);
      this.mainWindow.webContents.send('tab-created', newTabId, openUrl);
      return { action: 'deny' }; // Prevent default new window
    });

    // Block keyboard shortcuts for private/incognito mode
    wc.on('before-input-event', (_event, input) => {
      // Block Cmd/Ctrl+Shift+N (private window), Cmd/Ctrl+Shift+P (Firefox private)
      if ((input.meta || input.control) && input.shift && (input.key === 'N' || input.key === 'n' || input.key === 'P' || input.key === 'p')) {
        _event.preventDefault();
      }
    });

    // Disable DevTools keyboard shortcut
    wc.on('before-input-event', (_event, input) => {
      if ((input.meta || input.control) && input.shift && (input.key === 'I' || input.key === 'i')) {
        _event.preventDefault();
      }
      if (input.key === 'F12') {
        _event.preventDefault();
      }
    });

    // Register content injection listeners BEFORE loadURL to avoid race condition
    if (this.onTabCreated) {
      this.onTabCreated(tabId, wc);
    }

    // Forward navigation events to renderer
    wc.on('did-navigate', () => this.sendTabUpdate(tabId, wc));
    wc.on('did-navigate-in-page', () => this.sendTabUpdate(tabId, wc));
    wc.on('page-title-updated', () => this.sendTabUpdate(tabId, wc));
    wc.on('did-start-loading', () => this.sendTabUpdate(tabId, wc, { loading: true }));
    wc.on('did-stop-loading', () => this.sendTabUpdate(tabId, wc, { loading: false }));

    // Load URL AFTER all listeners are registered
    if (url) wc.loadURL(url);

    this.setActiveTab(tabId);
    return view;
  }

  setActiveTab(tabId: string) {
    // Remove old active view
    if (this.activeTabId) {
      const old = this.tabs.get(this.activeTabId);
      if (old) {
        this.mainWindow.contentView.removeChildView(old.view);
      }
    }

    const tab = this.tabs.get(tabId);
    if (!tab) return;

    this.activeTabId = tabId;
    this.mainWindow.contentView.addChildView(tab.view);
    this.layoutActiveTab();
  }

  closeTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    if (this.activeTabId === tabId) {
      this.mainWindow.contentView.removeChildView(tab.view);
      this.activeTabId = null;
    }

    tab.view.webContents.close();
    this.tabs.delete(tabId);
  }

  navigate(tabId: string, url: string) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.view.webContents.loadURL(url);
  }

  goBack(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack();
  }

  goForward(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward();
  }

  reload(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.view.webContents.reload();
  }

  getWebContents(tabId: string) {
    return this.tabs.get(tabId)?.view.webContents;
  }

  getAllWebContents() {
    return Array.from(this.tabs.values()).map(t => ({ id: t.id, webContents: t.view.webContents }));
  }

  private layoutActiveTab() {
    if (!this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    // Use getContentBounds() for width/height but position relative to content area (0,0)
    const [width, height] = this.mainWindow.getContentSize();
    tab.view.setBounds({
      x: 0,
      y: this.toolbarHeight,
      width: width,
      height: height - this.toolbarHeight,
    });
  }

  private sendTabUpdate(tabId: string, wc: Electron.WebContents, extra: Record<string, any> = {}) {
    this.mainWindow.webContents.send('tab-update', tabId, {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      ...extra,
    });
  }
}
```

- [ ] **Step 2: Create ipc-handlers.ts**

```typescript
// browser/src/main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { WindowManager } from './window-manager';

export function registerIpcHandlers(wm: WindowManager) {
  ipcMain.on('create-tab', (_event, tabId: string) => {
    wm.createTab(tabId);
  });

  ipcMain.on('close-tab', (_event, tabId: string) => {
    wm.closeTab(tabId);
  });

  ipcMain.on('set-active-tab', (_event, tabId: string) => {
    wm.setActiveTab(tabId);
  });

  ipcMain.on('navigate', (_event, tabId: string, url: string) => {
    wm.navigate(tabId, url);
  });

  ipcMain.on('go-back', (_event, tabId: string) => {
    wm.goBack(tabId);
  });

  ipcMain.on('go-forward', (_event, tabId: string) => {
    wm.goForward(tabId);
  });

  ipcMain.on('reload', (_event, tabId: string) => {
    wm.reload(tabId);
  });
}
```

- [ ] **Step 3: Create menu.ts — restricted app menu**

```typescript
// browser/src/main/menu.ts
import { Menu, app } from 'electron';

export function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  // No View menu (no DevTools for kids)
  // No Window menu beyond basics

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 4: Update main.ts to use WindowManager and IPC**

```typescript
// browser/src/main/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { WindowManager } from './window-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { buildMenu } from './menu';

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Phylax Browser',
    titleBarStyle: 'hiddenInset', // macOS: hide title bar, show traffic lights
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  windowManager = new WindowManager(mainWindow);
  registerIpcHandlers(windowManager);
  buildMenu();

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Create initial tab
  windowManager.createTab('tab-1', 'https://www.google.com');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 5: Verify app launches with tabs working**

```bash
cd browser && npm run build && npx electron .
```

- [ ] **Step 6: Commit**

```bash
git add browser/src/main/
git commit -m "feat(browser): window manager with tab management via WebContentsView"
```

---

### Task 4: Preload Script — IPC Bridge

**Files:**
- Create: `browser/src/preload/preload.ts`
- Create: `browser/src/renderer/types/electron.d.ts`

- [ ] **Step 1: Create preload.ts**

```typescript
// browser/src/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Tab management
  createTab: (tabId: string) => ipcRenderer.send('create-tab', tabId),
  closeTab: (tabId: string) => ipcRenderer.send('close-tab', tabId),
  setActiveTab: (tabId: string) => ipcRenderer.send('set-active-tab', tabId),
  navigate: (tabId: string, url: string) => ipcRenderer.send('navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.send('go-back', tabId),
  goForward: (tabId: string) => ipcRenderer.send('go-forward', tabId),
  reload: (tabId: string) => ipcRenderer.send('reload', tabId),

  // Tab updates from main (strip raw event to avoid leaking Electron internals)
  onTabUpdate: (callback: (tabId: string, updates: any) => void) => {
    ipcRenderer.on('tab-update', (_event, tabId, updates) => callback(tabId, updates));
  },
  offTabUpdate: () => {
    ipcRenderer.removeAllListeners('tab-update');
  },

  // Safety engine communication (used by content scripts)
  sendToSafety: (channel: string, data: any) => ipcRenderer.invoke('safety:' + channel, data),
  onSafetyDecision: (callback: (data: any) => void) => {
    ipcRenderer.on('safety-decision', (_event, data) => callback(data));
  },

  // Pairing
  submitPairingCode: (code: string) => ipcRenderer.invoke('pairing:submit-code', code),
  onShowPairing: (callback: () => void) => {
    ipcRenderer.on('show-pairing', () => callback());
  },

  // Lockdown
  submitParentPassword: (password: string) => ipcRenderer.invoke('lockdown:verify-password', password),
  onLockdownConfig: (callback: (config: any) => void) => {
    ipcRenderer.on('lockdown-config', (_event, config) => callback(config));
  },
  onRequestPassword: (callback: (action: string) => void) => {
    ipcRenderer.on('request-password', (_event, action) => callback(action));
  },

  // Shield status
  onShieldStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('shield-status', (_event, status) => callback(status));
  },

  // New tab created externally (window.open)
  onTabCreated: (callback: (tabId: string, url: string) => void) => {
    ipcRenderer.on('tab-created', (_event, tabId, url) => callback(tabId, url));
  },
});
```

- [ ] **Step 2: Create TypeScript declarations for renderer**

```typescript
// browser/src/renderer/types/electron.d.ts
interface ElectronAPI {
  platform: string;
  createTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  navigate: (tabId: string, url: string) => void;
  goBack: (tabId: string) => void;
  goForward: (tabId: string) => void;
  reload: (tabId: string) => void;
  onTabUpdate: (callback: (tabId: string, updates: any) => void) => void;
  offTabUpdate: () => void;
  sendToSafety: (channel: string, data: any) => Promise<any>;
  onSafetyDecision: (callback: (data: any) => void) => void;
  submitPairingCode: (code: string) => Promise<any>;
  submitParentPassword: (password: string) => Promise<boolean>;
  onShowPairing?: (callback: () => void) => void;
  onLockdownConfig?: (callback: (event: any, config: any) => void) => void;
  onRequestPassword?: (callback: (event: any, action: string) => void) => void;
  onShieldStatus?: (callback: (event: any, status: string) => void) => void;
  onTabCreated?: (callback: (tabId: string, url: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
```

- [ ] **Step 3: Commit**

```bash
git add browser/src/preload/ browser/src/renderer/types/
git commit -m "feat(browser): preload IPC bridge for renderer and content scripts"
```

---

### Task 5: Copy & Adapt Safety Engine from phylax-safety

**Files:**
- Copy: `phylax-safety/engine/*` → `browser/src/engine/`
- Copy: `phylax-safety/content/*` → `browser/src/content/`
- Copy: `phylax-safety/enforcement/*` → `browser/src/enforcement/`
- Create: `browser/src/main/safety/bridge.ts`
- Create: `browser/src/main/safety/pipeline-runner.ts`

- [ ] **Step 1: Copy engine files**

```bash
cp phylax-safety/engine/*.js browser/src/engine/
cp phylax-safety/content/*.js browser/src/content/
cp phylax-safety/enforcement/*.js browser/src/enforcement/
```

- [ ] **Step 2: Create bridge.ts — chrome.* API shimming**

The engine code uses `chrome.storage`, `chrome.runtime`, etc. We need a shim layer so the existing JS runs without modification.

```typescript
// browser/src/main/safety/bridge.ts
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const storageDir = path.join(app.getPath('userData'), 'phylax-storage');

// Ensure storage directory exists
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

function getStoragePath() {
  return path.join(storageDir, 'local-storage.json');
}

function readStorage(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(getStoragePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, any>) {
  fs.writeFileSync(getStoragePath(), JSON.stringify(data, null, 2));
}

/**
 * Shim for chrome.storage.local used by engine code.
 * Uses an in-memory cache with periodic flushing to avoid
 * blocking the main process event loop on every get/set call.
 */
let memoryCache: Record<string, any> | null = null;
let dirty = false;

function getCache(): Record<string, any> {
  if (!memoryCache) memoryCache = readStorage();
  return memoryCache;
}

// Flush to disk every 10 seconds if dirty
setInterval(() => {
  if (dirty && memoryCache) {
    writeStorage(memoryCache);
    dirty = false;
  }
}, 10_000);

export const chromeStorageShim = {
  local: {
    get: async (keys: string | string[]): Promise<Record<string, any>> => {
      const cache = getCache();
      if (typeof keys === 'string') keys = [keys];
      const result: Record<string, any> = {};
      for (const k of keys) {
        if (k in cache) result[k] = cache[k];
      }
      return result;
    },
    set: async (items: Record<string, any>): Promise<void> => {
      const cache = getCache();
      Object.assign(cache, items);
      dirty = true;
    },
    remove: async (keys: string | string[]): Promise<void> => {
      const cache = getCache();
      if (typeof keys === 'string') keys = [keys];
      for (const k of keys) delete cache[k];
      dirty = true;
    },
  },
};

/**
 * Shim for chrome.runtime.sendMessage — routes to IPC in Electron.
 * Not needed in main process; content scripts use preload bridge instead.
 */
export const chromeRuntimeShim = {
  sendMessage: async (_message: any) => {
    // No-op in main process context. Content scripts use IPC.
  },
  getURL: (relativePath: string) => {
    return path.join(__dirname, '../../', relativePath);
  },
};
```

- [ ] **Step 3: Create pipeline-runner.ts — orchestrates safety checks**

```typescript
// browser/src/main/safety/pipeline-runner.ts
import { ipcMain, WebContents } from 'electron';

// These will be dynamically imported from the JS engine files
let evaluate: any;
let compileToPolicyObject: any;
let compileRules: any;
let createSessionState: any;
let createConversationState: any;
let cacheGet: any;
let cacheSet: any;

let currentPolicy: any = null;
let sessionState: any = null;
let groomingStates = new Map<string, any>();

export async function initSafetyEngine() {
  // Dynamic imports of JS engine files
  const pipeline = await import('../../engine/pipeline.js');
  const ruleCompiler = await import('../../engine/rule-compiler.js');
  const behavior = await import('../../engine/behavior.js');
  const grooming = await import('../../engine/grooming-detector.js');
  const cache = await import('../../engine/decision-cache.js');

  evaluate = pipeline.evaluate;
  compileToPolicyObject = pipeline.compileToPolicyObject;
  compileRules = ruleCompiler.compileRules;
  createSessionState = behavior.createSessionState;
  createConversationState = grooming.createConversationState;
  cacheGet = cache.cacheGet;
  cacheSet = cache.cacheSet;

  sessionState = createSessionState();
  console.log('[Phylax Safety] Engine initialized');
}

export function updatePolicy(rules: any[], profileTier: string) {
  if (!compileRules) return;
  const compiled = compileRules(rules);
  currentPolicy = compileToPolicyObject(compiled, profileTier);
  console.log('[Phylax Safety] Policy updated, tier:', profileTier);
}

export async function evaluateContent(contentObject: any): Promise<any> {
  if (!evaluate || !currentPolicy) {
    return { action: 'ALLOW', reason: 'engine_not_ready' };
  }

  // Check cache first
  const cached = cacheGet?.(contentObject.content_id);
  if (cached) return cached;

  const conversationKey = contentObject.conversation_key;
  let groomingState = conversationKey ? groomingStates.get(conversationKey) : undefined;
  if (conversationKey && !groomingState) {
    groomingState = createConversationState();
    groomingStates.set(conversationKey, groomingState);
  }

  const decision = evaluate(contentObject, currentPolicy, {
    sessionState,
    groomingConversationState: groomingState,
  });

  // Cache the decision
  if (contentObject.content_id) {
    cacheSet?.(contentObject.content_id, decision);
  }

  return decision;
}

export function registerSafetyIpc() {
  ipcMain.handle('safety:evaluate', async (_event, contentObject) => {
    return evaluateContent(contentObject);
  });

  ipcMain.handle('safety:check-paired', async () => {
    const { isPaired } = await import('../sync/auth');
    return { paired: isPaired() };
  });

  ipcMain.on('safety:confirmed-close', () => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.destroy();
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add browser/src/engine/ browser/src/content/ browser/src/enforcement/ browser/src/main/safety/
git commit -m "feat(browser): port safety engine from phylax-safety with Electron bridge"
```

---

### Task 6: Request Interceptor & Content Injector

**Files:**
- Create: `browser/src/main/safety/request-interceptor.ts`
- Create: `browser/src/main/safety/content-injector.ts`
- Create: `browser/src/main/safety/grooming-state.ts`

- [ ] **Step 1: Create request-interceptor.ts**

```typescript
// browser/src/main/safety/request-interceptor.ts
import { session } from 'electron';

// Known-bad domains (loaded from policy sync)
let blockedDomains: Set<string> = new Set();

export function updateBlockedDomains(domains: string[]) {
  blockedDomains = new Set(domains);
}

export function setupRequestInterception() {
  const defaultSession = session.defaultSession;

  // Intercept all requests before they reach the renderer
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);

      // Skip Electron internal URLs
      if (url.protocol === 'devtools:' || url.protocol === 'chrome-extension:') {
        return callback({});
      }

      // Domain gate: block known-bad domains
      if (blockedDomains.has(url.hostname)) {
        console.log('[Phylax] Blocked domain:', url.hostname);
        return callback({ cancel: true });
      }

      // Block chrome://, about:, file:// navigation
      if (['chrome:', 'about:', 'file:'].includes(url.protocol)) {
        return callback({ cancel: true });
      }
    } catch {
      // Invalid URL, allow
    }

    callback({});
  });

  // Prevent navigation to restricted protocols
  defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });
}
```

- [ ] **Step 2: Create content-injector.ts**

```typescript
// browser/src/main/safety/content-injector.ts
import { WebContents } from 'electron';
import fs from 'fs';
import path from 'path';

const contentDir = path.join(__dirname, '../../content');

// Read content scripts once at startup
let observerScript = '';
let enforcerScript = '';
let youtubeScript = '';
let searchScript = '';
let llmObserverScript = '';

export function loadContentScripts() {
  observerScript = fs.readFileSync(path.join(contentDir, 'observer.js'), 'utf-8');
  enforcerScript = fs.readFileSync(path.join(contentDir, 'enforcer.js'), 'utf-8');
  youtubeScript = fs.readFileSync(path.join(contentDir, 'youtube-scanner.js'), 'utf-8');
  searchScript = fs.readFileSync(path.join(contentDir, 'search-interceptor.js'), 'utf-8');
  llmObserverScript = fs.readFileSync(path.join(contentDir, 'llm-observer.js'), 'utf-8');
  console.log('[Phylax] Content scripts loaded');
}

/**
 * Replace chrome.runtime.sendMessage calls with the Electron IPC bridge.
 * Content scripts call window.phylaxBridge.sendMessage() instead.
 */
function wrapForElectron(script: string): string {
  const bridge = `
    // Phylax Electron bridge — replaces chrome.runtime.sendMessage
    if (!window.__phylaxBridge) {
      window.__phylaxBridge = {
        sendMessage: function(msg, callback) {
          window.electronAPI.sendToSafety(msg.type || 'evaluate', msg).then(function(result) {
            if (callback) callback(result);
          });
        }
      };
      // Shim chrome.runtime for content scripts
      if (typeof chrome === 'undefined') window.chrome = {};
      if (!chrome.runtime) chrome.runtime = {};
      chrome.runtime.sendMessage = window.__phylaxBridge.sendMessage;
    }
  `;
  return bridge + '\n' + script;
}

const YOUTUBE_DOMAINS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
const SEARCH_DOMAINS = ['google.com', 'www.google.com', 'bing.com', 'www.bing.com', 'duckduckgo.com', 'search.yahoo.com'];
const LLM_DOMAINS = ['chat.openai.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'poe.com', 'perplexity.ai'];

export function injectContentScripts(webContents: WebContents) {
  webContents.on('did-finish-load', () => {
    const url = webContents.getURL();
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return;
    }

    // Always inject observer + enforcer
    webContents.executeJavaScript(wrapForElectron(observerScript)).catch(() => {});
    webContents.executeJavaScript(wrapForElectron(enforcerScript)).catch(() => {});

    // Platform-specific scripts
    if (YOUTUBE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(youtubeScript)).catch(() => {});
    }

    if (SEARCH_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(searchScript)).catch(() => {});
    }

    if (LLM_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(llmObserverScript)).catch(() => {});
    }
  });
}
```

- [ ] **Step 3: Create grooming-state.ts**

```typescript
// browser/src/main/safety/grooming-state.ts

const MAX_STATES = 500;
const STATE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

interface GroomingEntry {
  state: any;
  lastSeen: number;
}

const states = new Map<string, GroomingEntry>();

export function getGroomingState(conversationKey: string, createFn: () => any): any {
  const entry = states.get(conversationKey);
  if (entry && Date.now() - entry.lastSeen < STATE_TTL_MS) {
    entry.lastSeen = Date.now();
    return entry.state;
  }

  // Evict expired or over-limit
  if (states.size >= MAX_STATES) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of states) {
      if (v.lastSeen < oldestTime) {
        oldestTime = v.lastSeen;
        oldestKey = k;
      }
    }
    if (oldestKey) states.delete(oldestKey);
  }

  const newState = createFn();
  states.set(conversationKey, { state: newState, lastSeen: Date.now() });
  return newState;
}
```

- [ ] **Step 4: Commit**

```bash
git add browser/src/main/safety/
git commit -m "feat(browser): request interceptor and content script injector for Electron"
```

---

### Task 7: Backend Sync — Port from Extension

**Files:**
- Create: `browser/src/main/sync/backend-sync.ts`
- Create: `browser/src/main/sync/auth.ts`

- [ ] **Step 1: Create auth.ts**

```typescript
// browser/src/main/sync/auth.ts
import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const configPath = path.join(app.getPath('userData'), 'phylax-config.json');

interface PhylaxConfig {
  deviceId: string;
  authToken: string | null;
  childProfileId: string | null;
  profileTier: string;
  apiBase: string;
  pairingToken: string | null;
  parentPasswordHash: string | null;
}

let config: PhylaxConfig | null = null;

function defaultConfig(): PhylaxConfig {
  return {
    deviceId: crypto.randomUUID(),
    authToken: null,
    childProfileId: null,
    profileTier: 'tween_13',
    apiBase: 'https://phylax-app.vercel.app',
    pairingToken: null,
    parentPasswordHash: null,
  };
}

export function loadConfig(): PhylaxConfig {
  if (config) return config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    config = defaultConfig();
    saveConfig();
  }
  return config!;
}

export function saveConfig() {
  if (!config) return;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function updateConfig(updates: Partial<PhylaxConfig>) {
  loadConfig();
  Object.assign(config!, updates);
  saveConfig();
}

export function getDeviceId(): string {
  return loadConfig().deviceId;
}

export function getAuthToken(): string | null {
  return loadConfig().authToken;
}

export function getApiBase(): string {
  return loadConfig().apiBase;
}

export function isPaired(): boolean {
  return !!loadConfig().authToken && !!loadConfig().childProfileId;
}

export function getProfileTier(): string {
  return loadConfig().profileTier;
}

export function signRequest(payload: string): string {
  const token = getAuthToken();
  if (!token) return '';
  return crypto.createHmac('sha256', token).update(payload).digest('hex');
}
```

- [ ] **Step 2: Create backend-sync.ts**

```typescript
// browser/src/main/sync/backend-sync.ts
import { getApiBase, getAuthToken, getDeviceId, updateConfig, getProfileTier } from './auth';
import { updatePolicy } from '../safety/pipeline-runner';
import { updateBlockedDomains } from '../safety/request-interceptor';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const EVENT_FLUSH_INTERVAL_MS = 30 * 1000;
const MAX_EVENT_BUFFER = 200;

let eventBuffer: any[] = [];
let syncTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;

async function apiFetch(path: string, options: RequestInit = {}) {
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
  return response.json();
}

export async function syncPolicy() {
  try {
    const deviceId = getDeviceId();
    const data = await apiFetch(`/api/extension/sync?device_id=${deviceId}`);

    if (data.rules) {
      updatePolicy(data.rules, data.profile_tier || getProfileTier());
    }
    if (data.profile_tier) {
      updateConfig({ profileTier: data.profile_tier });
    }
    if (data.blocked_domains) {
      updateBlockedDomains(data.blocked_domains);
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
    eventBuffer.shift(); // Drop oldest
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
    // Re-queue on failure
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
  // Initial sync
  syncPolicy();
  sendHeartbeat();

  // Periodic sync
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
```

- [ ] **Step 3: Commit**

```bash
git add browser/src/main/sync/
git commit -m "feat(browser): backend sync with policy, heartbeat, events, and alerts"
```

---

### Task 8: Pairing Flow

**Files:**
- Create: `browser/src/main/sync/pairing.ts`
- Create: `browser/src/renderer/components/PairingScreen.tsx`

- [ ] **Step 1: Create pairing.ts**

```typescript
// browser/src/main/sync/pairing.ts
import { ipcMain } from 'electron';
import { loadConfig, updateConfig, isPaired, getApiBase } from './auth';
import { startSync } from './backend-sync';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Check for embedded pairing token (set by installer).
 * The installer writes a pairing-token.json file next to the app.
 */
export async function checkEmbeddedPairing(): Promise<boolean> {
  const tokenPaths = [
    path.join(app.getPath('userData'), 'pairing-token.json'),
    path.join(path.dirname(app.getAppPath()), 'pairing-token.json'),
  ];

  for (const tokenPath of tokenPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      if (data.token) {
        const result = await consumePairingToken(data.token);
        if (result.success) {
          // Remove token file after successful pairing
          fs.unlinkSync(tokenPath);
          return true;
        }
      }
    } catch {
      // File doesn't exist or invalid
    }
  }
  return false;
}

async function consumePairingToken(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const base = getApiBase();
    const response = await fetch(`${base}/api/pairing/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return { success: false, error: 'Invalid or expired token' };
    }

    const data = await response.json();
    updateConfig({
      authToken: data.auth_token,
      childProfileId: data.child_profile_id,
      profileTier: data.profile_tier || 'tween_13',
    });

    startSync();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Manual pairing via 6-digit code.
 */
async function pairWithCode(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const base = getApiBase();
    const config = loadConfig();
    const response = await fetch(`${base}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim(),
        device_id: config.deviceId,
        device_name: `Phylax Browser (${process.platform === 'darwin' ? 'Mac' : 'Windows'})`,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || 'Invalid code' };
    }

    const data = await response.json();
    updateConfig({
      authToken: data.auth_token || data.token,
      childProfileId: data.child_profile_id || data.childId,
      profileTier: data.profile_tier || 'tween_13',
    });

    startSync();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function registerPairingIpc() {
  ipcMain.handle('pairing:submit-code', async (_event, code: string) => {
    return pairWithCode(code);
  });

  ipcMain.handle('pairing:check-status', async () => {
    return { paired: isPaired() };
  });
}
```

- [ ] **Step 2: Create PairingScreen.tsx**

```tsx
// browser/src/renderer/components/PairingScreen.tsx
import React, { useState, useCallback } from 'react';

interface Props {
  onPaired: () => void;
}

export default function PairingScreen({ onPaired }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    const result = await window.electronAPI?.submitPairingCode(code);
    setLoading(false);

    if (result?.success) {
      onPaired();
    } else {
      setError(result?.error || 'Pairing failed');
    }
  }, [code, onPaired]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-toolbar)',
      gap: 24,
    }}>
      {/* Shield logo */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>P</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>
        Welcome to Phylax Browser
      </h1>

      <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
        Enter the 6-digit pairing code from the Phylax parent dashboard to connect this browser to your family account.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          style={{
            padding: '14px 16px',
            fontSize: 24,
            textAlign: 'center',
            letterSpacing: 8,
            border: '2px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
            fontFamily: 'monospace',
          }}
        />

        {error && <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          style={{
            padding: '12px 24px',
            background: code.length === 6 ? 'var(--accent-gold)' : '#ddd',
            color: code.length === 6 ? 'white' : '#999',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 15,
            fontWeight: 600,
            cursor: code.length === 6 ? 'pointer' : 'default',
          }}
        >
          {loading ? 'Connecting...' : 'Connect Browser'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add browser/src/main/sync/pairing.ts browser/src/renderer/components/PairingScreen.tsx
git commit -m "feat(browser): auto-pairing and manual 6-digit code entry"
```

---

### Task 9: Lockdown Modes & Parental Lock

**Files:**
- Create: `browser/src/main/lockdown/parental-lock.ts`
- Create: `browser/src/main/lockdown/age-modes.ts`
- Create: `browser/src/renderer/components/PasswordDialog.tsx`

- [ ] **Step 1: Create age-modes.ts**

```typescript
// browser/src/main/lockdown/age-modes.ts

export type AgeTier = 'kid_10' | 'tween_13' | 'teen_16';

export interface LockdownConfig {
  showAddressBar: boolean;
  allowDownloads: boolean;
  allowClose: boolean;
  allowDevTools: boolean;
  requirePasswordToClose: boolean;
  safetyThresholdMultiplier: number; // 1.0 = normal, 1.5 = more lenient
}

const LOCKDOWN_CONFIGS: Record<AgeTier, LockdownConfig> = {
  kid_10: {
    showAddressBar: false,
    allowDownloads: false,
    allowClose: false,
    allowDevTools: false,
    requirePasswordToClose: true,
    safetyThresholdMultiplier: 1.0,
  },
  tween_13: {
    showAddressBar: true,
    allowDownloads: false, // Requires parent approval
    allowClose: true,
    allowDevTools: false,
    requirePasswordToClose: false,
    safetyThresholdMultiplier: 1.0,
  },
  teen_16: {
    showAddressBar: true,
    allowDownloads: true,
    allowClose: true,
    allowDevTools: false, // Unless parent enables
    requirePasswordToClose: false,
    safetyThresholdMultiplier: 1.3, // Higher thresholds, less intervention
  },
};

export function getLockdownConfig(tier: AgeTier): LockdownConfig {
  return LOCKDOWN_CONFIGS[tier] || LOCKDOWN_CONFIGS.tween_13;
}
```

- [ ] **Step 2: Create parental-lock.ts**

```typescript
// browser/src/main/lockdown/parental-lock.ts
import { BrowserWindow, ipcMain, dialog } from 'electron';
import { getLockdownConfig, AgeTier } from './age-modes';
import crypto from 'crypto';
import { loadConfig } from '../sync/auth';

/**
 * Parent password is persisted to the config file so it survives app restarts.
 * Stored as SHA-256 hash — never the plaintext.
 */
export function setParentPassword(password: string) {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  updateConfig({ parentPasswordHash: hash } as any);
}

export function verifyParentPassword(password: string): boolean {
  const config = loadConfig() as any;
  const storedHash = config.parentPasswordHash;
  if (!storedHash) return true; // No password set yet
  return crypto.createHash('sha256').update(password).digest('hex') === storedHash;
}

export function applyLockdown(mainWindow: BrowserWindow, tier: AgeTier) {
  const config = getLockdownConfig(tier);

  // Prevent closing without password
  if (config.requirePasswordToClose) {
    mainWindow.on('close', (event) => {
      event.preventDefault();
      // Notify renderer to show password dialog
      mainWindow.webContents.send('request-password', 'close');
    });
  }

  // Disable DevTools
  if (!config.allowDevTools) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Send lockdown config to renderer
  mainWindow.webContents.send('lockdown-config', config);

  console.log('[Phylax Lockdown] Applied tier:', tier, config);
}

export function registerLockdownIpc(mainWindow: BrowserWindow) {
  ipcMain.handle('lockdown:verify-password', async (_event, password: string) => {
    return verifyParentPassword(password);
  });

  ipcMain.handle('lockdown:get-config', async () => {
    const config = loadConfig();
    return getLockdownConfig(config.profileTier as AgeTier);
  });

  // Handle close after password verification
  ipcMain.on('lockdown:confirmed-close', () => {
    mainWindow.destroy(); // Force close
  });
}
```

- [ ] **Step 3: Create PasswordDialog.tsx**

```tsx
// browser/src/renderer/components/PasswordDialog.tsx
import React, { useState, useCallback } from 'react';

interface Props {
  action: string; // 'close', 'uninstall', 'settings'
  onVerified: () => void;
  onCancel: () => void;
}

export default function PasswordDialog({ action, onVerified, onCancel }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await window.electronAPI?.submitParentPassword(password);
    if (ok) {
      onVerified();
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  }, [password, onVerified]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 32,
        maxWidth: 380,
        width: '100%',
      }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Parent Password Required</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Enter the parent password to {action}.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              marginBottom: 8,
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} style={{
              padding: '8px 16px', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', background: 'white', cursor: 'pointer',
            }}>Cancel</button>
            <button type="submit" style={{
              padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-gold)', color: 'white', cursor: 'pointer', fontWeight: 600,
            }}>Confirm</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add browser/src/main/lockdown/ browser/src/renderer/components/PasswordDialog.tsx
git commit -m "feat(browser): lockdown modes and parental password gate"
```

---

### Task 10: App Restrictor & Browser Detector

**Files:**
- Create: `browser/src/main/lockdown/app-restrictor.ts`
- Create: `browser/src/main/lockdown/browser-detector.ts`

- [ ] **Step 1: Create app-restrictor.ts**

```typescript
// browser/src/main/lockdown/app-restrictor.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const execAsync = promisify(exec);

const KNOWN_BROWSERS = {
  mac: [
    'Google Chrome.app',
    'Firefox.app',
    'Microsoft Edge.app',
    'Brave Browser.app',
    'Opera.app',
    'Arc.app',
    'Vivaldi.app',
    'Chromium.app',
  ],
  win: [
    'chrome.exe',
    'firefox.exe',
    'msedge.exe',
    'brave.exe',
    'opera.exe',
    'vivaldi.exe',
  ],
};

/**
 * macOS: Generate and install a .mobileconfig profile that restricts app launches.
 * Requires admin password (prompted by the OS).
 */
export async function restrictBrowsersMac(): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate mobileconfig XML
    const profileXml = generateMobileConfig();
    const profilePath = path.join(app.getPath('userData'), 'phylax-restrictions.mobileconfig');
    fs.writeFileSync(profilePath, profileXml);

    // Install profile (will prompt for admin password)
    await execAsync(`open "${profilePath}"`);
    // Note: macOS will show a System Preferences dialog for the user to install

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function generateMobileConfig(): string {
  const blockedApps = KNOWN_BROWSERS.mac.map(app => {
    const bundleId = getBundleIdForApp(app);
    return `<string>${bundleId}</string>`;
  }).join('\n              ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.applicationaccess</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>com.phylax.browser.restrictions</string>
      <key>PayloadUUID</key>
      <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
      <key>blockedAppBundleIDs</key>
      <array>
        ${blockedApps}
      </array>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>Phylax Browser Restrictions</string>
  <key>PayloadIdentifier</key>
  <string>com.phylax.browser.profile</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>F1E2D3C4-B5A6-9870-FEDC-BA0987654321</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

function getBundleIdForApp(appName: string): string {
  const bundleIds: Record<string, string> = {
    'Google Chrome.app': 'com.google.Chrome',
    'Firefox.app': 'org.mozilla.firefox',
    'Microsoft Edge.app': 'com.microsoft.edgemac',
    'Brave Browser.app': 'com.brave.Browser',
    'Opera.app': 'com.operasoftware.Opera',
    'Arc.app': 'company.thebrowser.Browser',
    'Vivaldi.app': 'com.vivaldi.Vivaldi',
    'Chromium.app': 'org.chromium.Chromium',
  };
  return bundleIds[appName] || appName;
}

/**
 * Windows: Configure AppLocker to block browser executables.
 * Requires admin elevation.
 */
export async function restrictBrowsersWindows(): Promise<{ success: boolean; error?: string }> {
  try {
    const rules = KNOWN_BROWSERS.win.map(exe =>
      `New-AppLockerPolicy -RuleType Path -Action Deny -Path "%PROGRAMFILES%\\*\\${exe}" -User Everyone`
    ).join('; ');

    await execAsync(`powershell -Command "${rules}"`, { timeout: 30000 });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function restrictBrowsers(): Promise<{ success: boolean; error?: string }> {
  if (process.platform === 'darwin') {
    return restrictBrowsersMac();
  } else if (process.platform === 'win32') {
    return restrictBrowsersWindows();
  }
  return { success: false, error: 'Unsupported platform' };
}
```

- [ ] **Step 2: Create browser-detector.ts**

```typescript
// browser/src/main/lockdown/browser-detector.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { sendAlert } from '../sync/backend-sync';

const execAsync = promisify(exec);

const SCAN_INTERVAL_MS = 60 * 1000; // Check every minute

const KNOWN_BROWSER_PATHS = {
  mac: [
    '/Applications/Google Chrome.app',
    '/Applications/Firefox.app',
    '/Applications/Microsoft Edge.app',
    '/Applications/Brave Browser.app',
    '/Applications/Opera.app',
    '/Applications/Arc.app',
    '/Applications/Vivaldi.app',
  ],
  win: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ],
};

const BROWSER_PROCESS_NAMES = {
  mac: ['Google Chrome', 'firefox', 'Microsoft Edge', 'Brave Browser', 'Opera', 'Arc', 'Safari'],
  win: ['chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe', 'opera.exe'],
};

let scanTimer: NodeJS.Timeout | null = null;
let knownInstalledBrowsers = new Set<string>();
let alertedBrowsers = new Set<string>();

/**
 * Scan for installed browsers.
 */
function scanInstalledBrowsers(): string[] {
  const paths = process.platform === 'darwin' ? KNOWN_BROWSER_PATHS.mac : KNOWN_BROWSER_PATHS.win;
  return paths.filter(p => fs.existsSync(p));
}

/**
 * Check for running browser processes.
 */
async function scanRunningBrowsers(): Promise<string[]> {
  const names = process.platform === 'darwin' ? BROWSER_PROCESS_NAMES.mac : BROWSER_PROCESS_NAMES.win;
  const running: string[] = [];

  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('ps aux');
      for (const name of names) {
        if (stdout.includes(name)) running.push(name);
      }
    } else {
      const { stdout } = await execAsync('tasklist /FO CSV /NH');
      for (const name of names) {
        if (stdout.toLowerCase().includes(name.toLowerCase())) running.push(name);
      }
    }
  } catch {
    // Can't scan processes
  }

  return running;
}

/**
 * Watch /Applications (Mac) for new app installs.
 */
function watchInstallDirectory() {
  const watchDir = process.platform === 'darwin' ? '/Applications' : 'C:\\Program Files';

  try {
    fs.watch(watchDir, { persistent: false }, (_eventType, filename) => {
      if (!filename) return;
      const names = process.platform === 'darwin' ? BROWSER_PROCESS_NAMES.mac : BROWSER_PROCESS_NAMES.win;
      for (const name of names) {
        if (filename.toLowerCase().includes(name.toLowerCase().replace('.exe', '').replace('.app', ''))) {
          handleNewBrowserDetected(filename);
        }
      }
    });
  } catch {
    // Fallback to polling only
  }
}

async function handleNewBrowserDetected(browserName: string) {
  if (alertedBrowsers.has(browserName)) return;
  alertedBrowsers.add(browserName);

  console.log('[Phylax Detector] New browser detected:', browserName);

  await sendAlert({
    type: 'browser_detected',
    severity: 'warning',
    title: `Another browser detected: ${browserName}`,
    message: `${browserName} was found on this device. The child may be able to bypass Phylax protections.`,
    timestamp: new Date().toISOString(),
  });
}

async function periodicScan() {
  // Check installed
  const installed = scanInstalledBrowsers();
  for (const browserPath of installed) {
    const name = path.basename(browserPath);
    if (!knownInstalledBrowsers.has(name)) {
      knownInstalledBrowsers.add(name);
      await handleNewBrowserDetected(name);
    }
  }

  // Check running
  const running = await scanRunningBrowsers();
  for (const name of running) {
    if (!alertedBrowsers.has(name)) {
      await handleNewBrowserDetected(name);
    }
  }
}

export function startBrowserDetection() {
  // Initial scan
  const installed = scanInstalledBrowsers();
  knownInstalledBrowsers = new Set(installed.map(p => path.basename(p)));

  // Watch for new installs
  watchInstallDirectory();

  // Periodic scanning
  scanTimer = setInterval(periodicScan, SCAN_INTERVAL_MS);

  console.log('[Phylax Detector] Started. Known browsers:', knownInstalledBrowsers.size);
}

export function stopBrowserDetection() {
  if (scanTimer) clearInterval(scanTimer);
}
```

- [ ] **Step 3: Commit**

```bash
git add browser/src/main/lockdown/
git commit -m "feat(browser): OS-level app restriction and other-browser detection"
```

---

### Task 11: Blocked Page & New Tab Page

**Files:**
- Create: `browser/src/renderer/components/BlockedPage.tsx`
- Create: `browser/src/renderer/components/NewTabPage.tsx`
- Create: `browser/src/renderer/components/ShieldMenu.tsx`

- [ ] **Step 1: Create BlockedPage.tsx**

```tsx
// browser/src/renderer/components/BlockedPage.tsx
import React from 'react';

interface Props {
  url: string;
  reason: string;
  onRequestAccess: () => void;
}

export default function BlockedPage({ url, reason, onRequestAccess }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: '#fafafa',
      gap: 16,
      padding: 40,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>P</span>
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
        This page is blocked
      </h2>

      <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 400 }}>
        {reason || 'This content has been blocked by your family safety settings.'}
      </p>

      <button
        onClick={onRequestAccess}
        style={{
          marginTop: 8,
          padding: '10px 20px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          background: 'white',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        Request Access
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create NewTabPage.tsx**

```tsx
// browser/src/renderer/components/NewTabPage.tsx
import React from 'react';

export default function NewTabPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: '#fafafa',
      gap: 24,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, var(--accent-gold), #B8962E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'white', fontSize: 26, fontWeight: 'bold' }}>P</span>
      </div>

      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
        Search or type a URL above
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create ShieldMenu.tsx**

```tsx
// browser/src/renderer/components/ShieldMenu.tsx
import React from 'react';

interface Props {
  visible: boolean;
  status: 'safe' | 'blocked' | 'monitoring';
  onClose: () => void;
  onRequestAccess: () => void;
}

export default function ShieldMenu({ visible, status, onClose, onRequestAccess }: Props) {
  if (!visible) return null;

  const statusColors = {
    safe: { bg: '#E8FAF0', text: '#16a34a', label: 'Safe' },
    blocked: { bg: '#FEE2E2', text: '#dc2626', label: 'Blocked' },
    monitoring: { bg: '#FEF3C7', text: '#d97706', label: 'Monitoring' },
  };

  const s = statusColors[status];

  return (
    <div style={{
      position: 'absolute',
      top: 48,
      right: 12,
      background: 'white',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      padding: 16,
      width: 240,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Phylax Protection</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>x</span>
      </div>

      <div style={{
        padding: '8px 12px',
        background: s.bg,
        borderRadius: 'var(--radius-sm)',
        color: s.text,
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center',
      }}>
        {s.label}
      </div>

      {status === 'blocked' && (
        <button
          onClick={onRequestAccess}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '8px',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            background: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Request Access
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add browser/src/renderer/components/BlockedPage.tsx browser/src/renderer/components/NewTabPage.tsx browser/src/renderer/components/ShieldMenu.tsx
git commit -m "feat(browser): blocked page, new tab page, and shield protection menu"
```

---

### Task 12: Wire Everything Together in main.ts

**Files:**
- Modify: `browser/src/main/main.ts`

- [ ] **Step 1: Update main.ts to initialize all subsystems**

```typescript
// browser/src/main/main.ts — final version
import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { WindowManager } from './window-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { buildMenu } from './menu';
import { initSafetyEngine, registerSafetyIpc } from './safety/pipeline-runner';
import { setupRequestInterception } from './safety/request-interceptor';
import { loadContentScripts, injectContentScripts } from './safety/content-injector';
import { startSync } from './sync/backend-sync';
import { loadConfig, isPaired } from './sync/auth';
import { checkEmbeddedPairing, registerPairingIpc } from './sync/pairing';
import { applyLockdown, registerLockdownIpc } from './lockdown/parental-lock';
import { startBrowserDetection } from './lockdown/browser-detector';
import { AgeTier, getLockdownConfig } from './lockdown/age-modes';

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Phylax Browser',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  windowManager = new WindowManager(mainWindow);

  // Register IPC handlers
  registerIpcHandlers(windowManager);
  registerSafetyIpc();
  registerPairingIpc();
  registerLockdownIpc(mainWindow);
  buildMenu();

  // Initialize safety engine
  await initSafetyEngine();
  setupRequestInterception();
  loadContentScripts();

  // Register content injection callback — called BEFORE loadURL (no race condition)
  windowManager.onNewTab((tabId, wc) => {
    injectContentScripts(wc);
  });

  // Intercept downloads per lockdown mode
  session.defaultSession.on('will-download', (event, item) => {
    const config = loadConfig();
    const lockdown = getLockdownConfig(config.profileTier as AgeTier);
    if (!lockdown.allowDownloads) {
      event.preventDefault(); // Block download entirely for kid_10
      // For tween_13, could queue for parent approval instead
      mainWindow!.webContents.send('download-blocked', item.getFilename());
    }
  });

  // Load UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Check pairing status
  const config = loadConfig();
  let paired = isPaired();

  if (!paired) {
    // Try embedded pairing token first
    paired = await checkEmbeddedPairing();
  }

  if (paired) {
    // Start sync and apply lockdown
    startSync();
    applyLockdown(mainWindow, config.profileTier as AgeTier);
    startBrowserDetection();

    // Create initial tab
    windowManager.createTab('tab-1', 'https://www.google.com');
  } else {
    // Show pairing screen (renderer handles this based on paired status)
    mainWindow.webContents.send('show-pairing');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 2: Verify the app compiles**

```bash
cd browser && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add browser/src/main/main.ts
git commit -m "feat(browser): wire all subsystems together in main entry point"
```

---

### Task 13: Build & Package

**Files:**
- Modify: `browser/package.json` (if needed)
- Existing: `browser/electron-builder.yml`

- [ ] **Step 1: Copy shield icon assets**

```bash
cp phylax-safety/icon128.png browser/assets/icons/icon.png
# For macOS .icns and Windows .ico, we'll generate from the PNG
```

- [ ] **Step 2: Test dev mode launch**

```bash
cd browser && npm run dev
```

Expected: Electron window opens with the light theme toolbar and tab bar. First tab loads Google.

- [ ] **Step 3: Test production build**

```bash
cd browser && npm run build
```

Expected: No TypeScript errors. Vite builds renderer. `dist/` contains compiled output.

- [ ] **Step 4: Package for current platform**

```bash
cd browser && npm run package
```

Expected: `.dmg` (Mac) or `.exe` (Windows) created in `browser/release/`.

- [ ] **Step 5: Commit**

```bash
git add browser/assets/
git commit -m "feat(browser): add app icons and verify build pipeline"
```

---

### Task 14: Integration Testing — End-to-End Smoke Test

- [ ] **Step 1: Launch browser and verify basic browsing**

```bash
cd browser && npm run dev
```

Manual checks:
- [ ] Window opens with light theme
- [ ] Tab bar shows with "New Tab"
- [ ] Address bar is functional
- [ ] Can navigate to google.com
- [ ] Can open new tabs with +
- [ ] Can close tabs with x
- [ ] Back/forward/reload buttons work
- [ ] Gold Phylax shield icon visible in toolbar

- [ ] **Step 2: Verify safety engine loads**

Check terminal for: `[Phylax Safety] Engine initialized`

- [ ] **Step 3: Verify content scripts inject**

Navigate to any page and check terminal for content injection logs.

- [ ] **Step 4: Test pairing screen**

Without a pairing token, browser should show the 6-digit code entry screen.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A browser/
git commit -m "fix(browser): integration test fixes"
```

---

## Execution Order Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Scaffold & Electron Shell | None |
| 2 | Renderer UI (tabs, toolbar) | Task 1 |
| 3 | Window Manager (BrowserViews) | Task 1 |
| 4 | Preload IPC Bridge | Task 1 |
| 5 | Copy & Adapt Safety Engine | Task 1 |
| 6 | Request Interceptor & Content Injector | Tasks 4, 5 |
| 7 | Backend Sync | Tasks 5, 6 (imports from safety/) |
| 8 | Pairing Flow | Task 7 |
| 9 | Lockdown Modes & Parental Lock | Tasks 3, 7 (imports auth.ts) |
| 10 | App Restrictor & Browser Detector | Task 7 |
| 11 | Blocked/New Tab Pages | Task 2 |
| 12 | Wire Everything Together | Tasks 2-11 |
| 13 | Build & Package | Task 12 |
| 14 | Integration Testing | Task 13 |

Tasks 2, 3, 4, 5 can run in parallel after Task 1.
Tasks 8, 10, 11 can run in parallel after their dependencies.
