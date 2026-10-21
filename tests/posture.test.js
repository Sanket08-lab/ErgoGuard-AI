import assert from 'node:assert/strict';
import { postureRule } from '../engine/rules/posture.js';

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

console.log('Running posture.test.js test suite...\n');

// Standard upright worker fixture
const standardBbox = { x1: 100, y1: 100, x2: 250, y2: 500, confidence: 0.95 };

// Upright landmarks: shoulders at y=150, hips at y=300, knees at y=400, ankles at y=490, ears at y=110
function makeUprightLandmarks() {
  return [
    { x: 175, y: 100, visibility: 0.95 }, // 0: nose
    ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 165, y: 110, visibility: 0.90 }, // 7: left ear
    { x: 185, y: 110, visibility: 0.90 }, // 8: right ear
    ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 150, y: 150, visibility: 0.95 }, // 11: left shoulder
    { x: 200, y: 150, visibility: 0.95 }, // 12: right shoulder
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 160, y: 300, visibility: 0.95 }, // 23: left hip
    { x: 190, y: 300, visibility: 0.95 }, // 24: right hip
    { x: 160, y: 400, visibility: 0.90 }, // 25: left knee
    { x: 190, y: 400, visibility: 0.90 }, // 26: right knee
    { x: 160, y: 490, visibility: 0.90 }, // 27: left ankle
    { x: 190, y: 490, visibility: 0.90 }, // 28: right ankle
  ];
}

test('SAFE: upright standing worker produces clean posture and zero violations', () => {
  const lms = makeUprightLandmarks();
  const res = postureRule(standardBbox, lms);

  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.postureState, 'SAFE');
  assert.strictEqual(res.riskLevel, 'LOW');
  assert.ok(res.angles.trunkInclinationDeg < 5);
  assert.strictEqual(res.findings.length, 0);
});

test('UNSAFE_LIFTING: bent trunk with straight knees flags UnsafePosture violation', () => {
  const lms = makeUprightLandmarks();
  // Bend shoulders forward in X to create ~50° trunk bend:
  // midHip = (175, 300), midShoulder = (325, 150) -> dx = 150, dy = 150 -> 45° angle
  lms[11] = { x: 300, y: 150, visibility: 0.95 };
  lms[12] = { x: 350, y: 150, visibility: 0.95 };

  const res = postureRule(standardBbox, lms);
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(res.riskLevel, 'HIGH');
  assert.strictEqual(res.angles.rebaRiskScore, 7);
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'UnsafePosture');
  assert.strictEqual(res.findings[0].points, 40);
});

test('SQUAT LIFT: bent trunk with bent knees (squatting) is classified as SAFE', () => {
  const lms = makeUprightLandmarks();
  // Bent trunk: 45°
  lms[11] = { x: 300, y: 150, visibility: 0.95 };
  lms[12] = { x: 350, y: 150, visibility: 0.95 };
  // Bent knees: knee pushed forward at x=250, creating ~90° joint bend
  lms[25] = { x: 250, y: 350, visibility: 0.95 };
  lms[26] = { x: 250, y: 350, visibility: 0.95 };

  const res = postureRule(standardBbox, lms);
  assert.strictEqual(res.postureState, 'SAFE');
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.findings.length, 0);
});

test('FORWARD_HEAD: excessive cervical flexion flags medium risk advisory', () => {
  const lms = makeUprightLandmarks();
  // Ears pushed forward in X relative to shoulders (head forward)
  lms[7] = { x: 240, y: 100, visibility: 0.90 };
  lms[8] = { x: 260, y: 100, visibility: 0.90 };

  const res = postureRule(standardBbox, lms);
  assert.strictEqual(res.postureState, 'FORWARD_HEAD');
  assert.strictEqual(res.riskLevel, 'MEDIUM');
  assert.strictEqual(res.angles.rebaRiskScore, 3);
});

test('FATIGUE: prolonged head droop over 2.0s triggers WorkerFatigue violation', () => {
  const lms = makeUprightLandmarks();
  // Head droop: ear tilted forward (x=300, 320 vs shoulders at 240, 290; dx=45, dy=40 -> 48.4° > 40°)
  lms[7] = { x: 300, y: 110, visibility: 0.90 };
  lms[8] = { x: 320, y: 110, visibility: 0.90 };
  lms[11] = { x: 240, y: 150, visibility: 0.95 }; // Trunk bent > 28° (slouching)
  lms[12] = { x: 290, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, headDroopDurationMs: 0, slouchDurationMs: 0, immobileDurationMs: 0 };

  // Step 1: 1.0s droop (below 2.0s threshold)
  const step1 = postureRule(standardBbox, lms, history, { timestamp: 1000 });
  assert.strictEqual(step1.fatigue.isFatigued, false);
  history = step1.updatedHistory;

  // Step 2: 3.2s total droop + slouch (exceeds threshold)
  const step2 = postureRule(standardBbox, lms, history, { timestamp: 3200 });
  assert.strictEqual(step2.fatigue.isFatigued, true);
  assert.ok(step2.fatigue.fatigueScore >= 0.50);
  assert.ok(step2.findings.some((f) => f.type === 'WorkerFatigue'));
  assert.strictEqual(step2.findings.find((f) => f.type === 'WorkerFatigue').points, 45);
});

test('SKIPPED & UNCERTAIN: occluded or missing pose data returns zero violations', () => {
  // 1. Missing landmarks
  const skipped = postureRule(standardBbox, null);
  assert.strictEqual(skipped.status, 'SKIPPED');
  assert.strictEqual(skipped.findings.length, 1);
  assert.strictEqual(skipped.findings[0].points, 0);

  // 2. Occluded shoulders (low visibility)
  const lms = makeUprightLandmarks();
  lms[11] = { x: 150, y: 150, visibility: 0.1 };
  lms[12] = { x: 200, y: 150, visibility: 0.1 };
  const uncertain = postureRule(standardBbox, lms);
  assert.strictEqual(uncertain.status, 'UNCERTAIN');
  assert.strictEqual(uncertain.findings[0].points, 0);

  // 3. Null person input
  const invalid = postureRule(null, lms);
  assert.strictEqual(invalid.status, 'INVALID');
  assert.strictEqual(invalid.findings[0].points, 0);
});

console.log(`\nAll ${testsRun} posture tests passed successfully!\n`);
