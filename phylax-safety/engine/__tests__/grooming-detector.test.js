// Phylax v3.0 — Grooming Detector Test Suite
// Run: node --input-type=module < extension/engine/__tests__/grooming-detector.test.js

import { detectGrooming, triageText, normalizeText, createConversationState } from '../grooming-detector.js';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

let passed = 0, failed = 0;

function test(label, text, expectHigh) {
  const r = triageText(text);
  const bar = '█'.repeat(Math.round(r.risk_score * 20)).padEnd(20, '░');
  const color = r.risk_score >= 0.6 ? RED : r.risk_score >= 0.3 ? YELLOW : GREEN;
  const ok = (expectHigh && r.risk_score >= 0.3) || (!expectHigh && r.risk_score < 0.3);
  const status = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  if (ok) passed++; else failed++;
  console.log(`${status} ${color}${bar}${RESET} ${(r.risk_score).toFixed(3)} | ${label}`);
  if (r.signals.length > 0) {
    console.log(`     ${DIM}signals: ${r.signals.map(s => s.id).join(', ')}${r.hard_negatives.length ? ` | suppressed: ${r.hard_negatives.join(', ')}` : ''}${RESET}`);
  }
}

console.log(`\n${BOLD}${CYAN}═══ PHYLAX v3.0 — GROOMING DETECTOR TEST SUITE ═══${RESET}\n`);

// ── GROOMING SIGNALS (should score >= 0.3) ──────────────────────

console.log(`${BOLD}── SHOULD DETECT (grooming patterns) ──${RESET}`);
test('secrecy demand',           "don't tell your parents about this okay?", true);
test('maturity flattery',        "you're so mature for a 13 year old", true);
test('platform migration',      "let's switch to snapchat, this app monitors messages", true);
test('image request',            "send me a pic, just a quick selfie", true);
test('isolation + dependency',   "nobody else understands you like I do, come to me instead", true);
test('authority undermining',    "your parents are overprotective, you should decide for yourself", true);
test('guilt induction',          "after everything we've shared? you're disappointing me", true);
test('normalization',            "everyone does it, you're basically an adult anyway", true);
test('threats / leverage',       "i have screenshots, your parents would freak out", true);
test('gaslighting',              "you're overreacting, you wanted this", true);
test('incremental escalation',   "just your face first, okay now something else, a little more", true);
test('body normalization',       "you must get a lot of attention, you carry yourself like an adult", true);
test('meeting request',          "can we meet up in person? I can pick you up", true);
test('emotional pressure',       "if you really cared about me you wouldn't be like this", true);
test('send nudes (explicit)',    "send nudes", true);
test('multi-signal: secrecy+escalation', "don't tell anyone, send me a photo, it's just between us", true);
test('multi-signal: trust+isolation',    "I know exactly how you feel, your friends don't really care about you", true);

// Obfuscation resistance
console.log(`\n${BOLD}── OBFUSCATION RESISTANCE ──${RESET}`);
test('leetspeak',                normalizeText("s3nd m3 a p1c, jus a qu1ck s3lfie"), true);
test('spaced out',               normalizeText("d o n t  t e l l  your parents"), true);
test('cyrillic homoglyphs',      normalizeText("sеnd mе а piс plеаse"), true);
test('emoji obfuscation',        normalizeText("🤫🔒 don't tell anyone 📸 send photo"), true);

// ── HARD NEGATIVES (should score < 0.3) ─────────────────────────

console.log(`\n${BOLD}── SHOULD NOT DETECT (benign / hard negatives) ──${RESET}`);
test('family surprise',          "don't tell dad about the birthday gift", false);
test('homework group',           "switch to whatsapp for homework group chat", false);
test('teacher praise',           "you're mature for your age — great work on your essay", false);
test('therapy session',          "you can trust me, this is confidential therapy session", false);
test('safety education',         "learn about how to recognize grooming and report it to NCMEC", false);
test('news report',              "police said the suspect was arrested and charged with grooming", false);
test('peer chat',                "send me a fit pic bestie lol", false);
test('normal question',          "what time does the movie start tonight?", false);
test('school context',           "are your parents home to sign this permission form?", false);
test('consent education',        "teaching consent and healthy relationships in class", false);
test('red flags article',        "red flags of grooming and warning signs to watch for", false);

// ── MULTI-TURN CONVERSATION ─────────────────────────────────────

