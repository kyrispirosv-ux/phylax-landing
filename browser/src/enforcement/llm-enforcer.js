// Phylax SafeGuard — LLM Enforcer v1.0
// Action space: allow / blur / block / block_and_alert / warn / educational_redirect / queue_for_review
// Intercepts LLM response content and applies enforcement overlays.
// Streaming-aware: shows "Phylax is reviewing..." while Agent 1 buffers tokens.
// Works on: ChatGPT, Claude, Gemini, Copilot, Poe, Perplexity.

(function () {
  'use strict';

  // Only run on LLM sites
  const host = window.location.hostname;
  const LLM_DOMAINS = {
    'chat.openai.com': 'chatgpt',
    'chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'copilot.microsoft.com': 'copilot',
    'poe.com': 'poe',
    'perplexity.ai': 'perplexity',
  };

  const platform = Object.entries(LLM_DOMAINS).find(([d]) => host === d || host.endsWith('.' + d));
  if (!platform) return;

  const platformName = platform[1];

  // ── State ──────────────────────────────────────────────────────
  let activeOverlays = new Map(); // responseId -> overlay element
  let reviewingIndicators = new Map(); // responseId -> reviewing spinner element
  let enforcedResponses = new Set(); // responseId -> already enforced
  const DEDUP_MS = 300;
  let lastEnforceTime = 0;

  // ── SVG Constants ──────────────────────────────────────────────
  const PHYLAX_LOGO_SVG = `<svg width="56" height="56" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="phylax-bg-llm" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#2B1766"/><stop offset="1" stop-color="#0E2847"/></linearGradient>
      <linearGradient id="phylax-spiral-llm" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="0.65" stop-color="#E8D5A0"/><stop offset="1" stop-color="#C9A84C"/></linearGradient>
    </defs>
    <rect width="512" height="512" rx="112" fill="url(#phylax-bg-llm)"/>
    <rect x="6" y="6" width="500" height="500" rx="108" stroke="#C9A84C" stroke-width="2" fill="none" opacity="0.35"/>
    <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198" stroke="url(#phylax-spiral-llm)" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
  </svg>`;

  const PHYLAX_STYLES = `
    @keyframes phylaxLlmFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes phylaxLlmSpinnerRotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes phylaxLlmPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes phylaxLlmBlurReveal {
      from { filter: blur(12px); }
      to { filter: blur(0); }
    }
  `;

  // Inject global styles once
  const styleEl = document.createElement('style');
  styleEl.textContent = PHYLAX_STYLES;
  (document.head || document.documentElement).appendChild(styleEl);

  // ── Listen for LLM decisions from background ──────────────────
  window.addEventListener('phylax-llm-decision', (e) => {
    enforceLlm(e.detail);
  });

  // Also listen via chrome.runtime for decisions routed through background.js
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PHYLAX_LLM_DECISION') {
        enforceLlm(message.decision);
      }
      if (message.type === 'PHYLAX_LLM_REVIEWING') {
        showReviewingIndicator(message.responseId, message.responseElement);
      }
    });
  } catch { /* not in extension context */ }

  // ── Main enforce router ───────────────────────────────────────
  function enforceLlm(decision) {
    if (!decision) return;

    const action = decision.action || decision.decision || 'allow';
    const responseId = decision.response_id || decision.responseId || generateResponseId();
    const now = Date.now();

    if (now - lastEnforceTime < DEDUP_MS && enforcedResponses.has(responseId)) {
      return;
    }
    lastEnforceTime = now;
    enforcedResponses.add(responseId);

    // Clear any "reviewing" indicator for this response
    clearReviewingIndicator(responseId);

    console.log(`[Phylax LLM Enforcer] Action: ${action} for response ${responseId} on ${platformName}`);

    const responseEl = decision.responseElement || findLatestResponseElement();
    if (!responseEl && action !== 'allow') {
      console.warn('[Phylax LLM Enforcer] Could not locate response element');
      return;
    }

    switch (action) {
      case 'allow':
        revealContent(responseId, responseEl);
        break;
      case 'blur':
        showBlurOverlay(responseId, responseEl, decision);
        break;
      case 'block':
        showBlockOverlay(responseId, responseEl, decision);
        break;
      case 'block_and_alert':
        showBlockOverlay(responseId, responseEl, decision);
        sendParentAlert(decision, 'critical');
        break;
      case 'warn':
        showWarnBanner(responseId, responseEl, decision);
        break;
      case 'educational_redirect':
        showEducationalRedirect(responseId, responseEl, decision);
        break;
      case 'queue_for_review':
        showQueuedIndicator(responseId, responseEl, decision);
        break;
      default:
        revealContent(responseId, responseEl);
    }

    // Log the event
    logLlmEvent(decision, action);
  }

  // ═════════════════════════════════════════════════════════════════
  // STREAMING UX — "Phylax is reviewing..." spinner
  // ═════════════════════════════════════════════════════════════════

  function showReviewingIndicator(responseId, responseEl) {
    if (reviewingIndicators.has(responseId)) return;

    const target = responseEl || findLatestResponseElement();
    if (!target) return;

    // Reserve space — match the element's current dimensions
    const rect = target.getBoundingClientRect();
    const wrapper = document.createElement('div');
    wrapper.className = 'phylax-llm-reviewing';
    wrapper.dataset.phylaxResponseId = responseId;
    wrapper.style.cssText = `
      position: relative;
      min-height: ${Math.max(rect.height, 60)}px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: phylaxLlmFadeIn 0.2s ease;
    `;

    // Hide original content while reviewing
    target.style.visibility = 'hidden';
    target.style.position = 'relative';

    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(15, 21, 37, 0.85);
      border-radius: 12px;
      border: 1px solid rgba(124, 92, 255, 0.15);
      z-index: 10;
      backdrop-filter: blur(4px);
    `;
    indicator.innerHTML = `
      <div style="width: 18px; height: 18px; border: 2px solid rgba(124,92,255,0.3); border-top-color: #7C5CFF; border-radius: 50%; animation: phylaxLlmSpinnerRotate 0.8s linear infinite;"></div>
      <span style="font-size: 13px; color: rgba(255,255,255,0.6); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; animation: phylaxLlmPulse 2s ease-in-out infinite;">Phylax is reviewing...</span>
    `;

    wrapper.appendChild(indicator);
    target.parentElement.insertBefore(wrapper, target.nextSibling);

    reviewingIndicators.set(responseId, { wrapper, target });
  }

  function clearReviewingIndicator(responseId) {
    const indicator = reviewingIndicators.get(responseId);
    if (indicator) {
      indicator.target.style.visibility = '';
      indicator.wrapper.remove();
      reviewingIndicators.delete(responseId);
    }
    // Also clear any indicators found in DOM
    document.querySelectorAll(`.phylax-llm-reviewing[data-phylax-response-id="${responseId}"]`).forEach(el => el.remove());
  }

  // ═════════════════════════════════════════════════════════════════
  // ALLOW — Reveal content normally
  // ═════════════════════════════════════════════════════════════════

  function revealContent(responseId, responseEl) {
    // Remove any existing overlay for this response
    const existing = activeOverlays.get(responseId);
    if (existing) {
      existing.remove();
      activeOverlays.delete(responseId);
    }
    if (responseEl) {
      responseEl.style.visibility = '';
      responseEl.style.filter = '';
      responseEl.style.pointerEvents = '';
      responseEl.style.userSelect = '';
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // BLOCK — Full block overlay over response
  // ═════════════════════════════════════════════════════════════════

  function showBlockOverlay(responseId, responseEl, decision) {
    clearExistingOverlay(responseId);

    const reasonSummary = buildReasonSummary(decision);

    // Hide the actual response content
    responseEl.style.visibility = 'hidden';
    responseEl.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'phylax-llm-block-overlay';
    overlay.dataset.phylaxResponseId = responseId;
    overlay.style.cssText = `
      position: relative;
      width: 100%;
      min-height: 120px;
      background: rgba(5, 5, 10, 0.98);
      border: 1px solid rgba(124, 92, 255, 0.25);
      border-radius: 16px;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: phylaxLlmFadeIn 0.3s ease;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      margin: 8px 0;
    `;

    overlay.innerHTML = `
      <div style="width: 48px; height: 48px; margin-bottom: 14px;">
        ${PHYLAX_LOGO_SVG}
      </div>
      <div style="font-size: 16px; font-weight: 700; color: white; margin-bottom: 6px;">
        This response was filtered by Phylax
      </div>
      <div style="font-size: 13px; color: rgba(255,255,255,0.45); line-height: 1.6; margin-bottom: 20px; max-width: 400px;">
        ${reasonSummary}
      </div>
      <button class="phylax-llm-request-access-btn" style="
        padding: 10px 24px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        background: linear-gradient(135deg, #7C5CFF, rgba(124, 92, 255, 0.8));
        color: white;
        box-shadow: 0 4px 16px rgba(124, 92, 255, 0.3);
        font-family: inherit;
        transition: all 0.2s;
      ">Request Access</button>
    `;

    // Insert overlay after the hidden response
    responseEl.parentElement.insertBefore(overlay, responseEl.nextSibling);
    activeOverlays.set(responseId, overlay);

    // Request Access handler
    const accessBtn = overlay.querySelector('.phylax-llm-request-access-btn');
    if (accessBtn) {
      accessBtn.addEventListener('click', () => {
        requestAccess(decision);
        accessBtn.textContent = 'Request Sent';
        accessBtn.style.background = 'rgba(124, 92, 255, 0.2)';
        accessBtn.style.cursor = 'default';
        accessBtn.disabled = true;
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // BLUR — Gaussian blur with click-through
  // ═════════════════════════════════════════════════════════════════

  function showBlurOverlay(responseId, responseEl, decision) {
    clearExistingOverlay(responseId);

    // Apply CSS blur to the response content
    responseEl.style.filter = 'blur(12px)';
    responseEl.style.pointerEvents = 'none';
    responseEl.style.userSelect = 'none';
    responseEl.style.position = 'relative';
    responseEl.style.transition = 'filter 0.4s ease';

    const overlay = document.createElement('div');
    overlay.className = 'phylax-llm-blur-overlay';
    overlay.dataset.phylaxResponseId = responseId;
    overlay.style.cssText = `
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      margin: 4px 0;
      cursor: pointer;
      animation: phylaxLlmFadeIn 0.3s ease;
    `;

    const clickThrough = document.createElement('div');
    clickThrough.style.cssText = `
      background: rgba(15, 21, 37, 0.7);
      border: 1px solid rgba(124, 92, 255, 0.2);
      border-radius: 12px;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      transition: all 0.2s;
      backdrop-filter: blur(4px);
    `;
    clickThrough.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(124,92,255,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span style="font-size: 13px; color: rgba(255,255,255,0.6); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        This content may not be appropriate. Click to view.
      </span>
    `;
    clickThrough.addEventListener('mouseenter', () => {
      clickThrough.style.background = 'rgba(15, 21, 37, 0.85)';
      clickThrough.style.borderColor = 'rgba(124, 92, 255, 0.4)';
    });
    clickThrough.addEventListener('mouseleave', () => {
      clickThrough.style.background = 'rgba(15, 21, 37, 0.7)';
      clickThrough.style.borderColor = 'rgba(124, 92, 255, 0.2)';
    });

    clickThrough.addEventListener('click', () => {
      responseEl.style.filter = '';
      responseEl.style.pointerEvents = '';
      responseEl.style.userSelect = '';
      responseEl.style.animation = 'phylaxLlmBlurReveal 0.4s ease';
      overlay.remove();
      activeOverlays.delete(responseId);

      // Log the reveal
      logLlmEvent({
        ...decision,
        event_type: 'llm_blur_revealed',
      }, 'blur_revealed');
    });

    overlay.appendChild(clickThrough);
    responseEl.parentElement.insertBefore(overlay, responseEl.nextSibling);
    activeOverlays.set(responseId, overlay);
  }

  // ═════════════════════════════════════════════════════════════════
  // WARN — Banner warning above response
  // ═════════════════════════════════════════════════════════════════

  function showWarnBanner(responseId, responseEl, decision) {
    clearExistingOverlay(responseId);

    const reasonSummary = buildReasonSummary(decision);

    const banner = document.createElement('div');
    banner.className = 'phylax-llm-warn-banner';
    banner.dataset.phylaxResponseId = responseId;
    banner.style.cssText = `
      width: 100%;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 6px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: phylaxLlmFadeIn 0.3s ease;
    `;
    banner.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style="font-size: 13px; color: rgba(245, 158, 11, 0.9); line-height: 1.5;">
        ${reasonSummary}
      </span>
      <button class="phylax-llm-warn-dismiss" style="
        margin-left: auto;
        background: none;
        border: none;
        color: rgba(245, 158, 11, 0.5);
        cursor: pointer;
        font-size: 16px;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
      ">&times;</button>
    `;

    const dismissBtn = banner.querySelector('.phylax-llm-warn-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-4px)';
        banner.style.transition = 'all 0.2s ease';
        setTimeout(() => {
          banner.remove();
          activeOverlays.delete(responseId);
        }, 200);
      });
    }

    // Insert banner BEFORE the response content
    responseEl.parentElement.insertBefore(banner, responseEl);
    activeOverlays.set(responseId, banner);
  }

  // ═════════════════════════════════════════════════════════════════
  // EDUCATIONAL REDIRECT — Replace content with age-appropriate explanation
  // ═════════════════════════════════════════════════════════════════

  function showEducationalRedirect(responseId, responseEl, decision) {
    clearExistingOverlay(responseId);

    const educationalContent = decision.educational_content || buildEducationalContent(decision);

    // Hide the actual response
    responseEl.style.visibility = 'hidden';
    responseEl.style.position = 'relative';
    responseEl.style.height = '0';
    responseEl.style.overflow = 'hidden';

    const redirect = document.createElement('div');
    redirect.className = 'phylax-llm-educational-redirect';
    redirect.dataset.phylaxResponseId = responseId;
    redirect.style.cssText = `
      width: 100%;
      background: rgba(15, 21, 37, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 16px;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: phylaxLlmFadeIn 0.3s ease;
      margin: 8px 0;
    `;
    redirect.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span style="font-size: 15px; font-weight: 600; color: white;">
          Let's learn about this differently
        </span>
      </div>
      <div style="font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 16px;">
        ${educationalContent}
      </div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.25); display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Redirected by Phylax for your safety
      </div>
    `;

    responseEl.parentElement.insertBefore(redirect, responseEl.nextSibling);
    activeOverlays.set(responseId, redirect);
  }

  // ═════════════════════════════════════════════════════════════════
  // QUEUE FOR REVIEW — Subtle "flagged" indicator
  // ═════════════════════════════════════════════════════════════════

  function showQueuedIndicator(responseId, responseEl, decision) {
    clearExistingOverlay(responseId);

    const indicator = document.createElement('div');
    indicator.className = 'phylax-llm-queued-indicator';
    indicator.dataset.phylaxResponseId = responseId;
    indicator.style.cssText = `
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      margin: 4px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: phylaxLlmFadeIn 0.3s ease;
    `;
    indicator.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(124,92,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span style="font-size: 11px; color: rgba(124,92,255,0.4);">Flagged for parent review</span>
    `;

    // Insert after the response
    responseEl.parentElement.insertBefore(indicator, responseEl.nextSibling);
    activeOverlays.set(responseId, indicator);
  }

  // ═════════════════════════════════════════════════════════════════
  // RESPONSE ELEMENT DETECTION — Platform-specific
  // ═════════════════════════════════════════════════════════════════

  function findLatestResponseElement() {
    switch (platformName) {
      case 'chatgpt':
        return findChatGPTResponse();
      case 'claude':
        return findClaudeResponse();
      case 'gemini':
        return findGeminiResponse();
      case 'copilot':
        return findCopilotResponse();
      case 'poe':
        return findPoeResponse();
      case 'perplexity':
        return findPerplexityResponse();
      default:
        return findGenericResponse();
    }
  }

  function findChatGPTResponse() {
    // ChatGPT uses data-message-author-role="assistant" for responses
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (messages.length > 0) return messages[messages.length - 1];
    // Fallback: look for the markdown container in the last assistant message
    const markdownEls = document.querySelectorAll('.markdown.prose');
    if (markdownEls.length > 0) return markdownEls[markdownEls.length - 1];
    return null;
  }

  function findClaudeResponse() {
    // Claude uses [data-is-streaming] during streaming, and font-claude-message for completed
    const messages = document.querySelectorAll('[class*="font-claude-message"]');
    if (messages.length > 0) return messages[messages.length - 1];
    // Fallback: look for response containers
    const responses = document.querySelectorAll('[data-testid*="response"], [class*="response"]');
    if (responses.length > 0) return responses[responses.length - 1];
    // Final fallback: prose blocks
    const prose = document.querySelectorAll('.prose');
    if (prose.length > 0) return prose[prose.length - 1];
    return null;
  }

  function findGeminiResponse() {
    // Gemini uses message-content for responses
    const messages = document.querySelectorAll('message-content, [class*="response-container"], .model-response-text');
    if (messages.length > 0) return messages[messages.length - 1];
    // Fallback
    const markdownEls = document.querySelectorAll('.markdown-main-panel, .markdown');
    if (markdownEls.length > 0) return markdownEls[markdownEls.length - 1];
    return null;
  }

  function findCopilotResponse() {
    const messages = document.querySelectorAll('[class*="response"], [class*="answer"]');
    if (messages.length > 0) return messages[messages.length - 1];
    return null;
  }

  function findPoeResponse() {
    const messages = document.querySelectorAll('[class*="Message_botMessage"], [class*="botMessage"]');
    if (messages.length > 0) return messages[messages.length - 1];
    return null;
  }

  function findPerplexityResponse() {
    const messages = document.querySelectorAll('[class*="answer"], [class*="prose"]');
    if (messages.length > 0) return messages[messages.length - 1];
    return null;
  }

  function findGenericResponse() {
    // Generic: look for the last large text block that looks like an AI response
    const candidates = document.querySelectorAll('.prose, .markdown, [class*="response"], [class*="answer"], [class*="message"]');
    if (candidates.length > 0) return candidates[candidates.length - 1];
    return null;
  }

  // ═════════════════════════════════════════════════════════════════
  // HELPERS
  // ═════════════════════════════════════════════════════════════════

  function clearExistingOverlay(responseId) {
    const existing = activeOverlays.get(responseId);
    if (existing) {
      existing.remove();
      activeOverlays.delete(responseId);
    }
  }

  function generateResponseId() {
    return 'phylax-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  }

  function buildReasonSummary(decision) {
    // Smart, human-readable explanations
    const explanation = decision.explanation || decision.reason || null;
    if (explanation) return escapeHtml(explanation);

    const reasonCode = decision.reason_code || '';
    const REASON_MAP = {
      'WEAPONS_CONSTRUCTION': 'This response appeared to provide actionable weapon-construction guidance.',
      'EXPLICIT_CONTENT': 'This response contained sexually explicit content that is not appropriate.',
      'SELF_HARM': 'This response contained content related to self-harm or suicide. If you need help, please talk to a trusted adult.',
      'DRUGS_SYNTHESIS': 'This response appeared to provide instructions for creating dangerous substances.',
      'GROOMING_PATTERN': 'This response exhibited patterns associated with online grooming behavior.',
      'EXPLOITATION': 'This response contained content that could be used for exploitation.',
      'VIOLENCE_DETAILED': 'This response contained detailed violent content that is not appropriate.',
      'HATE_SPEECH': 'This response contained hateful or discriminatory language.',
      'PERSONA_BYPASS': 'This response attempted to bypass safety guidelines through a persona or roleplay.',
      'JAILBREAK_ATTEMPT': 'A prompt injection or jailbreak attempt was detected in this conversation.',
      'TOPIC_BLOCKED': 'This topic has been blocked by your family\'s safety settings.',
      'CAPABILITY_BLOCKED': 'This AI capability has been restricted by your family\'s safety settings.',
    };

    if (REASON_MAP[reasonCode]) return REASON_MAP[reasonCode];

    // Fallback based on category
    const category = decision.category || '';
    if (category) return `This response was filtered because it relates to: ${escapeHtml(category)}.`;

    return "This response was filtered by your family's safety settings.";
  }

  function buildEducationalContent(decision) {
    const category = decision.category || decision.reason_code || 'this topic';
    const age = decision.child_age || decision.tier || 'young person';

    return escapeHtml(
      `The AI's response to your question touched on a topic that your family has chosen to ` +
      `filter. This is not about limiting your curiosity — it is about making sure you get ` +
      `information in a safe and age-appropriate way. If you are curious about ${category}, ` +
      `consider talking to a parent, teacher, or trusted adult who can help you understand ` +
      `it in the right context.`
    );
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function requestAccess(decision) {
    try {
      chrome.runtime.sendMessage({
        type: 'PHYLAX_ACCESS_REQUEST',
        request: {
          url: window.location.href,
          domain: window.location.hostname,
          platform: platformName,
          reason_code: decision.reason_code || 'LLM_RESPONSE_BLOCKED',
          context: 'llm_response',
          rule_id: decision.rule_id || null,
          timestamp: Date.now(),
        },
      });
    } catch { /* not in extension context */ }
  }

  function sendParentAlert(decision, level) {
    const alertLevel = level || 'concerning';

    try {
      chrome.runtime.sendMessage({
        type: 'PHYLAX_PARENT_ALERT',
        alert: {
          alert_type: 'LLM_RESPONSE_BLOCKED',
          severity: alertLevel,
          url: window.location.href,
          domain: window.location.hostname,
          platform: platformName,
          reason_code: decision.reason_code || 'LLM_CONTENT_VIOLATION',
          confidence: decision.confidence || 0,
          // Truncated snippet only — never full response for privacy
          snippet: decision.snippet || null,
          explanation: buildReasonSummary(decision),
          evidence: decision.evidence || [],
          timestamp: Date.now(),
        },
      });
    } catch { /* not in extension context */ }
  }

  function logLlmEvent(decision, action) {
    const eventType = mapActionToEventType(action);

    try {
      chrome.runtime.sendMessage({
        type: 'PHYLAX_LOG_EVENT',
        event: {
          event_type: eventType,
          domain: window.location.hostname,
          url: window.location.href,
          category: decision.category || null,
          rule_id: decision.rule_id || null,
          reason_code: decision.reason_code || null,
          confidence: decision.confidence || null,
          metadata: {
            platform: platformName,
            action: action,
            // Truncated snippet only — never full responses
            snippet: decision.snippet || null,
            explanation: decision.explanation || null,
          },
        },
      });
    } catch { /* not in extension context */ }
  }

  function mapActionToEventType(action) {
    switch (action) {
      case 'block':
      case 'block_and_alert':
        return 'llm_response_blocked';
      case 'blur':
        return 'llm_response_blocked';
      case 'blur_revealed':
        return 'llm_blur_revealed';
      case 'warn':
        return 'llm_pattern_detected';
      case 'educational_redirect':
        return 'llm_response_blocked';
      case 'queue_for_review':
        return 'llm_pattern_detected';
      case 'allow':
        return 'llm_allowed';
      default:
        return 'llm_allowed';
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // MUTATION OBSERVER — Detect new responses being streamed
  // ═════════════════════════════════════════════════════════════════

  let observerActive = false;

  function startResponseObserver() {
    if (observerActive) return;
    observerActive = true;

    const conversationContainer = findConversationContainer();
    if (!conversationContainer) {
      // Retry after DOM settles
      setTimeout(startResponseObserver, 2000);
      observerActive = false;
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if this is a new assistant/bot response
          if (isResponseElement(node)) {
            const responseId = generateResponseId();
            node.dataset.phylaxResponseId = responseId;

            // Notify background that a new response is appearing
            try {
              chrome.runtime.sendMessage({
                type: 'PHYLAX_LLM_NEW_RESPONSE',
                responseId: responseId,
                platform: platformName,
                url: window.location.href,
              });
            } catch { /* not in extension context */ }
          }
        }
      }
    });

    observer.observe(conversationContainer, {
      childList: true,
      subtree: true,
    });
  }

  function findConversationContainer() {
    switch (platformName) {
      case 'chatgpt':
        return document.querySelector('[class*="react-scroll-to-bottom"]') ||
               document.querySelector('main') ||
               document.querySelector('[role="main"]');
      case 'claude':
        return document.querySelector('[class*="conversation"]') ||
               document.querySelector('main');
      case 'gemini':
        return document.querySelector('[class*="conversation-container"]') ||
               document.querySelector('main');
      default:
        return document.querySelector('main') || document.body;
    }
  }

  function isResponseElement(node) {
    if (!node.getAttribute) return false;

    switch (platformName) {
      case 'chatgpt':
        return node.getAttribute('data-message-author-role') === 'assistant' ||
               node.querySelector?.('[data-message-author-role="assistant"]');
      case 'claude':
        return node.classList?.contains('font-claude-message') ||
               node.querySelector?.('[class*="font-claude-message"]');
      case 'gemini':
        return node.tagName === 'MESSAGE-CONTENT' ||
               node.querySelector?.('message-content');
      default:
        return false;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═════════════════════════════════════════════════════════════════

  // Start observing for new responses when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startResponseObserver, 1000);
    });
  } else {
    setTimeout(startResponseObserver, 1000);
  }

  console.log(`[Phylax LLM Enforcer v1] Ready on ${platformName} (${host})`);
})();
