
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { device_id, events } = body;

        if (!device_id || !events || !Array.isArray(events)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // 1. Get device info to link to family/child
        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('id, family_id, child_id')
            .eq('id', device_id)
            .single();

        if (deviceError || !device) {
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
            console.error('Error inserting events:', insertError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

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
            .map((evt: any) => ({
                family_id: device.family_id,
                child_id: device.child_id,
                device_id: device.id,
                alert_type: evt.event_type === 'PARENT_ALERT' ? 'PARENT_ALERT' : 'BLOCK',
                severity: evt.category === 'Self-Harm' ? 'critical' : 'warning',
                title: evt.event_type === 'PARENT_ALERT' ? 'Safety Alert' : 'Content Blocked',
                body: evt.metadata?.description || `Access to ${evt.domain} was blocked.`,
                url: evt.url,
                domain: evt.domain,
                reason_code: evt.reason_code,
                confidence: evt.confidence,
                read: false
            }));

        if (alertsToInsert.length > 0) {
            await supabase.from('alerts').insert(alertsToInsert);
        }

        return NextResponse.json({ success: true, count: events.length });

    } catch (error) {
        console.error('Error processing events:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
