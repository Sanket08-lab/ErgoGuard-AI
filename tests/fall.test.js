import assert from 'node:assert/strict';
import { fallRule } from '../engine/rules/fall.js';

let testsRun = 0;
function test(name, fn) {
  testsRun += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('Running fall.test.js test suite...\n');

// Upright person fixture: H=400, W=150 (aspect ratio = 2.67)
const uprightPerson = { x1: 100, y1: 100, x2: 250, y2: 500, confidence: 0.95 };
const uprightLandmarks = [
  ...Array(11).fill({ x: 175, y: 120, visibility: 0.3 }),
  { x: 160, y: 160, visibility: 0.95 }, // 11: left shoulder
  { x: 190, y: 160, visibility: 0.95 }, // 12: right shoulder
  ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
  { x: 165, y: 280, visibility: 0.95 }, // 23: left hip
  { x: 185, y: 280, visibility: 0.95 }, // 24: right hip
  { x: 165, y: 380, visibility: 0.90 }, // 25: left knee
  { x: 185, y: 380, visibility: 0.90 }, // 26: right knee
  { x: 165, y: 480, visibility: 0.90 }, // 27: left ankle
  { x: 185, y: 480, visibility: 0.90 }, // 28: right ankle
];

// Forward bending (stoop) fixture: H=350, W=180 (aspect ratio = 1.94)
// Torso bent forward ~60° from vertical (torsoFloorAngle = 30°), but hips are elevated on standing legs
const forwardBendingPerson = { x1: 100, y1: 150, x2: 280, y2: 500, confidence: 0.95 };
const forwardBendingLandmarks = [
  ...Array(11).fill({ x: 260, y: 240, visibility: 0.3 }),
  { x: 250, y: 260, visibility: 0.95 }, // 11: left shoulder bent forward
  { x: 270, y: 260, visibility: 0.95 }, // 12: right shoulder
  ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
  { x: 160, y: 280, visibility: 0.95 }, // 23: left hip
  { x: 180, y: 280, visibility: 0.95 }, // 24: right hip
  { x: 165, y: 380, visibility: 0.90 }, // 25: left knee
  { x: 185, y: 380, visibility: 0.90 }, // 26: right knee
  { x: 165, y: 480, visibility: 0.90 }, // 27: left ankle
  { x: 185, y: 480, visibility: 0.90 }, // 28: right ankle
];

// Reaching toward floor fixture: H=220, W=260 (collapsed aspect ratio = 0.85)
// Worker reaches all the way toward the floor: shoulders down at y=420, but hips remain elevated at y=250 on standing legs (ankles at y=450)
const reachingFloorPerson = { x1: 100, y1: 230, x2: 360, y2: 450, confidence: 0.92 };
const reachingFloorLandmarks = [
  ...Array(11).fill({ x: 280, y: 400, visibility: 0.2 }),
  { x: 280, y: 410, visibility: 0.95 }, // 11: left shoulder reaching down
  { x: 300, y: 410, visibility: 0.95 }, // 12: right shoulder
  ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
  { x: 150, y: 250, visibility: 0.95 }, // 23: left hip elevated in air
  { x: 170, y: 250, visibility: 0.95 }, // 24: right hip
  { x: 155, y: 350, visibility: 0.90 }, // 25: left knee
  { x: 175, y: 350, visibility: 0.90 }, // 26: right knee
  { x: 155, y: 440, visibility: 0.90 }, // 27: left ankle
  { x: 175, y: 440, visibility: 0.90 }, // 28: right ankle
];

// Horizontal fallen person fixture: H=100, W=300 (aspect ratio = 0.33)
const fallenPerson = { x1: 100, y1: 400, x2: 400, y2: 500, confidence: 0.92 };
const fallenLandmarks = [
  ...Array(11).fill({ x: 120, y: 450, visibility: 0.2 }),
  { x: 140, y: 440, visibility: 0.95 }, // 11: left shoulder on floor
  { x: 140, y: 460, visibility: 0.95 }, // 12: right shoulder
  ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
  { x: 260, y: 440, visibility: 0.95 }, // 23: left hip on floor
  { x: 260, y: 460, visibility: 0.95 }, // 24: right hip
  { x: 320, y: 445, visibility: 0.90 }, // 25: left knee on floor
  { x: 320, y: 465, visibility: 0.90 }, // 26: right knee
  { x: 380, y: 445, visibility: 0.90 }, // 27: left ankle on floor
  { x: 380, y: 465, visibility: 0.90 }, // 28: right ankle
];

test('NORMAL: upright standing worker produces clean status and zero fall findings', () => {
  const res = fallRule(uprightPerson, uprightLandmarks);
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.emergencyAlert, false);
  assert.ok(res.aspectRatio > 2.0);
  assert.strictEqual(res.findings.length, 0);
});

