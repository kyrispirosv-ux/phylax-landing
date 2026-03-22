import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const execAsync = promisify(exec);

const KNOWN_BROWSERS = {
  mac: ['Google Chrome.app', 'Firefox.app', 'Microsoft Edge.app', 'Brave Browser.app', 'Opera.app', 'Arc.app', 'Vivaldi.app', 'Chromium.app'],
  win: ['chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe'],
};

export async function restrictBrowsersMac(): Promise<{ success: boolean; error?: string }> {
  try {
    const profileXml = generateMobileConfig();
    const profilePath = path.join(app.getPath('userData'), 'phylax-restrictions.mobileconfig');
    fs.writeFileSync(profilePath, profileXml);
    await execAsync(`open "${profilePath}"`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function generateMobileConfig(): string {
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

  const blockedApps = KNOWN_BROWSERS.mac.map(a => `<string>${bundleIds[a] || a}</string>`).join('\n              ');

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
  if (process.platform === 'darwin') return restrictBrowsersMac();
  if (process.platform === 'win32') return restrictBrowsersWindows();
  return { success: false, error: 'Unsupported platform' };
}
