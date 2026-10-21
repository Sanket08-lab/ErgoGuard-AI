import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

console.log('Running riskEngine.test.js test suite...\n');

// 1. Replay test with real fixture: project aithon/examples/standard_detection_output.json
test('replay test: processes standard_detection_output.json and flags worker violations', () => {
  const fixturePath = path.resolve(import.meta.dirname, '../project aithon/examples/standard_detection_output.json');
  assert.ok(fs.existsSync(fixturePath), 'Fixture standard_detection_output.json must exist');
  const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const engine = new RiskEngine({ onsetDebounceMs: 0 }); // zero debounce to activate immediately
  const startedEvents = [];
  const riskUpdatedEvents = [];

  engine.addEventListener('violation:started', (e) => startedEvents.push(e.detail));
  engine.addEventListener('risk:updated', (e) => riskUpdatedEvents.push(e.detail));

  const result = engine.processFrame(fixtureData);

  // Validate frame processing
  assert.strictEqual(result.frameId, 142);
  assert.strictEqual(result.workers.length, 2);

  // Worker 1: Missing vest in fixture
  const w1 = result.workers.find((w) => w.trackId === 1);
  assert.ok(w1 !== undefined);
  assert.ok(w1.findings.some((f) => f.type === 'MissingVest' && f.status === 'VIOLATION'));
  assert.strictEqual(w1.riskScore >= 35, true);
  assert.strictEqual(w1.severity, 'MEDIUM');

  // Worker 2: Fully compliant PPE in fixture
  const w2 = result.workers.find((w) => w.trackId === 2);
  assert.ok(w2 !== undefined);
  const w2PpeViolations = w2.findings.filter((f) => (f.type === 'MissingHardhat' || f.type === 'MissingVest') && f.status === 'VIOLATION');
  assert.strictEqual(w2PpeViolations.length, 0);

  // Validate event dispatching
  assert.ok(startedEvents.some((e) => e.workerId === 1 && e.ruleType === 'MissingVest'));
  assert.strictEqual(riskUpdatedEvents.length, 1);
  assert.strictEqual(riskUpdatedEvents[0].frameId, 142);
});

// 2. Throttling test: verifies risk:updated dispatches at max 5 Hz (>= 200ms interval)
test('throttling: limits risk:updated events to max 5 Hz', () => {
  const engine = new RiskEngine({ riskUpdateIntervalMs: 200, onsetDebounceMs: 0 });
  const riskEvents = [];
  engine.addEventListener('risk:updated', (e) => riskEvents.push(e.detail));

  const baseWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: false, confidence: 0.1 } },
  };

  // Frame 1 @ t=0ms: First event should fire
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 1);

  // Frame 2 @ t=50ms (< 200ms interval): suppressed
  engine.processFrame({ timestamp: 50, frameId: 2, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 1);

  // Frame 3 @ t=150ms (< 200ms interval): suppressed
  engine.processFrame({ timestamp: 150, frameId: 3, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 1);

  // Frame 4 @ t=200ms (>= 200ms interval): fires 2nd event
  engine.processFrame({ timestamp: 200, frameId: 4, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 2);
  assert.strictEqual(riskEvents[1].frameId, 4);

  // Frame 5 @ t=250ms (< 200ms interval): suppressed
  engine.processFrame({ timestamp: 250, frameId: 5, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 2);

  // Frame 6 @ t=410ms (>= 200ms interval): fires 3rd event
  engine.processFrame({ timestamp: 410, frameId: 6, workers: [baseWorker] });
  assert.strictEqual(riskEvents.length, 3);
  assert.strictEqual(riskEvents[2].frameId, 6);
});

// 3. Multi-rule aggregation and probabilistic score test
test('aggregation: per-person risk score uses probabilistic formula 100*(1-prod(1-s/100))', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });

  // Worker missing both Hardhat (55) and Vest (35)
  // Expected: 100 * (1 - (1 - 0.55)*(1 - 0.35)) = 70.8 -> HIGH severity
  const multiViolationWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: {
      helmet: { detected: false, confidence: 0.1 },
      vest: { detected: false, confidence: 0.1 },
    },
  };

  const res = engine.processFrame({ timestamp: 0, frameId: 10, workers: [multiViolationWorker] });
  const w1 = res.workers[0];

  assert.strictEqual(w1.riskScore, 70.8);
  assert.strictEqual(w1.severity, 'HIGH');
  assert.strictEqual(res.overallRisk.score, 70.8);
  assert.strictEqual(res.overallRisk.severity, 'HIGH');
});

// 4. Temporal progression: onset debounce -> active alert -> resolution
test('lifecycle events: starts on debounce expiry and resolves on compliance', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 167 });
  const events = [];

  engine.addEventListener('violation:started', (e) => events.push({ type: 'STARTED', ...e.detail }));
  engine.addEventListener('violation:resolved', (e) => events.push({ type: 'RESOLVED', ...e.detail }));

  const missingVestWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: false, confidence: 0.1 } },
  };
  const compliantWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: { helmet: { detected: true, confidence: 0.9 }, vest: { detected: true, confidence: 0.9 } },
  };

  // t=0ms: First observation -> Debouncing (no event)
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [missingVestWorker] });
  assert.strictEqual(events.length, 0);

  // t=100ms: Still debouncing
  engine.processFrame({ timestamp: 100, frameId: 2, workers: [missingVestWorker] });
  assert.strictEqual(events.length, 0);

  // t=180ms: Debounce met -> violation:started event fired!
  engine.processFrame({ timestamp: 180, frameId: 3, workers: [missingVestWorker] });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'STARTED');
  assert.strictEqual(events[0].ruleType, 'MissingVest');

  // t=300ms: Worker complies -> violation:resolved event fired!
  engine.processFrame({ timestamp: 300, frameId: 4, workers: [compliantWorker] });
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[1].type, 'RESOLVED');
  assert.strictEqual(events[1].ruleType, 'MissingVest');
});

