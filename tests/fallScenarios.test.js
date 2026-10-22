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

  // Process forward bending worker over multiple frames (0ms, 1000ms, 2000ms - exceeding 1.5s grace)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  engine.processFrame({ timestamp: 1000, frameId: 2, workers: [forwardBendingWorker] });
  const finalRes = engine.processFrame({ timestamp: 2000, frameId: 3, workers: [forwardBendingWorker] });

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

  // Step 1: Sustained forward bending triggers UnsafePosture (40 pts)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  assert.ok(engine.tracker.records.get('1:UnsafePosture')?.state === 'ACTIVE');
  assert.strictEqual(engine.tracker.records.get('1:FallEvent')?.state, 'INACTIVE');

  // Step 2: Worker stands up, resolving posture
  engine.processFrame({ timestamp: 4000, frameId: 3, workers: [uprightWorker] });
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

test('11. RiskEngine: Waist-up webcam crop with legs outside frame and asymmetrical hip visibility during T-pose keeps score 0 and severity LOW', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  const waistUpWorker = {
    track_id: 1,
    bbox: { x1: 40, y1: 100, x2: 600, y2: 240 }, // H=140, W=560 (AR=0.25 <= 0.85)
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 320, y: 300, visibility: 0.1 }),
      { x: 250, y: 160, visibility: 0.95 }, // 11: left shoulder
      { x: 390, y: 160, visibility: 0.95 }, // 12: right shoulder
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 50, y: 160, visibility: 0.95 },  // 15: left wrist extended sideways
      { x: 590, y: 160, visibility: 0.95 }, // 16: right wrist extended sideways
      ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 250, y: 200, visibility: 0.95 }, // 23: left hip visible
      { x: 390, y: 200, visibility: 0.20 }, // 24: right hip occluded by frame boundary!
      { x: 250, y: 230, visibility: 0.30 }, // 25: knee at bottom
      { x: 390, y: 230, visibility: 0.30 }, // 26: knee at bottom
      { x: 250, y: 400, visibility: 0.05 }, // 27: ankle out of frame
      { x: 390, y: 400, visibility: 0.05 }, // 28: ankle out of frame
    ],
  };

  // Evaluate across multi-frame sequence (0ms, 200ms, 500ms, 1000ms)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [waistUpWorker] });
  engine.processFrame({ timestamp: 200, frameId: 2, workers: [waistUpWorker] });
  engine.processFrame({ timestamp: 500, frameId: 3, workers: [waistUpWorker] });
  const res = engine.processFrame({ timestamp: 1000, frameId: 4, workers: [waistUpWorker] });

  // Must maintain 0 risk score and LOW severity
  assert.strictEqual(res.overallRisk.score, 0);
  assert.strictEqual(res.overallRisk.severity, 'LOW');
  assert.strictEqual(res.workers[0].riskScore, 0);
  assert.strictEqual(res.workers[0].fall.fallState, 'NORMAL');
  assert.strictEqual(res.workers[0].fall.isFallen, false);
  assert.strictEqual(res.workers[0].posture.postureState, 'SAFE');
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
  assert.strictEqual(res.activeIncidents.length, 0);
});

