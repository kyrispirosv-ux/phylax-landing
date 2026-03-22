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
