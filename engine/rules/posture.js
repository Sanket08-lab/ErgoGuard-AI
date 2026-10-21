import { angleAt, angleFromVertical } from '../geometry.js';
import { CONFIG } from '../config.js';

// Normalizes arbitrary landmark structures (array, object, or MediaPipe dictionary) into indexable map.
function parseLandmarks(raw) {
  if (!raw) return null;
  const list = raw.landmarks ?? raw.landmark ?? raw;
  if (!list) return null;

  const map = new Map();
  if (Array.isArray(list)) {
    for (let idx = 0; idx < list.length; idx++) {
      const pt = list[idx];
      if (!pt) continue;
      const x = typeof pt.x === 'number' ? pt.x : (Array.isArray(pt) ? pt[0] : null);
      const y = typeof pt.y === 'number' ? pt.y : (Array.isArray(pt) ? pt[1] : null);
      const z = typeof pt.z === 'number' ? pt.z : (Array.isArray(pt) ? pt[2] : 0);
      const visibility = typeof pt.visibility === 'number' ? pt.visibility : 1.0;
      if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
        map.set(idx, { x, y, z, visibility });
      }
    }
  } else if (typeof list === 'object') {
    for (const [key, pt] of Object.entries(list)) {
      const idx = Number(key);
      if (Number.isNaN(idx) || !pt) continue;
      const x = typeof pt.x === 'number' ? pt.x : (Array.isArray(pt) ? pt[0] : null);
      const y = typeof pt.y === 'number' ? pt.y : (Array.isArray(pt) ? pt[1] : null);
      const z = typeof pt.z === 'number' ? pt.z : (Array.isArray(pt) ? pt[2] : 0);
      const visibility = typeof pt.visibility === 'number' ? pt.visibility : 1.0;
      if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
        map.set(idx, { x, y, z, visibility });
      }
    }
  }

  return map.size > 0 ? map : null;
}

