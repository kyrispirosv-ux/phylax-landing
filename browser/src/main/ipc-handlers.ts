import { ipcMain } from 'electron';
import { WindowManager } from './window-manager';

export function registerIpcHandlers(wm: WindowManager) {
  ipcMain.on('create-tab', (_event, tabId: string) => wm.createTab(tabId));
  ipcMain.on('close-tab', (_event, tabId: string) => wm.closeTab(tabId));
  ipcMain.on('set-active-tab', (_event, tabId: string) => wm.setActiveTab(tabId));
  ipcMain.on('navigate', (_event, tabId: string, url: string) => wm.navigate(tabId, url));
  ipcMain.on('go-back', (_event, tabId: string) => wm.goBack(tabId));
  ipcMain.on('go-forward', (_event, tabId: string) => wm.goForward(tabId));
  ipcMain.on('reload', (_event, tabId: string) => wm.reload(tabId));
}
