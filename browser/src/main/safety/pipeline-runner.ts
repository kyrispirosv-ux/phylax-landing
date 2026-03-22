import { ipcMain, WebContents } from 'electron';
import { isPaired, loadConfig, getProfileTier } from '../sync/auth';

let evaluate: any;
let compileToPolicyObject: any;
let compileRules: any;
let createSessionState: any;
let createConversationState: any;
let cacheGet: any;
let cacheSet: any;

let currentPolicy: any = null;
let sessionState: any = null;
let groomingStates = new Map<string, any>();

export async function initSafetyEngine() {
  const pipeline = await import('../../engine/pipeline.js');
  const ruleCompiler = await import('../../engine/rule-compiler.js');
  const behavior = await import('../../engine/behavior.js');
  const grooming = await import('../../engine/grooming-detector.js');
  const cache = await import('../../engine/decision-cache.js');

  evaluate = pipeline.evaluate;
  compileToPolicyObject = pipeline.compileToPolicyObject;
  compileRules = ruleCompiler.compileRules;
  createSessionState = behavior.createSessionState;
  createConversationState = grooming.createConversationState;
  cacheGet = cache.cacheGet;
  cacheSet = cache.cacheSet;

  sessionState = createSessionState();
  console.log('[Phylax Safety] Engine initialized');
}

export function updatePolicy(rules: any[], profileTier: string) {
  if (!compileRules) return;
  const compiled = compileRules(rules);
  currentPolicy = compileToPolicyObject(compiled, profileTier);
  console.log('[Phylax Safety] Policy updated, tier:', profileTier);
}

export async function evaluateContent(contentObject: any): Promise<any> {
  if (!evaluate || !currentPolicy) {
    return { action: 'ALLOW', reason: 'engine_not_ready' };
  }

  const cached = cacheGet?.(contentObject.content_id);
  if (cached) return cached;

  const conversationKey = contentObject.conversation_key;
  let groomingState = conversationKey ? groomingStates.get(conversationKey) : undefined;
  if (conversationKey && !groomingState) {
    groomingState = createConversationState();
    groomingStates.set(conversationKey, groomingState);
  }

  const decision = evaluate(contentObject, currentPolicy, {
    sessionState,
    groomingConversationState: groomingState,
  });

  if (contentObject.content_id) {
    cacheSet?.(contentObject.content_id, decision);
  }

  return decision;
}

export function registerSafetyIpc() {
  ipcMain.handle('safety:evaluate', async (_event, contentObject) => {
    return evaluateContent(contentObject);
  });

  ipcMain.handle('safety:check-paired', async () => {
    return { paired: isPaired(), tier: getProfileTier() };
  });

  ipcMain.on('safety:confirmed-close', () => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.destroy();
  });
}
