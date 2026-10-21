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

// Computes the torso angle relative to the horizontal floor (0° = lying flat, 90° = perfectly upright).
function extractTorsoFloorAngle(landmarks) {
  if (!landmarks) return null;
  const lm = landmarks.landmarks ?? landmarks.landmark ?? landmarks;
  const ls = lm[11] ?? lm['11'];
  const rs = lm[12] ?? lm['12'];
  const lh = lm[23] ?? lm['23'];
  const rh = lm[24] ?? lm['24'];

  if (!ls || !rs || !lh || !rh) return null;
  const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

  // Angle from vertical: 0° is upright, 90° is horizontal. Floor angle is 90° - vertical angle.
  const angleVert = angleFromVertical(midShoulder, midHip);
  return Math.max(0, Math.min(90, Math.round((90.0 - angleVert) * 10) / 10));
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

  // 2. Torso inclination relative to floor (< 30° indicates prone/horizontal body)
  const torsoFloorAngle = extractTorsoFloorAngle(landmarks);
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

  // 4. Horizontal floor condition
  const isHorizontal = (aspectRatio < aspectThreshold) || (torsoFloorAngle !== null && torsoFloorAngle < torsoFloorAngleThreshold);

  let fallStartTimeMs = trackState.fallStartTimeMs ?? null;
  let groundDurationMs = 0;

  if (isHorizontal) {
    if (fallStartTimeMs === null) {
      fallStartTimeMs = nowMs;
    }
    groundDurationMs = Math.max(0, nowMs - fallStartTimeMs);
  } else {
    // Worker is upright or recovered
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

  if (isHorizontal && groundDurationMs >= confirmMs) {
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
