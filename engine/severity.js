import { CONFIG } from './config.js';

export const SEVERITY_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const SEVERITY_RANKS = Object.freeze({
  [SEVERITY_LEVELS.LOW]: 0,
  [SEVERITY_LEVELS.MEDIUM]: 1,
  [SEVERITY_LEVELS.HIGH]: 2,
  [SEVERITY_LEVELS.CRITICAL]: 3,
});

// Normalizes numerical scores and guards against negative, NaN, or non-finite inputs.
function sanitizeScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || Number.isNaN(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, score));
}

// Determines the un-hysteresed base severity tier according to configured score cutoffs.
export function getRawSeverity(score, options = {}) {
  const levels = options.thresholds ?? CONFIG.severityLevels ?? {
    Low: 0,
    Medium: 25,
    High: 50,
    Critical: 75,
  };

  const s = sanitizeScore(score);
  const crit = levels.Critical ?? 75;
  const high = levels.High ?? 50;
  const med = levels.Medium ?? 25;

  if (s >= crit) return SEVERITY_LEVELS.CRITICAL;
  if (s >= high) return SEVERITY_LEVELS.HIGH;
  if (s >= med) return SEVERITY_LEVELS.MEDIUM;
  return SEVERITY_LEVELS.LOW;
}

// Compares two severity tiers to determine relative priority (-1, 0, 1).
export function compareSeverity(sevA, sevB) {
  const rankA = SEVERITY_RANKS[sevA] ?? -1;
  const rankB = SEVERITY_RANKS[sevB] ?? -1;
  if (rankA < rankB) return -1;
  if (rankA > rankB) return 1;
  return 0;
}

// Helper to check whether sevA is strictly higher than sevB.
export function isSeverityHigher(sevA, sevB) {
  return compareSeverity(sevA, sevB) > 0;
}

// Helper to check whether sevA is equal to or higher than sevB.
export function isSeverityEqualOrHigher(sevA, sevB) {
  return compareSeverity(sevA, sevB) >= 0;
}

// Classifies severity using a deadband hysteresis margin to suppress oscillatory transitions.
export function classifySeverity(score, previousSeverity = null, options = {}) {
  const levels = options.thresholds ?? CONFIG.severityLevels ?? {
    Low: 0,
    Medium: 25,
    High: 50,
    Critical: 75,
  };
  const margin = options.hysteresisMargin ?? CONFIG.severityHysteresis ?? 5;
  const s = sanitizeScore(score);
  const raw = getRawSeverity(s, { thresholds: levels });

  // When no previous valid severity exists, apply raw classification directly
  if (!previousSeverity || SEVERITY_RANKS[previousSeverity] === undefined) {
    return {
      severity: raw,
      rawSeverity: raw,
      transitioned: false,
    };
  }

  const prevRank = SEVERITY_RANKS[previousSeverity];
  const rawRank = SEVERITY_RANKS[raw];

  // Upgrades occur immediately when the threshold boundary is crossed
  if (rawRank > prevRank) {
    return {
      severity: raw,
      rawSeverity: raw,
      transitioned: true,
    };
  }

  // Same band requires no hysteresis check
  if (rawRank === prevRank) {
    return {
      severity: raw,
      rawSeverity: raw,
      transitioned: false,
    };
  }

  // Downgrade path: requires score to drop below boundary MINUS hysteresis margin
  const crit = levels.Critical ?? 75;
  const high = levels.High ?? 50;
  const med = levels.Medium ?? 25;

  let resolvedSeverity = previousSeverity;

  if (previousSeverity === SEVERITY_LEVELS.CRITICAL) {
    if (s < crit - margin) {
      // Allowed to downgrade from CRITICAL
      if (s >= high) {
        resolvedSeverity = SEVERITY_LEVELS.HIGH;
      } else if (s >= med) {
        resolvedSeverity = SEVERITY_LEVELS.MEDIUM;
      } else {
        resolvedSeverity = SEVERITY_LEVELS.LOW;
      }
    }
  } else if (previousSeverity === SEVERITY_LEVELS.HIGH) {
    if (s < high - margin) {
      // Allowed to downgrade from HIGH
      if (s >= med) {
        resolvedSeverity = SEVERITY_LEVELS.MEDIUM;
      } else {
        resolvedSeverity = SEVERITY_LEVELS.LOW;
      }
    }
  } else if (previousSeverity === SEVERITY_LEVELS.MEDIUM) {
    if (s < med - margin) {
      resolvedSeverity = SEVERITY_LEVELS.LOW;
    }
  }

  return {
    severity: resolvedSeverity,
    rawSeverity: raw,
    transitioned: resolvedSeverity !== previousSeverity,
  };
}

export default {
  SEVERITY_LEVELS,
  getRawSeverity,
  classifySeverity,
  compareSeverity,
  isSeverityHigher,
  isSeverityEqualOrHigher,
};
