// Phylax Engine — Decision Logger
// Privacy-aware logging for debugging and auditing

// ── Decision log storage ────────────────────────────────────────

const MAX_LOG_SIZE = 1000;
const LOG_RETENTION_HOURS = 168; // 7 days

export class DecisionLogger {
  constructor() {
    this.logs = [];
    this.stats = {
      total_decisions: 0,
      blocks: 0,
      warns: 0,
      nudges: 0,
      frictions: 0,
      cooldowns: 0,
      allows: 0,
      alerts: 0,
      redirects: 0,
    };
  }

  // Log a decision (privacy-aware: no raw content stored)
  log(event, decision, modelVersion = '1.0.0') {
    const record = {
      trace_id: generateTraceId(),
      event_id: event.event_id,
      event_type: event.event_type,
      domain: event.source?.domain || 'unknown',
      scores: {
        harm: decision.scores.harm,
        compulsion: decision.scores.compulsion,
      },
      top_reasons: decision.top_reasons.slice(0, 5),
      action: decision.action,
      hard_trigger: decision.hard_trigger,
      alert_parent: decision.alert_parent,
      escalation: decision.escalation ? {
        trigger_id: decision.escalation.trigger_id,
        count: decision.escalation.count,
      } : null,
      model: {
        version: modelVersion,
        latency_ms: 0, // Will be set by caller
      },
      privacy: {
        stored_text: false,
        stored_hash: true,
        content_hash: hashContent(event.payload?.text || ''),
      },
      timestamp: Date.now(),
    };

    this.logs.push(record);
    this.updateStats(decision.action);
    this.prune();

    return record;
  }

  // Update running statistics
  updateStats(action) {
    this.stats.total_decisions++;
    switch (action) {
      case 'BLOCK': this.stats.blocks++; break;
      case 'WARN': this.stats.warns++; break;
      case 'NUDGE': this.stats.nudges++; break;
      case 'FRICTION': this.stats.frictions++; break;
      case 'COOLDOWN': this.stats.cooldowns++; break;
      case 'ALLOW': this.stats.allows++; break;
      case 'ALERT_PARENT': this.stats.alerts++; break;
      case 'REDIRECT': this.stats.redirects++; break;
    }
  }

  // Get recent logs
  getRecent(count = 50) {
    return this.logs.slice(-count);
  }

  // Get logs by action type
  getByAction(action, count = 50) {
    return this.logs
      .filter(l => l.action === action)
      .slice(-count);
  }

  // Get logs for a specific domain
  getByDomain(domain, count = 50) {
    return this.logs
      .filter(l => l.domain === domain)
      .slice(-count);
  }

  // Get today's summary
  getTodaySummary() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const cutoff = todayStart.getTime();

    const todayLogs = this.logs.filter(l => l.timestamp >= cutoff);

    const categoryCounts = {};
    for (const log of todayLogs) {
      for (const reason of log.top_reasons) {
        const cat = reason.split(':')[0];
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    return {
      total: todayLogs.length,
      blocks: todayLogs.filter(l => l.action === 'BLOCK').length,
      warns: todayLogs.filter(l => l.action === 'WARN').length,
      nudges: todayLogs.filter(l => l.action === 'NUDGE').length,
      frictions: todayLogs.filter(l => l.action === 'FRICTION').length,
      cooldowns: todayLogs.filter(l => l.action === 'COOLDOWN').length,
      allows: todayLogs.filter(l => l.action === 'ALLOW').length,
      redirects: todayLogs.filter(l => l.action === 'REDIRECT').length,
      alerts: todayLogs.filter(l => l.alert_parent).length,
      top_categories: Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cat, count]) => ({ category: cat, count })),
      domains_blocked: [...new Set(
        todayLogs.filter(l => l.action === 'BLOCK').map(l => l.domain)
      )],
    };
  }

  // Get stats
  getStats() {
    return { ...this.stats };
  }

  // Prune old logs
  prune() {
    const cutoff = Date.now() - (LOG_RETENTION_HOURS * 3600 * 1000);
    this.logs = this.logs.filter(l => l.timestamp >= cutoff);
    if (this.logs.length > MAX_LOG_SIZE) {
      this.logs = this.logs.slice(-MAX_LOG_SIZE);
    }
  }

  // Persist to chrome.storage (call periodically)
  async persist() {
    try {
      await chrome.storage.local.set({
        phylaxLogs: this.logs.slice(-500), // Keep last 500
        phylaxStats: this.stats,
      });
    } catch (e) {
      console.error('[Phylax Logger] Failed to persist:', e);
    }
  }

  // Restore from chrome.storage
  async restore() {
    try {
      const { phylaxLogs, phylaxStats } = await chrome.storage.local.get(['phylaxLogs', 'phylaxStats']);
      if (phylaxLogs) this.logs = phylaxLogs;
      if (phylaxStats) this.stats = phylaxStats;
    } catch (e) {
      console.error('[Phylax Logger] Failed to restore:', e);
    }
  }

  // Export logs for parent review (privacy-filtered)
  exportForParent() {
    return {
      generated_at: new Date().toISOString(),
      summary: this.getTodaySummary(),
      recent_interventions: this.logs
        .filter(l => l.action !== 'ALLOW')
        .slice(-100)
        .map(l => ({
          time: new Date(l.timestamp).toISOString(),
          domain: l.domain,
          action: l.action,
          harm_score: l.scores.harm,
          compulsion_score: l.scores.compulsion,
          reasons: l.top_reasons,
          hard_trigger: l.hard_trigger,
        })),
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function generateTraceId() {
  return 'trc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Simple hash for content (privacy: don't store raw text)
function hashContent(text) {
  if (!text) return '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'h_' + Math.abs(hash).toString(36);
}
