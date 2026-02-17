
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { MockAlertStore } from '@/lib/mockAlertStore';

export async function GET(req: NextRequest) {
    // Try Supabase auth first (production mode)
    let alerts: any[] = [];
    let usedMockStore = false;

    try {
        const supabase = await createServerSupabase();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            // Look up the parent's family_id
            const { data: parent } = await supabase
                .from('parents')
                .select('family_id')
                .eq('id', session.user.id)
                .single() as { data: { family_id: string } | null; error: any };

            if (parent?.family_id) {
                const { data, error } = await supabase
                    .from('alerts')
                    .select('*')
                    .eq('family_id', parent.family_id)
                    .order('created_at', { ascending: false })
                    .limit(50) as { data: any[] | null; error: any };

                if (!error && data && data.length > 0) {
                    alerts = data;
                }
            }
        }
    } catch {
        // Supabase not configured or session check failed
        console.warn('[Activity API] Supabase unavailable, falling back to mock store');
    }

    // If no Supabase alerts, try mock store (demo mode)
    if (alerts.length === 0) {
        const mockAlerts = MockAlertStore.fetch(undefined, 50);
        if (mockAlerts.length > 0) {
            alerts = mockAlerts;
            usedMockStore = true;
            console.log(`[Activity API] Serving ${mockAlerts.length} alerts from mock store`);
        }
    }

    // Map to dashboard format
    const formattedAlerts = alerts.map((alert: any) => ({
        id: alert.id,
        title: alert.title,
        description: alert.body || alert.domain,
        severity: alert.severity === 'critical' ? 'high' : (alert.severity === 'warning' ? 'medium' : 'low'),
        category: getCategoryFromAlert(alert),
        timestamp: formatTimestamp(alert.created_at),
        actionTaken: alert.alert_type === 'BLOCK' ? 'blocked' : 'warned',
    }));

    return NextResponse.json({ alerts: formattedAlerts });
}

function getCategoryFromAlert(alert: any) {
    // Map reason_code to human-readable category
    if (alert.reason_code === 'VIDEO_BLOCKED' || alert.reason_code === 'VIDEO_WARNED') return 'Video';
    if (alert.reason_code === 'SEARCH_RISK' || alert.reason_code === 'SEARCH_BLOCKED') return 'Search';
    if (alert.reason_code === 'CHAT_GROOMING_SIGNAL') return 'Chat Safety';
    if (alert.reason_code === 'DOMAIN_BLOCK') return 'Website';
    if (alert.reason_code === 'GAMBLING') return 'Gambling';
    if (alert.reason_code === 'ADULT') return 'Adult';
    // Try alert_type for parent alerts
    if (alert.alert_type === 'PARENT_ALERT') return 'Safety Alert';
    // Fallback to domain or generic
    return alert.domain || 'General';
}

function formatTimestamp(isoString: string) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
}
