export type AgeGroup = 0 | 1 | 2 | 3 | 4;

export interface AgePolicy {
    id: AgeGroup;
    name: string;
    range: string;
    description: string;
    mode: string; // e.g., "Max Protection", "Guided Internet"
    sensitivityMultiplier: number;
    blockThreshold: number;
    blockedCategories: string[];
    intervention: {
        style: 'block' | 'warn' | 'monitor';
        message: string;
        showWarning: boolean;
        notifyParent: boolean;
    };
    philosophy: string;
}

export const AGE_POLICIES: Record<AgeGroup, AgePolicy> = {
    0: {
        id: 0,
        name: 'Early Years',
        range: 'Under 5',
        mode: 'Max Protection',
        description: 'Zero-trust internet. Blocks almost everything except allowlisted content.',
        philosophy: 'Zero-trust internet',
        sensitivityMultiplier: 2.5,
        blockThreshold: 0.15,
        blockedCategories: [
            'Social Media', 'Chat/Messaging', 'YouTube (Non-Kids)', 'User Generated Content',
            'External Links', 'Search Engines'
        ],
        intervention: {
            style: 'block',
            message: "This page isn’t safe for kids. Let’s find something fun to watch instead!",
            showWarning: false, // "Never show child warning text about danger types"
            notifyParent: true
        }
    },
    1: {
        id: 1,
        name: 'Young Explorers',
        range: '5–8',
        mode: 'High Protection',
        description: 'Blocks interactive content like DMs and comments. High sensitivity.',
        philosophy: 'High protection mode',
        sensitivityMultiplier: 2.0,
        blockThreshold: 0.25,
        blockedCategories: [
            'DMs', 'Comments', 'Video Comments', 'Live Streams', 'External Video Links', 'Suggested Videos'
        ],
        intervention: {
            style: 'block',
            message: "Content blocked for safety.",
            showWarning: false, // "No warnings shown to child"
            notifyParent: true // "Auto-block + silent parent alert"
        }
    },
    2: {
        id: 2,
        name: 'Growing Up',
        range: '8–11',
        mode: 'Guided Internet',
        description: 'Teaches judgment. Blocks harmful content but warns on borderline content.',
        philosophy: 'Teach judgment while protecting',
        sensitivityMultiplier: 1.5,
        blockThreshold: 0.40,
        blockedCategories: [
            'Harmful Content', 'Unknown DMs'
        ],
        intervention: {
            style: 'warn',
            message: "This content might not be appropriate. Ask your parent if unsure.",
            showWarning: true,
            notifyParent: true // "flagged logs"
        }
    },
    3: {
        id: 3,
        name: 'Pre-Teen',
        range: '11–14',
        mode: 'Supervised Independence',
        description: 'Monitors patterns. Blocks grooming and coercion. Allows normal social media.',
        philosophy: 'Monitor patterns rather than block everything',
        sensitivityMultiplier: 1.2,
        blockThreshold: 0.60,
        blockedCategories: [
            'Grooming', 'Sexual Solicitation', 'Predatory Language', 'Coercion', 'Self-Harm', 'Extremist Recruitment'
        ],
        intervention: {
            style: 'monitor', // "Block only specific categories"
            message: "Access restricted due to safety concerns.",
            showWarning: true,
            notifyParent: true // "Log suspicious conversations"
        }
    },
    4: {
        id: 4,
        name: 'Teen / Young Adult',
        range: '14+',
        mode: 'Intelligent Guardian',
        description: 'Silent co-pilot. Intervenes only for credible threats and grooming.',
        philosophy: 'AI acts like a silent safety co-pilot',
        sensitivityMultiplier: 1.0,
        blockThreshold: 0.80,
        blockedCategories: [
            'Credible Threats', 'Grooming Probability', 'Blackmail', 'Exploitation'
        ],
        intervention: {
            style: 'monitor', // "Flag + Monitor + Escalate"
            message: "",
            showWarning: false,
            notifyParent: false // Only if pattern (escalation rule handled elsewhere)
        }
    }
};

export function getPolicyForAge(age: number): AgePolicy {
    // Failsafe: clamp to 0-4
    const safeAge = Math.max(0, Math.min(4, Math.floor(age))) as AgeGroup;
    return AGE_POLICIES[safeAge];
}
