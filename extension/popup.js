document.addEventListener('DOMContentLoaded', async () => {
    const pairingSection = document.getElementById('pairing-section');
    const connectedSection = document.getElementById('connected-section');
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    const connectBtn = document.getElementById('connect-btn');
    const errorMsg = document.getElementById('error-msg');
    const digits = document.querySelectorAll('.code-digit');

    // ── 6-digit code input behavior ──

    digits.forEach((input, i) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val;
            if (val && i < digits.length - 1) digits[i + 1].focus();
            updateButton();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && i > 0) {
                digits[i - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            for (let j = 0; j < Math.min(paste.length, 6); j++) {
                digits[j].value = paste[j];
            }
            if (paste.length >= 6) digits[5].focus();
            updateButton();
        });
    });

    function getCode() {
        return Array.from(digits).map(d => d.value).join('');
    }

    function updateButton() {
        connectBtn.disabled = getCode().length !== 6;
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }

    function hideError() {
        errorMsg.style.display = 'none';
    }

    // ── API base discovery (same logic as pairing.js / backend-sync.js) ──

    async function getApiBase() {
        const stored = await chrome.storage.local.get(['phylaxDashboardUrl']);
        if (stored.phylaxDashboardUrl) return stored.phylaxDashboardUrl;

        const candidates = [
            'https://app.phylax.ai',
            'https://phylax-landing.vercel.app',
            'http://localhost:3000',
        ];

        for (const url of candidates) {
            try {
                const res = await fetch(`${url}/api/extension/ping`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    await chrome.storage.local.set({ phylaxDashboardUrl: url });
                    return url;
                }
            } catch { /* try next */ }
        }

        return candidates[0];
    }

    // ── Check current pairing status ──

    const { phylaxPaired } = await chrome.storage.local.get('phylaxPaired');
    if (phylaxPaired) {
        showConnectedState();
    } else {
        showDisconnectedState();
        digits[0].focus();
    }

    // ── Pair via real API ──

    connectBtn.addEventListener('click', async () => {
        const code = getCode();
        if (code.length !== 6) return;

        hideError();
        connectBtn.disabled = true;
        connectBtn.innerText = 'Connecting...';

        try {
            const base = await getApiBase();
            const res = await fetch(`${base}/api/pairing/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    short_code: code,
                    device_name: 'Chrome Browser',
                    platform: 'chrome',
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Pairing failed (HTTP ${res.status})`);
            }

            const result = await res.json();

            // Store device credentials + auth token
            await chrome.storage.local.set({
                phylaxDeviceId: result.device_id,
                phylaxChildId: result.child_id,
                phylaxFamilyId: result.family_id,
                phylaxPolicyVersion: result.policy_version,
                phylaxAuthToken: result.auth_token || null,
                phylaxPaired: true,
            });

            // Store policy pack / rules if returned
            if (result.policy_pack) {
                const rules = result.policy_pack.rules.map(r => r.text);
                await chrome.storage.local.set({
                    phylaxRules: JSON.stringify(rules),
                    phylaxProfile: result.policy_pack.tier,
                    phylaxPolicyPack: JSON.stringify(result.policy_pack),
                });

                // Tell background to recompile policy
                try {
                    chrome.runtime.sendMessage({ type: 'PHYLAX_SYNC_RULES', rules });
                } catch { /* background may not be ready */ }
            }

            // Tell background to start sync timers
            try {
                chrome.runtime.sendMessage({ type: 'PHYLAX_PAIR_DEVICE', code });
            } catch { /* ok */ }

            showConnectedState();
        } catch (err) {
            showError(err.message || 'Could not connect. Check code and try again.');
            connectBtn.disabled = false;
            connectBtn.innerText = 'Connect Device';
        }
    });

    function showConnectedState() {
        pairingSection.style.display = 'none';
        connectedSection.style.display = 'block';
        statusText.innerText = 'Protection Active';
        statusIcon.style.background = '#34D399';
        statusIcon.style.boxShadow = '0 0 8px rgba(52,211,153,0.4)';
    }

    function showDisconnectedState() {
        pairingSection.style.display = 'block';
        connectedSection.style.display = 'none';
        statusText.innerText = 'Not Connected';
        statusIcon.style.background = '#FBBF24';
        statusIcon.style.boxShadow = '0 0 8px rgba(251,191,36,0.4)';
        connectBtn.innerText = 'Connect Device';
    }
});
