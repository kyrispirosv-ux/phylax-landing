'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function NotFound() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Fail-safe: If we hit a 404 on the legacy landing URL, redirect home immediately
        if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            if (path === '/landing.html' || path === '/landing') {
                window.location.replace('/');
            }
        }
    }, [pathname]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white">
            <h2 className="text-2xl font-bold mb-4">404 - Page Not Found</h2>
            <p className="mb-8">Could not find requested resource.</p>
            <a href="/" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 transition-colors">
                Return Home
            </a>
        </div>
    );
}
