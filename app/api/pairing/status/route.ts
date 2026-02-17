import { NextResponse } from "next/server";
import { MockPairingStore } from "@/lib/mockPairingStore";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
        return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const record = MockPairingStore.getStatus(code);

    if (!record) {
        return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    if (record.status === 'paired') {
        return NextResponse.json({
            paired: true,
            device_id: record.deviceId,
            child_id: "child_123",
        });
    }

    return NextResponse.json({ paired: false });
}
