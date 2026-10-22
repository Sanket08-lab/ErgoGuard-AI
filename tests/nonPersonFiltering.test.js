import assert from 'node:assert/strict';
import { postureRule } from '../engine/rules/posture.js';
import { fallRule } from '../engine/rules/fall.js';
import { RiskEngine } from '../engine/riskEngine.js';
import { CONFIG } from '../engine/config.js';

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

console.log('Running nonPersonFiltering.test.js test suite...\n');

// Standard genuine worker bounding box
const genuineWorkerBbox = { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 };

// Helper to construct a full 33-landmark skeleton array
function createLandmarks(overrides = {}) {
  // Baseline upright person
  const landmarks = Array(33).fill(null).map((_, i) => ({ x: 0, y: 0, visibility: 0.1 }));

  // Head
  landmarks[0] = { x: 225, y: 110, visibility: 0.95 }; // nose
  landmarks[7] = { x: 215, y: 115, visibility: 0.90 }; // left ear
  landmarks[8] = { x: 235, y: 115, visibility: 0.90 }; // right ear

  // Torso
  landmarks[11] = { x: 190, y: 150, visibility: 0.95 }; // left shoulder
  landmarks[12] = { x: 260, y: 150, visibility: 0.95 }; // right shoulder
  landmarks[23] = { x: 200, y: 280, visibility: 0.95 }; // left hip
  landmarks[24] = { x: 250, y: 280, visibility: 0.95 }; // right hip

  // Legs
  landmarks[25] = { x: 200, y: 360, visibility: 0.90 }; // left knee
  landmarks[26] = { x: 250, y: 360, visibility: 0.90 }; // right knee
  landmarks[27] = { x: 200, y: 440, visibility: 0.90 }; // left ankle
  landmarks[28] = { x: 250, y: 440, visibility: 0.90 }; // right ankle

  for (const [idxStr, pt] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    landmarks[idx] = pt;
  }

  return landmarks;
}

// ---------------------------------------------------------------------------
// 1. A NON-PERSON OBJECT WITH UNRELIABLE POSE LANDMARKS
// ---------------------------------------------------------------------------
test('Non-person 1a: Low person-detection confidence (< 0.5) returns UNCERTAIN with zero violations', () => {
  const lowConfPerson = { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.35 };
  const lms = createLandmarks({
    11: { x: 280, y: 190, visibility: 0.9 }, // Tilted shoulders
    12: { x: 280, y: 190, visibility: 0.9 },
  });

  const res = postureRule(lowConfPerson, lms);
  assert.strictEqual(res.status, 'UNCERTAIN', 'Low person confidence must be UNCERTAIN');
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'UncertainPerson');
  assert.strictEqual(res.findings[0].points, 0, 'Must have zero penalty points');
});

test('Non-person 1b: Small background region/artifact (< 120px scale) returns SKIPPED with zero violations', () => {
  const tinyArtifact = { x1: 50, y1: 50, x2: 95, y2: 100, confidence: 0.90 }; // width=45, height=50 (< 120px)
  const lms = createLandmarks();

  const res = postureRule(tinyArtifact, lms);
  assert.strictEqual(res.status, 'SKIPPED', 'Small noise boxes must be SKIPPED');
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'SkippedWorker');
  assert.strictEqual(res.findings[0].points, 0);
});

test('Non-person 1c: Spurious tilted vector on furniture with missing knees does not flag UNSAFE_LIFTING', () => {
  // Furniture edge produces 4 spurious landmarks (shoulders + hips) tilted > 50°, but zero knee evidence
  const lms = Array(33).fill(null).map(() => ({ x: 0, y: 0, visibility: 0.0 }));
  lms[11] = { x: 280, y: 180, visibility: 0.85 }; // shoulders forward
  lms[12] = { x: 290, y: 180, visibility: 0.85 };
  lms[23] = { x: 200, y: 270, visibility: 0.85 }; // hips
  lms[24] = { x: 210, y: 270, visibility: 0.85 };
  // Knees and ankles have 0.0 visibility

  const res = postureRule(genuineWorkerBbox, lms);
  assert.notStrictEqual(res.postureState, 'UNSAFE_LIFTING', 'Must NOT declare UNSAFE_LIFTING without knee evidence');
  assert.strictEqual(res.status, 'COMPLIANT', 'Without confirmed straight knees, must not declare VIOLATION');
  assert.strictEqual(res.findings.length, 0, 'Must produce zero violation findings');
});

test('Non-person 1d: Degenerate torso segment length (< 25px) returns UNCERTAIN with zero violations', () => {
  // Shoulders and hips clustered within 12 pixels
  const lms = createLandmarks({
    11: { x: 220, y: 150, visibility: 0.9 },
    12: { x: 230, y: 150, visibility: 0.9 },
    23: { x: 222, y: 158, visibility: 0.9 },
    24: { x: 228, y: 158, visibility: 0.9 },
  });

  const res = postureRule(genuineWorkerBbox, lms);
  assert.strictEqual(res.status, 'UNCERTAIN');
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'UncertainPose');
  assert.strictEqual(res.findings[0].points, 0);
});

