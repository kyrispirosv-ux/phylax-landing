// Simple in-memory store for demo purposes
// distinct from production DB

type PairingRecord = {
    code: string;
    status: 'pending' | 'paired';
    deviceId?: string;
    createdAt: number;
};

// Global singleton to persist across hot reloads in dev (mostly)
const globalStore = global as unknown as { _mockPairingStore: Map<string, PairingRecord> };

if (!globalStore._mockPairingStore) {
    globalStore._mockPairingStore = new Map();
}

export const MockPairingStore = {
    create: (code: string) => {
        globalStore._mockPairingStore.set(code, {
            code,
            status: 'pending',
            createdAt: Date.now()
        });
        console.log(`[MockStore] Created code: ${code}`);
    },

    consume: (code: string, deviceId: string) => {
        const record = globalStore._mockPairingStore.get(code);
        if (record) {
            record.status = 'paired';
            record.deviceId = deviceId;
            globalStore._mockPairingStore.set(code, record);
            console.log(`[MockStore] Consumed code: ${code} by ${deviceId}`);
            return true;
        }
        console.log(`[MockStore] Consume failed - code not found: ${code}`);
        return false;
    },

    getStatus: (code: string) => {
        const record = globalStore._mockPairingStore.get(code);
        return record;
    },

    // Clean up old codes
    cleanup: () => {
        const now = Date.now();
        for (const [code, record] of globalStore._mockPairingStore.entries()) {
            if (now - record.createdAt > 1000 * 60 * 30) { // 30 mins
                globalStore._mockPairingStore.delete(code);
            }
        }
    }
};
