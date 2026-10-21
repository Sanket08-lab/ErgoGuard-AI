import assert from 'node:assert/strict';
import { RiskEngine } from '../engine/riskEngine.js';

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

console.log('Running fallScenarios.test.js integration suite...\n');

// Upright person fixture: H=400, W=150
const uprightWorker = {
  track_id: 1,
  bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
  ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
  landmarks: [
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
  ],
};

// Forward bending worker (stoop lift): trunk bent forward ~60°, straight knees (> 150°)
const forwardBendingWorker = {
  track_id: 1,
  bbox: { x1: 100, y1: 150, x2: 280, y2: 500 },
  ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
  landmarks: [
    ...Array(11).fill({ x: 260, y: 240, visibility: 0.3 }),
    { x: 250, y: 260, visibility: 0.95 }, // 11: left shoulder
    { x: 270, y: 260, visibility: 0.95 }, // 12: right shoulder
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 160, y: 280, visibility: 0.95 }, // 23: left hip
    { x: 180, y: 280, visibility: 0.95 }, // 24: right hip
    { x: 165, y: 380, visibility: 0.90 }, // 25: left knee
    { x: 185, y: 380, visibility: 0.90 }, // 26: right knee
    { x: 165, y: 480, visibility: 0.90 }, // 27: left ankle
    { x: 185, y: 480, visibility: 0.90 }, // 28: right ankle
  ],
};

// Reaching toward floor worker: upper body lowered near floor, but hips elevated on standing legs
const reachingFloorWorker = {
  track_id: 1,
  bbox: { x1: 100, y1: 230, x2: 360, y2: 450 }, // H=220, W=260 (collapsed aspect ratio = 0.85)
  ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
  landmarks: [
    ...Array(11).fill({ x: 280, y: 400, visibility: 0.2 }),
    { x: 280, y: 410, visibility: 0.95 }, // 11: left shoulder reaching down
    { x: 300, y: 410, visibility: 0.95 }, // 12: right shoulder
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 150, y: 250, visibility: 0.95 }, // 23: left hip elevated
    { x: 170, y: 250, visibility: 0.95 }, // 24: right hip
    { x: 155, y: 350, visibility: 0.90 }, // 25: left knee
    { x: 175, y: 350, visibility: 0.90 }, // 26: right knee
    { x: 155, y: 440, visibility: 0.90 }, // 27: left ankle
    { x: 175, y: 440, visibility: 0.90 }, // 28: right ankle
  ],
};

// Fallen worker on floor: H=100, W=300 (aspect ratio = 0.33)
const fallenWorker = {
  track_id: 1,
  bbox: { x1: 100, y1: 400, x2: 400, y2: 500 },
  ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
  landmarks: [
    ...Array(11).fill({ x: 120, y: 450, visibility: 0.2 }),
    { x: 140, y: 440, visibility: 0.95 }, // 11: left shoulder on floor
    { x: 140, y: 460, visibility: 0.95 }, // 12: right shoulder
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 260, y: 440, visibility: 0.95 }, // 23: left hip on floor
    { x: 260, y: 460, visibility: 0.95 }, // 24: right hip
    { x: 320, y: 445, visibility: 0.90 }, // 25: left knee
    { x: 320, y: 465, visibility: 0.90 }, // 26: right knee
    { x: 380, y: 445, visibility: 0.90 }, // 27: left ankle
    { x: 380, y: 465, visibility: 0.90 }, // 28: right ankle
  ],
};

test('1. Normal standing: produces 0 risk score and zero active incidents', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const result = engine.processFrame({ timestamp: 0, frameId: 1, workers: [uprightWorker] });

  assert.strictEqual(result.overallRisk.score, 0);
  assert.strictEqual(result.overallRisk.severity, 'LOW');
  assert.strictEqual(result.activeIncidents.length, 0);

  const w = result.workers[0];
  assert.strictEqual(w.riskScore, 0);
  assert.strictEqual(w.fall.fallState, 'NORMAL');
  assert.strictEqual(w.fall.isFallen, false);
});

