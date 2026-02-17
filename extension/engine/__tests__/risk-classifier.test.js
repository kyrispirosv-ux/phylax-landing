// Phylax Engine — Risk Classifier Tests
// Tests all three demo tasks with the exact inputs from the spec.

import { classify_video_risk, analyze_message_risk, predict_conversation_risk, classify_search_risk } from '../risk-classifier.js';

// ═════════════════════════════════════════════════════════════════
// TASK 1 — YouTube Semantic Video Blocking
// Search query: "how to win money online"
// ═════════════════════════════════════════════════════════════════

describe('classify_video_risk', () => {
  // ── ALLOWED videos ──────────────────────────────────────────────

  test('allows financial literacy content', () => {
    const result = classify_video_risk(
      'Financial Literacy 101: How to Build Wealth | Personal Finance Basics for Beginners'
    );
    expect(result.decision).toBe('allow');
    expect(result.risk_score).toBeLessThan(50);
  });

  test('allows investing basics', () => {
    const result = classify_video_risk(
      'How to Start Investing with $100 | Stock Market Basics | Index Funds Explained for Beginners'
    );
    expect(result.decision).toBe('allow');
    expect(result.risk_score).toBeLessThan(50);
  });

  test('allows business advice', () => {
    const result = classify_video_risk(
      'How to Start a Business in 2024 | Entrepreneur Tips | Side Hustle Ideas That Actually Work'
    );
    expect(result.decision).toBe('allow');
    expect(result.risk_score).toBeLessThan(50);
  });

  test('allows budgeting tutorials', () => {
    const result = classify_video_risk(
      'How to Budget Your Money | The 50/30/20 Rule | Personal Finance for Beginners | Savings Tips'
    );
    expect(result.decision).toBe('allow');
    expect(result.risk_score).toBeLessThan(30);
  });

  test('allows passive income education', () => {
    const result = classify_video_risk(
      'Passive Income Ideas 2024: How to Make Money While You Sleep | Investing, Real Estate, Business'
    );
    expect(result.decision).toBe('allow');
    expect(result.risk_score).toBeLessThan(50);
  });

  // ── BLOCKED videos ─────────────────────────────────────────────

  test('blocks gambling systems', () => {
    const result = classify_video_risk(
      'GUARANTEED Roulette System That NEVER Loses! Casino Strategy | Beat the House Edge | Betting Trick'
    );
    expect(result.decision).toBe('block');
    expect(result.category).toMatch(/gambling|scams/);
  });

  test('blocks casino tricks', () => {
    const result = classify_video_risk(
      'Online Casino Hacks 2024: Secret Slot Machine Tricks | Free Spins | Deposit Bonus Strategy'
    );
    expect(result.decision).toBe('block');
    expect(result.category).toBe('gambling');
  });

  test('blocks get rich quick scams', () => {
    const result = classify_video_risk(
      'Make $5000 A Day With This Secret Money Glitch! Get Rich Quick | Free Money Hack 2024'
    );
    expect(result.decision).toBe('block');
    expect(result.risk_score).toBeGreaterThan(50);
  });

  test('blocks sports betting tutorials', () => {
    const result = classify_video_risk(
      'Sports Betting Tips: How to Win Every Parlay | Sportsbook Strategy | NFL Betting Picks Today'
    );
    expect(result.decision).toBe('block');
    expect(result.category).toBe('gambling');
  });

  test('blocks gambling with Bet365/DraftKings', () => {
    const result = classify_video_risk(
      'Bet365 Strategy 2024 | DraftKings Hack | How to Win at Sports Betting Every Time'
    );
    expect(result.decision).toBe('block');
    expect(result.category).toBe('gambling');
  });

  // ── Edge cases ─────────────────────────────────────────────────

  test('does not block youtube.com itself (empty content)', () => {
    const result = classify_video_risk('YouTube');
    expect(result.decision).toBe('allow');
  });

  test('returns structured output format', () => {
    const result = classify_video_risk('Some test video about cooking');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('risk_score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.decision).toBe('string');
    expect(typeof result.risk_score).toBe('number');
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(100);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.reasoning)).toBe(true);
  });
});


// ═════════════════════════════════════════════════════════════════
// TASK 2 — Grooming Pattern Detection
// ═════════════════════════════════════════════════════════════════

