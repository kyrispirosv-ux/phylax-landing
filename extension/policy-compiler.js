/**
 * Phylax Rule Engine — compiles scoped rules to declarativeNetRequest rules
 * Used by background.js to translate policy pack rules into DNR format.
 */

/**
 * Compile a policy pack into:
 * 1. DNR rules for domain-level blocking
 * 2. Content filter config for content scripts
 *
 * @param {Object} policyPack - The policy pack from the backend
 * @returns {{ dnrRules: Array, contentFilters: Array, siteBlocks: Array }}
 */
export function compilePolicyPack(policyPack) {
  const dnrRules = [];
  const contentFilters = [];
  const siteBlocks = [];
  let ruleId = 1;

  for (const rule of policyPack.rules || []) {
    if (rule.scope === 'site' && rule.target) {
      // Domain-level blocking via declarativeNetRequest
      const domain = rule.target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      siteBlocks.push(domain);

      dnrRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/blocked.html?rule=${encodeURIComponent(rule.text)}&url=`,
          },
        },
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: ['main_frame'],
        },
      });
    } else if (rule.scope === 'content') {
      // Content-level filtering — passed to content scripts
      contentFilters.push({
        id: rule.id,
        text: rule.text,
        target: rule.target, // topic keyword (gambling, violence, etc.)
        sort_order: rule.sort_order,
      });
    }
  }

  return { dnrRules, contentFilters, siteBlocks };
}

/**
 * Apply DNR rules to Chrome's declarativeNetRequest.
 * Removes all old dynamic rules and adds new ones.
 */
export async function applyDNRRules(dnrRules) {
  try {
    // Get existing dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: dnrRules,
    });

    return { applied: dnrRules.length, removed: removeIds.length };
  } catch (err) {
    console.error('[phylax-dnr] Failed to apply DNR rules:', err);
    return { error: err.message };
  }
}

/**
 * Quick check if a domain is blocked at the site level.
 * Used by background.js for fast-path domain gate.
 */
export function isDomainBlocked(domain, siteBlocks) {
  const normalized = domain.replace(/^www\./, '').toLowerCase();
  return siteBlocks.some(blocked => {
    const b = blocked.replace(/^www\./, '').toLowerCase();
    return normalized === b || normalized.endsWith('.' + b);
  });
}
