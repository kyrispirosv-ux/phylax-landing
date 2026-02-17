
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { MockAlertStore } from '@/lib/mockAlertStore';

/**
 * Build alert records from raw events.
 * Shared logic for both Supabase and mock storage paths.
 */
function buildAlerts(events: any[], familyId: string, childId: string, deviceId: string) {
    return events
        .filter((evt: any) => {
            return (
                evt.event_type === 'PARENT_ALERT' ||
                evt.event_type === 'VIDEO_BLOCK' ||
                evt.event_type === 'SEARCH_BLOCKED' ||
                evt.reason_code === 'DOMAIN_BLOCK' ||
                evt.reason_code === 'VIDEO_BLOCKED' ||
                evt.reason_code === 'VIDEO_WARNED' ||
                evt.reason_code === 'SEARCH_RISK' ||
                evt.reason_code === 'SEARCH_BLOCKED' ||
                evt.reason_code === 'CHAT_GROOMING_SIGNAL' ||
                evt.category === 'Gambling' ||
                evt.category === 'Adult' ||
                evt.category === 'Self-Harm'
            );
        })
        .map((evt: any) => {
            // Build descriptive title based on event type
            let title = 'Content Blocked';
            if (evt.event_type === 'PARENT_ALERT') {
                title = evt.metadata?.title || 'Safety Alert';
            } else if (evt.event_type === 'VIDEO_BLOCK') {
                const videoTitle = evt.metadata?.title || evt.domain || 'Unknown video';
                title = `Video Blocked: ${videoTitle.slice(0, 80)}`;
            } else if (evt.event_type === 'SEARCH_BLOCKED') {
                const query = evt.metadata?.query || 'Unknown query';
                title = `Search Blocked: ${query.slice(0, 80)}`;
            } else if (evt.reason_code === 'CHAT_GROOMING_SIGNAL') {
                title = 'Chat Threat Detected';
            }

            // Build descriptive body from metadata
            let body = `Access to ${evt.domain} was blocked.`;
            if (evt.event_type === 'VIDEO_BLOCK' && evt.metadata?.title) {
                body = `"${evt.metadata.title}" on ${evt.domain}`;
                if (evt.metadata?.channel) body += ` (channel: ${evt.metadata.channel})`;
            } else if (evt.event_type === 'SEARCH_BLOCKED' && evt.metadata?.query) {
                body = `Search query "${evt.metadata.query}" was intercepted.`;
            } else if (evt.event_type === 'PARENT_ALERT' && evt.metadata?.body) {
                body = evt.metadata.body;
            }
            if (evt.metadata?.reasoning?.length) {
                body += ` Reason: ${evt.metadata.reasoning[0]}`;
            }

            // Determine severity
            let severity = 'warning';
            if (evt.category === 'Self-Harm' || evt.category === 'self_harm') severity = 'critical';
            else if (evt.confidence >= 0.9) severity = 'critical';

            return {
                family_id: familyId,
                child_id: childId,
                device_id: deviceId,
                alert_type: evt.event_type === 'PARENT_ALERT' ? 'PARENT_ALERT' : 'BLOCK',
                severity,
                title,
                body,
                url: evt.url || '',
                domain: evt.domain || '',
                reason_code: evt.reason_code || '',
                confidence: evt.confidence || 0,
                read: false,
            };
        });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { device_id, events } = body;

        if (!device_id || !events || !Array.isArray(events)) {
            console.error('[Events API] Invalid payload:', JSON.stringify(body).slice(0, 100));
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        console.log(`[Events API] Received ${events.length} events from device ${device_id}`);

        // Try Supabase first (production mode)
        let device: { id: string; family_id: string; child_id: string } | null = null;
        try {
            const supabase = createServiceClient();
            const { data, error } = await supabase
                .from('devices')
                .select('id, family_id, child_id')
                .eq('id', device_id)
                .single();

            if (!error && data) {
                device = data;
            }
        } catch {
            // Supabase not configured or unavailable
            console.warn('[Events API] Supabase unavailable, using mock store');
        }

        if (device) {
            // ── Production path: Supabase ──
            const supabase = createServiceClient();

            const eventsToInsert = events.map((evt: any) => ({
                family_id: device!.family_id,
                child_id: device!.child_id,
                device_id: device!.id,
                event_type: evt.event_type,
                domain: evt.domain,
                url: evt.url,
                category: evt.category,
                rule_id: evt.rule_id,
                reason_code: evt.reason_code,
                confidence: evt.confidence,
                metadata: evt.metadata,
            }));

            await supabase.from('events').insert(eventsToInsert);

            const alertsToInsert = buildAlerts(events, device.family_id, device.child_id, device.id);
            if (alertsToInsert.length > 0) {
                await supabase.from('alerts').insert(alertsToInsert);
            }

            console.log('[Events API] Supabase: events stored successfully');
        } else {
            // ── Demo/mock path: in-memory store ──
            // Device not in Supabase (mock pairing) — use in-memory store
            console.log(`[Events API] Demo mode: storing alerts in mock store for device ${device_id}`);

            const alertsToInsert = buildAlerts(events, 'fam_demo', 'child_demo', device_id);
            if (alertsToInsert.length > 0) {
                MockAlertStore.insert(alertsToInsert);
                console.log(`[Events API] Mock store: ${alertsToInsert.length} alerts created (total: ${MockAlertStore.count()})`);
            }
        }

        return NextResponse.json({ success: true, count: events.length });

    } catch (error) {
        console.error('Error processing events:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Handle CORS preflight for extension requests
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
