// Phylax SafeGuard — Popup Script

(async function () {
  const { phylaxRules } = await chrome.storage.local.get('phylaxRules');
  const rules = phylaxRules || [];

  const countEl = document.getElementById('ruleCount');
  const listEl = document.getElementById('rulesList');

  const activeCount = rules.filter(r => r.active).length;
  countEl.textContent = `${activeCount} rule${activeCount !== 1 ? 's' : ''}`;

  if (rules.length === 0) {
    listEl.innerHTML = '<div class="empty">No rules configured. Open the dashboard to add rules.</div>';
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
})();
