'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, Activity, List, Smartphone, LogOut, Menu } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useState } from 'react';

import { GreekKeyLogo } from '@/components/GreekKeyLogo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { logout } = useStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { name: 'Overview', href: '/dashboard', icon: Home },
        { name: 'Rules', href: '/rules', icon: List },
        { name: 'Activity', href: '/activity', icon: Activity },
        { name: 'Devices', href: '/devices', icon: Smartphone },
        { name: 'Settings', href: '/settings', icon: Settings },
    ];

    return (
        <div className="min-h-screen flex bg-transparent">
            {/* Sidebar (Desktop) */}
            <aside className="hidden md:flex w-64 flex-col border-r border-white/10 bg-black/20 backdrop-blur-md">
                <div className="h-18 flex items-center px-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <GreekKeyLogo className="w-10 h-10" />
                        <span className="font-bold text-white tracking-wide text-lg">Phylax</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                    ? 'bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/20'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <item.icon className="w-5 h-5" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="md:hidden h-16 flex items-center justify-between px-4 border-b border-white/10 bg-black/20 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <GreekKeyLogo className="w-8 h-8" />
                        <span className="font-bold text-white">Phylax</span>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-white/70">
                        <Menu className="w-6 h-6" />
                    </button>
                </header>

                {/* Mobile Menu Overlay */}
                {isMobileMenuOpen && (
                    <div className="md:hidden absolute inset-0 z-50 bg-[#0A1022] p-4">
                        <div className="flex justify-end mb-8">
                            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-white/70">X</button>
                        </div>
                        <nav className="space-y-4">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium text-white/70 hover:bg-white/5"
                                >
                                    <item.icon className="w-6 h-6" />
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                    </div>
                )}

                <main className="flex-1 p-6 md:p-10 overflow-auto relative">
                    {/* Greek Key motif background */}
                    <div className="absolute top-10 right-10 pointer-events-none opacity-[0.03]">
                        <GreekKeyLogo className="w-[500px] h-[500px]" transparent={true} />
                    </div>
                    {children}
                </main>
            </div>
        </div>
    );
}