test('FORWARD BENDING: bending forward at waist does not trigger false fall violation', () => {
  // Worker bends forward at waist (torso inclination ~60° from vertical, torsoFloorAngle = 30°)
  // Vertical leg support prevents false fall detection
  const res = fallRule(forwardBendingPerson, forwardBendingLandmarks, {}, { timestamp: 0 });
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.findings.length, 0);

  // Even when held over time (e.g. 500ms > 333ms confirm threshold)
  const resHeld = fallRule(forwardBendingPerson, forwardBendingLandmarks, res.updatedTrackState, { timestamp: 500 });
  assert.strictEqual(resHeld.status, 'COMPLIANT');
  assert.strictEqual(resHeld.fallState, 'NORMAL');
  assert.strictEqual(resHeld.isFallen, false);
  assert.strictEqual(resHeld.findings.length, 0);
});

test('REACHING TOWARD FLOOR: reaching down with collapsed box does not falsely count as fall', () => {
  // Worker bends deeply to touch floor: aspect ratio = 0.85, shoulders low, but hips elevated on standing legs
  const res1 = fallRule(reachingFloorPerson, reachingFloorLandmarks, {}, { timestamp: 0 });
  assert.strictEqual(res1.status, 'COMPLIANT');
  assert.strictEqual(res1.fallState, 'NORMAL');
  assert.strictEqual(res1.isFallen, false);
  assert.strictEqual(res1.findings.length, 0);

  // Still compliant after 600ms of floor-level reaching
  const res2 = fallRule(reachingFloorPerson, reachingFloorLandmarks, res1.updatedTrackState, { timestamp: 600 });
  assert.strictEqual(res2.status, 'COMPLIANT');
  assert.strictEqual(res2.fallState, 'NORMAL');
  assert.strictEqual(res2.isFallen, false);
  assert.strictEqual(res2.findings.length, 0);
});

test('MISSING OR UNRELIABLE LANDMARKS: collapsed box without reliable pose returns UNCERTAIN, not confirmed fall', () => {
  // Case A: Missing landmarks (null)
  const missingRes = fallRule(fallenPerson, null, {}, { timestamp: 0 });
  assert.strictEqual(missingRes.status, 'UNCERTAIN');
  assert.strictEqual(missingRes.fallState, 'UNCERTAIN');
  assert.strictEqual(missingRes.isFallen, false);
  assert.strictEqual(missingRes.findings.length, 1);
  assert.strictEqual(missingRes.findings[0].type, 'UncertainFall');
  assert.strictEqual(missingRes.findings[0].points, 0);

  // Case B: Low visibility landmarks (occluded/noisy keypoints with visibility < 0.3)
  const noisyLandmarks = [
    ...Array(33).fill({ x: 200, y: 450, visibility: 0.15 }),
  ];
  const lowConfRes = fallRule(fallenPerson, noisyLandmarks, {}, { timestamp: 0 });
  assert.strictEqual(lowConfRes.status, 'UNCERTAIN');
  assert.strictEqual(lowConfRes.fallState, 'UNCERTAIN');
  assert.strictEqual(lowConfRes.isFallen, false);
  assert.strictEqual(lowConfRes.findings.length, 1);
  assert.strictEqual(lowConfRes.findings[0].type, 'UncertainFall');
  assert.strictEqual(lowConfRes.findings[0].points, 0);
});

test('RAPID_DESCENT: rapid vertical drop flags UNCERTAIN pending floor confirmation', () => {
  // Step 1: Worker at yCenter = 200 (height 400)
  const p1 = { x1: 100, y1: 0, x2: 250, y2: 400 };
  const s1 = fallRule(p1, uprightLandmarks, {}, { timestamp: 0 });

  // Step 2: 100ms later, worker vertical center drops by 60px (60/400 = 0.15 normalized height > 0.08)
  const p2 = { x1: 100, y1: 60, x2: 250, y2: 460 };
  const s2 = fallRule(p2, uprightLandmarks, s1.updatedTrackState, { timestamp: 100 });

  assert.strictEqual(s2.fallState, 'RAPID_DESCENT');
  assert.strictEqual(s2.status, 'UNCERTAIN');
  assert.strictEqual(s2.isFallen, false);
  assert.strictEqual(s2.findings[0].points, 0);
});

