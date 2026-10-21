import { angleFromVertical } from '../geometry.js';
import { CONFIG } from '../config.js';

// Parses bounding box into standard dimensions [x1, y1, x2, y2, width, height, centerY].
function parsePersonBox(raw) {
  if (!raw) return null;
  const b = raw.bbox ?? raw.box ?? raw;
  let x1, y1, x2, y2;

  if (Array.isArray(b)) {
    if (b.length < 4) return null;
    [x1, y1, x2, y2] = b;
  } else if (typeof b === 'object') {
    x1 = b.x1 ?? b.xmin ?? b.left ?? b.x ?? null;
    y1 = b.y1 ?? b.ymin ?? b.top ?? b.y ?? null;
    x2 = b.x2 ?? b.xmax ?? b.right ?? (b.width !== undefined ? (x1 ?? 0) + b.width : null);
    y2 = b.y2 ?? b.ymax ?? b.bottom ?? (b.height !== undefined ? (y1 ?? 0) + b.height : null);
  }

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    width,
    height,
    centerY: (minY + maxY) / 2,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 1.0,
  };
}

// Normalizes arbitrary landmark collections into a validated Map by index.
function parseLandmarksMap(raw) {
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
      const visibility = typeof pt.visibility === 'number' ? pt.visibility : (typeof pt.confidence === 'number' ? pt.confidence : 1.0);
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
      const visibility = typeof pt.visibility === 'number' ? pt.visibility : (typeof pt.confidence === 'number' ? pt.confidence : 1.0);
      if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
        map.set(idx, { x, y, z, visibility });
      }
    }
  }

  return map.size > 0 ? map : null;
}

// Analyzes skeletal posture and leg support to differentiate true falls from forward bending and floor reaching.
function evaluatePoseKinematics(landmarksInput, box, options = {}) {
  const lmMap = parseLandmarksMap(landmarksInput);
  if (!lmMap) {
    return {
      hasLandmarks: false,
      isReliable: false,
      torsoFloorAngle: null,
      isStandingLegsSupported: false,
      hipAnkleVerticalDistance: null,
    };
  }

  const minVisibility = options.minVisibility ?? CONFIG.minConf?.landmark ?? 0.4;
  const ls = lmMap.get(11);
  const rs = lmMap.get(12);
  const lh = lmMap.get(23);
  const rh = lmMap.get(24);
  const lk = lmMap.get(25);
  const rk = lmMap.get(26);
  const la = lmMap.get(27);
  const ra = lmMap.get(28);

  const hasShoulders = (ls && ls.visibility >= minVisibility) || (rs && rs.visibility >= minVisibility);
  const hasHips = (lh && lh.visibility >= minVisibility) || (rh && rh.visibility >= minVisibility);

  if (!hasShoulders || !hasHips) {
    return {
      hasLandmarks: true,
      isReliable: false,
      torsoFloorAngle: null,
      isStandingLegsSupported: false,
      hipAnkleVerticalDistance: null,
    };
  }

  const shoulderPts = [ls, rs].filter((p) => p && p.visibility >= minVisibility);
  const hipPts = [lh, rh].filter((p) => p && p.visibility >= minVisibility);
  const midShoulder = {
    x: shoulderPts.reduce((acc, p) => acc + p.x, 0) / shoulderPts.length,
    y: shoulderPts.reduce((acc, p) => acc + p.y, 0) / shoulderPts.length,
  };
  const midHip = {
    x: hipPts.reduce((acc, p) => acc + p.x, 0) / hipPts.length,
    y: hipPts.reduce((acc, p) => acc + p.y, 0) / hipPts.length,
  };

  const angleVert = angleFromVertical(midShoulder, midHip);
  const torsoFloorAngle = Math.max(0, Math.min(90, Math.round((90.0 - angleVert) * 10) / 10));

  // Determine if lower extremities are supporting the pelvis upright (standing or bending)
  const anklePts = [la, ra].filter((p) => p && p.visibility >= 0.25);
  const kneePts = [lk, rk].filter((p) => p && p.visibility >= 0.25);
  const lowerPts = anklePts.length > 0 ? anklePts : kneePts;

  let isStandingLegsSupported = false;
  let hipAnkleVerticalDistance = null;

  if (lowerPts.length > 0) {
    const midLower = {
      x: lowerPts.reduce((acc, p) => acc + p.x, 0) / lowerPts.length,
      y: lowerPts.reduce((acc, p) => acc + p.y, 0) / lowerPts.length,
    };

    const rawDy = midLower.y - midHip.y;
    hipAnkleVerticalDistance = Math.round(rawDy * 10) / 10;

    // Check if coordinates are normalized (0-1) or pixel-based
    const isNormalizedCoords = midLower.y <= 2.0 && midHip.y <= 2.0;
    const normalizedDy = isNormalizedCoords
      ? rawDy
      : rawDy / Math.max(1, box?.height ?? 100);

    const legAngleVert = angleFromVertical(midHip, midLower);

    // Standing leg support: hips elevated above feet/knees and leg axis predominantly vertical
    if (normalizedDy >= 0.18 && legAngleVert < 50.0) {
      isStandingLegsSupported = true;
    }
  }

  return {
    hasLandmarks: true,
    isReliable: true,
    torsoFloorAngle,
    isStandingLegsSupported,
    hipAnkleVerticalDistance,
  };
}

