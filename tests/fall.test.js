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

console.log(`\nAll ${testsRun} fall tests passed successfully!\n`);