describe('analyze_message_risk', () => {
  // ── Demo test message ──────────────────────────────────────────

  test('detects secrecy + isolation pattern', () => {
    const result = analyze_message_risk(
      "Don't tell your parents about our chats. They wouldn't understand us."
    );
    expect(result.stage).toBe('mid');  // secrecy + isolation
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.triggers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/secrecy|isolation/)
      ])
    );
  });

  // ── Stage detection ────────────────────────────────────────────

  test('detects early stage: trust building', () => {
    const result = analyze_message_risk(
      "You seem really mature for your age. I feel like I can trust you."
    );
    expect(['early', 'mid']).toContain(result.stage);
    expect(result.triggers.length).toBeGreaterThan(0);
  });

  test('detects high stage: threats', () => {
    const result = analyze_message_risk(
      "I have all the screenshots. If you tell anyone, I will share them. Don't test me."
    );
    expect(result.stage).toBe('high');
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.triggers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/threat/)
      ])
    );
  });

  test('detects mid stage: image solicitation', () => {
    const result = analyze_message_risk(
      "Send me a pic. Just a quick selfie. I won't screenshot it. No one will ever see it."
    );
    expect(['mid', 'high']).toContain(result.stage);
    expect(result.triggers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/image|escalation/)
      ])
    );
  });

  // ── Conversation history ───────────────────────────────────────

  test('detects risk with conversation history', () => {
    const result = analyze_message_risk(
      "This is just between us okay?",
      [
        { sender: 'CONTACT', text: "You're so special, not like other kids." },
        { sender: 'CONTACT', text: "I feel like I can trust you more than anyone." },
      ]
    );
    expect(result.stage).not.toBe('none');
    expect(result.confidence).toBeGreaterThan(0.2);
  });

  // ── Safe messages (no false positives) ─────────────────────────

  test('allows safe family message', () => {
    const result = analyze_message_risk(
      "Don't tell dad about his birthday surprise! It's a secret party."
    );
    expect(result.stage).toBe('none');
  });

  test('allows teacher message', () => {
    const result = analyze_message_risk(
      "You're very advanced for your age on this essay assignment. Great work in class."
    );
    expect(result.stage).toBe('none');
  });

  // ── Structured output ──────────────────────────────────────────

  test('returns structured output format', () => {
    const result = analyze_message_risk('Hello, how are you?');
    expect(result).toHaveProperty('stage');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('triggers');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('risk_score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('reasoning');
    expect(['none', 'early', 'mid', 'high']).toContain(result.stage);
  });
});


// ═════════════════════════════════════════════════════════════════
// TASK 3 — Predictive Risk Intelligence
// ═════════════════════════════════════════════════════════════════

