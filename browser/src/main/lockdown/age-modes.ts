export type AgeTier = 'kid_10' | 'tween_13' | 'teen_16';

export interface LockdownConfig {
  showAddressBar: boolean;
  allowDownloads: boolean;
  allowClose: boolean;
  allowDevTools: boolean;
  requirePasswordToClose: boolean;
  safetyThresholdMultiplier: number;
}

const LOCKDOWN_CONFIGS: Record<AgeTier, LockdownConfig> = {
  kid_10: {
    showAddressBar: false,
    allowDownloads: false,
    allowClose: false,
    allowDevTools: false,
    requirePasswordToClose: true,
    safetyThresholdMultiplier: 1.0,
  },
  tween_13: {
    showAddressBar: true,
    allowDownloads: false,
    allowClose: true,
    allowDevTools: false,
    requirePasswordToClose: false,
    safetyThresholdMultiplier: 1.0,
  },
  teen_16: {
    showAddressBar: true,
    allowDownloads: true,
    allowClose: true,
    allowDevTools: false,
    requirePasswordToClose: false,
    safetyThresholdMultiplier: 1.3,
  },
};

export function getLockdownConfig(tier: AgeTier): LockdownConfig {
  return LOCKDOWN_CONFIGS[tier] || LOCKDOWN_CONFIGS.tween_13;
}
