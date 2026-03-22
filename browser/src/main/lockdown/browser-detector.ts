import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { sendAlert } from '../sync/backend-sync';

const execAsync = promisify(exec);
const SCAN_INTERVAL_MS = 60 * 1000;

const KNOWN_BROWSER_PATHS = {
  mac: [
    '/Applications/Google Chrome.app', '/Applications/Firefox.app',
    '/Applications/Microsoft Edge.app', '/Applications/Brave Browser.app',
    '/Applications/Opera.app', '/Applications/Arc.app', '/Applications/Vivaldi.app',
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

function scanInstalledBrowsers(): string[] {
  const paths = process.platform === 'darwin' ? KNOWN_BROWSER_PATHS.mac : KNOWN_BROWSER_PATHS.win;
  return paths.filter(p => fs.existsSync(p));
}

async function scanRunningBrowsers(): Promise<string[]> {
  const names = process.platform === 'darwin' ? BROWSER_PROCESS_NAMES.mac : BROWSER_PROCESS_NAMES.win;
  const running: string[] = [];
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('ps aux');
      for (const name of names) { if (stdout.includes(name)) running.push(name); }
    } else {
      const { stdout } = await execAsync('tasklist /FO CSV /NH');
      for (const name of names) { if (stdout.toLowerCase().includes(name.toLowerCase())) running.push(name); }
    }
  } catch {}
  return running;
}

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
  } catch {}
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
  const installed = scanInstalledBrowsers();
  for (const browserPath of installed) {
    const name = path.basename(browserPath);
    if (!knownInstalledBrowsers.has(name)) {
      knownInstalledBrowsers.add(name);
      await handleNewBrowserDetected(name);
    }
  }
  const running = await scanRunningBrowsers();
  for (const name of running) {
    if (!alertedBrowsers.has(name)) await handleNewBrowserDetected(name);
  }
}

export function startBrowserDetection() {
  const installed = scanInstalledBrowsers();
  knownInstalledBrowsers = new Set(installed.map(p => path.basename(p)));
  watchInstallDirectory();
  scanTimer = setInterval(periodicScan, SCAN_INTERVAL_MS);
  console.log('[Phylax Detector] Started. Known browsers:', knownInstalledBrowsers.size);
}

export function stopBrowserDetection() {
  if (scanTimer) clearInterval(scanTimer);
}