// ---------------------------------------------------------------------------
// 2. A GENUINE WORKER BENDING FORWARD
// ---------------------------------------------------------------------------
test('Genuine worker 2: Bending forward > 45° with straight knees flags UnsafePosture violation', () => {
  // Trunk bent forward: midShoulder = (325, 150), midHip = (175, 300) -> 45° inclination
  // Straight knees at (175, 400), straight ankles at (175, 490) -> knee angle 180°
  const lms = createLandmarks({
    11: { x: 300, y: 150, visibility: 0.95 },
    12: { x: 350, y: 150, visibility: 0.95 },
    23: { x: 160, y: 300, visibility: 0.95 },
    24: { x: 190, y: 300, visibility: 0.95 },
    25: { x: 160, y: 400, visibility: 0.90 },
    26: { x: 190, y: 400, visibility: 0.90 },
    27: { x: 160, y: 490, visibility: 0.90 },
    28: { x: 190, y: 490, visibility: 0.90 },
  });

  const res = postureRule(genuineWorkerBbox, lms);
  assert.strictEqual(res.status, 'VIOLATION');
  assert.strictEqual(res.postureState, 'UNSAFE_LIFTING');
  assert.strictEqual(res.riskLevel, 'HIGH');
  assert.strictEqual(res.findings.length, 1);
  assert.strictEqual(res.findings[0].type, 'UnsafePosture');
  assert.strictEqual(res.findings[0].points, 40);
});

// ---------------------------------------------------------------------------
// 3. A PARTIALLY OCCLUDED WORKER
// ---------------------------------------------------------------------------
test('Partially occluded 3a: Standing upright with legs occluded behind desk evaluates as SAFE', () => {
  // Upper body clearly visible and upright; lower body occluded (visibility = 0.1)
  const lms = createLandmarks({
    25: { x: 0, y: 0, visibility: 0.1 }, // left knee occluded
    26: { x: 0, y: 0, visibility: 0.1 }, // right knee occluded
    27: { x: 0, y: 0, visibility: 0.1 }, // ankles occluded
    28: { x: 0, y: 0, visibility: 0.1 },
  });

  const res = postureRule(genuineWorkerBbox, lms);
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.postureState, 'SAFE');
  assert.strictEqual(res.riskLevel, 'LOW');
  assert.strictEqual(res.findings.length, 0);
});

test('Partially occluded 3b: One shoulder occluded uses ipsilateral visible shoulder without distortion', () => {
  // Left shoulder visible (0.95), right shoulder occluded behind column (0.05)
  const lms = createLandmarks({
    11: { x: 220, y: 150, visibility: 0.95 }, // visible left shoulder
    12: { x: 0, y: 0, visibility: 0.05 },      // occluded right shoulder at (0, 0)
    23: { x: 220, y: 280, visibility: 0.95 }, // visible left hip
    24: { x: 0, y: 0, visibility: 0.05 },      // occluded right hip
  });

  const res = postureRule(genuineWorkerBbox, lms);
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.postureState, 'SAFE');
  // Trunk is vertical between x=220, y=150 and x=220, y=280 -> 0.0° inclination
  assert.strictEqual(res.angles.trunkInclinationDeg, 0);
});

test('Partially occluded 3c: Bending forward behind equipment with occluded knees does not create UNSAFE_LIFTING violation', () => {
  // Trunk bent forward 45°, but worker is behind machinery so knees are occluded
  const lms = createLandmarks({
    11: { x: 300, y: 150, visibility: 0.95 },
    12: { x: 350, y: 150, visibility: 0.95 },
    23: { x: 160, y: 300, visibility: 0.95 },
    24: { x: 190, y: 300, visibility: 0.95 },
    25: { x: 0, y: 0, visibility: 0.1 }, // knees occluded
    26: { x: 0, y: 0, visibility: 0.1 },
  });

  const res = postureRule(genuineWorkerBbox, lms);
  assert.strictEqual(res.postureState, 'SLOUCHING', 'Without knee visibility, stoop lift cannot be confirmed');
  assert.strictEqual(res.status, 'COMPLIANT', 'Must NOT create a high-severity lifting violation');
  assert.strictEqual(res.findings.length, 0);
});

// ---------------------------------------------------------------------------
// 4. A WORKER STANDING UPRIGHT
// ---------------------------------------------------------------------------
test('Standing upright 4: Full-body upright worker evaluates as SAFE with zero risk score', () => {
  const lms = createLandmarks();
  const res = postureRule(genuineWorkerBbox, lms);

  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.postureState, 'SAFE');
  assert.strictEqual(res.riskLevel, 'LOW');
  assert.ok(res.angles.trunkInclinationDeg < 5.0);
  assert.strictEqual(res.findings.length, 0);
});

