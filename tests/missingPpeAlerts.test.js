import assert from 'node:assert/strict';
import test from 'node:test';
import { ppeRule } from '../engine/rules/ppe.js';
import { RiskEngine } from '../engine/riskEngine.js';
import { CONFIG } from '../engine/config.js';

test('1. No PPE: missing-PPE alerts appear when inspection is reliable', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 167 });
  const workerNoPPE = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: false, confidence: 0.0, bounding_box: null },
      vest: { detected: false, confidence: 0.0, bounding_box: null },
    },
    landmarks: [
      { x: 220, y: 120, z: 0, visibility: 0.95 }, // nose (head visible)
      { x: 180, y: 180, z: 0, visibility: 0.90 }, // left shoulder (torso visible)
      { x: 260, y: 180, z: 0, visibility: 0.90 }, // right shoulder
      { x: 190, y: 300, z: 0, visibility: 0.85 }, // left hip
      { x: 250, y: 300, z: 0, visibility: 0.85 }, // right hip
    ],
  };

  // Frame 1 @ t=0: Debouncing begins
  const res1 = engine.processFrame({ timestamp: 0, frameId: 1, workers: [workerNoPPE] });
  const w1 = res1.workers[0];
  const hardhatFinding = w1.findings.find(f => f.type === 'MissingHardhat');
  const vestFinding = w1.findings.find(f => f.type === 'MissingVest');

  assert.ok(hardhatFinding, 'MissingHardhat finding must be raised');
  assert.strictEqual(hardhatFinding.status, 'VIOLATION');
  assert.strictEqual(hardhatFinding.points, 55);

  assert.ok(vestFinding, 'MissingVest finding must be raised');
  assert.strictEqual(vestFinding.status, 'VIOLATION');
  assert.strictEqual(vestFinding.points, 35);

  // Frame 2 @ t=200ms: Debounce confirmed (> 167ms confirmation period)
  const res2 = engine.processFrame({ timestamp: 200, frameId: 2, workers: [workerNoPPE] });
  assert.strictEqual(engine.tracker.records.get('1:MissingHardhat')?.state, 'ACTIVE');
  assert.strictEqual(engine.tracker.records.get('1:MissingVest')?.state, 'ACTIVE');
  assert.ok(res2.overallRisk.score >= 70, `Score must be HIGH/CRITICAL combined risk (actual: ${res2.overallRisk.score})`);
  assert.strictEqual(res2.overallRisk.severity, 'HIGH');
});

test('2. Helmet and vest present: no false missing-PPE alerts', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 167 });
  const workerWithPPE = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: true, confidence: 0.85, bounding_box: [180, 95, 260, 160] },
      vest: { detected: true, confidence: 0.80, bounding_box: [160, 170, 280, 320] },
    },
    landmarks: [
      { x: 220, y: 120, z: 0, visibility: 0.95 },
      { x: 180, y: 180, z: 0, visibility: 0.90 },
      { x: 260, y: 180, z: 0, visibility: 0.90 },
      { x: 190, y: 300, z: 0, visibility: 0.85 },
      { x: 250, y: 300, z: 0, visibility: 0.85 },
    ],
  };

  const res = engine.processFrame({ timestamp: 200, frameId: 1, workers: [workerWithPPE] });
  const w = res.workers[0];
  const ppeViolations = w.findings.filter(f => (f.type.includes('Hardhat') || f.type.includes('Vest')) && f.status === 'VIOLATION');
  assert.strictEqual(ppeViolations.length, 0, 'No missing PPE violations should be raised when PPE is present');
  assert.strictEqual(res.overallRisk.score, 0, 'Score must remain 0 when worker is compliant');
});

