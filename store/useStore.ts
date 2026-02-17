import { create } from 'zustand';

interface Device {
    id: string;
    name: string;
    type: 'chrome' | 'edge' | 'brave';
    lastSeen: string;
    status: 'active' | 'offline';
}

interface Alert {
    id: string;
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    category: string;
    timestamp: string;
    actionTaken: 'blocked' | 'warned' | 'allowed';
}

interface AppState {
    // User Session
    isAuthenticated: boolean;
    user: { name: string; email: string } | null;
    login: (name: string, email: string) => void;
    logout: () => void;

    // Onboarding & Pairing
    pairingCode: string | null;
    generatePairingCode: () => void;
    pairingStatus: 'waiting' | 'connected' | 'expired';
    setPairingStatus: (status: 'waiting' | 'connected' | 'expired') => void;
    checkPairingStatus: (code: string) => Promise<boolean>;

    // Dashboard Data
    devices: Device[];
    addDevice: (device: Device) => void;
    removeDevice: (id: string) => void;

    alerts: Alert[];
    fetchAlerts: () => Promise<void>;
    addAlert: (alert: Alert) => void;
    clearAlerts: () => Promise<void>;

    // Policy / Settings
    ageGroup: number;
    setAgeGroup: (age: number) => void;
}

/**
 * Fetch alerts directly from the Phylax extension via the bridge.js content script.
 * The bridge uses window.postMessage to communicate between the web page and the extension.
 * Returns null if the extension is not installed or doesn't respond.
 */
function fetchAlertsFromExtension(): Promise<Alert[] | null> {
    return new Promise((resolve) => {
        // Guard: only runs in browser
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            resolve(null);
            return;
        }

        // Check if the extension bridge is present
        if (!document.documentElement.hasAttribute('data-phylax-extension')) {
            console.log('[Store] Extension not detected (no data-phylax-extension attribute)');
            resolve(null);
            return;
        }

        // Set up a one-time listener for the response
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            console.log('[Store] Extension bridge timeout — no response');
            resolve(null);
        }, 3000); // 3 second timeout

        function handler(event: MessageEvent) {
            if (event.source !== window) return;
            if (!event.data || event.data.type !== 'PHYLAX_GET_ACTIVITY_RESPONSE') return;

            clearTimeout(timeout);
            window.removeEventListener('message', handler);

            if (event.data.success && event.data.alerts) {
                // Format timestamps as relative time
                const now = Date.now();
                const formatted = event.data.alerts.map((alert: Alert & { timestamp: string }) => ({
                    ...alert,
                    timestamp: formatRelativeTime(alert.timestamp, now),
                }));
                resolve(formatted);
            } else {
                resolve(null);
            }
        }

        window.addEventListener('message', handler);

        // Send the request via postMessage (bridge.js will relay to background.js)
        window.postMessage({ type: 'PHYLAX_GET_ACTIVITY', limit: 50 }, '*');
    });
}

/** Format an ISO timestamp as a relative time string */
function formatRelativeTime(isoString: string, now: number = Date.now()): string {
    const date = new Date(isoString).getTime();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return new Date(isoString).toLocaleDateString();
}

export const useStore = create<AppState>((set) => ({
    isAuthenticated: false,
    user: null,
    login: (name, email) => set({ isAuthenticated: true, user: { name, email } }),
    logout: () => set({ isAuthenticated: false, user: null }),

    driverId: null, // Placeholder if needed

    // Onboarding & Pairing
    pairingCode: null,
    generatePairingCode: async () => {
        try {
            const res = await fetch('/api/pairing/generate', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                set({ pairingCode: data.short_code, pairingStatus: 'waiting' });
                return data.short_code;
            }
        } catch (e) {
            console.error("Failed to generate code", e);
        }
        // Fallback
        const mockCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        set({ pairingCode: mockCode, pairingStatus: 'waiting' });
        return mockCode;
    },
    pairingStatus: 'waiting',
    setPairingStatus: (status) => set({ pairingStatus: status }),

    checkPairingStatus: async (code: string) => {
        try {
            const res = await fetch(`/api/pairing/status?code=${code}`);
            if (res.ok) {
                const data = await res.json();
                if (data.paired) {
                    set((state) => ({
                        pairingStatus: 'connected',
                        devices: [...(state.devices || []), {
                            id: data.device_id || 'dev_' + Date.now(),
                            name: 'Chrome Extension',
                            type: 'chrome',
                            lastSeen: 'Just now',
                            status: 'active'
                        }]
                    }));
                    return true;
                }
            }
        } catch (e) {
            console.error("Check status failed", e);
        }
        return false;
    },

    devices: [],
    addDevice: (device) => {
        console.log("Store: Adding device", device);
        set((state) => ({
            devices: [...(state.devices || []), device],
            pairingStatus: 'connected'
        }));
    },
    removeDevice: (id) => set((state) => ({ devices: state.devices.filter(d => d.id !== id) })),

    alerts: [],
    fetchAlerts: async () => {
        // Strategy 1: Try reading directly from the extension via bridge.js
        // This bypasses the server entirely and works in demo mode without Supabase
        const extensionAlerts = await fetchAlertsFromExtension();
        if (extensionAlerts && extensionAlerts.length > 0) {
            console.log(`[Store] Got ${extensionAlerts.length} alerts from extension bridge`);
            set({ alerts: extensionAlerts });
            return;
        }

        // Strategy 2: Fall back to server API (works with Supabase in production)
        try {
            const res = await fetch('/api/activity');
            if (res.ok) {
                const data = await res.json();
                if (data.alerts && data.alerts.length > 0) {
                    set({ alerts: data.alerts });
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to fetch alerts from server", e);
        }
    },
    addAlert: (alert: Alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
    clearAlerts: async () => {
        set({ alerts: [] });

        // Clear extension storage if present
        if (typeof window !== 'undefined' && document.documentElement.hasAttribute('data-phylax-extension')) {
            window.postMessage({ type: 'PHYLAX_CLEAR_ACTIVITY' }, '*');
        }

        // Clear server/mock storage
        try {
            await fetch('/api/activity', { method: 'DELETE' });
        } catch (e) {
            console.error("Failed to clear server alerts", e);
        }
    },

    ageGroup: 2, // Default to 8-11 "Guided Internet"
    setAgeGroup: (age) => set({ ageGroup: age }),
}));