test('12. Regression: Standing worker bending forward over a wheelbarrow does not trigger FallEvent or WorkerFatigue', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Worker #1: standing worker leaning forward over wheelbarrow handles
  // Torso bent forward ~55° (torsoFloorAngle ~35°), head tilted down looking at wheelbarrow (neckAngle ~50°)
  // Hips elevated high above feet (pelvis at y=280, feet at y=520, box height=440)
  const wheelbarrowWorker = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 380, y2: 540 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      { x: 340, y: 190, visibility: 0.90 }, // 0: nose looking down at wheelbarrow
      ...Array(6).fill({ x: 330, y: 180, visibility: 0.2 }),
      { x: 310, y: 175, visibility: 0.85 }, // 7: left ear
      { x: 330, y: 175, visibility: 0.85 }, // 8: right ear
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 280, y: 220, visibility: 0.95 }, // 11: left shoulder forward
      { x: 320, y: 220, visibility: 0.95 }, // 12: right shoulder forward
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 200, y: 280, visibility: 0.95 }, // 23: left hip elevated
      { x: 230, y: 280, visibility: 0.95 }, // 24: right hip elevated
      { x: 205, y: 400, visibility: 0.85 }, // 25: left knee
      { x: 235, y: 400, visibility: 0.85 }, // 26: right knee
      { x: 210, y: 520, visibility: 0.85 }, // 27: left ankle on ground
      { x: 240, y: 520, visibility: 0.85 }, // 28: right ankle on ground
    ],
  };

  // Evaluate worker working over wheelbarrow across sustained time sequence (0s to 3.5s)
  let res;
  for (let t = 0; t <= 3500; t += 250) {
    res = engine.processFrame({ timestamp: t, frameId: Math.floor(t / 250) + 1, workers: [wheelbarrowWorker] });
  }

  // Must NOT trigger FallEvent
  assert.strictEqual(res.workers[0].fall.isFallen, false, 'Standing worker over wheelbarrow must NOT be marked fallen');
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false, 'Must not dispatch FallEvent');

  // Must NOT trigger false WorkerFatigue from looking down at work
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'WorkerFatigue'), false, 'Task-directed neck tilt must not trigger WorkerFatigue');

  // Risk score must NOT be critical
  assert.notStrictEqual(res.overallRisk.severity, 'CRITICAL', 'Worker bending over wheelbarrow must not be CRITICAL');
});

test('13. Regression: Spurious horizontal wheelbarrow chassis detection does not trigger confirmed FallEvent', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Worker #2: Wheelbarrow chassis/wheel (horizontal aspect ratio, no leg support, stationary on ground)
  const wheelbarrowObject = {
    track_id: 2,
    bbox: { x1: 958, y1: 991, x2: 1837, y2: 1214 }, // AR = 223 / 879 = 0.25
    landmarks: [
      ...Array(11).fill({ x: 1000, y: 1050, visibility: 0.2 }),
      { x: 1050, y: 1050, visibility: 0.45 }, // 11
      { x: 1100, y: 1050, visibility: 0.45 }, // 12
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 1700, y: 1060, visibility: 0.45 }, // 23
      { x: 1750, y: 1060, visibility: 0.45 }, // 24
      // Lower extremity points occluded / below min visibility
      { x: 1400, y: 1100, visibility: 0.20 },
      { x: 1450, y: 1100, visibility: 0.20 },
      { x: 1500, y: 1100, visibility: 0.15 },
      { x: 1550, y: 1100, visibility: 0.15 },
    ],
  };

  // Process frames
  let res;
  for (let t = 0; t <= 1000; t += 200) {
    res = engine.processFrame({ timestamp: t, frameId: Math.floor(t / 200) + 1, workers: [wheelbarrowObject] });
  }

  // Must not confirm a fall violation (should be UNCERTAIN or safe)
  assert.strictEqual(res.workers[0].fall.isFallen, false, 'Horizontal wheelbarrow object must not confirm fall');
  assert.strictEqual(startedEvents.some((e) => e.ruleType === 'FallEvent'), false);
});

test('14. Genuine sustained fatigue detection: prolonged slumping and head droop triggers WorkerFatigue', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Upright slumping worker with severe head droop (trunk bent ~34°, head droop ~54°)
  const fatiguedWorker = {
    track_id: 1,
    bbox: { x1: 150, y1: 100, x2: 350, y2: 450 },
    landmarks: [
      { x: 310, y: 140, visibility: 0.90 }, // nose
      ...Array(6).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 330, y: 130, visibility: 0.90 }, // 7: ear tilted forward relative to shoulders
      { x: 350, y: 130, visibility: 0.90 }, // 8: ear
      ...Array(2).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 260, y: 170, visibility: 0.95 }, // 11: shoulders slouched forward
      { x: 310, y: 170, visibility: 0.95 }, // 12
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 190, y: 280, visibility: 0.95 }, // 23: hips
      { x: 230, y: 280, visibility: 0.95 }, // 24
      { x: 190, y: 360, visibility: 0.90 }, // 25
      { x: 230, y: 360, visibility: 0.90 }, // 26
      { x: 190, y: 440, visibility: 0.90 }, // 27
      { x: 230, y: 440, visibility: 0.90 }, // 28
    ],
  };

  // t=0: Baseline
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [fatiguedWorker] });

  // t=1000ms: Not yet fatigued (below dwell)
  const res1 = engine.processFrame({ timestamp: 1000, frameId: 2, workers: [fatiguedWorker] });
  assert.strictEqual(res1.workers[0].posture.fatigue.isFatigued, false);

  // t=3500ms: Sustained slumping + head droop over 3.5s
  const res2 = engine.processFrame({ timestamp: 3500, frameId: 3, workers: [fatiguedWorker] });
  assert.strictEqual(res2.workers[0].posture.fatigue.isFatigued, true);
  assert.ok(startedEvents.some((e) => e.ruleType === 'WorkerFatigue'), 'Must dispatch WorkerFatigue alert');
  assert.strictEqual(res2.workers[0].posture.postureState, 'FATIGUED', 'Posture panel must show FATIGUED, not SAFE');
});

