import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const storageDir = path.join(app.getPath('userData'), 'phylax-storage');

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

function getStoragePath() {
  return path.join(storageDir, 'local-storage.json');
}

function readStorage(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(getStoragePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeStorage(data: Record<string, any>) {
  fs.writeFileSync(getStoragePath(), JSON.stringify(data, null, 2));
}

let memoryCache: Record<string, any> | null = null;
let dirty = false;

function getCache(): Record<string, any> {
  if (!memoryCache) memoryCache = readStorage();
  return memoryCache;
}

setInterval(() => {
  if (dirty && memoryCache) {
    writeStorage(memoryCache);
    dirty = false;
  }
}, 10_000);

export const chromeStorageShim = {
  local: {
    get: async (keys: string | string[]): Promise<Record<string, any>> => {
      const cache = getCache();
      if (typeof keys === 'string') keys = [keys];
      const result: Record<string, any> = {};
      for (const k of keys) {
        if (k in cache) result[k] = cache[k];
      }
      return result;
    },
    set: async (items: Record<string, any>): Promise<void> => {
      const cache = getCache();
      Object.assign(cache, items);
      dirty = true;
    },
    remove: async (keys: string | string[]): Promise<void> => {
      const cache = getCache();
      if (typeof keys === 'string') keys = [keys];
      for (const k of keys) delete cache[k];
      dirty = true;
    },
  },
};

export const chromeRuntimeShim = {
  sendMessage: async (_message: any) => {},
  getURL: (relativePath: string) => {
    return path.join(__dirname, '../../', relativePath);
  },
};