test('FALLEN: horizontal worker confirms fall violation after 333ms floor persistence', () => {
  let trackState = {};

  // t = 0: First horizontal observation (aspect ratio 0.33 < 0.85) -> pending confirmation (< 333ms)
  const step1 = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 0 });
  assert.strictEqual(step1.isFallen, false);
  assert.strictEqual(step1.findings.length, 0);
  trackState = step1.updatedTrackState;

  // t = 200ms: Still pending confirmation
  const step2 = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 200 });
  assert.strictEqual(step2.isFallen, false);
  trackState = step2.updatedTrackState;

  // t = 350ms (>= 333ms confirmation threshold): Confirmed FALLEN
  const step3 = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 350 });
  assert.strictEqual(step3.isFallen, true);
  assert.strictEqual(step3.fallState, 'FALLEN');
  assert.strictEqual(step3.status, 'VIOLATION');
  assert.strictEqual(step3.emergencyAlert, false);
  assert.strictEqual(step3.findings.length, 1);
  assert.strictEqual(step3.findings[0].type, 'FallEvent');
  assert.strictEqual(step3.findings[0].points, 90);
});

test('MAN_DOWN_EMERGENCY: persistent immobility for 5.0s triggers CRITICAL emergency', () => {
  let trackState = { fallStartTimeMs: 0 };

  // Worker on floor at t = 5200ms (>= 5000ms recovery timeout)
  const res = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 5200 });

  assert.strictEqual(res.isFallen, true);
  assert.strictEqual(res.fallState, 'FALLEN_INACTIVE');
  assert.strictEqual(res.emergencyAlert, true);
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'FallEvent');
  assert.strictEqual(res.findings[0].confidence, 0.96);
  assert.strictEqual(res.findings[0].evidence.emergencyAlert, true);
});

test('RECOVERY: standing back up resets fall state to NORMAL', () => {
  // Worker was fallen
  const fallenState = { fallStartTimeMs: 1000 };

  // Worker stands back up at t=3000ms (aspect ratio = 2.67 > 0.85, upright torso)
  const res = fallRule(uprightPerson, uprightLandmarks, fallenState, { timestamp: 3000 });

  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.updatedTrackState.fallStartTimeMs, null);
  assert.strictEqual(res.findings.length, 0);
});

test('INVALID & SKIPPED: malformed boxes and tiny detections are safely handled', () => {
  // 1. Null person
  const invalid = fallRule(null);
  assert.strictEqual(invalid.status, 'INVALID');
  assert.strictEqual(invalid.findings[0].points, 0);

  // 2. Zero-area box
  const zeroArea = fallRule({ x1: 50, y1: 50, x2: 50, y2: 100 });
  assert.strictEqual(zeroArea.status, 'INVALID');

  // 3. Tiny person (< 120px height)
  const tiny = fallRule({ x1: 50, y1: 50, x2: 100, y2: 150 }); // H = 100px < 120px
  assert.strictEqual(tiny.status, 'SKIPPED');
  assert.strictEqual(tiny.findings[0].points, 0);
});

// ============================================================================
// REGRESSION SUITE: ARM POSITION & SPATIAL ORIENTATION INVARIANCE
// Ensures arm positions, lateral reach, and orientation NEVER trigger FallEvent
// ============================================================================

test('REGRESSION 1: Standing with arms at sides remains COMPLIANT with 0 points', () => {
  const box = { x1: 100, y1: 100, x2: 250, y2: 500, confidence: 0.95 }; // H=400, W=150 (AR=2.67)
  const lms = Array(33).fill(null).map(() => ({ x: 175, y: 300, visibility: 0.1 }));
  lms[11] = { x: 160, y: 160, visibility: 0.95 }; // left shoulder
  lms[12] = { x: 190, y: 160, visibility: 0.95 }; // right shoulder
  lms[15] = { x: 150, y: 270, visibility: 0.95 }; // left wrist hanging down
  lms[16] = { x: 200, y: 270, visibility: 0.95 }; // right wrist hanging down
  lms[23] = { x: 165, y: 280, visibility: 0.95 }; // left hip
  lms[24] = { x: 185, y: 280, visibility: 0.95 }; // right hip
  lms[25] = { x: 165, y: 380, visibility: 0.90 }; // left knee
  lms[26] = { x: 185, y: 380, visibility: 0.90 }; // right knee
  lms[27] = { x: 165, y: 480, visibility: 0.90 }; // left ankle
  lms[28] = { x: 185, y: 480, visibility: 0.90 }; // right ankle

  const res = fallRule(box, lms, {}, { timestamp: 0 });
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.findings.length, 0);
  assert.ok(res.torsoFloorAngleDeg > 75.0);
});

