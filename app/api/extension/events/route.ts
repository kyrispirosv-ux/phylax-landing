
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { device_id, events } = body;

        if (!device_id || !events || !Array.isArray(events)) {
            console.error('[Events API] Invalid payload:', JSON.stringify(body).slice(0, 100));
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        console.log(`[Events API] Received ${events.length} events from device ${device_id}`);

        const supabase = createServiceClient();

        // 1. Get device info to link to family/child
        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('id, family_id, child_id')
            .eq('id', device_id)
            .single();

        if (deviceError || !device) {
            console.error('[Events API] Device lookup failed:', deviceError?.message || 'Device not found');
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        // 2. Prepare events for insertion
        const eventsToInsert = events.map((evt: any) => ({
            family_id: device.family_id,
            child_id: device.child_id,
            device_id: device.id,
            event_type: evt.event_type,
            domain: evt.domain,
            url: evt.url,
            category: evt.category,
            rule_id: evt.rule_id,
            reason_code: evt.reason_code,
            confidence: evt.confidence,
            metadata: evt.metadata,
        }));

        // 3. Insert into 'events' table
        const { error: insertError } = await supabase
            .from('events')
            .insert(eventsToInsert);

        if (insertError) {
            console.error('[Events API] Insert events error:', insertError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        console.log('[Events API] Successfully inserted events');

        // 4. Create alerts for high-severity events or BLOCK actions
        // Filter events that should be alerts
        const alertsToInsert = events
            .filter((evt: any) => {
                // Logic: Blocked items, Parent Alerts, or specific high-risk categories
                return (
                    evt.event_type === 'PARENT_ALERT' ||
                    evt.reason_code === 'DOMAIN_BLOCK' ||
                    evt.reason_code === 'VIDEO_BLOCKED' ||
                    evt.reason_code === 'VIDEO_WARNED' ||
                    evt.reason_code === 'SEARCH_RISK' ||
                    evt.reason_code === 'SEARCH_BLOCKED' ||
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
                    family_id: device.family_id,
                    child_id: device.child_id,
                    device_id: device.id,
                    alert_type: evt.event_type === 'PARENT_ALERT' ? 'PARENT_ALERT' : 'BLOCK',
                    severity,
                    title,
                    body,
                    url: evt.url,
                    domain: evt.domain,
                    reason_code: evt.reason_code,
                    confidence: evt.confidence,
                    read: false,
                };
            });

        if (alertsToInsert.length > 0) {
            await supabase.from('alerts').insert(alertsToInsert);
        }

        return NextResponse.json({ success: true, count: events.length });

    } catch (error) {
        console.error('Error processing events:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
