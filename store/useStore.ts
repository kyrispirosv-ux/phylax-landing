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
        // Mock implementation for demo/frontend-only mode
        const mockCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        set({ pairingCode: mockCode, pairingStatus: 'waiting' });
        return mockCode;
    },
    pairingStatus: 'waiting',
    setPairingStatus: (status) => set({ pairingStatus: status }),

    checkPairingStatus: async (code: string) => {
        // Mock implementation
        // Simulate a successful pairing check occasionally or always for demo
        // For now, let's just log it. The UI polls this.
        console.log("Checking pairing status for", code);

        // Return false by default so it doesn't auto-advance in demo unless we want it to
        // or maybe simulate success after a few checks?
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
