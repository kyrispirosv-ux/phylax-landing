
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabase();

    // Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the parent's family_id
    const { data: parent } = await supabase
        .from('parents')
        .select('family_id')
        .eq('id', session.user.id)
        .single();

    if (!parent?.family_id) {
        return NextResponse.json({ alerts: [] });
    }

    // Fetch alerts for this family only
    const { data: alerts, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('family_id', parent.family_id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error || !alerts) {
        return NextResponse.json({ error: error?.message || 'No data' }, { status: 500 });
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
