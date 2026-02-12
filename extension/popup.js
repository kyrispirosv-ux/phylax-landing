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
  } catch (e) {
    document.getElementById('engineInfo').textContent = 'Engine: connecting...';
  }

  // Load rules
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

    listEl.innerHTML = '';
    for (const rule of rules) {
      const div = document.createElement('div');
      div.className = `rule-item ${rule.active ? '' : 'inactive'}`;
      div.innerHTML = `
        <span>${rule.text}</span>
        <span class="rule-status ${rule.active ? 'active' : 'off'}">${rule.active ? 'ON' : 'OFF'}</span>
      `;
      listEl.appendChild(div);
    }
  } catch (e) {
    // Storage access error
  }
})();
