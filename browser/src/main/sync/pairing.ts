import { ipcMain } from 'electron';
import { loadConfig, updateConfig, isPaired, getApiBase } from './auth';
import { startSync } from './backend-sync';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

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
          fs.unlinkSync(tokenPath);
          return true;
        }
      }
    } catch {}
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

    if (!response.ok) return { success: false, error: 'Invalid or expired token' };

    const data = await response.json() as Record<string, any>;
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
      const err = await response.json().catch(() => ({})) as Record<string, any>;
      return { success: false, error: err.error || 'Invalid code' };
    }

    const data = await response.json() as Record<string, any>;
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