// Computes 2D Euclidean distance between two coordinate pairs.
function distance2D(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Evaluates ergonomic postures, hazardous lifting techniques, and worker fatigue progression.
export function postureRule(person, landmarksInput, history = {}, options = {}) {
  // Input validation
  if (!person || typeof person !== 'object') {
    return {
      status: 'INVALID',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'INVALID',
          type: 'InvalidInput',
          confidence: 0,
          points: 0,
          evidence: { reason: 'Person object is null or undefined' },
        },
      ],
    };
  }

  const lmMap = parseLandmarks(landmarksInput);
  if (!lmMap) {
    return {
      status: 'SKIPPED',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'SKIPPED',
          type: 'SkippedPose',
          confidence: 0,
          points: 0,
          evidence: { reason: 'No valid landmarks provided for posture evaluation' },
        },
      ],
    };
  }

  // Key landmark indices: shoulders (11, 12), hips (23, 24), ears (7, 8), knees (25, 26), ankles (27, 28)
  const ls = lmMap.get(11);
  const rs = lmMap.get(12);
  const lh = lmMap.get(23);
  const rh = lmMap.get(24);
  const le = lmMap.get(7);
  const re = lmMap.get(8);
  const lk = lmMap.get(25);
  const rk = lmMap.get(26);
  const la = lmMap.get(27);
  const ra = lmMap.get(28);

  const minVisibility = options.minVisibility ?? CONFIG.minConf?.landmark ?? 0.5;

  // Validate core trunk points are available with sufficient confidence
  const hasShoulders = ls && rs && (ls.visibility >= minVisibility || rs.visibility >= minVisibility);
  const hasHips = lh && rh && (lh.visibility >= minVisibility || rh.visibility >= minVisibility);

  if (!hasShoulders || !hasHips) {
    return {
      status: 'UNCERTAIN',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'UNCERTAIN',
          type: 'UncertainPose',
          confidence: Math.min(ls?.visibility ?? 0, lh?.visibility ?? 0),
          points: 0,
          evidence: { reason: 'Torso landmarks (shoulders/hips) occluded or low visibility' },
        },
      ],
    };
  }

  const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const earPoint = le && re ? { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 } : (le || re || midShoulder);

  // 1. Trunk inclination angle from vertical (0° = upright, 90° = horizontal)
  const trunkAngle = Math.round(angleFromVertical(midShoulder, midHip) * 10) / 10;

  // 2. Neck flexion angle from vertical (head tilt relative to mid-shoulder)
  const neckAngle = Math.round(angleFromVertical(earPoint, midShoulder) * 10) / 10;

  // 3. Bilateral knee flexion angles (straight leg = ~180°)
  let leftKneeAngle = 180.0;
  let rightKneeAngle = 180.0;

  if (lh && lk && la && lk.visibility >= 0.3) {
    leftKneeAngle = Math.round(angleAt(lh, lk, la) * 10) / 10;
  }
  if (rh && rk && ra && rk.visibility >= 0.3) {
    rightKneeAngle = Math.round(angleAt(rh, rk, ra) * 10) / 10;
  }
  const minKneeAngle = Math.min(leftKneeAngle, rightKneeAngle);

  // Ergonomic thresholds
  const trunkUnsafeDeg = options.trunkUnsafeDeg ?? CONFIG.posture?.stoopTrunkDeg ?? 45.0;
  const trunkSevereDeg = options.trunkSevereDeg ?? CONFIG.posture?.trunkBendDeg ?? 60.0;
  const straightKneeDeg = options.straightKneeDeg ?? CONFIG.posture?.straightKneeDeg ?? 150.0;
  const neckUnsafeDeg = options.neckUnsafeDeg ?? 35.0;
  const headDroopDeg = options.headDroopDeg ?? 40.0;

  let postureState = 'SAFE';
  let postureSeverity = 'LOW';
  let postureDescription = 'Worker is maintaining an ergonomic and safe posture.';
  const findings = [];

  // Ergonomic Lifting & Bending Evaluation
  if (trunkAngle >= trunkUnsafeDeg) {
    // Dangerous lifting: trunk bent forward while knees remain straight (> 150°)
    const kneesStraight = minKneeAngle >= straightKneeDeg;
    if (kneesStraight) {
      postureState = 'UNSAFE_LIFTING';
      postureSeverity = trunkAngle >= trunkSevereDeg ? 'CRITICAL' : 'HIGH';
      postureDescription = `Dangerous lifting technique detected! Trunk bent ${trunkAngle.toFixed(1)}° with straight knees (${minKneeAngle.toFixed(1)}°).`;
      findings.push({
        status: 'VIOLATION',
        type: 'UnsafePosture',
        confidence: Math.round(((ls.visibility + lh.visibility) / 2) * 100) / 100,
        points: CONFIG.violations?.UnsafePosture?.base ?? 40,
        evidence: {
          postureState,
          trunkAngle,
          neckAngle,
          minKneeAngle,
          severity: postureSeverity,
          reason: postureDescription,
        },
      });
    } else {
      postureState = 'SAFE';
      postureDescription = `Squat posture detected (knees bent at ${minKneeAngle.toFixed(1)}°, trunk ${trunkAngle.toFixed(1)}°). Acceptable ergonomic lift.`;
    }
  } else if (trunkAngle > 28.0) {
    postureState = 'SLOUCHING';
    postureSeverity = 'MEDIUM';
    postureDescription = `Moderate slouching/trunk inclination detected (${trunkAngle.toFixed(1)}°).`;
  } else if (neckAngle > neckUnsafeDeg) {
    postureState = 'FORWARD_HEAD';
    postureSeverity = 'MEDIUM';
    postureDescription = `Excessive forward neck bend detected (${neckAngle.toFixed(1)}°). Risk of cervical fatigue.`;
  }

  // --- Fatigue Tracking (in milliseconds) ---
  const nowMs = typeof options.timestamp === 'number'
    ? options.timestamp
    : (typeof options.timestamp === 'string' ? Date.parse(options.timestamp) : Date.now());

  const lastMs = history.lastTimestampMs ?? nowMs;
  const dtMs = Math.max(0, Math.min(5000, nowMs - lastMs));

  const isDrooping = neckAngle > headDroopDeg;
  const isSlouched = trunkAngle > 28.0;

  let headDroopMs = history.headDroopDurationMs ?? 0;
  if (isDrooping) {
    headDroopMs += dtMs;
  } else {
    headDroopMs = Math.max(0, headDroopMs - dtMs * 2);
  }

  let slouchMs = history.slouchDurationMs ?? 0;
  if (isSlouched) {
    slouchMs += dtMs;
  } else {
    slouchMs = Math.max(0, slouchMs - dtMs);
  }

  // Track physical immobility based on centroid displacement
  const bbox = person.bbox ?? person;
  const curPos = {
    x: (bbox.x1 !== undefined && bbox.x2 !== undefined) ? (bbox.x1 + bbox.x2) / 2 : 0,
    y: (bbox.y1 !== undefined && bbox.y2 !== undefined) ? (bbox.y1 + bbox.y2) / 2 : 0,
  };

  let immobileMs = history.immobileDurationMs ?? 0;
  if (history.lastPos) {
    const dist = distance2D(curPos, history.lastPos);
    if (dist < 8.0) {
      immobileMs += dtMs;
    } else {
      immobileMs = 0;
    }
  }

  const droopDwellMs = options.fatigueDwellMs ?? CONFIG.timing?.fatigueDwellMs ?? 2000;
  const immobilityThresholdMs = options.immobilityThresholdMs ?? CONFIG.timing?.immobilityMs ?? 15000;

  // Compute normalized fatigue score (0.0 to 1.0)
  const droopComponent = Math.min(0.50, (headDroopMs / Math.max(1000, droopDwellMs)) * 0.50);
  const slouchComponent = Math.min(0.30, (slouchMs / Math.max(2000, droopDwellMs * 2)) * 0.30);
  const immobilityComponent = Math.min(0.20, (immobileMs / 30000) * 0.20);
  const fatigueScore = Math.round(Math.min(1.0, droopComponent + slouchComponent + immobilityComponent) * 100) / 100;

  const fatigueIndicators = [];
  const droopSec = Math.round((headDroopMs / 1000) * 10) / 10;
  const immobileSec = Math.round((immobileMs / 1000) * 10) / 10;

  if (droopSec >= 2.0) {
    fatigueIndicators.push(`head_droop_${droopSec}s`);
  }
  if (slouchMs >= droopDwellMs) {
    fatigueIndicators.push('prolonged_slumped_posture');
  }
  if (immobileMs >= immobilityThresholdMs && isSlouched) {
    fatigueIndicators.push('lethargic_immobility');
  }

  const isFatigued = fatigueScore >= 0.60 || fatigueIndicators.length >= 2 || droopSec >= 3.0;
  const fatigueDesc = isFatigued
    ? `Worker fatigue detected (Score: ${fatigueScore.toFixed(2)}). Symptoms: ${fatigueIndicators.join(', ')}.`
    : 'Worker alertness within normal ergonomic thresholds.';

  if (isFatigued) {
    findings.push({
      status: 'VIOLATION',
      type: 'WorkerFatigue',
      confidence: fatigueScore,
      points: CONFIG.violations?.WorkerFatigue?.base ?? CONFIG.violations?.Fatigue?.base ?? 45,
      evidence: {
        fatigueScore,
        fatigueIndicators,
        headDroopSeconds: droopSec,
        immobilitySeconds: immobileSec,
        reason: fatigueDesc,
      },
    });
  }

  const rebaScore = postureSeverity === 'CRITICAL' ? 8 : (postureSeverity === 'HIGH' ? 7 : (postureSeverity === 'MEDIUM' ? 3 : 1));

  return {
    status: findings.some((f) => f.status === 'VIOLATION') ? 'VIOLATION' : 'COMPLIANT',
    postureState,
    riskLevel: postureSeverity,
    angles: {
      trunkInclinationDeg: trunkAngle,
      neckFlexionDeg: neckAngle,
      leftKneeAngleDeg: leftKneeAngle,
      rightKneeAngleDeg: rightKneeAngle,
      rebaRiskScore: rebaScore,
    },
    fatigue: {
      isFatigued,
      fatigueScore,
      indicators: fatigueIndicators,
      headDroopDurationSeconds: droopSec,
      immobilitySeconds: immobileSec,
      description: fatigueDesc,
    },
    updatedHistory: {
      lastTimestampMs: nowMs,
      headDroopDurationMs: headDroopMs,
      slouchDurationMs: slouchMs,
      immobileDurationMs: immobileMs,
      lastPos: curPos,
    },
    findings,
  };
}

export default postureRule;
