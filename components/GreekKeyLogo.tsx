
export function GreekKeyLogo({ className = "w-16 h-16", transparent = false }: { className?: string, transparent?: boolean }) {
    return (
        <svg
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1E1B4B" /> {/* Darker Navy */}
                    <stop offset="1" stopColor="#0F172A" />
                </linearGradient>
                <linearGradient id="gold" x1="120" y1="120" x2="392" y2="392" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FDE68A" />
                    <stop offset="0.5" stopColor="#D97706" />
                    <stop offset="1" stopColor="#FDE68A" />
                </linearGradient>
            </defs>

            {/* Background: Rounded Square with Gold Border - Only if not transparent */}
            {!transparent && (
                <>
                    <rect width="512" height="512" rx="100" fill="url(#bg)" />
                    <rect x="10" y="10" width="492" height="492" rx="90" stroke="url(#gold)" strokeWidth="4" opacity="0.5" />
                </>
            )}

            {/* Simpler Spiral Path (Center) */}
            {/* Centered around 256, 256. Size approx 240x240 */}
            <path
                d="M176 176 H336 V336 H176 V208 H304 V304 H208 V240 H272 V272 H240"
                stroke="url(#gold)"
                strokeWidth="16"
                strokeLinecap="square"
                strokeLinejoin="miter"
                fill="none"
            />

            {/* PHYLAX Text */}
            <text
                x="256"
                y="430"
                textAnchor="middle"
                fontFamily="'Times New Roman', serif"
                fontWeight="bold"
                fontSize="64"
                letterSpacing="12"
                fill="url(#gold)"
            >
                PHYLAX
            </text>
        </svg>
    );
}