test('REGRESSION 2: Both arms extended horizontally (T-pose) with collapsed box aspect ratio does NOT trigger FallEvent', () => {
  // Extending arms horizontally expands bounding box width to full arm span (560px), collapsing AR to 0.71 (<= 0.85)
  const tBox = { x1: 40, y1: 100, x2: 600, y2: 500, confidence: 0.95 }; // H=400, W=560 (AR=0.71)
  const tLms = Array(33).fill(null).map(() => ({ x: 320, y: 300, visibility: 0.1 }));
  tLms[11] = { x: 270, y: 160, visibility: 0.95 }; // shoulders
  tLms[12] = { x: 370, y: 160, visibility: 0.95 };
  tLms[15] = { x: 50, y: 160, visibility: 0.95 };  // left wrist extended wide
  tLms[16] = { x: 590, y: 160, visibility: 0.95 }; // right wrist extended wide
  tLms[23] = { x: 290, y: 280, visibility: 0.95 }; // hips
  tLms[24] = { x: 350, y: 280, visibility: 0.95 };
  tLms[25] = { x: 290, y: 380, visibility: 0.90 }; // knees
  tLms[26] = { x: 350, y: 380, visibility: 0.90 };
  tLms[27] = { x: 290, y: 480, visibility: 0.90 }; // ankles
  tLms[28] = { x: 350, y: 480, visibility: 0.90 };

  // Frame 1 @ t=0ms
  const step1 = fallRule(tBox, tLms, {}, { timestamp: 0 });
  assert.strictEqual(step1.status, 'COMPLIANT');
  assert.strictEqual(step1.fallState, 'NORMAL');
  assert.strictEqual(step1.isFallen, false);
  assert.strictEqual(step1.findings.length, 0);

  // Frame 2 @ t=500ms (held longer than 333ms confirm threshold) -> must stay COMPLIANT
  const step2 = fallRule(tBox, tLms, step1.updatedTrackState, { timestamp: 500 });
  assert.strictEqual(step2.status, 'COMPLIANT');
  assert.strictEqual(step2.fallState, 'NORMAL');
  assert.strictEqual(step2.isFallen, false);
  assert.strictEqual(step2.findings.length, 0);

  // Even in waist-up desk framing where knees/ankles are cut off and AR=0.39
  const halfBox = { x1: 40, y1: 100, x2: 600, y2: 320, confidence: 0.95 }; // H=220, W=560 (AR=0.39)
  const halfLms = [...tLms];
  halfLms[25] = { x: 290, y: 550, visibility: 0.1 }; // knees out of frame
  halfLms[26] = { x: 350, y: 550, visibility: 0.1 };
  halfLms[27] = { x: 290, y: 650, visibility: 0.1 }; // ankles out of frame
  halfLms[28] = { x: 350, y: 650, visibility: 0.1 };

  const halfRes = fallRule(halfBox, halfLms, step2.updatedTrackState, { timestamp: 1000 });
  assert.strictEqual(halfRes.status, 'COMPLIANT');
  assert.strictEqual(halfRes.fallState, 'NORMAL');
  assert.strictEqual(halfRes.isFallen, false);
  assert.strictEqual(halfRes.findings.length, 0);
});