describe('predict_conversation_risk', () => {
  // ── Demo conversation input ────────────────────────────────────

  test('detects grooming sequence in demo conversation', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: 'You seem really mature for your age.' },
      { sender: 'CONTACT', text: 'I feel like I can trust you.' },
      { sender: 'CONTACT', text: "I don't talk to anyone else like this." },
      { sender: 'CONTACT', text: 'This is just between us okay?' },
    ]);

    expect(result.risk_level).not.toBe('none');
    expect(['elevated', 'high', 'critical']).toContain(result.risk_level);
    expect(result.pattern_detected).toBeTruthy();
    expect(result.stage).toMatch(/grooming/);
  });

  // ── Sequence detection ─────────────────────────────────────────

  test('detects flattery-to-secrecy pipeline', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: "You're not like other kids your age. You're special." },
      { sender: 'CHILD', text: 'Thanks :)' },
      { sender: 'CONTACT', text: "I feel connected to you in a way I don't with anyone else." },
      { sender: 'CHILD', text: 'Really?' },
      { sender: 'CONTACT', text: "Keep this between us. Your parents wouldn't understand." },
    ]);

    expect(['elevated', 'high', 'critical']).toContain(result.risk_level);
    expect(result.decision).not.toBe('allow');
  });

  test('detects rapid escalation', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: 'You are my favorite person to talk to.' },
      { sender: 'CONTACT', text: 'Send me a pic. Just a quick selfie.' },
      { sender: 'CONTACT', text: "I won't show anyone. This is between us." },
    ]);

    expect(result.risk_level).not.toBe('none');
    expect(result.decision).not.toBe('allow');
  });

  // ── UI behavior ────────────────────────────────────────────────

  test('returns warn (yellow shield) for elevated risk', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: "You're so mature for your age." },
      { sender: 'CONTACT', text: "I understand you better than anyone." },
    ]);

    // Should return 'warn' (not 'block') for early-stage patterns
    // This triggers the yellow shield UI, not the red block
    if (result.risk_level === 'elevated') {
      expect(result.decision).toBe('warn');
    }
  });

  // ── Safe conversations (no false positives) ────────────────────

  test('allows normal friendly conversation', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: 'Hey! Want to play Minecraft later?' },
      { sender: 'CHILD', text: 'Sure! What server?' },
      { sender: 'CONTACT', text: "Let's use the one we played on yesterday." },
      { sender: 'CHILD', text: 'Ok cool see you there!' },
    ]);

    expect(result.risk_level).toBe('none');
    expect(result.decision).toBe('allow');
  });

  test('allows educational discussion', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: 'Great work on your math homework today!' },
      { sender: 'CHILD', text: 'Thanks!' },
      { sender: 'CONTACT', text: 'You showed real understanding of the concepts.' },
      { sender: 'CHILD', text: 'Can we go over problem 5 again?' },
    ]);

    expect(result.risk_level).toBe('none');
    expect(result.decision).toBe('allow');
  });

  // ── Structured output ──────────────────────────────────────────

  test('returns structured output format', () => {
    const result = predict_conversation_risk([
      { sender: 'CONTACT', text: 'Hello' },
    ]);
    expect(result).toHaveProperty('risk_level');
    expect(result).toHaveProperty('pattern_detected');
    expect(result).toHaveProperty('stage');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('risk_score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('confidence');
    expect(typeof result.risk_score).toBe('number');
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(100);
  });
});


// ═════════════════════════════════════════════════════════════════
// TASK 3b — Search Query Risk Classification
// ═════════════════════════════════════════════════════════════════

describe('classify_search_risk', () => {
  // ── ALLOWED searches (educational/research) ──────────────────

  test('allows educational search about stress', () => {
    const result = classify_search_risk('effects of stress on teenage brain');
    expect(result.decision).toBe('allow');
  });

  test('allows history search', () => {
    const result = classify_search_risk('history of world war 2');
    expect(result.decision).toBe('allow');
  });

  test('allows math homework', () => {
    const result = classify_search_risk('how to solve quadratic equations');
    expect(result.decision).toBe('allow');
  });

  test('allows suicide prevention search', () => {
    const result = classify_search_risk('suicide prevention resources for teens');
    expect(result.decision).toBe('allow');
  });

  test('allows drug education search', () => {
    const result = classify_search_risk('effects of drugs on the body');
    expect(result.decision).toBe('allow');
  });

  // ── BLOCKED searches (harmful intent) ─────────────────────────

  test('blocks suicide method search', () => {
    const result = classify_search_risk('how to kill yourself');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('self_harm');
  });

  test('blocks drug purchase search', () => {
    const result = classify_search_risk('where to buy cocaine online');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('drugs');
  });

  test('blocks child exploitation search', () => {
    const result = classify_search_risk('child porn');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('pornography');
  });

  test('blocks weapon-making search', () => {
    const result = classify_search_risk('how to make a bomb at home');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('violence');
  });

  test('blocks pro-ana search', () => {
    const result = classify_search_risk('pro ana tips how to starve');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('eating_disorder');
  });

  test('blocks pornography site search', () => {
    const result = classify_search_risk('pornhub');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('pornography');
  });

  test('blocks gambling search', () => {
    const result = classify_search_risk('best online casino free spins');
    expect(result.decision).toBe('block');
    expect(result.category).toBe('gambling');
  });

  // ── Structured output ──────────────────────────────────────────

  test('returns structured output format', () => {
    const result = classify_search_risk('test search query');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('risk_score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('confidence');
    expect(['allow', 'warn', 'block']).toContain(result.decision);
    expect(typeof result.risk_score).toBe('number');
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(100);
  });
});