// 5. Clean reset
test('reset: clears internal history and cached states', () => {
  const engine = new RiskEngine();
  const worker = {
    track_id: 5,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: { helmet: { detected: false, confidence: 0.1 } },
  };

  engine.processFrame({ timestamp: 0, frameId: 1, workers: [worker] });
  assert.strictEqual(engine.workerPreviousSeverity.size, 1);

  engine.reset();
  assert.strictEqual(engine.workerPreviousSeverity.size, 0);
  assert.strictEqual(engine.workerPostureHistory.size, 0);
  assert.strictEqual(engine.workerFallHistory.size, 0);
});

// 6. Regression: Uncertain PPE detection enters grace period and does NOT immediately resolve active incident
test('regression: UncertainHardhat enters grace period and does not falsely resolve active incident', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 50, gracePeriodMs: 400 });
  const resolvedEvents = [];
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  // t=0ms: First observation -> missing hardhat
  const missingHardhatWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: { helmet: { detected: false, confidence: 0.1 }, vest: { detected: true, confidence: 0.9 } },
  };
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [missingHardhatWorker] });

  // t=60ms: Debounce met -> active violation
  engine.processFrame({ timestamp: 60, frameId: 2, workers: [missingHardhatWorker] });
  assert.strictEqual(engine.tracker.records.get('1:MissingHardhat')?.state, 'ACTIVE');

  // t=120ms: Next frame has UNCERTAIN hardhat (low confidence 0.35 < 0.40)
  const uncertainHardhatWorker = {
    track_id: 1,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    ppe: [
      { type: 'hardhat', bbox: [140, 110, 200, 180], confidence: 0.35 },
      { type: 'vest', bbox: [120, 200, 230, 400], confidence: 0.90 },
    ],
  };
  const step3 = engine.processFrame({ timestamp: 120, frameId: 3, workers: [uncertainHardhatWorker] });

  // The uncertain detection must NOT immediately resolve the incident
  assert.strictEqual(resolvedEvents.length, 0, 'Uncertain hardhat must not prematurely resolve active incident');
  assert.ok(engine.tracker.records.get('1:MissingHardhat')?.state !== 'INACTIVE', 'Incident must remain active within grace period');

  // t=600ms (> 400ms grace period elapsed since last confirmed violation at t=60ms)
  engine.processFrame({ timestamp: 600, frameId: 4, workers: [uncertainHardhatWorker] });
  assert.strictEqual(resolvedEvents.length, 1, 'Incident resolves only after grace period expires');
  assert.strictEqual(resolvedEvents[0].ruleType, 'MissingHardhat');
});

// 7. Regression: Skipped evaluation (SkippedPose) does not become COMPLIANT
test('regression: SkippedPose does not become COMPLIANT and preserves grace period', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 50, gracePeriodMs: 400 });
  const resolvedEvents = [];
  engine.addEventListener('violation:resolved', (e) => resolvedEvents.push(e.detail));

  // Worker with active UnsafePosture violation
  const bentLandmarks = [
    { x: 175, y: 100, visibility: 0.95 },
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 300, y: 150, visibility: 0.95 }, // 11: left shoulder bent forward
    { x: 350, y: 150, visibility: 0.95 }, // 12: right shoulder
    ...Array(10).fill({ x: 0, y: 0, visibility: 0.1 }),
    { x: 160, y: 300, visibility: 0.95 }, // 23: left hip
    { x: 190, y: 300, visibility: 0.95 }, // 24: right hip
    { x: 160, y: 400, visibility: 0.90 }, // 25: left knee
    { x: 190, y: 400, visibility: 0.90 }, // 26: right knee
    { x: 160, y: 490, visibility: 0.90 }, // 27: left ankle
    { x: 190, y: 490, visibility: 0.90 }, // 28: right ankle
  ];

  const bentWorker = {
    track_id: 2,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    landmarks: bentLandmarks,
  };

  // t=0ms & t=60ms: Confirm UnsafePosture violation
  engine.processFrame({ timestamp: 0, frameId: 1, workers: [bentWorker] });
  engine.processFrame({ timestamp: 60, frameId: 2, workers: [bentWorker] });
  assert.strictEqual(engine.tracker.records.get('2:UnsafePosture')?.state, 'ACTIVE');

  // t=150ms: Camera drops pose landmarks entirely -> SkippedPose
  const occludedWorker = {
    track_id: 2,
    bbox: { x1: 100, y1: 100, x2: 250, y2: 500 },
    landmarks: null, // missing landmarks
  };

  engine.processFrame({ timestamp: 150, frameId: 3, workers: [occludedWorker] });
  assert.strictEqual(resolvedEvents.length, 0, 'Skipped pose must not trigger immediate resolution as COMPLIANT');
  assert.ok(engine.tracker.records.get('2:UnsafePosture')?.state !== 'INACTIVE');
});

console.log(`\nAll ${testsRun} riskEngine tests passed successfully!\n`);
