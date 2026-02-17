
export function GreekKeyLogo({ className = "w-16 h-16", transparent = false }: { className?: string, transparent?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            fill="none"
            className={className}
        >
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#2B1766" />
                    <stop offset="1" stopColor="#0E2847" />
                </linearGradient>
                <linearGradient id="spiral" x1="146" y1="86" x2="366" y2="306" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFFFFF" />
                    <stop offset="0.65" stopColor="#E8D5A0" />
                    <stop offset="1" stopColor="#C9A84C" />
                </linearGradient>
                <linearGradient id="textGrad" x1="120" y1="420" x2="392" y2="420" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#E8D5A0" />
                    <stop offset="0.5" stopColor="#C9A84C" />
                    <stop offset="1" stopColor="#E8D5A0" />
                </linearGradient>
            </defs>

            {/* Dark blue background - hidden if transparent */}
            {!transparent && (
                <rect width="512" height="512" rx="112" fill="url(#bg)" />
            )}

            {/* Subtle gold border */}
            <rect x="6" y="6" width="500" height="500" rx="108"
                stroke="#C9A84C" strokeWidth="2" fill="none" opacity="0.35" />

            {/* Dense rectangular spiral (maze shifted up for text room) */}
            <path d="M146 86 H366 V306 H158 V98 H354 V294 H170 V110 H342 V282 H182 V122 H330 V270 H194 V134 H318 V258 H206 V146 H306 V246 H218 V158 H294 V234 H230 V170 H282 V222 H242 V182 H270 V210 H254 V194 H258 V198"
                stroke="url(#spiral)" strokeWidth="4"
                strokeLinecap="square" strokeLinejoin="miter" />

            {/* PHYLAX wordmark in Greek-style font */}
            <text x="256" y="425" textAnchor="middle"
                fontFamily="'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif"
                fontWeight="600" fontSize="56" letterSpacing="18"
                fill="url(#textGrad)">PHYLAX</text>
        </svg>
    );
}
