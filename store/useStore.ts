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

    pairingCode: null,
    generatePairingCode: () => {
        const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        }
        set({ pairingCode: code, pairingStatus: 'waiting' });
    },
    pairingStatus: 'waiting',
    setPairingStatus: (status) => set({ pairingStatus: status }),

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
