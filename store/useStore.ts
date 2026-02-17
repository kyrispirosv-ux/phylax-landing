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
    addAlert: (alert: Alert) => void;

    // Policy / Settings
    ageGroup: number;
    setAgeGroup: (age: number) => void;
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

    alerts: [
        {
            id: '1', title: 'Gambling Site Blocked', description: 'Attempted access to poker-online.com', severity: 'high', category: 'Gambling', timestamp: '10 mins ago', actionTaken: 'blocked'
        },
        {
            id: '2', title: 'Suspicious DM Detected', description: 'Pattern matching "Let\'s keep this secret" in Instagram DM', severity: 'medium', category: 'Grooming', timestamp: '2 hours ago', actionTaken: 'warned'
        }
    ],
    addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),

    ageGroup: 2, // Default to 8-11 "Guided Internet"
    setAgeGroup: (age) => set({ ageGroup: age }),
}));