test('REGRESSION 2B: Waist-up crop with asymmetrical hip visibility (one hip occluded) during T-pose stays COMPLIANT', () => {
  // Bounding box collapsed by horizontal arm span (H=140, W=560, AR=0.25 <= 0.85)
  // Both shoulders visible at y=160 (center=320)
  // Left hip visible at y=200 (x=250), right hip occluded by frame edge (vis=0.20 < 0.40)
  // Legs outside frame (knees at bottom with weak vis=0.30)
  const box = { x1: 40, y1: 100, x2: 600, y2: 240, confidence: 0.95 };
  const lms = Array(33).fill(null).map(() => ({ x: 320, y: 300, visibility: 0.1 }));
  lms[11] = { x: 250, y: 160, visibility: 0.95 }; // left shoulder
  lms[12] = { x: 390, y: 160, visibility: 0.95 }; // right shoulder
  lms[15] = { x: 50, y: 160, visibility: 0.95 };  // left wrist
  lms[16] = { x: 590, y: 160, visibility: 0.95 }; // right wrist
  lms[23] = { x: 250, y: 200, visibility: 0.95 }; // left hip visible
  lms[24] = { x: 390, y: 200, visibility: 0.20 }; // right hip occluded!
  lms[25] = { x: 250, y: 230, visibility: 0.30 }; // knees at bottom
  lms[26] = { x: 390, y: 230, visibility: 0.30 };
  lms[27] = { x: 250, y: 400, visibility: 0.05 }; // ankles out of frame
  lms[28] = { x: 390, y: 400, visibility: 0.05 };

  let trackState = {};
  const s1 = fallRule(box, lms, trackState, { timestamp: 0 });
  trackState = s1.updatedTrackState;

  // Persisting in T-pose for 500ms (> 333ms confirmation window) must remain COMPLIANT
  const s2 = fallRule(box, lms, trackState, { timestamp: 500 });
  assert.strictEqual(s2.status, 'COMPLIANT');
  assert.strictEqual(s2.fallState, 'NORMAL');
  assert.strictEqual(s2.isFallen, false);
  assert.strictEqual(s2.findings.length, 0);
  assert.ok(s2.torsoFloorAngleDeg >= 75.0, `Expected torsoFloorAngleDeg >= 75.0, got ${s2.torsoFloorAngleDeg}`);
});

test('REGRESSION 2C: Waist-up crop with normalized coordinates [0, 1] during T-pose stays COMPLIANT', () => {
  const normBox = { x1: 0, y1: 50, x2: 640, y2: 300, confidence: 0.95 }; // AR=0.39 <= 0.85
  const normLms = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.05 }));
  normLms[11] = { x: 0.40, y: 0.25, visibility: 0.95 };
  normLms[12] = { x: 0.60, y: 0.25, visibility: 0.95 };
  normLms[15] = { x: 0.08, y: 0.25, visibility: 0.95 };
  normLms[16] = { x: 0.92, y: 0.25, visibility: 0.95 };
  normLms[23] = { x: 0.44, y: 0.70, visibility: 0.85 };
  normLms[24] = { x: 0.56, y: 0.70, visibility: 0.85 };
  normLms[25] = { x: 0.44, y: 1.15, visibility: 0.05 }; // legs outside frame
  normLms[26] = { x: 0.56, y: 1.15, visibility: 0.05 };
  normLms[27] = { x: 0.44, y: 1.35, visibility: 0.02 };
  normLms[28] = { x: 0.56, y: 1.35, visibility: 0.02 };

  let trackState = {};
  const s1 = fallRule(normBox, normLms, trackState, { timestamp: 0 });
  trackState = s1.updatedTrackState;

  const s2 = fallRule(normBox, normLms, trackState, { timestamp: 500 });
  assert.strictEqual(s2.status, 'COMPLIANT');
  assert.strictEqual(s2.fallState, 'NORMAL');
  assert.strictEqual(s2.isFallen, false);
  assert.strictEqual(s2.findings.length, 0);
});

test('REGRESSION 3: Both arms raised overhead produces tall aspect ratio and stays COMPLIANT', () => {
  const upBox = { x1: 250, y1: 30, x2: 390, y2: 510, confidence: 0.95 }; // H=480, W=140 (AR=3.43)
  const upLms = Array(33).fill(null).map(() => ({ x: 320, y: 300, visibility: 0.1 }));
  upLms[11] = { x: 280, y: 180, visibility: 0.95 }; // shoulders
  upLms[12] = { x: 360, y: 180, visibility: 0.95 };
  upLms[15] = { x: 290, y: 40, visibility: 0.95 };  // left wrist overhead
  upLms[16] = { x: 350, y: 40, visibility: 0.95 };  // right wrist overhead
  upLms[23] = { x: 290, y: 300, visibility: 0.95 }; // hips
  upLms[24] = { x: 350, y: 300, visibility: 0.95 };
  upLms[25] = { x: 290, y: 400, visibility: 0.90 };
  upLms[26] = { x: 350, y: 400, visibility: 0.90 };
  upLms[27] = { x: 290, y: 500, visibility: 0.90 };
  upLms[28] = { x: 350, y: 500, visibility: 0.90 };

  const res = fallRule(upBox, upLms, {}, { timestamp: 0 });
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.findings.length, 0);
});

