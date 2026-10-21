import { CONFIG } from './config.js';

// Validates whether confidence is a finite probability between 0 and 1.
function isValidConfidence(conf) {
  return typeof conf === 'number' && Number.isFinite(conf) && conf >= 0 && conf <= 1;
}

// Determines the base penalty points for a given finding based on config or custom weights.
function resolveBasePoints(finding, customWeights = {}) {
  const type = finding.type;
  if (customWeights[type]?.base !== undefined) {
    return customWeights[type].base;
  }
  if (typeof finding.points === 'number' && Number.isFinite(finding.points) && finding.points > 0) {
    return finding.points;
  }
  if (CONFIG.violations?.[type]?.base !== undefined) {
    return CONFIG.violations[type].base;
  }
  return typeof finding.points === 'number' && Number.isFinite(finding.points) ? finding.points : 0;
}

// Combines safety findings into an explainable, normalized risk score (0-100) and detailed breakdown.
export function calculateRiskScore(findings = [], options = {}) {
  if (!Array.isArray(findings)) {
    return {
      score: 0,
      findingsBreakdown: [],
    };
  }

  const method = options.method ?? 'probabilistic';
  const customWeights = options.weights ?? {};
  const maxScore = options.maxScore ?? 100;
  const useConfidenceWeighting = options.useConfidenceWeighting ?? false;

  const findingsBreakdown = [];
  const violationPoints = [];

  for (const finding of findings) {
    if (!finding || typeof finding !== 'object') continue;

    const status = String(finding.status ?? '').toUpperCase();
    const type = finding.type ?? 'Unknown';
    const basePoints = resolveBasePoints(finding, customWeights);
    const conf = isValidConfidence(finding.confidence) ? finding.confidence : 1.0;

    // Only confirmed violations generate penalty points; uncertain or skipped items generate 0
    const isViolation = status === 'VIOLATION';
    const effectivePoints = isViolation
      ? (useConfidenceWeighting ? Math.round(basePoints * conf * 10) / 10 : basePoints)
      : 0;

    findingsBreakdown.push({
      type,
      status,
      basePoints,
      confidence: conf,
      effectivePoints,
      contributed: isViolation && effectivePoints > 0,
      evidence: finding.evidence ?? null,
    });

    if (isViolation && effectivePoints > 0) {
      violationPoints.push(effectivePoints);
    }
  }

  let finalScore = 0;

  if (violationPoints.length > 0) {
    if (method === 'sum') {
      const sum = violationPoints.reduce((acc, p) => acc + p, 0);
      finalScore = Math.min(maxScore, sum);
    } else {
      // Probabilistic union: 100 * (1 - prod(1 - s/100))
      let product = 1.0;
      for (const p of violationPoints) {
        const clampedFraction = Math.max(0, Math.min(1.0, p / 100));
        product *= (1.0 - clampedFraction);
      }
      finalScore = Math.min(maxScore, Math.max(0, 100 * (1.0 - product)));
    }
  }

  return {
    score: Math.round(finalScore * 10) / 10,
    findingsBreakdown,
  };
}

export default {
  calculateRiskScore,
};
