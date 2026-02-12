// Phylax — Rule Compiler Tests (Generalized)
// Tests NL → structured rule compilation across ANY topic × ANY platform.
//
// Run with: node extension/engine/__tests__/rule-compiler.test.js

import { compileRule, compileRules, evaluateRules, extractDNRPatterns, RULE_ACTIONS, INTENT_TYPES } from '../rule-compiler.js';

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
// The ORIGINAL bug: this used to block ALL of YouTube
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 1: YouTube + Gambling (original bug case)');
{
  const rule = compileRule("dont block all of youtube only videos about gambling");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT (not BLOCK_DOMAIN)');
  assert(rule.scope.domain_allowlist?.includes('youtube.com'), 'youtube.com is in domain_allowlist');
  assert(rule.scope.domain_allowlist?.includes('www.youtube.com'), 'www.youtube.com is in domain_allowlist');
  assert(!rule.scope.domain_blocklist, 'No domain_blocklist (youtube is NOT blocked)');
  assert(rule.condition.classifier?.labels_any?.includes('gambling'), 'Classifier uses labels_any with gambling');
  assert(rule.parsed_intent != null, 'parsed_intent is present');

  // Enforcement
  const compiled = [rule];
  const ytHome = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', 'YouTube homepage trending videos music');
  assertEq(ytHome.action, 'ALLOW', 'youtube.com homepage is ALLOWED');

  const ytCooking = evaluateRules(compiled, 'https://www.youtube.com/watch?v=abc123', 'www.youtube.com', 'How to make pasta carbonara recipe Italian cooking');
  assertEq(ytCooking.action, 'ALLOW', 'YouTube cooking video is ALLOWED');

  const ytGambling = evaluateRules(compiled, 'https://www.youtube.com/watch?v=xyz789', 'www.youtube.com', 'Best online casino slots gambling tips how to win at poker betting strategies');
  assert(ytGambling.action === RULE_ACTIONS.BLOCK_CONTENT || ytGambling.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube gambling video is BLOCKED or WARNED');

  // DNR: youtube.com should NOT appear in DNR patterns
  const dnr = extractDNRPatterns(compiled);
  assert(!dnr.some(p => p.pattern.includes('youtube')), 'youtube.com NOT in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2: "block youtube" (explicit domain block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 2: "block youtube" — explicit domain block');
{
  const rule = compileRule("block youtube");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube.com in domain_blocklist');

  const compiled = [rule];
  const yt = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', '');
  assertEq(yt.action, RULE_ACTIONS.BLOCK_DOMAIN, 'youtube.com is BLOCKED at domain level');

  const dnr = extractDNRPatterns(compiled);
  assert(dnr.some(p => p.pattern.includes('youtube.com')), 'youtube.com IS in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 3: "no gambling sites" (category block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 3: "no gambling sites" — category domain block');
{
  const rule = compileRule("no gambling sites");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('bet365.com'), 'bet365.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('draftkings.com'), 'draftkings.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('pokerstars.com'), 'pokerstars.com in blocklist');

  const compiled = [rule];
  const bet365 = evaluateRules(compiled, 'https://www.bet365.com/', 'www.bet365.com', '');
  assertEq(bet365.action, RULE_ACTIONS.BLOCK_DOMAIN, 'bet365.com is BLOCKED');

  const yt = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', '');
  assertEq(yt.action, 'ALLOW', 'youtube.com is NOT blocked by "no gambling sites"');

  const dnr = extractDNRPatterns(compiled);
  assert(dnr.some(p => p.pattern.includes('bet365.com')), 'bet365.com in DNR patterns');
  assert(!dnr.some(p => p.pattern.includes('youtube')), 'youtube NOT in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 4: "dont block all of instagram only posts about self-harm"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 4: Instagram + Self-Harm (content-scoped)');
{
  const rule = compileRule("dont block all of instagram only posts about self-harm");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('instagram.com'), 'instagram.com in allowlist');
  assert(!rule.scope.domain_blocklist, 'No domain_blocklist');
  assert(rule.condition.classifier?.labels_any?.includes('self_harm'), 'Classifier includes self_harm label');

  const compiled = [rule];
  const igHome = evaluateRules(compiled, 'https://www.instagram.com/', 'www.instagram.com', 'Instagram explore fashion travel food photography');
  assertEq(igHome.action, 'ALLOW', 'Instagram homepage is ALLOWED');

  const igSafe = evaluateRules(compiled, 'https://www.instagram.com/p/abc123/', 'www.instagram.com', 'Beautiful sunset photography landscape nature');
  assertEq(igSafe.action, 'ALLOW', 'Instagram nature post is ALLOWED');

  const igHarm = evaluateRules(compiled, 'https://www.instagram.com/p/xyz789/', 'www.instagram.com', 'I want to die suicide cutting self-harm kill myself nobody cares end my life');
  assert(igHarm.action === RULE_ACTIONS.BLOCK_CONTENT || igHarm.action === RULE_ACTIONS.WARN_CONTENT,
    'Instagram self-harm post is BLOCKED or WARNED');

  const dnr = extractDNRPatterns(compiled);
  assert(!dnr.some(p => p.pattern.includes('instagram')), 'instagram.com NOT in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 5: "allow reddit but block hate speech"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 5: Reddit + Hate Speech');
{
  const rule = compileRule("allow reddit but block hate speech");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('reddit.com'), 'reddit.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('hate'), 'Classifier includes hate label');

  const compiled = [rule];
  const redditSafe = evaluateRules(compiled, 'https://www.reddit.com/r/programming/comments/abc', 'www.reddit.com', 'Great tutorial on Rust programming language memory safety');
  assertEq(redditSafe.action, 'ALLOW', 'Reddit programming post is ALLOWED');

  const redditHate = evaluateRules(compiled, 'https://www.reddit.com/r/bad/comments/xyz', 'www.reddit.com', 'white supremacy hate speech racism racist bigotry race war ethnic cleansing');
  assert(redditHate.action === RULE_ACTIONS.BLOCK_CONTENT || redditHate.action === RULE_ACTIONS.WARN_CONTENT,
    'Reddit hate speech post is BLOCKED or WARNED');

  assert(!extractDNRPatterns(compiled).some(p => p.pattern.includes('reddit')), 'reddit.com NOT in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 6: "on discord block grooming behavior"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 6: Discord + Grooming');
{
  const rule = compileRule("on discord block grooming behavior");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('discord.com'), 'discord.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('grooming'), 'Classifier includes grooming label');

  const compiled = [rule];
  const discordSafe = evaluateRules(compiled, 'https://discord.com/channels/123/456', 'discord.com', 'Hey want to play some Minecraft later? I found a cool server');
  assertEq(discordSafe.action, 'ALLOW', 'Discord gaming chat is ALLOWED');

  const discordGroom = evaluateRules(compiled, 'https://discord.com/channels/123/789', 'discord.com', 'send me a pic are you alone dont tell your parents our secret special relationship just between us mature for your age');
  assert(discordGroom.action === RULE_ACTIONS.BLOCK_CONTENT || discordGroom.action === RULE_ACTIONS.WARN_CONTENT,
    'Discord grooming message is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 7: "on tiktok only block videos about drugs"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 7: TikTok + Drugs');
{
  const rule = compileRule("on tiktok only block videos about drugs");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('tiktok.com'), 'tiktok.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('drugs'), 'Classifier includes drugs label');

  const compiled = [rule];
  const ttDance = evaluateRules(compiled, 'https://www.tiktok.com/@user/video/123', 'www.tiktok.com', 'Amazing dance choreography trending sound music');
  assertEq(ttDance.action, 'ALLOW', 'TikTok dance video is ALLOWED');

  const ttDrugs = evaluateRules(compiled, 'https://www.tiktok.com/@user/video/456', 'www.tiktok.com', 'how to use drugs marijuana weed edibles getting high cocaine fentanyl substance abuse');
  assert(ttDrugs.action === RULE_ACTIONS.BLOCK_CONTENT || ttDrugs.action === RULE_ACTIONS.WARN_CONTENT,
    'TikTok drugs video is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 8: "allow wikipedia but block articles about suicide methods"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 8: Wikipedia + Suicide');
{
  const rule = compileRule("allow wikipedia but block articles about suicide methods");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(
    rule.scope.domain_allowlist?.includes('wikipedia.org') || rule.scope.domain_allowlist?.includes('en.wikipedia.org'),
    'wikipedia.org or en.wikipedia.org in allowlist'
  );
  assert(rule.condition.classifier?.labels_any?.includes('self_harm'), 'Classifier includes self_harm label');

  const compiled = [rule];
  const wikiSafe = evaluateRules(compiled, 'https://en.wikipedia.org/wiki/Cat', 'en.wikipedia.org', 'The cat is a domesticated species of small carnivorous mammal.');
  assertEq(wikiSafe.action, 'ALLOW', 'Wikipedia cat article is ALLOWED');

  const wikiHarm = evaluateRules(compiled, 'https://en.wikipedia.org/wiki/Suicide_methods', 'en.wikipedia.org', 'suicide methods how to kill yourself ways to die overdose end my life');
  assert(wikiHarm.action === RULE_ACTIONS.BLOCK_CONTENT || wikiHarm.action === RULE_ACTIONS.WARN_CONTENT,
    'Wikipedia suicide methods article is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 9: "block adult content" (category block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 9: "block adult content" — category domain block');
{
  const rule = compileRule("block adult content");

  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('pornhub.com'), 'pornhub.com in blocklist');
  assert(rule.scope.domain_blocklist?.includes('xvideos.com'), 'xvideos.com in blocklist');
  assert(!rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube.com NOT in blocklist');

  const compiled = [rule];
  const ph = evaluateRules(compiled, 'https://www.pornhub.com/', 'www.pornhub.com', '');
  assertEq(ph.action, RULE_ACTIONS.BLOCK_DOMAIN, 'pornhub.com is BLOCKED');

  const yt = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', '');
  assertEq(yt.action, 'ALLOW', 'youtube.com is NOT blocked by adult content rule');

  const dnr = extractDNRPatterns(compiled);
  assert(dnr.some(p => p.pattern.includes('pornhub.com')), 'pornhub.com in DNR patterns');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 10: "allow youtube but block porn"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 10: YouTube + Pornography (content-scoped)');
{
  const rule = compileRule("allow youtube but block porn");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('youtube.com'), 'youtube.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('pornography'), 'Classifier includes pornography label');

  const compiled = [rule];
  const ytSafe = evaluateRules(compiled, 'https://www.youtube.com/watch?v=safe', 'www.youtube.com', 'Funny cat compilation adorable pets animals');
  assertEq(ytSafe.action, 'ALLOW', 'YouTube cat video is ALLOWED');

  const ytPorn = evaluateRules(compiled, 'https://www.youtube.com/watch?v=nsfw', 'www.youtube.com', 'porn pornography nsfw adult content explicit sex video sexually explicit nude naked');
  assert(ytPorn.action === RULE_ACTIONS.BLOCK_CONTENT || ytPorn.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube porn content is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 11: Combined rules — multiple topics × platforms
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 11: Combined rules — multi-topic multi-platform');
{
  const rules = compileRules([
    { text: "dont block all of youtube only videos about gambling", active: true },
    { text: "no gambling sites", active: true },
    { text: "on tiktok only block videos about drugs", active: true },
  ]);

  assert(rules.length === 3, 'All three rules compiled');

  // YouTube homepage: ALLOWED
  const ytHome = evaluateRules(rules, 'https://www.youtube.com/', 'www.youtube.com', 'YouTube trending music videos');
  assertEq(ytHome.action, 'ALLOW', 'youtube.com homepage ALLOWED with combined rules');

  // bet365.com: BLOCKED (gambling domain)
  const bet365 = evaluateRules(rules, 'https://www.bet365.com/', 'www.bet365.com', 'Sports betting odds');
  assertEq(bet365.action, RULE_ACTIONS.BLOCK_DOMAIN, 'bet365.com BLOCKED with combined rules');

  // YouTube gambling video: BLOCKED or WARNED
  const ytGambling = evaluateRules(rules, 'https://www.youtube.com/watch?v=abc', 'www.youtube.com', 'Online casino gambling slots poker betting tips how to win');
  assert(
    ytGambling.action === RULE_ACTIONS.BLOCK_CONTENT || ytGambling.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube gambling video BLOCKED/WARNED with combined rules'
  );

  // TikTok safe content: ALLOWED
  const ttSafe = evaluateRules(rules, 'https://www.tiktok.com/@user/video/1', 'www.tiktok.com', 'Dance choreography music trending');
  assertEq(ttSafe.action, 'ALLOW', 'TikTok dance video ALLOWED with combined rules');

  // TikTok drugs content: BLOCKED
  const ttDrugs = evaluateRules(rules, 'https://www.tiktok.com/@user/video/2', 'www.tiktok.com', 'drugs cocaine marijuana weed getting high substance abuse');
  assert(
    ttDrugs.action === RULE_ACTIONS.BLOCK_CONTENT || ttDrugs.action === RULE_ACTIONS.WARN_CONTENT,
    'TikTok drugs video BLOCKED/WARNED with combined rules'
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEST 12: "block all of youtube" (explicit full block)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 12: "block all of youtube" — explicit domain block');
{
  const rule = compileRule("block all of youtube");
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.includes('youtube.com'), 'youtube.com in blocklist');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 13: "never allow youtube.com"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 13: "never allow youtube.com"');
{
  const rule = compileRule("never allow youtube.com");
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_DOMAIN, 'Action is BLOCK_DOMAIN');
  assert(rule.scope.domain_blocklist?.some(d => d.includes('youtube')), 'youtube in blocklist');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 14: Inactive rules should be ignored
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 14: Inactive rules ignored');
{
  const rules = compileRules([
    { text: "block youtube", active: false },
    { text: "no gambling sites", active: true },
  ]);

  assert(rules.length === 1, 'Only active rules compiled');
  assertEq(rules[0].source_text, 'no gambling sites', 'Only the active rule is compiled');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 15: Vague rule doesn't create domain block
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 15: Vague rule safety');
{
  const rule = compileRule("keep my child safe online");

  assert(rule.action.type !== RULE_ACTIONS.BLOCK_DOMAIN, 'Vague rule does NOT create a domain block');
  assert(
    rule.action.type === RULE_ACTIONS.WARN_CONTENT || rule.action.type === RULE_ACTIONS.BLOCK_CONTENT,
    'Vague rule creates warn/content action (safe fallback)'
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEST 16: "block violence on youtube" — site+topic implicit conditional
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 16: YouTube + Violence (implicit conditional)');
{
  const rule = compileRule("block violence on youtube");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT (NOT BLOCK_DOMAIN)');
  assert(rule.scope.domain_allowlist?.includes('youtube.com'), 'youtube.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('violence'), 'Classifier includes violence label');

  const compiled = [rule];
  const ytSafe = evaluateRules(compiled, 'https://www.youtube.com/', 'www.youtube.com', 'Relaxing piano music study concentration');
  assertEq(ytSafe.action, 'ALLOW', 'YouTube music is ALLOWED');

  const ytViolent = evaluateRules(compiled, 'https://www.youtube.com/watch?v=bad', 'www.youtube.com', 'graphic violence murder beating assault gore torture stabbing brutality fight video');
  assert(ytViolent.action === RULE_ACTIONS.BLOCK_CONTENT || ytViolent.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube violent content is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 17: "no porn" — global content/domain block
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 17: "no porn" — global block');
{
  const rule = compileRule("no porn");

  assert(rule._compiled === true, 'Rule compiles successfully');
  // Should block known adult domains at domain level
  // OR classify as content-level with porn label
  assert(
    rule.action.type === RULE_ACTIONS.BLOCK_DOMAIN || rule.action.type === RULE_ACTIONS.BLOCK_CONTENT,
    'Action is BLOCK_DOMAIN or BLOCK_CONTENT'
  );

  if (rule.action.type === RULE_ACTIONS.BLOCK_DOMAIN) {
    assert(rule.scope.domain_blocklist?.includes('pornhub.com'), 'pornhub.com in blocklist');
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 18: "block weapons content on reddit"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 18: Reddit + Weapons');
{
  const rule = compileRule("block weapons content on reddit");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('reddit.com'), 'reddit.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('weapons'), 'Classifier includes weapons label');

  const compiled = [rule];
  const redditSafe = evaluateRules(compiled, 'https://www.reddit.com/r/aww', 'www.reddit.com', 'Cute puppy adorable kitten animals pets');
  assertEq(redditSafe.action, 'ALLOW', 'Reddit cute animals post is ALLOWED');

  const redditWeapons = evaluateRules(compiled, 'https://www.reddit.com/r/bad', 'www.reddit.com', 'assault rifle guns firearms ammunition buy weapons homemade weapon gun sale handgun');
  assert(redditWeapons.action === RULE_ACTIONS.BLOCK_CONTENT || redditWeapons.action === RULE_ACTIONS.WARN_CONTENT,
    'Reddit weapons post is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 19: "block scams on google search"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 19: Google + Scams');
{
  const rule = compileRule("block scams on google search");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(
    rule.scope.domain_allowlist?.includes('google.com') || rule.scope.domain_allowlist?.includes('www.google.com'),
    'google.com in allowlist'
  );
  assert(rule.condition.classifier?.labels_any?.includes('scams'), 'Classifier includes scams label');

  const compiled = [rule];
  const googleSafe = evaluateRules(compiled, 'https://www.google.com/search?q=weather', 'www.google.com', 'Weather forecast for today sunny 72 degrees');
  assertEq(googleSafe.action, 'ALLOW', 'Google weather search is ALLOWED');

  const googleScam = evaluateRules(compiled, 'https://www.google.com/search?q=money', 'www.google.com', 'get rich quick guaranteed returns double your money crypto scam wire transfer gift card payment nigerian prince');
  assert(googleScam.action === RULE_ACTIONS.BLOCK_CONTENT || googleScam.action === RULE_ACTIONS.WARN_CONTENT,
    'Google scam results are BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 20: "on facebook block bullying"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 20: Facebook + Bullying');
{
  const rule = compileRule("on facebook block bullying");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('facebook.com'), 'facebook.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('bullying'), 'Classifier includes bullying label');

  const compiled = [rule];
  const fbSafe = evaluateRules(compiled, 'https://www.facebook.com/', 'www.facebook.com', 'Happy birthday! Great photo from vacation. Family reunion this weekend.');
  assertEq(fbSafe.action, 'ALLOW', 'Facebook family post is ALLOWED');

  const fbBully = evaluateRules(compiled, 'https://www.facebook.com/posts/xyz', 'www.facebook.com', 'cyberbullying kys kill yourself nobody likes you go die everyone hates you worthless loser ugly');
  assert(fbBully.action === RULE_ACTIONS.BLOCK_CONTENT || fbBully.action === RULE_ACTIONS.WARN_CONTENT,
    'Facebook bullying post is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 21: Content-scoped rule doesn't affect unrelated domains
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 21: Domain scoping — rule doesn\'t leak to unrelated sites');
{
  const rule = compileRule("on tiktok only block videos about drugs");
  const compiled = [rule];

  // Rule should NOT affect YouTube
  const ytDrugs = evaluateRules(compiled, 'https://www.youtube.com/watch?v=abc', 'www.youtube.com', 'drugs cocaine marijuana weed getting high');
  assertEq(ytDrugs.action, 'ALLOW', 'TikTok drug rule does NOT affect YouTube');

  // Rule should NOT affect Google
  const googleDrugs = evaluateRules(compiled, 'https://www.google.com/search', 'www.google.com', 'drugs cocaine marijuana weed getting high');
  assertEq(googleDrugs.action, 'ALLOW', 'TikTok drug rule does NOT affect Google');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 22: "block extremism on twitter"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 22: Twitter/X + Extremism');
{
  const rule = compileRule("block extremism on twitter");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(
    rule.scope.domain_allowlist?.includes('twitter.com') || rule.scope.domain_allowlist?.includes('x.com'),
    'twitter.com or x.com in allowlist'
  );
  assert(rule.condition.classifier?.labels_any?.includes('extremism'), 'Classifier includes extremism label');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 23: "block eating disorder content on tumblr"
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 23: Tumblr + Eating Disorders');
{
  const rule = compileRule("block eating disorder content on tumblr");

  assert(rule._compiled === true, 'Rule compiles successfully');
  assertEq(rule.action.type, RULE_ACTIONS.BLOCK_CONTENT, 'Action is BLOCK_CONTENT');
  assert(rule.scope.domain_allowlist?.includes('tumblr.com'), 'tumblr.com in allowlist');
  assert(rule.condition.classifier?.labels_any?.includes('eating_disorder'), 'Classifier includes eating_disorder label');

  const compiled = [rule];
  const tumblrSafe = evaluateRules(compiled, 'https://www.tumblr.com/post/123', 'www.tumblr.com', 'Art blog watercolor painting digital illustration creative');
  assertEq(tumblrSafe.action, 'ALLOW', 'Tumblr art post is ALLOWED');

  const tumblrED = evaluateRules(compiled, 'https://www.tumblr.com/post/456', 'www.tumblr.com', 'pro ana thinspo thinspiration bonespo purging how to starve calorie restrict body check meanspo');
  assert(tumblrED.action === RULE_ACTIONS.BLOCK_CONTENT || tumblrED.action === RULE_ACTIONS.WARN_CONTENT,
    'Tumblr eating disorder content is BLOCKED or WARNED');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 24: DNR patterns only from BLOCK_DOMAIN rules
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 24: DNR extraction — only domain blocks');
{
  const rules = compileRules([
    { text: "block youtube", active: true },
    { text: "dont block all of instagram only posts about self-harm", active: true },
    { text: "no gambling sites", active: true },
    { text: "on tiktok only block videos about drugs", active: true },
  ]);

  const dnr = extractDNRPatterns(rules);

  // YouTube should be in DNR (explicit block)
  assert(dnr.some(p => p.pattern.includes('youtube.com')), 'youtube.com in DNR (explicit block)');

  // Gambling domains should be in DNR (category block)
  assert(dnr.some(p => p.pattern.includes('bet365.com')), 'bet365.com in DNR (category block)');

  // Instagram should NOT be in DNR (content-scoped rule)
  assert(!dnr.some(p => p.pattern.includes('instagram')), 'instagram.com NOT in DNR (content-scoped)');

  // TikTok should NOT be in DNR (content-scoped rule)
  assert(!dnr.some(p => p.pattern.includes('tiktok')), 'tiktok.com NOT in DNR (content-scoped)');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 25: Debug metadata present on all compiled rules
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 25: Debug metadata on compiled rules');
{
  const testCases = [
    "block youtube",
    "dont block all of instagram only posts about self-harm",
    "no gambling sites",
    "allow reddit but block hate speech",
    "keep my child safe online",
  ];

  for (const text of testCases) {
    const rule = compileRule(text);
    assert(rule.source_text === text, `source_text preserved: "${text}"`);
    assert(rule.parsed_intent != null, `parsed_intent present for: "${text}"`);
    assert(Array.isArray(rule.debug_reason_codes) || Array.isArray(rule._errors), `debug_reason_codes present for: "${text}"`);
    assert(rule.id != null, `id present for: "${text}"`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 26: Intent Model — structured intent on compiled rules
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 26: Intent Model output');
{
  const rule1 = compileRule("block youtube");
  assert(rule1.parsed_intent_model != null, 'Intent model present on domain block');
  assertEq(rule1.parsed_intent_model.user_intent_type, INTENT_TYPES.BLOCK_DOMAIN, 'Intent type is BLOCK_DOMAIN');
  assertEq(rule1.parsed_intent_model.strength, 'hard', 'Strength is hard');
  assert(rule1.parsed_intent_model.confidence >= 0.9, 'Confidence >= 0.9 for explicit block');

  const rule2 = compileRule("allow reddit but block hate speech");
  assert(rule2.parsed_intent_model != null, 'Intent model present on conditional rule');
  assertEq(rule2.parsed_intent_model.user_intent_type, INTENT_TYPES.ALLOW_DOMAIN_EXCEPT_TOPIC, 'Intent type is ALLOW_DOMAIN_EXCEPT_TOPIC');
  assertEq(rule2.parsed_intent_model.scope_granularity, 'content', 'Scope granularity is content');

  const rule3 = compileRule("no gambling sites");
  assert(rule3.parsed_intent_model != null, 'Intent model present on category block');
  assertEq(rule3.parsed_intent_model.user_intent_type, INTENT_TYPES.BLOCK_TOPIC_GLOBAL, 'Intent type is BLOCK_TOPIC_GLOBAL');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 27: Reason Graph — present in evaluation results
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 27: Reason Graph in evaluation results');
{
  const rules = compileRules([
    { text: "dont block all of youtube only videos about gambling", active: true },
    { text: "no gambling sites", active: true },
  ]);

  const result = evaluateRules(rules, 'https://www.youtube.com/watch?v=abc', 'www.youtube.com', 'casino gambling poker slots betting tips');
  assert(result.reason_graph != null, 'Reason graph present in result');
  assert(result.reason_graph.domain === 'www.youtube.com', 'Reason graph has correct domain');
  assert(result.reason_graph.rules_evaluated > 0, 'Reason graph shows rules evaluated');
  assert(Array.isArray(result.reason_graph.decision_path), 'Reason graph has decision path array');
  assert(result.reason_graph.decision_path.length > 0, 'Decision path is not empty');
  assert(result.reason_graph.decision_path[0].rule_id != null, 'Decision path entries have rule_id');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 28: FALSE POSITIVE PREVENTION — Google search for "religion"
// This was the original bug: searching "religion" on Google got blocked
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 28: FALSE POSITIVE — Google "religion" search NOT blocked');
{
  const rules = compileRules([
    { text: "no gambling sites", active: true },
    { text: "block adult content", active: true },
    { text: "dont block all of youtube only videos about gambling", active: true },
  ]);

  const googleReligion = evaluateRules(
    rules,
    'https://www.google.com/search?q=religion',
    'www.google.com',
    'religion world religions christianity islam buddhism hinduism judaism history faith belief spiritual'
  );
  assertEq(googleReligion.action, 'ALLOW', 'Google search for "religion" is ALLOWED (not a false positive)');

  const googleHistory = evaluateRules(
    rules,
    'https://www.google.com/search?q=history+of+gambling',
    'www.google.com',
    'history of gambling ancient civilizations dice games roman empire betting study finds research shows'
  );
  assertEq(googleHistory.action, 'ALLOW', 'Google search for "history of gambling" is ALLOWED (educational context on search engine)');
}

// ═══════════════════════════════════════════════════════════════════
// TEST 29: Contextual Reasoning — educational vs promotional
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 29: Contextual Reasoning — educational vs promotional');
{
  const rules = compileRules([
    { text: "dont block all of youtube only videos about gambling", active: true },
  ]);

  // Educational content about gambling on YouTube should be ALLOWED or at most warned
  const ytEducational = evaluateRules(
    rules,
    'https://www.youtube.com/watch?v=edu',
    'www.youtube.com',
    'study finds research shows gambling addiction published in journal of psychology education understanding compulsive gambling academic'
  );
  // Even though it mentions gambling, educational context should reduce the score
  assert(
    ytEducational.action === 'ALLOW' || ytEducational.action === RULE_ACTIONS.WARN_CONTENT,
    'Educational gambling content on YouTube is ALLOWED or WARNED (not hard blocked)'
  );

  // Promotional gambling content on YouTube should be BLOCKED
  const ytPromotional = evaluateRules(
    rules,
    'https://www.youtube.com/watch?v=promo',
    'www.youtube.com',
    'sign up now free spins casino bonus bet now play now slots gambling jackpot win big guaranteed poker online betting odds'
  );
  assert(
    ytPromotional.action === RULE_ACTIONS.BLOCK_CONTENT || ytPromotional.action === RULE_ACTIONS.WARN_CONTENT,
    'Promotional gambling content on YouTube is BLOCKED or WARNED'
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEST 30: Specificity-based conflict resolution
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 30: Specificity-based conflict resolution');
{
  // Rule A: "no gambling sites" (category domain block — less specific)
  // Rule B: "allow youtube except gambling" (content-scoped — more specific)
  const rules = compileRules([
    { text: "no gambling sites", active: true },
    { text: "allow youtube but block gambling", active: true },
  ]);

  // bet365 should still be blocked by Rule A
  const bet365 = evaluateRules(rules, 'https://www.bet365.com/', 'www.bet365.com', '');
  assertEq(bet365.action, RULE_ACTIONS.BLOCK_DOMAIN, 'bet365 blocked by category rule');

  // YouTube homepage should be allowed (Rule B is more specific and allows YouTube)
  const ytHome = evaluateRules(rules, 'https://www.youtube.com/', 'www.youtube.com', 'YouTube trending videos');
  assertEq(ytHome.action, 'ALLOW', 'YouTube homepage allowed by more specific content-scoped rule');

  // YouTube gambling video should be blocked at content level
  const ytGambling = evaluateRules(rules, 'https://www.youtube.com/watch?v=abc', 'www.youtube.com', 'casino slots gambling poker betting jackpot bet now odds sportsbook');
  assert(
    ytGambling.action === RULE_ACTIONS.BLOCK_CONTENT || ytGambling.action === RULE_ACTIONS.WARN_CONTENT,
    'YouTube gambling video blocked at content level (not domain level)'
  );
}

// ═══════════════════════════════════════════════════════════════════
// TEST 31: Wikipedia safe-listing (educational domain context)
// ═══════════════════════════════════════════════════════════════════
console.log('\n📋 TEST 31: Wikipedia educational context');
{
  const rules = compileRules([
    { text: "no gambling sites", active: true },
  ]);

  // Wikipedia article about gambling should be ALLOWED (educational context)
  const wikiGambling = evaluateRules(
    rules,
    'https://en.wikipedia.org/wiki/Gambling',
    'en.wikipedia.org',
    'gambling casino history betting games study finds research published in encyclopedia'
  );
  assertEq(wikiGambling.action, 'ALLOW', 'Wikipedia gambling article is ALLOWED (educational domain, not a gambling domain)');
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