// Evaluates worker bounding box collapse, normalized descent velocity, and floor immobility.
export function fallRule(person, landmarks = null, trackState = {}, options = {}) {
  const box = parsePersonBox(person);
  if (!box) {
    return {
      status: 'INVALID',
      fallState: 'NORMAL',
      isFallen: false,
      aspectRatio: 0,
      torsoFloorAngleDeg: 90,
      findings: [
        {
          status: 'INVALID',
          type: 'InvalidInput',
          confidence: 0,
          points: 0,
          evidence: { reason: 'Person box is null, zero-area, or invalid' },
        },
      ],
    };
  }

  // Pre-condition: bypass tiny workers below minimum dimension in both axes
  const minHeight = options.minPersonHeightPx ?? CONFIG.ppe?.minPersonHeightPx ?? 120;
  const maxDim = Math.max(box.width, box.height);
  if (maxDim < minHeight && !trackState.fallStartTimeMs) {
    return {
      status: 'SKIPPED',
      fallState: 'NORMAL',
      isFallen: false,
      aspectRatio: Math.round((box.height / box.width) * 100) / 100,
      torsoFloorAngleDeg: 90,
      findings: [
        {
          status: 'SKIPPED',
          type: 'SkippedWorker',
          confidence: box.confidence,
          points: 0,
          evidence: { reason: `Worker scale (${maxDim}px) is below minHeight (${minHeight}px)` },
        },
      ],
    };
  }

  const nowMs = typeof options.timestamp === 'number'
    ? options.timestamp
    : (typeof options.timestamp === 'string' ? Date.parse(options.timestamp) : Date.now());

  // 1. Aspect ratio (Height / Width): upright workers are > 2.0; fallen horizontal workers are < 0.85
  const aspectRatio = Math.round((box.height / box.width) * 100) / 100;
  const aspectThreshold = options.aspectRatioThreshold ?? CONFIG.fall?.aspectRatioThreshold ?? 0.85;

  // 2. Biomechanical Pose Kinematics (torso inclination and leg support)
  const kinematics = evaluatePoseKinematics(landmarks, box, options);
  const torsoFloorAngle = kinematics.torsoFloorAngle;
  const torsoFloorAngleThreshold = options.torsoAngleThresholdDeg ?? CONFIG.fall?.torsoAngleThresholdDeg ?? 30.0;

  // 3. Normalized descent velocity (displacement normalized by person height)
  const positionHistory = Array.isArray(trackState.positionHistory) ? [...trackState.positionHistory] : [];
  positionHistory.push({ y: box.centerY, timestampMs: nowMs, height: box.height });

  // Keep last 600ms of position history
  const recentHistory = positionHistory.filter((p) => nowMs - p.timestampMs <= 600);

  let isRapidDescent = false;
  let normalizedVelocity = 0;
  if (recentHistory.length >= 2) {
    const oldest = recentHistory[0];
    const dtSec = Math.max(0.033, (nowMs - oldest.timestampMs) / 1000);
    // Downward displacement on screen is positive dy (y increases downward)
    const dy = box.centerY - oldest.y;
    const refHeight = Math.max(1, (box.height + oldest.height) / 2);
    const normalizedDy = dy / refHeight;
    normalizedVelocity = Math.round((normalizedDy / dtSec) * 100) / 100;

    const velThreshold = options.normalizedVelocityThreshold ?? CONFIG.fall?.normalizedVelocityThreshold ?? 0.08;
    if (normalizedDy >= velThreshold) {
      isRapidDescent = true;
    }
  }

  // 4. Horizontal floor condition discrimination
  let isFloorPosture = false;
  let isUncertainEvidence = false;
  let uncertainReason = '';

  const isCollapsedBox = aspectRatio <= aspectThreshold;

  if (isCollapsedBox) {
    if (!kinematics.hasLandmarks || !kinematics.isReliable) {
      // Box collapsed horizontally, but pose landmarks are missing or unreliable.
      // Per safety contract: do NOT automatically confirm fall without reliable pose evidence.
      isUncertainEvidence = true;
      uncertainReason = 'Worker aspect ratio collapsed, but pose landmarks are missing or unreliable to confirm fall.';
    } else if (kinematics.isStandingLegsSupported) {
      // Person is supported on standing legs (e.g. deep forward bend or reaching down).
      isFloorPosture = false;
    } else {
      // Reliable landmarks confirm absence of standing leg support
      const isTorsoHorizontal = torsoFloorAngle !== null && torsoFloorAngle <= torsoFloorAngleThreshold;
      if (isTorsoHorizontal) {
        isFloorPosture = true;
      }
    }
  } else {
    // Aspect ratio > aspectThreshold: Worker is not collapsed horizontally
    isFloorPosture = false;
  }

  let fallStartTimeMs = trackState.fallStartTimeMs ?? null;
  let groundDurationMs = 0;

  if (isFloorPosture) {
    if (fallStartTimeMs === null) {
      fallStartTimeMs = nowMs;
    }
    groundDurationMs = Math.max(0, nowMs - fallStartTimeMs);
  } else {
    // Worker is upright, recovered, or bending with leg support
    fallStartTimeMs = null;
    groundDurationMs = 0;
  }

  // Thresholds in milliseconds
  const confirmMs = options.fallConfirmationMs ?? CONFIG.timing?.fallConfirmationMs ?? 333; // 10 frames @ 30 FPS
  const recoveryTimeoutMs = options.fallRecoveryTimeoutMs ?? CONFIG.timing?.fallRecoveryTimeoutMs ?? 5000;

  let fallState = 'NORMAL';
  let isFallen = false;
  let emergencyAlert = false;
  const findings = [];

  if (isFloorPosture && groundDurationMs >= confirmMs) {
    isFallen = true;
    const groundSec = Math.round((groundDurationMs / 1000) * 10) / 10;

    if (groundDurationMs >= recoveryTimeoutMs) {
      fallState = 'FALLEN_INACTIVE';
      emergencyAlert = true;
      const desc = `CRITICAL MAN-DOWN: Worker has fallen and remained inactive on floor for ${groundSec.toFixed(1)}s. Immediate emergency assistance required!`;
      findings.push({
        status: 'VIOLATION',
        type: 'FallEvent',
        confidence: 0.96,
        points: CONFIG.violations?.FallEvent?.base ?? 90,
        evidence: {
          fallState,
          emergencyAlert,
          groundDurationSeconds: groundSec,
          aspectRatio,
          torsoFloorAngleDeg: torsoFloorAngle,
          normalizedVelocity,
          reason: desc,
        },
      });
    } else {
      fallState = 'FALLEN';
      const desc = `Worker fall detected! Aspect ratio: ${aspectRatio.toFixed(2)}, Ground duration: ${groundSec.toFixed(1)}s.`;
      findings.push({
        status: 'VIOLATION',
        type: 'FallEvent',
        confidence: 0.88,
        points: CONFIG.violations?.FallEvent?.base ?? 90,
        evidence: {
          fallState,
          emergencyAlert,
          groundDurationSeconds: groundSec,
          aspectRatio,
          torsoFloorAngleDeg: torsoFloorAngle,
          normalizedVelocity,
          reason: desc,
        },
      });
    }
  } else if (isUncertainEvidence) {
    fallState = 'UNCERTAIN';
    findings.push({
      status: 'UNCERTAIN',
      type: 'UncertainFall',
      confidence: 0.50,
      points: 0,
      evidence: {
        fallState,
        aspectRatio,
        torsoFloorAngleDeg: torsoFloorAngle,
        normalizedVelocity,
        reason: uncertainReason,
      },
    });
  } else if (isRapidDescent) {
    fallState = 'RAPID_DESCENT';
    findings.push({
      status: 'UNCERTAIN',
      type: 'UncertainFall',
      confidence: 0.65,
      points: 0,
      evidence: {
        fallState,
        normalizedVelocity,
        reason: `Rapid downward descent velocity detected (${normalizedVelocity} heights/sec), awaiting confirmation.`,
      },
    });
  }

  return {
    status: findings.some((f) => f.status === 'VIOLATION') ? 'VIOLATION' : (findings.some((f) => f.status === 'UNCERTAIN') ? 'UNCERTAIN' : 'COMPLIANT'),
    fallState,
    isFallen,
    emergencyAlert,
    aspectRatio,
    torsoFloorAngleDeg: torsoFloorAngle ?? (aspectRatio < 0.7 ? 20.0 : (aspectRatio < 1.0 ? 35.0 : 85.0)),
    timeOnGroundSeconds: Math.round((groundDurationMs / 1000) * 10) / 10,
    updatedTrackState: {
      fallStartTimeMs,
      positionHistory: recentHistory,
    },
    findings,
  };
}

export default fallRule;
