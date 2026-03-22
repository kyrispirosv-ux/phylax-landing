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
  private toolbarHeight = 80;

  private onTabCreated: ((tabId: string, wc: Electron.WebContents) => void) | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    mainWindow.on('resize', () => this.layoutActiveTab());
  }

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

    // Handle window.open() and target="_blank" — open in new tab
    wc.setWindowOpenHandler(({ url: openUrl }) => {
      const newTabId = `tab-${Date.now()}`;
      this.createTab(newTabId, openUrl);
      this.mainWindow.webContents.send('tab-created', newTabId, openUrl);
      return { action: 'deny' };
    });

    // Block keyboard shortcuts for private/incognito and DevTools
    wc.on('before-input-event', (event, input) => {
      if ((input.meta || input.control) && input.shift) {
        if (['N', 'n', 'P', 'p', 'I', 'i'].includes(input.key)) {
          event.preventDefault();
        }
      }
      if (input.key === 'F12') {
        event.preventDefault();
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
    if (this.activeTabId) {
      const old = this.tabs.get(this.activeTabId);
      if (old) this.mainWindow.contentView.removeChildView(old.view);
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
    const [width, height] = this.mainWindow.getContentSize();
    tab.view.setBounds({ x: 0, y: this.toolbarHeight, width, height: height - this.toolbarHeight });
  }

  private sendTabUpdate(tabId: string, wc: Electron.WebContents, extra: Record<string, any> = {}) {
    this.mainWindow.webContents.send('tab-update', tabId, {
      url: wc.getURL(), title: wc.getTitle(),
      canGoBack: wc.canGoBack(), canGoForward: wc.canGoForward(), ...extra,
    });
  }
}
