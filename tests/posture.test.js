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
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'UnsafePosture');
  assert.strictEqual(res.findings[0].points, 40);
});

test('BRIEF_BEND: 1.0s forward bending is within grace period, producing 0 penalty points', () => {
  const lms = makeUprightLandmarks();
  lms[11] = { x: 300, y: 150, visibility: 0.95 };
  lms[12] = { x: 350, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0 };
  // t=0ms: initial bend with 1.5s grace configured
  const f1 = postureRule(standardBbox, lms, history, { timestamp: 0, briefBendGraceMs: 1500 });
  assert.strictEqual(f1.status, 'COMPLIANT');
  assert.strictEqual(f1.postureState, 'BRIEF_BEND');
  assert.strictEqual(f1.findings.length, 0);

  // t=1000ms: 1.0s bend (below 1.5s grace period)
  const f2 = postureRule(standardBbox, lms, f1.updatedHistory, { timestamp: 1000, briefBendGraceMs: 1500 });
  assert.strictEqual(f2.status, 'COMPLIANT');
  assert.strictEqual(f2.postureState, 'BRIEF_BEND');
  assert.strictEqual(f2.findings.length, 0);
});

test('SUSTAINED_MODERATE_STOOP: 45° stoop sustained for 3.5s escalates to HIGH severity (60 pts)', () => {
  const lms = makeUprightLandmarks();
  lms[11] = { x: 300, y: 150, visibility: 0.95 };
  lms[12] = { x: 350, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0 };
  let res = postureRule(standardBbox, lms, history, { timestamp: 0 });
  // t=2000ms: 2.0s stoop (> 1.5s grace, < 3.0s sustained) -> MEDIUM (40 pts)
  res = postureRule(standardBbox, lms, res.updatedHistory, { timestamp: 2000 });
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(res.riskLevel, 'HIGH');
  assert.strictEqual(res.findings[0].points, 40);

  // t=3500ms: 3.5s stoop (>= 3.0s sustained) -> escalates to HIGH (60 pts)
  res = postureRule(standardBbox, lms, res.updatedHistory, { timestamp: 3500 });
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(res.riskLevel, 'HIGH');
  assert.strictEqual(res.findings[0].points, 60);
});

test('SUSTAINED_SEVERE_STOOP: 65° stoop sustained for 3.5s escalates to CRITICAL severity (80 pts)', () => {
  const lms = makeUprightLandmarks();
  // Severe bend: midShoulder=(495, 150), midHip=(175, 300) -> dx=320, dy=150 -> 64.9°
  lms[11] = { x: 470, y: 150, visibility: 0.95 };
  lms[12] = { x: 520, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0, severeStoopDurationMs: 0 };
  let res = postureRule(standardBbox, lms, history, { timestamp: 0 });

  // t=3500ms: 3.5s severe stoop -> escalates to CRITICAL (80 pts)
  res = postureRule(standardBbox, lms, res.updatedHistory, { timestamp: 3500 });
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(res.riskLevel, 'CRITICAL');
  assert.strictEqual(res.findings[0].points, 80);
});

test('DEADBAND_HYSTERESIS: slight angle fluctuation (46° to 43°) does not reset active stoop duration', () => {
  const lms = makeUprightLandmarks();
  lms[11] = { x: 300, y: 150, visibility: 0.95 };
  lms[12] = { x: 350, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0 };
  let res = postureRule(standardBbox, lms, history, { timestamp: 0 });
  res = postureRule(standardBbox, lms, res.updatedHistory, { timestamp: 2000 });
  assert.strictEqual(res.status, 'VIOLATION');

  // Slight dip in angle to 43° (within 3° deadband of 45°)
  // midShoulder dx = 140, dy = 150 -> 43.0°
  lms[11] = { x: 290, y: 150, visibility: 0.95 };
  lms[12] = { x: 340, y: 150, visibility: 0.95 };

  res = postureRule(standardBbox, lms, res.updatedHistory, { timestamp: 2500 });
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.ok(res.updatedHistory.stoopDurationMs >= 2500);
});

