import { CONFIG } from './config.js';
import { ppeRule } from './rules/ppe.js';
import { postureRule } from './rules/posture.js';
import { fallRule } from './rules/fall.js';
import { calculateRiskScore } from './riskScorer.js';
import { classifySeverity } from './severity.js';
import { ViolationTracker } from './violationTracker.js';

// Custom event class compatible with standard EventTarget in both Node.js and browsers.
export class RiskEngineEvent extends Event {
  constructor(type, detail = {}) {
    super(type);
    this.detail = detail;
  }
}

// Parses frame timestamp into epoch milliseconds.
function parseTimestampMs(ts) {
  if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

// Resolves the effective evaluation status and matching finding for a specific safety rule.
function resolveRuleEvaluation(ruleType, ppeFindings, postureFindings, fallFindings) {
  let matchedFinding = null;
  let status = 'COMPLIANT';

  switch (ruleType) {
    case 'MissingHardhat':
    case 'MissingHelmet': {
      matchedFinding = ppeFindings.find((f) => f.type === 'MissingHardhat' || f.type === 'MissingHelmet' || f.type === 'UncertainHardhat' || f.type === 'UncertainHelmet');
      if (matchedFinding) {
        status = matchedFinding.status;
      } else {
        const skipped = ppeFindings.find((f) => f.status === 'SKIPPED');
        const invalid = ppeFindings.find((f) => f.status === 'INVALID');
        if (skipped) {
          status = 'SKIPPED';
          matchedFinding = skipped;
        } else if (invalid) {
          status = 'INVALID';
          matchedFinding = invalid;
        } else {
          status = 'COMPLIANT';
        }
      }
      break;
    }

    case 'MissingVest': {
      matchedFinding = ppeFindings.find((f) => f.type === 'MissingVest' || f.type === 'UncertainVest');
      if (matchedFinding) {
        status = matchedFinding.status;
      } else {
        const skipped = ppeFindings.find((f) => f.status === 'SKIPPED');
        const invalid = ppeFindings.find((f) => f.status === 'INVALID');
        if (skipped) {
          status = 'SKIPPED';
          matchedFinding = skipped;
        } else if (invalid) {
          status = 'INVALID';
          matchedFinding = invalid;
        } else {
          status = 'COMPLIANT';
        }
      }
      break;
    }

    case 'UnsafePosture': {
      matchedFinding = postureFindings.find((f) => f.type === 'UnsafePosture');
      if (matchedFinding) {
        status = matchedFinding.status;
      } else {
        const uncertain = postureFindings.find((f) => f.type === 'UncertainPose' || f.status === 'UNCERTAIN');
        const skipped = postureFindings.find((f) => f.type === 'SkippedPose' || f.status === 'SKIPPED');
        const invalid = postureFindings.find((f) => f.status === 'INVALID');
        if (uncertain) {
          status = 'UNCERTAIN';
          matchedFinding = uncertain;
        } else if (skipped) {
          status = 'SKIPPED';
          matchedFinding = skipped;
        } else if (invalid) {
          status = 'INVALID';
          matchedFinding = invalid;
        } else {
          status = 'COMPLIANT';
        }
      }
      break;
    }

    case 'WorkerFatigue': {
      matchedFinding = postureFindings.find((f) => f.type === 'WorkerFatigue' || f.type === 'Fatigue');
      if (matchedFinding) {
        status = matchedFinding.status;
      } else {
        const uncertain = postureFindings.find((f) => f.type === 'UncertainPose' || f.status === 'UNCERTAIN');
        const skipped = postureFindings.find((f) => f.type === 'SkippedPose' || f.status === 'SKIPPED');
        const invalid = postureFindings.find((f) => f.status === 'INVALID');
        if (uncertain) {
          status = 'UNCERTAIN';
          matchedFinding = uncertain;
        } else if (skipped) {
          status = 'SKIPPED';
          matchedFinding = skipped;
        } else if (invalid) {
          status = 'INVALID';
          matchedFinding = invalid;
        } else {
          status = 'COMPLIANT';
        }
      }
      break;
    }

    case 'FallEvent': {
      matchedFinding = fallFindings.find((f) => f.type === 'FallEvent');
      if (matchedFinding) {
        status = matchedFinding.status;
      } else {
        const uncertain = fallFindings.find((f) => f.type === 'UncertainFall' || f.status === 'UNCERTAIN');
        const skipped = fallFindings.find((f) => f.type === 'SkippedWorker' || f.status === 'SKIPPED');
        const invalid = fallFindings.find((f) => f.status === 'INVALID');
        if (uncertain) {
          status = 'UNCERTAIN';
          matchedFinding = uncertain;
        } else if (skipped) {
          status = 'SKIPPED';
          matchedFinding = skipped;
        } else if (invalid) {
          status = 'INVALID';
          matchedFinding = invalid;
        } else {
          status = 'COMPLIANT';
        }
      }
      break;
    }

    default:
      status = 'COMPLIANT';
  }

  return { status, finding: matchedFinding };
}

export class RiskEngine extends EventTarget {
  // Initializes orchestrator with rule evaluators, incident tracker, and rate-limiting clocks.
  constructor(options = {}) {
    super();
    this.options = options;
    this.tracker = options.tracker ?? new ViolationTracker(options);

    // State caches per worker: workerId -> state
    this.workerPostureHistory = new Map();
    this.workerFallHistory = new Map();
    this.workerPreviousSeverity = new Map();

    // 5 Hz max rate = 200ms minimum interval between risk:updated dispatches
    this.riskUpdateIntervalMs = options.riskUpdateIntervalMs ?? CONFIG.timing?.riskUpdateIntervalMs ?? 200;
    this.lastRiskUpdateTimestampMs = -Infinity;
  }

  // Dispatches typed event payload to registered EventTarget listeners.
  _emit(eventType, detail) {
    this.dispatchEvent(new RiskEngineEvent(eventType, detail));
  }

  // Processes a single detection frame across all workers, updates incidents, and emits events.
  processFrame(framePayload) {
    if (!framePayload || typeof framePayload !== 'object') {
      return null;
    }

    const timestampMs = parseTimestampMs(framePayload.timestamp);
    const frameId = framePayload.frame_id ?? framePayload.frameId ?? 0;
    const rawWorkers = framePayload.workers ?? [];
    const sharedItems = framePayload.items ?? framePayload.ppe_items ?? [];

    const processedWorkers = [];
    const frameAllFindings = [];

    for (let i = 0; i < rawWorkers.length; i++) {
      const w = rawWorkers[i];
      if (!w) continue;

      const trackId = w.track_id ?? w.trackId ?? (i + 1);
      const bbox = w.bbox ?? w;

      // Extract worker-specific equipment items or inherit from frame-level detection items
      const ppeCandidates = w.ppe ?? w.items ?? sharedItems;
      const landmarks = w.landmarks ?? w.pose_landmarks ?? w.pose ?? null;

      // 1. Evaluate PPE Compliance (Helmet & Vest)
      const ppeFindings = ppeRule(w, ppeCandidates, CONFIG);

      // 2. Evaluate Ergonomic Posture & Fatigue
      const prevPostureHist = this.workerPostureHistory.get(trackId) ?? {};
      const postureOptions = {
        timestamp: timestampMs,
        ...this.options.posture,
        ...(this.options.briefBendGraceMs !== undefined ? { briefBendGraceMs: this.options.briefBendGraceMs } : {}),
      };
      const postureRes = postureRule(w, landmarks, prevPostureHist, postureOptions);
      this.workerPostureHistory.set(trackId, postureRes.updatedHistory ?? prevPostureHist);
      const postureFindings = postureRes.findings ?? [];

      // 3. Evaluate Fall Kinematics & Floor Inactivity
      const prevFallHist = this.workerFallHistory.get(trackId) ?? {};
      const fallOptions = {
        timestamp: timestampMs,
        ...this.options.fall,
        ...(this.options.fallConfirmationMs !== undefined ? { fallConfirmationMs: this.options.fallConfirmationMs } : {}),
      };
      const fallRes = fallRule(w, landmarks, prevFallHist, fallOptions);
      this.workerFallHistory.set(trackId, fallRes.updatedTrackState ?? prevFallHist);
      const fallFindings = fallRes.findings ?? [];

      // Aggregate all findings for this worker
      const workerFindings = [...ppeFindings, ...postureFindings, ...fallFindings];
      frameAllFindings.push(...workerFindings);

      // 4. Feed findings into ViolationTracker for onset debouncing and alert lifecycle
      const ruleTypesChecked = ['MissingHardhat', 'MissingVest', 'UnsafePosture', 'WorkerFatigue', 'FallEvent'];

      for (const ruleType of ruleTypesChecked) {
        const { status, finding } = resolveRuleEvaluation(ruleType, ppeFindings, postureFindings, fallFindings);
        const details = finding ? {
          severity: finding.evidence?.severity ?? (ruleType === 'FallEvent' && finding.evidence?.emergencyAlert ? 'CRITICAL' : 'HIGH'),
          points: finding.points,
          evidence: finding.evidence,
        } : {};

        const updateRes = this.tracker.update(trackId, ruleType, status, timestampMs, details);

        // Emit incident lifecycle events
        if (updateRes.action === 'STARTED') {
          this._emit('violation:started', {
            workerId: trackId,
            ruleType,
            incident: updateRes.incident,
            frameId,
            timestamp: timestampMs,
          });
        } else if (updateRes.action === 'ESCALATED') {
          this._emit('violation:escalated', {
            workerId: trackId,
            ruleType,
            incident: updateRes.incident,
            frameId,
            timestamp: timestampMs,
          });
        } else if (updateRes.action === 'RESOLVED') {
          this._emit('violation:resolved', {
            workerId: trackId,
            ruleType,
            incident: updateRes.incident,
            frameId,
            timestamp: timestampMs,
          });
        }
      }

      // 5. Compute Per-Person Aggregated Risk Score: 100 * (1 - prod(1 - s/100))
      const riskCalc = calculateRiskScore(workerFindings, { method: 'probabilistic' });
      const prevSev = this.workerPreviousSeverity.get(trackId) ?? null;
      const sevCalc = classifySeverity(riskCalc.score, prevSev);
      this.workerPreviousSeverity.set(trackId, sevCalc.severity);

      processedWorkers.push({
        trackId,
        bbox,
        riskScore: riskCalc.score,
        severity: sevCalc.severity,
        rawSeverity: sevCalc.rawSeverity,
        findings: workerFindings,
        breakdown: riskCalc.findingsBreakdown,
        posture: postureRes,
        fall: fallRes,
      });
    }

    // Overall frame risk: probabilistic union of individual worker risk scores
    let overallRiskProduct = 1.0;
    for (const pw of processedWorkers) {
      overallRiskProduct *= (1.0 - pw.riskScore / 100);
    }
    const overallScore = Math.round(100 * (1.0 - overallRiskProduct) * 10) / 10;
    const overallSeverity = classifySeverity(overallScore).severity;

    // 6. Emit risk:updated throttled to maximum 5 Hz (200ms)
    const timeSinceLastUpdate = timestampMs - this.lastRiskUpdateTimestampMs;
    if (timeSinceLastUpdate >= this.riskUpdateIntervalMs) {
      this.lastRiskUpdateTimestampMs = timestampMs;
      this._emit('risk:updated', {
        frameId,
        timestamp: timestampMs,
        workers: processedWorkers.map((pw) => ({
          trackId: pw.trackId,
          riskScore: pw.riskScore,
          severity: pw.severity,
        })),
        overallScore,
        overallSeverity,
      });
    }

    return {
      frameId,
      timestamp: timestampMs,
      workers: processedWorkers,
      activeIncidents: this.tracker.getActiveIncidents(),
      overallRisk: {
        score: overallScore,
        severity: overallSeverity,
      },
    };
  }

  // Resets engine state, tracking histories, and severity caches.
  reset() {
    this.tracker.reset();
    this.workerPostureHistory.clear();
    this.workerFallHistory.clear();
    this.workerPreviousSeverity.clear();
    this.lastRiskUpdateTimestampMs = -Infinity;
  }
}

export default RiskEngine;