test('REGRESSION 4: Standing with arms extended while turning sideways (oblique/profile) stays COMPLIANT', () => {
  // Worker turned at 45° angle with arms reaching outward; 2D spine remains vertical against gravity
  const sideBox = { x1: 50, y1: 100, x2: 590, y2: 340, confidence: 0.95 }; // H=240, W=540 (AR=0.44)
  const sideLms = Array(33).fill(null).map(() => ({ x: 320, y: 300, z: 0, visibility: 0.1 }));
  // Left shoulder slightly back in depth, right shoulder forward
  sideLms[11] = { x: 300, y: 150, z: -40, visibility: 0.95 };
  sideLms[12] = { x: 340, y: 155, z: 40, visibility: 0.95 };
  // Arms outstretched
  sideLms[15] = { x: 80, y: 150, z: -80, visibility: 0.95 };
  sideLms[16] = { x: 560, y: 155, z: 80, visibility: 0.95 };
  // Hips
  sideLms[23] = { x: 310, y: 280, z: -30, visibility: 0.95 };
  sideLms[24] = { x: 330, y: 280, z: 30, visibility: 0.95 };
  // Knees and ankles
  sideLms[25] = { x: 310, y: 380, z: -20, visibility: 0.90 };
  sideLms[26] = { x: 330, y: 380, z: 20, visibility: 0.90 };
  sideLms[27] = { x: 310, y: 480, z: -20, visibility: 0.90 };
  sideLms[28] = { x: 330, y: 480, z: 20, visibility: 0.90 };

  const res1 = fallRule(sideBox, sideLms, {}, { timestamp: 0 });
  assert.strictEqual(res1.status, 'COMPLIANT');
  assert.strictEqual(res1.fallState, 'NORMAL');
  assert.strictEqual(res1.isFallen, false);
  assert.strictEqual(res1.findings.length, 0);

  // Even after holding the pose for 800ms
  const res2 = fallRule(sideBox, sideLms, res1.updatedTrackState, { timestamp: 800 });
  assert.strictEqual(res2.status, 'COMPLIANT');
  assert.strictEqual(res2.fallState, 'NORMAL');
  assert.strictEqual(res2.isFallen, false);
  assert.strictEqual(res2.findings.length, 0);
});

test('REGRESSION 5: Genuine multi-frame fall-like sequence confirms fall and resets on recovery', () => {
  let trackState = {};

  // Step 1: Upright standing at t=0
  const s1 = fallRule(uprightPerson, uprightLandmarks, trackState, { timestamp: 0 });
  assert.strictEqual(s1.fallState, 'NORMAL');
  assert.strictEqual(s1.isFallen, false);
  trackState = s1.updatedTrackState;

  // Step 2: Rapid vertical drop at t=100ms
  const dropBox = { x1: 100, y1: 160, x2: 250, y2: 560 };
  const s2 = fallRule(dropBox, uprightLandmarks, trackState, { timestamp: 100 });
  assert.strictEqual(s2.fallState, 'RAPID_DESCENT');
  assert.strictEqual(s2.status, 'UNCERTAIN');
  assert.strictEqual(s2.isFallen, false);
  assert.strictEqual(s2.findings[0].points, 0);
  trackState = s2.updatedTrackState;

  // Step 3: Horizontal floor contact at t=200ms (duration 0ms < 333ms confirm threshold)
  const s3 = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 200 });
  assert.strictEqual(s3.isFallen, false); // Pending confirmation (duration < 333ms)
  assert.strictEqual(s3.findings[0]?.points ?? 0, 0);
  trackState = s3.updatedTrackState;

  // Step 4: Persistent floor contact at t=600ms (duration 400ms >= 333ms) -> Confirmed Fall!
  const s4 = fallRule(fallenPerson, fallenLandmarks, trackState, { timestamp: 600 });
  assert.strictEqual(s4.isFallen, true);
  assert.strictEqual(s4.fallState, 'FALLEN');
  assert.strictEqual(s4.status, 'VIOLATION');
  assert.strictEqual(s4.findings[0].points, 90);
  trackState = s4.updatedTrackState;

  // Step 5: Worker stands back up at t=1200ms -> Immediate recovery to NORMAL
  const s5 = fallRule(uprightPerson, uprightLandmarks, trackState, { timestamp: 1200 });
  assert.strictEqual(s5.isFallen, false);
  assert.strictEqual(s5.fallState, 'NORMAL');
  assert.strictEqual(s5.status, 'COMPLIANT');
  assert.strictEqual(s5.findings.length, 0);
});

console.log(`\nAll ${testsRun} fall tests passed successfully!\n`);