test('15. Genuine fall detection: horizontal worker on ground with bilateral landmarks triggers FallEvent', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  const fallenWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 400, x2: 400, y2: 500, confidence: 0.95 }, // AR = 100 / 300 = 0.33
    landmarks: [
      ...Array(11).fill({ x: 120, y: 450, visibility: 0.3 }),
      { x: 140, y: 440, visibility: 0.95 }, // 11: shoulders on floor
      { x: 140, y: 460, visibility: 0.95 }, // 12
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 260, y: 440, visibility: 0.95 }, // 23: hips on floor (dy ~ 0)
      { x: 260, y: 460, visibility: 0.95 }, // 24
      { x: 320, y: 445, visibility: 0.90 }, // 25: knees on floor
      { x: 320, y: 465, visibility: 0.90 }, // 26
      { x: 380, y: 445, visibility: 0.90 }, // 27: ankles on floor
      { x: 380, y: 465, visibility: 0.90 }, // 28
    ],
  };

  // t=0: First floor observation (< 333ms)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [fallenWorker] });

  // t=400ms: Ground duration exceeds 333ms confirmation threshold
  const res = engine.processFrame({ timestamp: 400, frameId: 2, workers: [fallenWorker] });

  assert.strictEqual(res.workers[0].fall.isFallen, true, 'Genuine fall must be confirmed');
  assert.strictEqual(res.workers[0].fall.fallState, 'FALLEN');
  assert.strictEqual(res.overallRisk.severity, 'CRITICAL');
  assert.ok(startedEvents.some((e) => e.ruleType === 'FallEvent'), 'Must dispatch FallEvent alert');
});

test('16. Severe sustained stoop: trunk bent 65° for 3.5s escalates to CRITICAL (80 pts) independently of fall', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Severe stoop worker: trunk bent 65° with straight knees
  const severeStoopWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 150, x2: 280, y2: 500 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 490, y: 150, visibility: 0.3 }),
      { x: 470, y: 150, visibility: 0.95 }, // 11: shoulders pushed far forward
      { x: 520, y: 150, visibility: 0.95 }, // 12
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 160, y: 300, visibility: 0.95 }, // 23: hips
      { x: 190, y: 300, visibility: 0.95 }, // 24
      { x: 165, y: 400, visibility: 0.90 }, // 25: straight knees (180°)
      { x: 185, y: 400, visibility: 0.90 }, // 26
      { x: 165, y: 490, visibility: 0.90 }, // 27: ankles
      { x: 185, y: 490, visibility: 0.90 }, // 28
    ],
  };

  // t=0: Initial bend (brief grace)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [severeStoopWorker] });

  // t=3500ms: Sustained >= 3.0s -> Escalates to CRITICAL (80 pts)!
  const res = engine.processFrame({ timestamp: 3500, frameId: 2, workers: [severeStoopWorker] });
  const w = res.workers[0];

  assert.strictEqual(w.findings.find(f => f.type === 'UnsafePosture').points, 80);
  assert.strictEqual(w.riskScore, 80.0);
  assert.strictEqual(w.severity, 'CRITICAL');
  assert.strictEqual(res.overallRisk.score, 80.0);
  assert.strictEqual(res.overallRisk.severity, 'CRITICAL');

  // Fall rule remains completely normal
  assert.strictEqual(w.fall.isFallen, false);
  assert.strictEqual(w.fall.fallState, 'NORMAL');
});

