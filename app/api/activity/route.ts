
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    const supabase = await createServerSupabase();

    // Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch alerts/events for the dashboard
    // We'll fetch from the 'alerts' table as that's what the dashboard "Activity Log" displays
    const { data: alerts, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to dashboard format
    const formattedAlerts = alerts.map(alert => ({
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
    if (alert.reason_code === 'GAMBLING') return 'Gambling';
    if (alert.reason_code === 'ADULT') return 'Adult';
    // inference from payload if reason_code isn't specific
    return 'General';
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