test('RECOVERY: standing upright decays stoop duration and clears violation', () => {
  const bentLms = makeUprightLandmarks();
  bentLms[11] = { x: 300, y: 150, visibility: 0.95 };
  bentLms[12] = { x: 350, y: 150, visibility: 0.95 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0 };
  let res = postureRule(standardBbox, bentLms, history, { timestamp: 0 });
  res = postureRule(standardBbox, bentLms, res.updatedHistory, { timestamp: 2000 });
  assert.strictEqual(res.status, 'VIOLATION');

  // Worker stands back up
  const uprightLms = makeUprightLandmarks();
  res = postureRule(standardBbox, uprightLms, res.updatedHistory, { timestamp: 4000 });
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.postureState, 'SAFE');
  assert.strictEqual(res.findings.length, 0);
  assert.strictEqual(res.updatedHistory.stoopDurationMs, 0);
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

test('REGRESSION: Trunk angle of 73° with bent knees (minKnee ~68°) sustained for 3.5s triggers CRITICAL (80 pts)', () => {
  const lms = makeUprightLandmarks();
  // Shoulders moved forward/down to create ~73° trunk bend: dx=-164, dy=53, dz=55 relative to hips
  // Hips at (175, 300)
  lms[11] = { x: 150 - 164, y: 300 - 53, z: 55, visibility: 0.95 };
  lms[12] = { x: 200 - 164, y: 300 - 53, z: 55, visibility: 0.95 };
  lms[23] = { x: 160, y: 300, z: 0, visibility: 0.95 };
  lms[24] = { x: 190, y: 300, z: 0, visibility: 0.95 };
  // Bent knees (minKnee ~68°): knees flexed forward/in
  lms[25] = { x: 230, y: 360, z: 0, visibility: 0.90 };
  lms[26] = { x: 250, y: 360, z: 0, visibility: 0.90 };
  lms[27] = { x: 180, y: 440, z: 0, visibility: 0.90 };
  lms[28] = { x: 200, y: 440, z: 0, visibility: 0.90 };

  let history = { lastTimestampMs: 0, stoopDurationMs: 0, severeStoopDurationMs: 0 };

  // Frame 1 @ t=0ms: initial bend
  const f1 = postureRule(standardBbox, lms, history, { timestamp: 0, briefBendGraceMs: 1500 });
  assert.ok(f1.angles.trunkInclinationDeg >= 70, `Trunk angle (${f1.angles.trunkInclinationDeg}°) must be >= 70°`);
  assert.ok(f1.angles.minKneeAngleDeg < 130, `Knees (${f1.angles.minKneeAngleDeg}°) must be bent`);
  assert.strictEqual(f1.status, 'COMPLIANT', 'First frame within 1.5s grace period');
  assert.strictEqual(f1.postureState, 'BRIEF_BEND');

  // Frame 2 @ t=1000ms: duration accumulates
  const f2 = postureRule(standardBbox, lms, f1.updatedHistory, { timestamp: 1000, briefBendGraceMs: 1500 });
  assert.strictEqual(f2.angles.stoopDurationMs, 1000, 'Stoop duration must accumulate across frames');
  assert.strictEqual(f2.status, 'COMPLIANT');

  // Frame 3 @ t=3500ms: sustained for 3.5s -> Escalates to CRITICAL (80 pts) despite bent knees!
  const f3 = postureRule(standardBbox, lms, f2.updatedHistory, { timestamp: 3500, briefBendGraceMs: 1500 });
  assert.strictEqual(f3.status, 'VIOLATION');
  assert.strictEqual(f3.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(f3.riskLevel, 'CRITICAL');
  assert.strictEqual(f3.findings.length, 1);
  assert.strictEqual(f3.findings[0].type, 'UnsafePosture');
  assert.strictEqual(f3.findings[0].points, 80);
  assert.strictEqual(f3.findings[0].evidence.severity, 'CRITICAL');
});

console.log(`\nAll ${testsRun} posture tests passed successfully!\n`);
