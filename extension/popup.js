// Phylax SafeGuard — Popup Script
// Shows engine status, today's interventions, and active rules

(async function () {
  const PROFILE_LABELS = {
    'kid_10': 'Child',
    'tween_13': 'Tween',
    'teen_16': 'Teen',
  };

  try {
    // Request full engine status from background
    const status = await chrome.runtime.sendMessage({ type: 'GET_PHYLAX_STATUS' });

    if (status) {
      // Profile badge
      const profileBadge = document.getElementById('profileBadge');
      profileBadge.textContent = PROFILE_LABELS[status.profile] || status.profile;

      // Today's intervention stats
      const today = status.today || {};
      document.getElementById('blockCount').textContent = today.blocks || 0;
      document.getElementById('warnCount').textContent = today.warns || 0;
      document.getElementById('nudgeCount').textContent =
        (today.nudges || 0) + (today.frictions || 0) + (today.cooldowns || 0);

      // Engine info
      const engineInfo = document.getElementById('engineInfo');
      const uptime = status.session ? Math.round(status.session.active_minutes || 0) : 0;
      engineInfo.textContent =
        `Engine: ${status.engine} | Events: ${status.events_buffered} | Active: ${uptime}m`;
    }
    // Render compiled rules debug panel
    if (status?.compiled_rules) {
      const debugEl = document.getElementById('compiledRulesDebug');
      if (status.compiled_rules.length === 0) {
        debugEl.innerHTML = '<div class="empty">No compiled rules.</div>';
      } else {
        debugEl.innerHTML = status.compiled_rules.map(r => `
          <div style="margin-bottom: 6px; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;">
            <div style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.6);">${r.source_text}</div>
            <div style="font-size: 9px; color: rgba(124,92,255,0.7); margin-top: 2px;">
              ${r.action} | priority: ${r.priority} | ${r._compiled ? 'compiled OK' : 'PARSE ERROR: ' + (r._errors || []).join(', ')}
            </div>
            <pre style="font-size: 8px; color: rgba(255,255,255,0.2); margin-top: 4px; max-height: 80px; overflow: auto; white-space: pre-wrap;">${JSON.stringify(r.scope, null, 1)}</pre>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    document.getElementById('engineInfo').textContent = 'Engine: connecting...';
  }

  // Load rules with compiled rule info
  try {
    const { phylaxRules } = await chrome.storage.local.get('phylaxRules');
    const rules = phylaxRules || [];

    const countEl = document.getElementById('ruleCount');
    const listEl = document.getElementById('rulesList');

    const activeCount = rules.filter(r => r.active).length;
    countEl.textContent = activeCount;

    if (rules.length === 0) {
      listEl.innerHTML = '<div class="empty">No rules configured.</div>';
      return;
    }

    // Get compiled rules for debug info
    const compiledRules = status?.compiled_rules || [];

    listEl.innerHTML = '';
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const compiled = compiledRules[i];
      const div = document.createElement('div');
      div.className = `rule-item ${rule.active ? '' : 'inactive'}`;

      const ACTION_COLORS = {
        'BLOCK_DOMAIN': '#FB7185',
        'BLOCK_CONTENT': '#F59E0B',
        'WARN_CONTENT': '#FBBF24',
        'ALLOW_DOMAIN': '#34D399',
      };
      const actionColor = compiled ? (ACTION_COLORS[compiled.action] || '#7C5CFF') : '#666';
      const actionLabel = compiled ? compiled.action.replace('_', ' ') : 'UNKNOWN';

      div.innerHTML = `
        <div style="flex: 1; min-width: 0;">
          <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${rule.text}</div>
          ${compiled ? `<div style="font-size: 9px; color: ${actionColor}; margin-top: 2px;">${actionLabel} ${compiled._compiled ? '' : '(parse error)'}</div>` : ''}
        </div>
        <span class="rule-status ${rule.active ? 'active' : 'off'}">${rule.active ? 'ON' : 'OFF'}</span>
      `;
      listEl.appendChild(div);
    }
  } catch (e) {
    // Storage access error
  }
})();
