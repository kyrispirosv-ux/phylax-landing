import { WebContents } from 'electron';
import fs from 'fs';
import path from 'path';

const contentDir = path.join(__dirname, '../../content');

let observerScript = '';
let enforcerScript = '';
let youtubeScript = '';
let searchScript = '';
let llmObserverScript = '';

export function loadContentScripts() {
  observerScript = fs.readFileSync(path.join(contentDir, 'observer.js'), 'utf-8');
  enforcerScript = fs.readFileSync(path.join(contentDir, 'enforcer.js'), 'utf-8');
  youtubeScript = fs.readFileSync(path.join(contentDir, 'youtube-scanner.js'), 'utf-8');
  searchScript = fs.readFileSync(path.join(contentDir, 'search-interceptor.js'), 'utf-8');
  llmObserverScript = fs.readFileSync(path.join(contentDir, 'llm-observer.js'), 'utf-8');
  console.log('[Phylax] Content scripts loaded');
}

function wrapForElectron(script: string): string {
  const bridge = `
    if (!window.__phylaxBridge) {
      window.__phylaxBridge = {
        sendMessage: function(msg, callback) {
          window.electronAPI.sendToSafety(msg.type || 'evaluate', msg).then(function(result) {
            if (callback) callback(result);
          });
        }
      };
      if (typeof chrome === 'undefined') window.chrome = {};
      if (!chrome.runtime) chrome.runtime = {};
      chrome.runtime.sendMessage = window.__phylaxBridge.sendMessage;
    }
  `;
  return bridge + '\n' + script;
}

const YOUTUBE_DOMAINS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
const SEARCH_DOMAINS = ['google.com', 'www.google.com', 'bing.com', 'www.bing.com', 'duckduckgo.com', 'search.yahoo.com'];
const LLM_DOMAINS = ['chat.openai.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'poe.com', 'perplexity.ai'];

export function injectContentScripts(webContents: WebContents) {
  webContents.on('did-finish-load', () => {
    const url = webContents.getURL();
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return;
    }

    webContents.executeJavaScript(wrapForElectron(observerScript)).catch(() => {});
    webContents.executeJavaScript(wrapForElectron(enforcerScript)).catch(() => {});

    if (YOUTUBE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(youtubeScript)).catch(() => {});
    }

    if (SEARCH_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(searchScript)).catch(() => {});
    }

    if (LLM_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      webContents.executeJavaScript(wrapForElectron(llmObserverScript)).catch(() => {});
    }
  });
}