test('2. Forward bending: flags UnsafePosture (+40 pts) but does NOT trigger false FallEvent', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Process forward bending worker over multiple frames (0ms, 200ms, 500ms)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  engine.processFrame({ timestamp: 200, frameId: 2, workers: [forwardBendingWorker] });
  const finalRes = engine.processFrame({ timestamp: 500, frameId: 3, workers: [forwardBendingWorker] });

  const w = finalRes.workers[0];
  // Posture rule correctly flags UnsafePosture (+40 points)
  assert.ok(w.findings.some((f) => f.type === 'UnsafePosture' && f.status === 'VIOLATION'));
  assert.strictEqual(w.riskScore, 40.0);
  assert.strictEqual(w.severity, 'MEDIUM');

  // Fall rule remains completely COMPLIANT (zero fall points)
  assert.strictEqual(w.fall.fallState, 'NORMAL');
  assert.strictEqual(w.fall.isFallen, false);
  assert.strictEqual(w.findings.some((f) => f.type === 'FallEvent'), false);

  // Violation tracker started UnsafePosture incident, but NOT FallEvent
  assert.ok(startedEvents.some((e) => e.ruleType === 'UnsafePosture'));
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
  assert.strictEqual(finalRes.activeIncidents.length, 1);
  assert.strictEqual(finalRes.activeIncidents[0].ruleType, 'UnsafePosture');
});

test('3. Reaching toward floor: deep bend does NOT trigger false FallEvent', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  const res = engine.processFrame({ timestamp: 0, frameId: 1, workers: [reachingFloorWorker] });
  const w = res.workers[0];

  assert.strictEqual(w.fall.fallState, 'NORMAL');
  assert.strictEqual(w.fall.isFallen, false);
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
});

test('4. Missing or unreliable landmarks: collapsed box produces UNCERTAIN, no confirmed fall or penalty', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Worker with collapsed box but missing landmarks (e.g. camera occlusion)
  const occludedWorker = {
    track_id: 2,
    bbox: { x1: 100, y1: 400, x2: 400, y2: 500 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: null, // missing landmarks
  };

  const res = engine.processFrame({ timestamp: 0, frameId: 1, workers: [occludedWorker] });
  const w = res.workers[0];

  assert.strictEqual(w.fall.fallState, 'UNCERTAIN');
  assert.strictEqual(w.fall.status, 'UNCERTAIN');
  assert.strictEqual(w.fall.isFallen, false);
  assert.strictEqual(w.riskScore, 0); // UNCERTAIN yields 0 risk points
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
  assert.strictEqual(res.activeIncidents.length, 0);
});

test('5. Multi-frame fall sequence: rapid descent -> floor persistence -> FallEvent alert (+90 pts)', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 50 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Frame 1 @ t=0ms: Normal standing
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [uprightWorker] });
  assert.strictEqual(startedEvents.length, 0);

  // Frame 2 @ t=100ms: Rapid vertical descent
  const droppingWorker = {
    ...uprightWorker,
    bbox: { x1: 100, y1: 200, x2: 250, y2: 600 }, // vertical drop
  };
  const dropRes = engine.processFrame({ timestamp: 100, frameId: 2, workers: [droppingWorker] });
  assert.strictEqual(dropRes.workers[0].fall.fallState, 'RAPID_DESCENT');
  assert.strictEqual(dropRes.workers[0].riskScore, 0); // UNCERTAIN descent gives 0 penalty

  // Frame 3 @ t=200ms: Floor contact (first horizontal frame, ground duration = 0ms < 333ms)
  const contactRes = engine.processFrame({ timestamp: 200, frameId: 3, workers: [fallenWorker] });
  assert.strictEqual(contactRes.workers[0].fall.isFallen, false);

  // Frame 4 @ t=600ms: Floor persistence 400ms (>= 333ms confirm threshold) -> Confirmed Fall!
  const confirmedRes = engine.processFrame({ timestamp: 600, frameId: 4, workers: [fallenWorker] });
  assert.strictEqual(confirmedRes.workers[0].fall.isFallen, true);
  assert.strictEqual(confirmedRes.workers[0].fall.fallState, 'FALLEN');
  assert.ok(confirmedRes.workers[0].findings.some((f) => f.type === 'FallEvent' && f.points === 90));
  assert.strictEqual(confirmedRes.workers[0].riskScore >= 90.0, true);
  assert.strictEqual(confirmedRes.workers[0].severity, 'CRITICAL');

  // Frame 5 @ t=700ms: Debounce met -> violation:started event fired for FallEvent
  engine.processFrame({ timestamp: 700, frameId: 5, workers: [fallenWorker] });
  assert.ok(startedEvents.some((e) => e.ruleType === 'FallEvent'));
});

