// browser/src/main/main.ts — final version
import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { WindowManager } from './window-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { buildMenu } from './menu';
import { initSafetyEngine, registerSafetyIpc } from './safety/pipeline-runner';
import { setupRequestInterception } from './safety/request-interceptor';
import { loadContentScripts, injectContentScripts } from './safety/content-injector';
import { startSync, stopSync } from './sync/backend-sync';
import { loadConfig, isPaired } from './sync/auth';
import { checkEmbeddedPairing, registerPairingIpc } from './sync/pairing';
import { applyLockdown, registerLockdownIpc } from './lockdown/parental-lock';
import { startBrowserDetection, stopBrowserDetection } from './lockdown/browser-detector';
import { chromeStorageShim, chromeRuntimeShim } from './safety/bridge';
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

  // Wire chrome.* shims so engine JS files can use chrome.storage/runtime
  (globalThis as any).chrome = {
    storage: {
      local: chromeStorageShim.local,
      session: chromeStorageShim.local, // engine uses session too
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: chromeRuntimeShim,
  };

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

app.on('before-quit', () => {
  stopSync();
  stopBrowserDetection();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