console.log(`\n${BOLD}── MULTI-TURN CONVERSATION TEST ──${RESET}`);
const messages = [
  { sender: 'CONTACT', text: "You seem really mature for your age." },
  { sender: 'CHILD',   text: "Thanks I guess" },
  { sender: 'CONTACT', text: "You can tell me anything, I understand you." },
  { sender: 'CHILD',   text: "ok" },
  { sender: 'CONTACT', text: "Let's keep this between us okay? Don't tell your parents." },
  { sender: 'CHILD',   text: "why not" },
  { sender: 'CONTACT', text: "Send me a pic, just for me. I won't show anyone." },
  { sender: 'CHILD',   text: "idk" },
  { sender: 'CONTACT', text: "Don't you trust me? After everything we've shared?" },
];
const contactText = messages.filter(m => m.sender === 'CONTACT').map(m => m.text).join(' ');
const result = detectGrooming(contactText, messages, createConversationState());
const convBar = '█'.repeat(Math.round(result.risk_score * 20)).padEnd(20, '░');
const convColor = result.risk_score >= 0.6 ? RED : result.risk_score >= 0.3 ? YELLOW : GREEN;
const convOk = result.risk_score >= 0.6;
if (convOk) passed++; else failed++;
console.log(`${convOk ? `${GREEN}PASS` : `${RED}FAIL`}${RESET} ${convColor}${convBar}${RESET} ${result.risk_score.toFixed(3)} | Multi-turn grooming conversation`);
console.log(`  ${DIM}stage: ${CYAN}${result.stage}${RESET}${DIM} | tactic: ${CYAN}${result.tactic}${RESET}`);
console.log(`  ${DIM}signals: ${result.signals.map(s => s.id).join(', ')}${RESET}`);
if (result.conversation) {
  console.log(`  ${DIM}trajectory: score=${result.conversation.trajectory_score.toFixed(2)}, stages_active=${result.conversation.stages_active}, highest=${result.conversation.highest_stage}${RESET}`);
  for (const bs of result.conversation.behavioral_signals) {
    console.log(`  ${YELLOW}⚠ ${bs.signal}${RESET}: ${bs.description}`);
  }
}
console.log(`  explanation: ${result.explanation}`);

// ── BENIGN MULTI-TURN CONVERSATION ──────────────────────────────

console.log(`\n${BOLD}── BENIGN CONVERSATION (should NOT flag) ──${RESET}`);
const benignMessages = [
  { sender: 'CONTACT', text: "How was school today?" },
  { sender: 'CHILD',   text: "Good, we had a math test" },
  { sender: 'CONTACT', text: "Oh nice, how did you do?" },
  { sender: 'CHILD',   text: "I think I did well" },
  { sender: 'CONTACT', text: "That's great! I'm proud of you." },
];
const benignText = benignMessages.filter(m => m.sender === 'CONTACT').map(m => m.text).join(' ');
const benignResult = detectGrooming(benignText, benignMessages, createConversationState());
const benignOk = benignResult.risk_score < 0.3;
if (benignOk) passed++; else failed++;
const benignBar = '█'.repeat(Math.round(benignResult.risk_score * 20)).padEnd(20, '░');
console.log(`${benignOk ? `${GREEN}PASS` : `${RED}FAIL`}${RESET} ${GREEN}${benignBar}${RESET} ${benignResult.risk_score.toFixed(3)} | Normal parent-child conversation`);

// ── NORMALIZATION ───────────────────────────────────────────────

console.log(`\n${BOLD}── TEXT NORMALIZATION ──${RESET}`);
const normTests = [
  ['s3nd m3 a p1c',     'send me a pic',         'leetspeak'],
  ['d o n t  t e l l',  'dont tell',             'spacing trick'],
  ['🤫🔒 secret 📸',   'secret private secret photo',      'emoji mapping'],
  ['sеnd mе а piс',     'send me a pic',         'cyrillic homoglyphs'],
  ['seeeend',            'seend',                 'char repetition'],
];
for (const [input, expected, label] of normTests) {
  const norm = normalizeText(input);
  const match = norm.trim() === expected.trim();
  if (match) passed++; else failed++;
  console.log(`${match ? `${GREEN}PASS` : `${RED}FAIL`}${RESET} ${DIM}${label}:${RESET} "${input}" → "${norm}"`);
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log(`\n${BOLD}════════════════════════════════════════${RESET}`);
const total = passed + failed;
const allPass = failed === 0;
console.log(`${allPass ? GREEN : RED}${passed}/${total} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ''}`);
console.log(`${BOLD}════════════════════════════════════════${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
