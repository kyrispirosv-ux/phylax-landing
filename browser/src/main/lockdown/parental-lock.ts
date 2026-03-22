import { BrowserWindow, ipcMain } from 'electron';
import { getLockdownConfig, AgeTier } from './age-modes';
import crypto from 'crypto';
import { loadConfig, updateConfig } from '../sync/auth';

export function setParentPassword(password: string) {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  updateConfig({ parentPasswordHash: hash });
}

export function verifyParentPassword(password: string): boolean {
  const config = loadConfig();
  const storedHash = config.parentPasswordHash;
  if (!storedHash) return true;
  return crypto.createHash('sha256').update(password).digest('hex') === storedHash;
}

export function applyLockdown(mainWindow: BrowserWindow, tier: AgeTier) {
  const config = getLockdownConfig(tier);

  if (config.requirePasswordToClose) {
    mainWindow.on('close', (event) => {
      event.preventDefault();
      mainWindow.webContents.send('request-password', 'close');
    });
  }

  if (!config.allowDevTools) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  mainWindow.webContents.send('lockdown-config', config);
  console.log('[Phylax Lockdown] Applied tier:', tier);
}

export function registerLockdownIpc(mainWindow: BrowserWindow) {
  ipcMain.handle('lockdown:verify-password', async (_event, password: string) => {
    return verifyParentPassword(password);
  });

  ipcMain.handle('lockdown:get-config', async () => {
    const config = loadConfig();
    return getLockdownConfig(config.profileTier as AgeTier);
  });

  ipcMain.on('lockdown:confirmed-close', () => {
    mainWindow.destroy();
  });
}