test('6. Recovery after violation: standing back up resolves FallEvent and resets score to 0', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const resolvedEvents = [];
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  // t=0ms and t=400ms: Worker is fallen on the floor (confirmed fall, score >= 90)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [fallenWorker] });
  const fallenFrame = engine.processFrame({ timestamp: 400, frameId: 2, workers: [fallenWorker] });
  assert.strictEqual(fallenFrame.workers[0].riskScore >= 90.0, true);
  assert.ok(fallenFrame.activeIncidents.some((i) => i.ruleType === 'FallEvent'));

  // t=1500ms: Worker stands back up (upright worker) -> Immediate resolution!
  const recoveredFrame = engine.processFrame({ timestamp: 1500, frameId: 3, workers: [uprightWorker] });
  assert.strictEqual(recoveredFrame.workers[0].riskScore, 0);
  assert.strictEqual(recoveredFrame.workers[0].severity, 'LOW');
  assert.strictEqual(recoveredFrame.overallRisk.score, 0);

  // Resolved event was emitted for FallEvent
  assert.ok(resolvedEvents.some((e) => e.ruleType === 'FallEvent'));

  // Active incidents list is now completely empty
  assert.strictEqual(recoveredFrame.activeIncidents.length, 0);
  assert.strictEqual(engine.tracker.getActiveIncidents().length, 0);
});

test('7. Event lifecycle separation: Posture violation and FallEvent are completely independent', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  const resolvedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  // Step 1: Forward bending triggers UnsafePosture (40 pts)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  assert.strictEqual(engine.tracker.records.get('1:UnsafePosture')?.state, 'ACTIVE');
  assert.strictEqual(engine.tracker.records.get('1:FallEvent')?.state, 'INACTIVE');

  // Step 2: Worker stands up, resolving posture
  engine.processFrame({ timestamp: 500, frameId: 2, workers: [uprightWorker] });
  assert.strictEqual(engine.tracker.records.get('1:UnsafePosture')?.state, 'INACTIVE');
  assert.strictEqual(resolvedEvents.some((e) => e.ruleType === 'UnsafePosture'), true);
  assert.strictEqual(engine.tracker.getActiveIncidents().length, 0);
});

test('8. RiskEngine: Standing with arms extended horizontally (T-pose) keeps score 0 and severity LOW', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // T-pose worker: arms extended 90° sideways, wide bounding box (AR=0.71)
  const tPoseWorker = {
    track_id: 1,
    bbox: { x1: 40, y1: 100, x2: 600, y2: 500 }, // W=560, H=400 (AR=0.71 <= 0.85)
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 320, y: 300, visibility: 0.1 }),
      { x: 270, y: 160, visibility: 0.95 }, // 11: left shoulder
      { x: 370, y: 160, visibility: 0.95 }, // 12: right shoulder
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 50, y: 160, visibility: 0.95 },  // 15: left wrist extended sideways
      { x: 590, y: 160, visibility: 0.95 }, // 16: right wrist extended sideways
      ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 290, y: 280, visibility: 0.95 }, // 23: left hip
      { x: 350, y: 280, visibility: 0.95 }, // 24: right hip
      { x: 290, y: 380, visibility: 0.90 }, // 25: left knee
      { x: 350, y: 380, visibility: 0.90 }, // 26: right knee
      { x: 290, y: 480, visibility: 0.90 }, // 27: left ankle
      { x: 350, y: 480, visibility: 0.90 }, // 28: right ankle
    ],
  };

  // Evaluate across multiple frames (0ms, 200ms, 500ms, 1000ms)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [tPoseWorker] });
  engine.processFrame({ timestamp: 200, frameId: 2, workers: [tPoseWorker] });
  engine.processFrame({ timestamp: 500, frameId: 3, workers: [tPoseWorker] });
  const res = engine.processFrame({ timestamp: 1000, frameId: 4, workers: [tPoseWorker] });

  // Overall risk and worker risk must remain completely zero
  assert.strictEqual(res.overallRisk.score, 0);
  assert.strictEqual(res.overallRisk.severity, 'LOW');
  assert.strictEqual(res.workers[0].riskScore, 0);
  assert.strictEqual(res.workers[0].severity, 'LOW');
  assert.strictEqual(res.workers[0].fall.fallState, 'NORMAL');
  assert.strictEqual(res.workers[0].fall.isFallen, false);
  assert.strictEqual(res.workers[0].posture.postureState, 'SAFE');

  // No FallEvent started
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
  assert.strictEqual(res.activeIncidents.length, 0);
});

