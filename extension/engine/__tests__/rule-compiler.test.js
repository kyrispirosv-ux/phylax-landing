// Phylax — Rule Compiler Tests
// Tests NL → structured rule compilation and enforcement logic
//
// Run with: node extension/engine/__tests__/rule-compiler.test.js

import { compileRule, compileRules, evaluateRules, extractDNRPatterns, RULE_ACTIONS } from '../rule-compiler.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function assertEq(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message} — expected "${expected}", got "${actual}"`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1: "dont block all of youtube only videos about gambling"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 1: "dont block all of youtube only videos about gambling"');
{
  const rule = compileRule("dont block all of youtube only videos about gambling");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT (not BLOCK_DOMAIN)');
  assert(rule.scope.domain_allowlist?.includes('youtube.com'), 'youtube.com is in domain_allowlist');
  assert(rule.scope.domain_allowlist?.includes('www.youtube.com'), 'www.youtube.com is in domain_allowlist');
  assert(!rule.scope.domain_blocklist, 'No domain_blocklist (youtube is NOT blocked)');
  assert(rule.condition.content_classifier?.topics?.some(t => t.topic === 'gambling'), 'Condition includes gambling topic classifier');

  // Enforcement: youtube.com homepage should NOT be blocked
  const compiled = [rule];
  const ytHome = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', 'YouTube homepage trending videos music');
  assertEq(ytHome.action, 'ALLOW', 'youtube.com homepage is ALLOWED');

  // Enforcement: youtube.com video about cooking should NOT be blocked
  const ytCooking = evaluateRules(compiled, 'https://www.youtube.com/watch?v=abc123', 'www.youtube.com', 'How to make pasta carbonara recipe Italian cooking');
  assertEq(ytCooking.action, 'ALLOW', 'YouTube cooking video is ALLOWED');

  // Enforcement: youtube.com video about gambling SHOULD be blocked
  const ytGambling = evaluateRules(compiled, 'https://www.youtube.com/watch?v=xyz789', 'www.youtube.com', 'Best online casino slots gambling tips how to win at poker betting strategies');
  assert(ytGambling.action === RULE_ACTIONS.BLOCK_CONTENT || ytGambling.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube gambling video is BLOCKED or WARNED');

  // DNR: youtube.com should NOT appear in DNR patterns
  const dnr = extractDNRPatterns(compiled);
  assert(!dnr.some(p => p.pattern.includes('youtube')), 'youtube.com NOT in DNR patterns (no network-level block)');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2: "block youtube"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 2: "block youtube"');
{
  const rule = compileRule("block youtube");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube.com in domain_blocklist');

  // Enforcement: youtube.com should be blocked
  const compiled = [rule];
  const yt = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', '');
  assertEq(yt.action, RULE_ACTIONS.BLOCK_DOMAIN, 'youtube.com is BLOCKED at domain level');

  // DNR: youtube.com should appear in DNR patterns
  const dnr = extractDNRPatterns(compiled);
  assert(dnr.some(p => p.pattern.includes('youtube.com')), 'youtube.com IS in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3: "no gambling sites"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 3: "no gambling sites"');
{
  const rule = compileRule("no gambling sites");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('bet365.com'), 'bet365.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('draftkings.com'), 'draftkings.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('pokerstars.com'), 'pokerstars.com in blocklist');

  // Enforcement: gambling sites blocked
  const compiled = [rule];
  const bet365 = evaluateRules(compiled, 'https://www.bet365.com/', 'www.bet365.com', '');
  assertEq(bet365.action, RULE_ACTIONS.BLOCK_DOMAIN, 'bet365.com is BLOCKED');

  // Enforcement: youtube.com NOT blocked
  const yt = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', '');
  assertEq(yt.action, 'ALLOW', 'youtube.com is NOT blocked by "no gambling sites"');

  // DNR: gambling domains in patterns, youtube NOT
  const dnr = extractDNRPatterns(compiled);
  assert(dnr.some(p => p.pattern.includes('bet365.com')), 'bet365.com in DNR patterns');
  assert(!dnr.some(p => p.pattern.includes('youtube')), 'youtube NOT in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 4: Combined rules — gambling content rule + gambling sites block
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 4: Combined rules interaction');
{
  const rules = compileRules([
    { text: "dont block all of youtube only videos about gambling", active: true },
    { text: "no gambling sites", active: true },
  ]);

  assert(rules.length === 2, 'Both rules compiled');

  // youtube.com homepage: ALLOWED (content rule allowlist overrides)
  const ytHome = evaluateRules(rules, 'https://www.youtube.com/', 'www.youtube.com', 'YouTube trending music videos');
  assertEq(ytHome.action, 'ALLOW', 'youtube.com homepage ALLOWED with combined rules');

  // bet365.com: BLOCKED (gambling domain block)
  const bet365 = evaluateRules(rules, 'https://www.bet365.com/', 'www.bet365.com', 'Sports betting odds');
  assertEq(bet365.action, RULE_ACTIONS.BLOCK_DOMAIN, 'bet365.com BLOCKED with combined rules');

  // YouTube gambling video: BLOCKED or WARNED
  const ytGambling = evaluateRules(rules, 'https://www.youtube.com/watch?v=abc', 'www.youtube.com', 'Online casino gambling slots poker betting tips how to win');
  assert(
    ytGambling.action === RULE_ACTIONS.BLOCK_CONTENT || ytGambling.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube gambling video is BLOCKED/WARNED with combined rules'
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEST 5: "block all of youtube" (explicit full block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 5: "block all of youtube"');
{
  const rule = compileRule("block all of youtube");

  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube.com in blocklist');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 6: "never allow youtube.com"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 6: "never allow youtube.com"');
{
  const rule = compileRule("never allow youtube.com");

  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.some(d => d.includes('youtube')), 'youtube in blocklist');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 7: "block adult content" (category block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 7: "block adult content"');
{
  const rule = compileRule("block adult content");

  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('pornhub.com'), 'pornhub.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('xvideos.com'), 'xvideos.com in blocklist');
  assert(!rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube NOT in blocklist');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 8: "on tiktok only block videos about drugs"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 8: "on tiktok only block videos about drugs"');
{
  const rule = compileRule("on tiktok only block videos about drugs");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('tiktok.com'), 'tiktok.com in allowlist');
  assert(rule.condition.content_classifier?.topics?.some(t => t.topic === 'drugs'), 'drugs topic in classifier');

  // TikTok homepage not blocked
  const compiled = [rule];
  const ttHome = evaluateRules(compiled, 'https://www.tiktok.com/', 'www.tiktok.com', 'For you page trending dance videos');
  assertEq(ttHome.action, 'ALLOW', 'TikTok homepage ALLOWED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 9: Inactive rules should be ignored
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 9: Inactive rules ignored');
{
  const rules = compileRules([
    { text: "block youtube", active: false },
    { text: "no gambling sites", active: true },
  ]);

  assert(rules.length === 1, 'Only active rules compiled');
  assertEq(rules[0].source_text, 'no gambling sites', 'Only the active rule is compiled');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 10: Unknown/vague rule doesn't create domain block
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 10: Vague rule safety');
{
  const rule = compileRule("keep my child safe online");

  assert(rule.action.type !== RULE_ACTIONS.BLOCK_DOMAIN, 'Vague rule does NOT create a domain block');
  assert(
    rule.action.type === RULE_ACTIONS.WARN_CONTENT || rule.action.type === RULE_ACTIONS.BLOCK_CONTENT,
    'Vague rule creates warn/content action (safe fallback)'
  );
}

// ═══════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error(`\n⚠️  ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
