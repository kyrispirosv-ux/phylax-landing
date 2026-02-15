'use client';

import { useStore } from '@/store/useStore';
import { Laptop, Info, Trash2, Plus } from 'lucide-react';
import Link from 'next/link';

export default function DevicesPage() {
    const { devices, removeDevice } = useStore();

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Connected Devices</h1>
                <Link
                    href="/onboarding"
                    className="bg-[#7C5CFF] hover:bg-[#7C5CFF]/90 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-[#7C5CFF]/20"
                >
                    <Plus className="w-4 h-4" /> Add Device
                </Link>
            </div>

            <div className="grid gap-4">
                {devices.map((device) => (
                    <div key={device.id} className="glass-card p-6 rounded-2xl flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                            <Laptop className="w-8 h-8 text-white/80" />
                        </div>

                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-1">{device.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-white/50">
                                <span className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${device.status === 'active' ? 'bg-[#34D399]' : 'bg-gray-500'}`} />
                                    {device.status === 'active' ? 'Active now' : 'Offline'}
                                </span>
                                <span>Last seen: {device.lastSeen}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => removeDevice(device.id)}
                            className="text-white/30 hover:text-[#FB7185] p-2 hover:bg-white/5 rounded-lg transition-colors"
                            title="Remove Device"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ))}

                {devices.length === 0 && (
                    <div className="glass-card p-12 rounded-2xl text-center border-dashed border-2 border-white/10">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Laptop className="w-8 h-8 text-white/30" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">No Devices Connected</h3>
                        <p className="text-white/50 max-w-sm mx-auto mb-6">Connect a device to start protecting your child.</p>
                        <Link
                            href="/onboarding"
                            className="inline-flex items-center gap-2 text-[#7C5CFF] font-medium hover:underline"
                        >
                            Connect your first device
                        </Link>
                    </div>
                )}
            </div>

            <div className="bg-[#22D3EE]/10 border border-[#22D3EE]/20 rounded-xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-[#22D3EE] shrink-0" />
                <p className="text-sm text-[#22D3EE]/80">
                    To disconnect a device permanently, you must also remove the Phylax extension from the browser.
                </p>
            </div>
        </div>
    );
}
