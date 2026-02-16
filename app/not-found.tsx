'use client';

import { useEffect } from 'react';

export default function NotFound() {
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            // Aggressive check for landing page variants
            if (path.includes('landing.html') || path === '/landing' || path.endsWith('.html')) {
                window.location.replace('/');
            }
        }
    }, []);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
            <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
            <p className="mb-8">We couldn't find the page you're looking for.</p>
            <p className="text-gray-400 text-sm mb-8">Attempting automatic recover...</p>
            <a
                href="/"
                className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors font-semibold"
            >
                Go to Homepage
            </a>
        </div>
    );
}