test('17. Genuine fall with bent knees: curled body on floor is detected as FallEvent (+90 pts, CRITICAL)', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Worker curled up sideways on floor: knees flexed (< 130°), but torso is horizontal along floor (torsoFloorAngle <= 30°)
  const bentKneeFallWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 400, x2: 380, y2: 490, confidence: 0.95 }, // H=90, W=280 (AR = 0.32)
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
    landmarks: [
      ...Array(11).fill({ x: 120, y: 450, visibility: 0.3 }),
      { x: 140, y: 440, visibility: 0.95 }, // 11: shoulders on floor
      { x: 140, y: 460, visibility: 0.95 }, // 12
      ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
      { x: 260, y: 440, visibility: 0.95 }, // 23: hips on floor (horizontal torso: dx=120, dy=0 -> 0° from floor)
      { x: 260, y: 460, visibility: 0.95 }, // 24
      { x: 300, y: 410, visibility: 0.90 }, // 25: knees bent up toward chest
      { x: 300, y: 430, visibility: 0.90 }, // 26
      { x: 260, y: 410, visibility: 0.90 }, // 27: ankles pulled near hips (bent knees ~90°)
      { x: 260, y: 430, visibility: 0.90 }, // 28
    ],
  };

  // t=0: Ground contact (< 333ms)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [bentKneeFallWorker] });

  // t=500ms: Ground persistence >= 333ms confirms fall!
  const res = engine.processFrame({ timestamp: 500, frameId: 2, workers: [bentKneeFallWorker] });
  const w = res.workers[0];

  assert.strictEqual(w.fall.isFallen, true, 'Genuine fall with bent knees must be confirmed');
  assert.strictEqual(w.fall.fallState, 'FALLEN');
  assert.strictEqual(res.overallRisk.severity, 'CRITICAL');
  assert.ok(w.findings.some(f => f.type === 'FallEvent' && f.points === 90));
});

test('18. Brief forward bend: 1.0s bend produces 0 risk score and zero active incidents', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0, briefBendGraceMs: 1500 });
  const startedEvents = [];
  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));

  // Process forward bending at t=0 and t=1000ms (< 1500ms grace period)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  const res = engine.processFrame({ timestamp: 1000, frameId: 2, workers: [forwardBendingWorker] });

  const w = res.workers[0];
  assert.strictEqual(w.riskScore, 0, 'Brief bend within grace period must award 0 points');
  assert.strictEqual(w.severity, 'LOW');
  assert.strictEqual(res.activeIncidents.length, 0);
  assert.strictEqual(startedEvents.length, 0);
});

test('19. Deadband hysteresis: angle fluctuating near 45° preserves active stoop duration', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });

  // Start bend at t=0, reach 2000ms
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  let res = engine.processFrame({ timestamp: 2000, frameId: 2, workers: [forwardBendingWorker] });
  assert.ok(res.workers[0].findings.some(f => f.type === 'UnsafePosture'));

  // Frame with angle dipping slightly to 43° (within 3° deadband of 45°)
  const fluctuatingWorker = {
    ...forwardBendingWorker,
    landmarks: forwardBendingWorker.landmarks.map((lm, i) => {
      if (i === 11 || i === 12) return { ...lm, x: 235 }; // angle ~43°
      return lm;
    }),
  };

  res = engine.processFrame({ timestamp: 2500, frameId: 3, workers: [fluctuatingWorker] });
  assert.ok(res.workers[0].findings.some(f => f.type === 'UnsafePosture'), 'Deadband prevents premature reset');
});

test('20. Recovery after hazardous posture: standing upright clears violation and resets score to 0', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });
  const resolvedEvents = [];
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  // Hazardous posture sustained 2.0s
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [forwardBendingWorker] });
  let res = engine.processFrame({ timestamp: 2000, frameId: 2, workers: [forwardBendingWorker] });
  assert.strictEqual(res.workers[0].riskScore, 40.0);
  assert.strictEqual(res.activeIncidents.length, 1);

  // Standing back upright at t=4000ms
  res = engine.processFrame({ timestamp: 4000, frameId: 3, workers: [uprightWorker] });
  assert.strictEqual(res.workers[0].riskScore, 0);
  assert.strictEqual(res.workers[0].severity, 'LOW');
  assert.strictEqual(res.activeIncidents.length, 0);
  assert.ok(resolvedEvents.some(e => e.ruleType === 'UnsafePosture'));
});

console.log(`\nAll ${testsRun} fall integration scenarios passed successfully!\n`);
