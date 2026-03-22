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

  // Safety engine communication
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