// ---------------------------------------------------------------------------
// 5. A GENUINE UNSAFE POSTURE THAT SHOULD TRIGGER AN ALERT
// ---------------------------------------------------------------------------
test('Genuine unsafe posture 5: Severe stoop lift triggers violation:started alert in RiskEngine', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const alertsEmitted = [];
  engine.addEventListener('violation:started', (e) => alertsEmitted.push(e.detail));

  const severeStoopLms = createLandmarks({
    11: { x: 440, y: 160, visibility: 0.95 }, // Severe forward stoop > 60° (dx=250, dy=140 -> 60.8°)
    12: { x: 460, y: 160, visibility: 0.95 },
    23: { x: 180, y: 300, visibility: 0.95 },
    24: { x: 220, y: 300, visibility: 0.95 },
    25: { x: 180, y: 400, visibility: 0.95 }, // Straight knees
    26: { x: 220, y: 400, visibility: 0.95 },
    27: { x: 180, y: 490, visibility: 0.95 },
    28: { x: 220, y: 490, visibility: 0.95 },
  });

  const frame = {
    frame_id: 10,
    timestamp: Date.now(),
    workers: [
      {
        track_id: 42,
        bbox: genuineWorkerBbox,
        ppe: {
          helmet: { detected: true, confidence: 0.9, bounding_box: [180, 100, 260, 160] },
          vest: { detected: true, confidence: 0.9, bounding_box: [170, 160, 270, 300] },
        },
        landmarks: severeStoopLms,
      },
    ],
  };

  const result = engine.processFrame(frame);
  assert.ok(result);
  assert.strictEqual(result.overallRisk.score, 40);
  assert.strictEqual(result.overallRisk.severity, 'MEDIUM'); // Base 40 is MEDIUM
  assert.strictEqual(alertsEmitted.length, 1);
  assert.strictEqual(alertsEmitted[0].workerId, 42);
  assert.strictEqual(alertsEmitted[0].ruleType, 'UnsafePosture');
  assert.strictEqual(alertsEmitted[0].incident.severity, 'CRITICAL'); // Severe stoop > 60° is CRITICAL severity
});

// ---------------------------------------------------------------------------
// 6. A GENUINE FALL THAT SHOULD STILL BE DETECTED
// ---------------------------------------------------------------------------
test('Genuine fall 6: Worker on floor triggers FallEvent with 90 points and CRITICAL severity', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const alertsEmitted = [];
  engine.addEventListener('violation:started', (e) => alertsEmitted.push(e.detail));

  // Horizontal bounding box on floor: height=120, width=320 -> Aspect ratio 0.38 (< 0.85)
  const fallenBox = { x1: 100, y1: 340, x2: 420, y2: 460, confidence: 0.95 };

  // Torso landmarks horizontal along floor: dy=10, dx=140 -> torso floor angle = 4.1° (< 30°)
  const floorLms = createLandmarks({
    11: { x: 140, y: 420, visibility: 0.9 },
    12: { x: 140, y: 440, visibility: 0.9 },
    23: { x: 280, y: 425, visibility: 0.9 },
    24: { x: 280, y: 445, visibility: 0.9 },
    25: { x: 350, y: 430, visibility: 0.85 },
    26: { x: 350, y: 440, visibility: 0.85 },
    27: { x: 410, y: 435, visibility: 0.85 },
    28: { x: 410, y: 445, visibility: 0.85 },
  });

  const now = Date.now();
  const compliantPpe = {
    helmet: { detected: true, confidence: 0.9, bounding_box: [120, 340, 200, 420] },
    vest: { detected: true, confidence: 0.9, bounding_box: [160, 360, 300, 460] },
  };

  // Frame 1: Initial horizontal ground observation
  engine.processFrame({
    frame_id: 1,
    timestamp: now,
    workers: [{ track_id: 88, bbox: fallenBox, ppe: compliantPpe, landmarks: floorLms }],
  });

  // Frame 2: Confirmed horizontal floor persistence after 400ms (> 333ms confirmation window)
  const result2 = engine.processFrame({
    frame_id: 2,
    timestamp: now + 400,
    workers: [{ track_id: 88, bbox: fallenBox, ppe: compliantPpe, landmarks: floorLms }],
  });

  assert.ok(result2);
  assert.ok(result2.overallRisk.score >= 90, 'FallEvent must yield at least 90 penalty points');
  assert.strictEqual(result2.overallRisk.severity, 'CRITICAL', 'FallEvent must be CRITICAL severity');
  assert.ok(alertsEmitted.some((a) => a.ruleType === 'FallEvent'), 'Must emit FallEvent violation alert');
});

console.log(`\nAll ${testsRun} regression tests passed successfully!\n`);
