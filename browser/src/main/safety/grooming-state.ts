const MAX_STATES = 500;
const STATE_TTL_MS = 72 * 60 * 60 * 1000;

interface GroomingEntry {
  state: any;
  lastSeen: number;
}

const states = new Map<string, GroomingEntry>();

export function getGroomingState(conversationKey: string, createFn: () => any): any {
  const entry = states.get(conversationKey);
  if (entry && Date.now() - entry.lastSeen < STATE_TTL_MS) {
    entry.lastSeen = Date.now();
    return entry.state;
  }

  if (states.size >= MAX_STATES) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of states) {
      if (v.lastSeen < oldestTime) {
        oldestTime = v.lastSeen;
        oldestKey = k;
      }
    }
    if (oldestKey) states.delete(oldestKey);
  }

  const newState = createFn();
  states.set(conversationKey, { state: newState, lastSeen: Date.now() });
  return newState;
}