test('3. Head or torso obscured: corresponding status is UNKNOWN (UNCERTAIN with 0 penalty)', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const workerHeadObscured = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: true, confidence: 0.2, bounding_box: null }, // UNKNOWN sentinel from visionPipeline
      vest: { detected: false, confidence: 0.0, bounding_box: null },   // Confirmed missing
    },
    landmarks: [
      { x: 220, y: 120, z: 0, visibility: 0.10 }, // nose obscured
      { x: 180, y: 180, z: 0, visibility: 0.90 }, // shoulders visible
      { x: 260, y: 180, z: 0, visibility: 0.90 },
    ],
  };

  const res = engine.processFrame({ timestamp: 0, frameId: 1, workers: [workerHeadObscured] });
  const w = res.workers[0];
  const helmetFinding = w.findings.find(f => f.type.includes('Hardhat'));
  const vestFinding = w.findings.find(f => f.type.includes('Vest'));

  assert.ok(helmetFinding, 'Helmet finding must exist');
  assert.strictEqual(helmetFinding.status, 'UNCERTAIN', 'Obscured head must be UNKNOWN/UNCERTAIN');
  assert.strictEqual(helmetFinding.points, 0, 'Uncertain head must carry 0 penalty points');

  assert.ok(vestFinding, 'Vest finding must exist');
  assert.strictEqual(vestFinding.status, 'VIOLATION', 'Visible torso missing vest must be a VIOLATION');
  assert.strictEqual(vestFinding.points, 35);
});

test('4. PPE becomes visible: the relevant alert resolves', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 50 });
  const resolvedEvents = [];
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  const workerMissing = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: false, confidence: 0.0, bounding_box: null },
      vest: { detected: true, confidence: 0.85, bounding_box: [160, 170, 280, 320] },
    },
  };

  // Step 1: Missing hardhat starts
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [workerMissing] });
  engine.processFrame({ timestamp: 100, frameId: 2, workers: [workerMissing] });
  assert.strictEqual(engine.tracker.records.get('1:MissingHardhat')?.state, 'ACTIVE');

  // Step 2: Worker puts on helmet (detected)
  const workerCompliant = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: true, confidence: 0.88, bounding_box: [180, 95, 260, 160] },
      vest: { detected: true, confidence: 0.85, bounding_box: [160, 170, 280, 320] },
    },
  };

  engine.processFrame({ timestamp: 200, frameId: 3, workers: [workerCompliant] });
  assert.strictEqual(engine.tracker.records.get('1:MissingHardhat')?.state, 'INACTIVE', 'Record state must become INACTIVE after resolution');
  assert.strictEqual(resolvedEvents.length, 1, 'One violation:resolved event must be emitted');
  assert.strictEqual(resolvedEvents[0].ruleType, 'MissingHardhat');
});

test('5. Existing posture and fall detection still work concurrently with PPE', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  // Worker with sustained stoop posture AND MissingVest
  const workerMultiHazard = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
    ppe: {
      helmet: { detected: true, confidence: 0.85, bounding_box: [180, 95, 260, 160] },
      vest: { detected: false, confidence: 0.0, bounding_box: null }, // Missing vest
    },
    landmarks: {
      11: { x: 300, y: 200, z: 0, visibility: 0.9 }, // horizontal trunk (dx=100, dy=0 -> trunk angle 90°)
      12: { x: 300, y: 200, z: 0, visibility: 0.9 },
      23: { x: 200, y: 200, z: 0, visibility: 0.9 },
      24: { x: 200, y: 200, z: 0, visibility: 0.9 },
      25: { x: 200, y: 320, z: 0, visibility: 0.9 }, // straight knees
      26: { x: 200, y: 320, z: 0, visibility: 0.9 },
      27: { x: 200, y: 440, z: 0, visibility: 0.9 },
      28: { x: 200, y: 440, z: 0, visibility: 0.9 },
    },
  };

  // Sustained stoop over 2 seconds (exceeding brief grace)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [workerMultiHazard] });
  const res = engine.processFrame({ timestamp: 2000, frameId: 2, workers: [workerMultiHazard] });
  const w = res.workers[0];
  const postureViol = w.findings.find(f => f.type === 'UnsafePosture');
  const vestViol = w.findings.find(f => f.type === 'MissingVest');

  assert.ok(postureViol, 'UnsafePosture must be detected alongside PPE');
  assert.ok(vestViol, 'MissingVest must be detected alongside posture');
  assert.ok(res.overallRisk.score >= 50, 'Risk score must aggregate multiple hazards into HIGH/CRITICAL tier');
});
