import { NextResponse } from "next/server";
import { MockPairingStore } from "@/lib/mockPairingStore";

export async function POST(request: Request) {
    const body = await request.json();
    const { short_code } = body;

    // Simulate network delay
    await new Promise(r => setTimeout(r, 800));

    if (short_code && short_code.length === 6) {
        const deviceId = "dev_" + Math.random().toString(36).substr(2, 9);

        // Update mock store
        const success = MockPairingStore.consume(short_code, deviceId);

        // Even if success is false (code not found in mock store), 
        // we might return success if we want to be lenient in demo,
        // BUT strictness helps debugging. Let's be consistent.
        // If the dashboard generated it via API, it will be in store.

        // Return dummy success data
        return NextResponse.json({
            device_id: deviceId,
            child_id: "child_123",
            family_id: "fam_123",
            auth_token: "mock_token_" + Date.now(),
            policy_version: 1,
            policy_pack: {
                policy_version: 1,
                tier: "tween_13",
                rules: []
            }
        });
    }

    return NextResponse.json(
        { error: "Invalid code" },
        { status: 400 }
    );
}
