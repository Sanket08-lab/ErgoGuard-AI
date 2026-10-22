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

// Normalizes and validates worker bounding box dimensions, rejecting zero-area or non-finite inputs.
function parsePersonBox(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw.bbox ?? raw.box ?? raw.bounding_box ?? raw;
  if (!b || typeof b !== 'object') return null;

  let x1 = null;
  let y1 = null;
  let x2 = null;
  let y2 = null;

  if (Array.isArray(b)) {
    if (b.length >= 4) {
      [x1, y1, x2, y2] = b;
    }
  } else {
    x1 = b.x1 ?? b.xmin ?? b.left ?? b.x ?? null;
    y1 = b.y1 ?? b.ymin ?? b.top ?? b.y ?? null;
    x2 = b.x2 ?? b.xmax ?? b.right ?? (b.width !== undefined ? (x1 ?? 0) + b.width : null);
    y2 = b.y2 ?? b.ymax ?? b.bottom ?? (b.height !== undefined ? (y1 ?? 0) + b.height : null);
  }

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return null;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const rawConf = raw.confidence ?? b.confidence;
  const confidence = typeof rawConf === 'number' && Number.isFinite(rawConf) ? rawConf : 1.0;

  return {
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    width,
    height,
    confidence,
  };
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

  // 1. Person detection confidence validation
  const rawPersonConf = person?.confidence ?? person?.bbox?.confidence;
  const hasPersonConf = rawPersonConf !== undefined;
  const personConf = hasPersonConf ? rawPersonConf : 1.0;
  const minPersonConf = options.minPersonConf ?? CONFIG.minConf?.person ?? 0.5;

  if (personConf < minPersonConf) {
    return {
      status: 'UNCERTAIN',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'UNCERTAIN',
          type: 'UncertainPerson',
          confidence: personConf,
          points: 0,
          evidence: { reason: `Person detection confidence (${personConf}) is below threshold (${minPersonConf})` },
        },
      ],
    };
  }

  // 2. Person bounding box validity and scale validation
  const personBox = parsePersonBox(person);
  if (!personBox) {
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
          evidence: { reason: 'Person bounding box is null, missing, zero-area, or invalid' },
        },
      ],
    };
  }

  const minPersonHeight = options.minPersonHeightPx ?? CONFIG.posture?.minPersonHeightPx ?? CONFIG.ppe?.minPersonHeightPx ?? 120;
  const maxDim = Math.max(personBox.width, personBox.height);
  if (maxDim < minPersonHeight) {
    return {
      status: 'SKIPPED',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'SKIPPED',
          type: 'SkippedWorker',
          confidence: personConf,
          points: 0,
          evidence: {
            reason: `Worker scale (${maxDim}px) is below minPersonHeightPx threshold (${minPersonHeight}px)`,
            height: personBox.height,
            width: personBox.width,
            minPersonHeight,
          },
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
  const lsVis = (ls?.visibility ?? 0) >= minVisibility;
  const rsVis = (rs?.visibility ?? 0) >= minVisibility;
  const lhVis = (lh?.visibility ?? 0) >= minVisibility;
  const rhVis = (rh?.visibility ?? 0) >= minVisibility;

  if ((!lsVis && !rsVis) || (!lhVis && !rhVis)) {
    return {
      status: 'UNCERTAIN',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'UNCERTAIN',
          type: 'UncertainPose',
          confidence: Math.max(ls?.visibility ?? 0, rs?.visibility ?? 0, lh?.visibility ?? 0, rh?.visibility ?? 0),
          points: 0,
          evidence: { reason: 'Torso landmarks (shoulders/hips) occluded or low visibility' },
        },
      ],
    };
  }

  // Determine reliable torso upper and lower references:
  // If both shoulders and both hips are visible, use bilateral midpoints.
  // If one side has occluded hip or shoulder, use the fully-observed ipsilateral pair (left-to-left or right-to-right).
  let torsoUpperPoint;
  let torsoLowerPoint;

  const hasZ = (ls?.z !== undefined || rs?.z !== undefined || lh?.z !== undefined || rh?.z !== undefined);

  if (lsVis && rsVis && lhVis && rhVis) {
    torsoUpperPoint = {
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
      ...(hasZ ? { z: ((ls?.z ?? 0) + (rs?.z ?? 0)) / 2 } : {}),
    };
    torsoLowerPoint = {
      x: (lh.x + rh.x) / 2,
      y: (lh.y + rh.y) / 2,
      ...(hasZ ? { z: ((lh?.z ?? 0) + (rh?.z ?? 0)) / 2 } : {}),
    };
  } else if (lsVis && lhVis && (!rsVis || !rhVis)) {
    // Left ipsilateral axis (avoids lateral bias from single hip)
    torsoUpperPoint = { x: ls.x, y: ls.y, ...(ls?.z !== undefined ? { z: ls.z } : {}) };
    torsoLowerPoint = { x: lh.x, y: lh.y, ...(lh?.z !== undefined ? { z: lh.z } : {}) };
  } else if (rsVis && rhVis && (!lsVis || !lhVis)) {
    // Right ipsilateral axis (avoids lateral bias from single hip)
    torsoUpperPoint = { x: rs.x, y: rs.y, ...(rs?.z !== undefined ? { z: rs.z } : {}) };
    torsoLowerPoint = { x: rh.x, y: rh.y, ...(rh?.z !== undefined ? { z: rh.z } : {}) };
  } else {
    // Both hips or both shoulders on opposing diagonals (e.g. only ls & rh):
    // Insufficient anatomical consistency to distinguish lateral asymmetry from forward stoop
    return {
      status: 'UNCERTAIN',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'UNCERTAIN',
          type: 'UncertainPose',
          confidence: Math.max(ls?.visibility ?? 0, rs?.visibility ?? 0, lh?.visibility ?? 0, rh?.visibility ?? 0),
          points: 0,
          evidence: { reason: 'Asymmetrical diagonal torso occlusion prevents reliable posture evaluation' },
        },
      ],
    };
  }

  const earPoint = (le && re && (le.visibility >= 0.3 || re.visibility >= 0.3))
    ? {
        x: (le.x + re.x) / 2,
        y: (le.y + re.y) / 2,
        ...(le?.z !== undefined && re?.z !== undefined ? { z: (le.z + re.z) / 2 } : {}),
      }
    : (le && le.visibility >= 0.3 ? le : (re && re.visibility >= 0.3 ? re : torsoUpperPoint));

  // 3. Anatomical torso segment length validation (uses 3D Euclidean distance when Z is available)
  const torsoLength = (torsoUpperPoint.z !== undefined && torsoLowerPoint.z !== undefined)
    ? Math.hypot(torsoUpperPoint.x - torsoLowerPoint.x, torsoUpperPoint.y - torsoLowerPoint.y, torsoUpperPoint.z - torsoLowerPoint.z)
    : distance2D(torsoUpperPoint, torsoLowerPoint);

  const minTorsoLength = options.minTorsoLengthPx ?? CONFIG.posture?.minTorsoLengthPx ?? 25;
  if (torsoLength < minTorsoLength) {
    return {
      status: 'UNCERTAIN',
      postureState: 'UNKNOWN',
      angles: null,
      fatigue: null,
      findings: [
        {
          status: 'UNCERTAIN',
          type: 'UncertainPose',
          confidence: Math.round(((ls?.visibility ?? 0) + (lh?.visibility ?? 0)) / 2 * 100) / 100,
          points: 0,
          evidence: { reason: `Degenerate torso segment length (${torsoLength.toFixed(1)}px < ${minTorsoLength}px)` },
        },
      ],
    };
  }

  // 1. Trunk inclination angle from vertical (0° = upright, 90° = horizontal in sagittal/coronal plane)
  const trunkAngle = Math.round(angleFromVertical(torsoUpperPoint, torsoLowerPoint) * 10) / 10;

  // 2. Neck flexion angle from vertical (head tilt relative to mid-shoulder)
  const neckAngle = Math.round(angleFromVertical(earPoint, torsoUpperPoint) * 10) / 10;

  // 3. Bilateral knee flexion angles (straight leg = ~180°)
  // For knee angle angleAt(hip, knee, ankle) to be valid, hip, knee, AND ankle must have reliable visibility
  const minLegVisibility = options.minLegVisibility ?? 0.20;
  const hasLeftKnee = Boolean(
    lh && lk && la &&
    (lh.visibility >= minVisibility || lhVis) &&
    (lk.visibility >= minLegVisibility) &&
    (la.visibility >= minLegVisibility)
  );
  const hasRightKnee = Boolean(
    rh && rk && ra &&
    (rh.visibility >= minVisibility || rhVis) &&
    (rk.visibility >= minLegVisibility) &&
    (ra.visibility >= minLegVisibility)
  );
  const hasKneeEvidence = hasLeftKnee || hasRightKnee;

  let leftKneeAngle = 180.0;
  let rightKneeAngle = 180.0;

  if (hasLeftKnee) {
    leftKneeAngle = Math.round(angleAt(lh, lk, la) * 10) / 10;
  }
  if (hasRightKnee) {
    rightKneeAngle = Math.round(angleAt(rh, rk, ra) * 10) / 10;
  }
  const minKneeAngle = hasKneeEvidence
    ? Math.min(hasLeftKnee ? leftKneeAngle : Infinity, hasRightKnee ? rightKneeAngle : Infinity)
    : null;

  // Ergonomic thresholds (provisional engineering thresholds)
  const trunkUnsafeDeg = options.trunkUnsafeDeg ?? CONFIG.posture?.stoopTrunkDeg ?? 45.0;
  const trunkSevereDeg = options.trunkSevereDeg ?? CONFIG.posture?.trunkBendDeg ?? 60.0;
  const straightKneeDeg = options.straightKneeDeg ?? CONFIG.posture?.straightKneeDeg ?? 150.0;
  const neckUnsafeDeg = options.neckUnsafeDeg ?? 35.0;
  const headDroopDeg = options.headDroopDeg ?? 40.0;

  // --- Temporal & Duration Tracking (in milliseconds) ---
  const nowMs = typeof options.timestamp === 'number'
    ? options.timestamp
    : (typeof options.timestamp === 'string' ? Date.parse(options.timestamp) : Date.now());

  const lastMs = history.lastTimestampMs ?? nowMs;
  const dtMs = Math.max(0, Math.min(5000, nowMs - lastMs));

  // When timestamp is not provided (e.g. single-frame static unit tests), grace period defaults to 0
  const briefBendGraceMs = options.briefBendGraceMs ?? (options.timestamp !== undefined ? (CONFIG.posture?.briefBendGraceMs ?? 1500) : 0);
  const sustainedBendMs = options.sustainedBendMs ?? CONFIG.posture?.sustainedBendMs ?? 3000;
  const hysteresisMarginDeg = options.hysteresisMarginDeg ?? CONFIG.posture?.hysteresisMarginDeg ?? 3.0;

  // Track active stooping duration with deadband margin for angle fluctuations
  let stoopDurationMs = history.stoopDurationMs ?? 0;
  let severeStoopDurationMs = history.severeStoopDurationMs ?? 0;

  // Deadband threshold: if already stooping, allow slight angle dip without resetting
  const activeStoopCutoff = stoopDurationMs > 0 ? (trunkUnsafeDeg - hysteresisMarginDeg) : trunkUnsafeDeg;
  const activeSevereCutoff = severeStoopDurationMs > 0 ? (trunkSevereDeg - hysteresisMarginDeg) : trunkSevereDeg;

  // Horizontal floor posture filter: prone/supine workers on floor (e.g. aspect ratio < 0.50) are evaluated by fallRule, not stoop lifting
  const isHorizontalOrFloor = trunkAngle >= 75.0 && (personBox.height / Math.max(1, personBox.width) < 0.50);

  // Stoop lifting / forward bending candidate:
  // Requires knee evidence so non-human furniture clutter (with 0.0 knee visibility) is rejected.
  // 1. Severe stoop (trunkAngle >= 60°): extreme lumbar flexion is hazardous regardless of knee angle.
  // 2. Moderate stoop (trunkAngle >= 45°): hazardous when knees are straight (minKneeAngle >= straightKneeDeg).
  const isSevereStoop = hasKneeEvidence && (trunkAngle >= activeSevereCutoff);
  const isStraightKneeStoop = hasKneeEvidence && (trunkAngle >= activeStoopCutoff) && (minKneeAngle >= straightKneeDeg);
  const isStoopLiftingCandidate = (isSevereStoop || isStraightKneeStoop) && !isHorizontalOrFloor;

  if (isStoopLiftingCandidate) {
    stoopDurationMs += dtMs;
    if (trunkAngle >= activeSevereCutoff) {
      severeStoopDurationMs += dtMs;
    } else {
      severeStoopDurationMs = Math.max(0, severeStoopDurationMs - dtMs);
    }
  } else {
    // Confirmed recovery: worker is upright (trunkAngle < 28°) or squatting (minKneeAngle < 130°)
    // Fast decay (2x dt) to clear duration while smoothing transient single-frame noise
    stoopDurationMs = Math.max(0, stoopDurationMs - dtMs * 2);
    severeStoopDurationMs = Math.max(0, severeStoopDurationMs - dtMs * 2);
  }

  let postureState = 'SAFE';
  let postureSeverity = 'LOW';
  let postureDescription = 'Worker is maintaining an ergonomic and safe posture.';
  const findings = [];

  // Ergonomic Lifting & Bending Evaluation
  if (trunkAngle >= trunkUnsafeDeg || (stoopDurationMs > 0 && trunkAngle >= activeStoopCutoff)) {
    // Acceptable squat lift requires bent knees (< 130°) AND trunk is NOT severely stooped (< trunkSevereDeg, 60°)
    const isAcceptableSquat = hasKneeEvidence && minKneeAngle < 130.0 && trunkAngle < trunkSevereDeg;

    if (isAcceptableSquat) {
      postureState = 'SAFE';
      postureSeverity = 'LOW';
      postureDescription = `Squat posture detected (knees bent at ${minKneeAngle.toFixed(1)}°, trunk ${trunkAngle.toFixed(1)}°). Acceptable ergonomic lift.`;
    } else if (hasKneeEvidence && (isSevereStoop || minKneeAngle >= straightKneeDeg) && !isHorizontalOrFloor) {
      // Stoop lift evaluation (severe stoop >= 60° regardless of knee angle, or straight-knee stoop >= 45°)
      if (options.briefBendGraceMs && stoopDurationMs < options.briefBendGraceMs) {
        // Category A: Normal movement within explicitly configured grace window
        postureState = 'BRIEF_BEND';
        postureSeverity = 'LOW';
        postureDescription = `Brief bending movement (${(stoopDurationMs / 1000).toFixed(1)}s < ${(options.briefBendGraceMs / 1000).toFixed(1)}s). Acceptable transient motion.`;
      } else {
        // Stoop lift evaluation with duration-based escalation
        postureState = 'UNSAFE_LIFTING';
        const durSec = (stoopDurationMs / 1000).toFixed(1);
        let points = CONFIG.violations?.UnsafePosture?.base ?? 40;

        if (severeStoopDurationMs >= sustainedBendMs && trunkAngle >= (trunkSevereDeg - hysteresisMarginDeg)) {
          // Category C: High-risk posture - severe stoop (>= 60°) sustained >= 3.0s
          postureSeverity = 'CRITICAL';
          points = CONFIG.violations?.UnsafePosture?.critical ?? 80;
          postureDescription = `Severe sustained stoop lift detected! Trunk bent ${trunkAngle.toFixed(1)}° (knees ${minKneeAngle.toFixed(1)}°) for ${durSec}s.`;
        } else if (stoopDurationMs >= sustainedBendMs) {
          // Category B: Sustained moderate stoop (>= 45°) sustained >= 3.0s
          postureSeverity = 'HIGH';
          points = CONFIG.violations?.UnsafePosture?.high ?? 60;
          postureDescription = `Sustained stoop lift detected! Trunk bent ${trunkAngle.toFixed(1)}° (knees ${minKneeAngle.toFixed(1)}°) for ${durSec}s.`;
        } else {
          // Category B: Stoop lift (< 3.0s)
          postureSeverity = trunkAngle >= trunkSevereDeg ? 'CRITICAL' : 'HIGH';
          points = CONFIG.violations?.UnsafePosture?.base ?? 40;
          postureDescription = `Dangerous lifting technique detected! Trunk bent ${trunkAngle.toFixed(1)}° (knees ${minKneeAngle.toFixed(1)}°) for ${durSec}s.`;
        }

        findings.push({
          status: 'VIOLATION',
          type: 'UnsafePosture',
          confidence: Math.round(((ls?.visibility ?? 0.8) + (lh?.visibility ?? 0.8)) / 2 * 100) / 100,
          points,
          evidence: {
            postureState,
            trunkAngle,
            neckAngle,
            minKneeAngle,
            stoopDurationMs,
            severity: postureSeverity,
            reason: postureDescription,
          },
        });
      }
    } else {
      // Lower body / knees unobserved: cannot confirm dangerous straight-knee lift
      postureState = 'SLOUCHING';
      postureSeverity = 'MEDIUM';
      postureDescription = `Trunk bent forward (${trunkAngle.toFixed(1)}°) with lower body occluded. Cannot verify knee flexion for stoop lifting.`;
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
  // Cervical head droop applies when torso is upright or moderately slouched (trunkAngle <= 45°).
  // During forward bending, stooping, or horizontal positions, head angle reflects working posture rather than drowsiness.
  const isDrooping = trunkAngle <= 45.0 && neckAngle > headDroopDeg;
  const isSlouched = trunkAngle > 28.0 && trunkAngle <= 70.0;

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

  // Sustained fatigue requires cumulative evidence across dwell, slouching, or immobility
  const isFatigued = fatigueScore >= 0.60 || (fatigueIndicators.length >= 2 && droopSec >= 2.0);
  const fatigueDesc = isFatigued
    ? `Worker fatigue detected (Score: ${fatigueScore.toFixed(2)}). Symptoms: ${fatigueIndicators.join(', ')}.`
    : 'Worker alertness within normal ergonomic thresholds.';

  if (isFatigued) {
    if (postureState === 'SAFE' || postureState === 'NORMAL' || postureState === 'SLOUCHING') {
      postureState = 'FATIGUED';
      postureSeverity = 'HIGH';
      postureDescription = fatigueDesc;
    }
    findings.push({
      status: 'VIOLATION',
      type: 'WorkerFatigue',
      confidence: fatigueScore,
      points: CONFIG.violations?.WorkerFatigue?.base ?? CONFIG.violations?.Fatigue?.base ?? 45,
      evidence: {
        postureState,
        fatigueScore,
        fatigueIndicators,
        headDroopSeconds: droopSec,
        immobilitySeconds: immobileSec,
        reason: fatigueDesc,
      },
    });
  }

  const rebaScore = postureSeverity === 'CRITICAL' ? 8 : (postureSeverity === 'HIGH' ? 7 : (postureSeverity === 'MEDIUM' ? 3 : 1));

  // Diagnostic telemetry log
  if (typeof window !== 'undefined' || options.debug) {
    const dx = torsoLowerPoint.x - torsoUpperPoint.x;
    const dy = torsoLowerPoint.y - torsoUpperPoint.y;
    const dz = (torsoLowerPoint.z !== undefined && torsoUpperPoint.z !== undefined) ? (torsoLowerPoint.z - torsoUpperPoint.z) : 0;
    const findingsStr = findings.map((f) => `${f.type}(+${f.points}pt)`).join(',') || 'none';
    console.log(`[PostureRule] workerConf=${personConf.toFixed(2)} trunkAngle=${trunkAngle.toFixed(1)}° (dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}, dz=${dz.toFixed(1)}) minKnee=${minKneeAngle !== null ? minKneeAngle.toFixed(1) + '°' : 'N/A'} hasKnees=${hasKneeEvidence} stoopMs=${stoopDurationMs}ms state=${postureState} findings=${findingsStr}`);
  }

  return {
    status: findings.some((f) => f.status === 'VIOLATION') ? 'VIOLATION' : 'COMPLIANT',
    postureState,
    riskLevel: postureSeverity,
    angles: {
      trunkInclinationDeg: trunkAngle,
      neckFlexionDeg: neckAngle,
      leftKneeAngleDeg: leftKneeAngle,
      rightKneeAngleDeg: rightKneeAngle,
      minKneeAngleDeg: minKneeAngle,
      rebaRiskScore: rebaScore,
      stoopDurationMs,
      severeStoopDurationMs,
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
      stoopDurationMs,
      severeStoopDurationMs,
      lastPos: curPos,
    },
    findings,
  };
}

export default postureRule;
