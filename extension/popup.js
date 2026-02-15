document.addEventListener('DOMContentLoaded', async () => {
    const pairingSection = document.getElementById('pairing-section');
    const connectedSection = document.getElementById('connected-section');
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    const connectBtn = document.getElementById('connect-btn');
    const codeInput = document.getElementById('pairing-code');

    // Check current status
    const { phylaxPairing } = await chrome.storage.local.get('phylaxPairing');

    if (phylaxPairing && phylaxPairing.connected) {
        showConnectedState();
    } else {
        showDisconnectedState();
    }

    connectBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code.length < 4) return;

        connectBtn.innerText = 'Connecting...';

        // Simulate API verification delay
        setTimeout(async () => {
            // Save pairing state
            await chrome.storage.local.set({
                phylaxPairing: {
                    connected: true,
                    code: code,
                    timestamp: Date.now()
                }
            });

            showConnectedState();

            // Notify background to start syncing
            chrome.runtime.sendMessage({ type: 'PHYLAX_PAIR_DEVICE', code });
        }, 1000);
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