test('9. RiskEngine: Standing with arms extended while turned sideways keeps score 0 and severity LOW', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  const sideWorker = {
    track_id: 1,
    bbox: { x1: 50, y1: 100, x2: 590, y2: 340 }, // H=240, W=540 (AR=0.44)
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 320, y: 300, z: 0, visibility: 0.1 }),
      { x: 300, y: 150, z: -40, visibility: 0.95 }, // 11
      { x: 340, y: 155, z: 40, visibility: 0.95 },  // 12
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 80, y: 150, z: -80, visibility: 0.95 },  // 15
      { x: 560, y: 155, z: 80, visibility: 0.95 },  // 16
      ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 310, y: 280, z: -30, visibility: 0.95 }, // 23
      { x: 330, y: 280, z: 30, visibility: 0.95 },  // 24
      { x: 310, y: 380, z: -20, visibility: 0.90 }, // 25
      { x: 330, y: 380, z: 20, visibility: 0.90 },  // 26
      { x: 310, y: 480, z: -20, visibility: 0.90 }, // 27
      { x: 330, y: 480, z: 20, visibility: 0.90 },  // 28
    ],
  };

  engine.processFrame({ timestamp: 0, frameId: 1, workers: [sideWorker] });
  const res = engine.processFrame({ timestamp: 600, frameId: 2, workers: [sideWorker] });

  assert.strictEqual(res.overallRisk.score, 0);
  assert.strictEqual(res.overallRisk.severity, 'LOW');
  assert.strictEqual(res.workers[0].riskScore, 0);
  assert.strictEqual(res.workers[0].fall.fallState, 'NORMAL');
  assert.strictEqual(res.workers[0].fall.isFallen, false);
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
  assert.strictEqual(res.activeIncidents.length, 0);
});

test('10. RiskEngine: Standing with arms raised overhead keeps score 0 and severity LOW', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  const overheadWorker = {
    track_id: 1,
    bbox: { x1: 250, y1: 30, x2: 390, y2: 510 }, // H=480, W=140 (AR=3.43)
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 320, y: 300, visibility: 0.1 }),
      { x: 280, y: 180, visibility: 0.95 }, // 11
      { x: 360, y: 180, visibility: 0.95 }, // 12
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 290, y: 40, visibility: 0.95 },  // 15 overhead
      { x: 350, y: 40, visibility: 0.95 },  // 16 overhead
      ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 290, y: 300, visibility: 0.95 }, // 23
      { x: 350, y: 300, visibility: 0.95 }, // 24
      { x: 290, y: 400, visibility: 0.90 }, // 25
      { x: 350, y: 400, visibility: 0.90 }, // 26
      { x: 290, y: 500, visibility: 0.90 }, // 27
      { x: 350, y: 500, visibility: 0.90 }, // 28
    ],
  };

  const res = engine.processFrame({ timestamp: 0, frameId: 1, workers: [overheadWorker] });
  assert.strictEqual(res.overallRisk.score, 0);
  assert.strictEqual(res.overallRisk.severity, 'LOW');
  assert.strictEqual(res.workers[0].riskScore, 0);
  assert.strictEqual(res.workers[0].fall.fallState, 'NORMAL');
  assert.strictEqual(res.workers[0].fall.isFallen, false);
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
});

console.log(`\nAll ${testsRun} fall integration scenarios passed successfully!\n`);
