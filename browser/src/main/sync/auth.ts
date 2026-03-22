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
