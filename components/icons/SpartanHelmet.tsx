
export function SpartanHelmet({ className = "w-6 h-6" }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M9 10.5C9 12.433 10.3431 14 12 14C13.6569 14 15 12.433 15 10.5V9C15 7.067 13.6569 5.5 12 5.5C10.3431 5.5 9 7.067 9 9V10.5Z" />
            <path d="M8 10V9C8 5.68629 9.79086 3 12 3C14.2091 3 16 5.68629 16 9V10" />
            <path d="M12 5.5V3" />
            <path d="M5 10V11C5 14.866 7.68629 18 11 18H13C16.3137 18 19 14.866 19 11V10" />
            <path d="M5 10L4 12" />
            <path d="M19 10L20 12" />
            <path d="M12 18V21" />
            <path d="M9 21H15" />
        </svg>
    );
}
