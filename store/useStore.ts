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
            // TODO: Get actual child_id from auth context or let API find default
            // For now sending empty object, API handles default child lookup for parent
            const res = await fetch('/api/pairing/generate', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (res.ok) {
                const data = await res.json();
                set({ pairingCode: data.short_code, pairingStatus: 'waiting' });
                return data.short_code;
            }
        } catch (error) {
            console.error('Failed to generate code', error);
        }
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
                        devices: [...state.devices, {
                            id: data.device_id,
                            name: 'New Device', // API doesn't return name in status, can fetch device details if needed
                            type: 'chrome',
                            lastSeen: 'Just now',
                            status: 'active'
                        }]
                    }));
                    return true;
                }
            }
        } catch (error) {
            console.error('Failed to check status', error);
        }
        return false;
    },

    devices: [],
    addDevice: (device) => set((state) => ({ devices: [...state.devices, device], pairingStatus: 'connected' })),
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
}));
