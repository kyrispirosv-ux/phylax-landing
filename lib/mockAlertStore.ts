// In-memory alert store for demo mode (no Supabase required)
// Mirrors the 'alerts' table schema but stored in memory.
// Persists across hot reloads via globalThis.

type MockAlert = {
    id: string;
    family_id: string;
    child_id: string;
    device_id: string;
    alert_type: string;
    severity: string;
    title: string;
    body: string;
    url: string;
    domain: string;
    reason_code: string;
    confidence: number;
    read: boolean;
    created_at: string;
};

const globalStore = global as unknown as { _mockAlertStore: MockAlert[] };

if (!globalStore._mockAlertStore) {
    globalStore._mockAlertStore = [];
}

export const MockAlertStore = {
    /** Add one or more alerts */
    insert: (alerts: Omit<MockAlert, 'id' | 'created_at'>[]) => {
        for (const alert of alerts) {
            globalStore._mockAlertStore.push({
                ...alert,
                id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                created_at: new Date().toISOString(),
            });
        }
        // Keep max 200 alerts
        if (globalStore._mockAlertStore.length > 200) {
            globalStore._mockAlertStore = globalStore._mockAlertStore.slice(-200);
        }
        console.log(`[MockAlertStore] Inserted ${alerts.length} alerts (total: ${globalStore._mockAlertStore.length})`);
    },

    /** Fetch most recent alerts, optionally filtered by family_id */
    fetch: (familyId?: string, limit = 50): MockAlert[] => {
        let results = [...globalStore._mockAlertStore];
        if (familyId) {
            results = results.filter(a => a.family_id === familyId);
        }
        return results
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit);
    },

    /** Get count */
    count: () => globalStore._mockAlertStore.length,

    /** Clear all */
    clear: () => { globalStore._mockAlertStore = []; },
};
