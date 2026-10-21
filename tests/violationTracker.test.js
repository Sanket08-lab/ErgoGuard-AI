import assert from 'node:assert/strict';
import { ViolationTracker } from '../engine/violationTracker.js';

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

console.log('Running violationTracker.test.js test suite...\n');

test('onset debounce: suppresses alerts until debounce duration elapses', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 167 });

  // Frame 1: First violation seen at t=0
  const step1 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 0, { severity: 'HIGH' });
  assert.strictEqual(step1.state, 'DEBOUNCING');
  assert.strictEqual(step1.shouldAlert, false);

  // Frame 2: Seen at t=100ms (< 167ms debounce)
  const step2 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 100, { severity: 'HIGH' });
  assert.strictEqual(step2.state, 'DEBOUNCING');
  assert.strictEqual(step2.shouldAlert, false);

  // Frame 3: Seen at t=170ms (>= 167ms) -> activates and alerts
  const step3 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 170, { severity: 'HIGH' });
  assert.strictEqual(step3.state, 'ACTIVE');
  assert.strictEqual(step3.action, 'STARTED');
  assert.strictEqual(step3.shouldAlert, true);
  assert.ok(step3.incident !== null);
  assert.strictEqual(step3.incident.workerId, 1);
  assert.strictEqual(step3.incident.ruleType, 'MissingHardhat');
});

test('debounce cancellation: compliance resets pending debounce', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 167 });

  tracker.update(1, 'MissingHardhat', 'VIOLATION', 0);
  const step2 = tracker.update(1, 'MissingHardhat', 'COMPLIANT', 50);
  assert.strictEqual(step2.state, 'INACTIVE');
  assert.strictEqual(step2.shouldAlert, false);

  // Re-violating restarts debounce clock from t=100
  const step3 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 100);
  assert.strictEqual(step3.state, 'DEBOUNCING');

  const step4 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 200); // 100ms elapsed (< 167ms)
  assert.strictEqual(step4.state, 'DEBOUNCING');
});

test('cooldown: prevents duplicate alerts during cooldown window', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 100, cooldownMs: 5000 });

  // Activate at t=100ms
  tracker.update(1, 'MissingVest', 'VIOLATION', 0);
  const activated = tracker.update(1, 'MissingVest', 'VIOLATION', 100, { severity: 'HIGH' });
  assert.strictEqual(activated.shouldAlert, true);

  // t=200ms: Still violating, but in cooldown
  const cool1 = tracker.update(1, 'MissingVest', 'VIOLATION', 200, { severity: 'HIGH' });
  assert.strictEqual(cool1.state, 'COOLDOWN');
  assert.strictEqual(cool1.shouldAlert, false);

  // t=4000ms (< 5000ms cooldown)
  const cool2 = tracker.update(1, 'MissingVest', 'VIOLATION', 4000, { severity: 'HIGH' });
  assert.strictEqual(cool2.state, 'COOLDOWN');
  assert.strictEqual(cool2.shouldAlert, false);

  // t=5200ms (>= 5000ms cooldown): re-triggers alert
  const reAlert = tracker.update(1, 'MissingVest', 'VIOLATION', 5200, { severity: 'HIGH' });
  assert.strictEqual(reAlert.state, 'ACTIVE');
  assert.strictEqual(reAlert.action, 'STARTED');
  assert.strictEqual(reAlert.shouldAlert, true);
});

test('escalation: higher severity alerts immediately regardless of cooldown', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50, cooldownMs: 10000 });

  // Activate at HIGH
  tracker.update(2, 'FallEvent', 'VIOLATION', 0, { severity: 'HIGH' });
  const step1 = tracker.update(2, 'FallEvent', 'VIOLATION', 60, { severity: 'HIGH' });
  assert.strictEqual(step1.shouldAlert, true);
  assert.strictEqual(step1.action, 'STARTED');

  // Next frame: severity increases to CRITICAL (Man-Down) -> ESCALATED immediately
  const escalated = tracker.update(2, 'FallEvent', 'VIOLATION', 100, { severity: 'CRITICAL' });
  assert.strictEqual(escalated.state, 'ACTIVE');
  assert.strictEqual(escalated.action, 'ESCALATED');
  assert.strictEqual(escalated.shouldAlert, true);
  assert.strictEqual(escalated.incident.severity, 'CRITICAL');
});

test('grace period: buffers temporary loss of detection before closing incident', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50, gracePeriodMs: 400 });

  // Activate incident
  tracker.update(1, 'MissingHardhat', 'VIOLATION', 0);
  tracker.update(1, 'MissingHardhat', 'VIOLATION', 60);

  // Camera occlusion at t=100ms -> UNCERTAIN
  const occluded1 = tracker.update(1, 'MissingHardhat', 'UNCERTAIN', 100);
  assert.strictEqual(occluded1.action, 'NONE'); // holds incident open

  // Camera occlusion at t=350ms (290ms since last violation, < 400ms grace)
  const occluded2 = tracker.update(1, 'MissingHardhat', 'SKIPPED', 350);
  assert.strictEqual(occluded2.action, 'NONE');

  // t=500ms (440ms since last violation, > 400ms grace) -> resolves incident
  const resolved = tracker.update(1, 'MissingHardhat', 'SKIPPED', 500);
  assert.strictEqual(resolved.state, 'RESOLVED');
  assert.strictEqual(resolved.action, 'RESOLVED');
  assert.strictEqual(resolved.shouldAlert, false);
});

test('immediate resolution: COMPLIANT status closes incident instantly', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50, gracePeriodMs: 1000 });

  tracker.update(1, 'MissingVest', 'VIOLATION', 0);
  tracker.update(1, 'MissingVest', 'VIOLATION', 60);

  // Worker puts on vest at t=100ms
  const step = tracker.update(1, 'MissingVest', 'COMPLIANT', 100);
  assert.strictEqual(step.state, 'RESOLVED');
  assert.strictEqual(step.action, 'RESOLVED');
  assert.ok(step.incident !== null);
  assert.strictEqual(step.incident.durationMs, 40);
});

test('isolation: tracks different workers and rules independently', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50 });

  tracker.update(1, 'MissingHardhat', 'VIOLATION', 0);
  tracker.update(2, 'MissingHardhat', 'VIOLATION', 0);
  tracker.update(1, 'MissingVest', 'VIOLATION', 0);

  const w1h = tracker.update(1, 'MissingHardhat', 'VIOLATION', 60);
  const w2h = tracker.update(2, 'MissingHardhat', 'COMPLIANT', 60);
  const w1v = tracker.update(1, 'MissingVest', 'VIOLATION', 60);

  assert.strictEqual(w1h.state, 'ACTIVE');
  assert.strictEqual(w2h.state, 'INACTIVE');
  assert.strictEqual(w1v.state, 'ACTIVE');

  const active = tracker.getActiveIncidents();
  assert.strictEqual(active.length, 2);
});

test('regression: out-of-order timestamp does not produce negative elapsed time or cancel debounce', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 100 });

  // Frame at t=100ms: violation starts debouncing
  const step1 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 100);
  assert.strictEqual(step1.state, 'DEBOUNCING');

  // Out-of-order frame from t=40ms arrives with COMPLIANT: must NOT cancel debounce!
  const stepOutOrder = tracker.update(1, 'MissingHardhat', 'COMPLIANT', 40);
  assert.strictEqual(stepOutOrder.state, 'DEBOUNCING');
  assert.strictEqual(stepOutOrder.action, 'NONE');

  // Out-of-order frame from t=60ms arrives with VIOLATION: must NOT produce negative elapsed time
  const stepOutOrder2 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 60);
  assert.strictEqual(stepOutOrder2.state, 'DEBOUNCING');
  assert.strictEqual(stepOutOrder2.action, 'NONE');

  // In-order frame at t=210ms (110ms >= 100ms debounce since t=100ms): cleanly activates!
  const step3 = tracker.update(1, 'MissingHardhat', 'VIOLATION', 210);
  assert.strictEqual(step3.state, 'ACTIVE');
  assert.strictEqual(step3.action, 'STARTED');
  assert.strictEqual(step3.shouldAlert, true);
});

test('regression: out-of-order timestamp does not prematurely resolve active incident', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50, gracePeriodMs: 400 });

  // Activate incident at t=60ms
  tracker.update(1, 'MissingVest', 'VIOLATION', 0);
  const stepActive = tracker.update(1, 'MissingVest', 'VIOLATION', 60);
  assert.strictEqual(stepActive.state, 'ACTIVE');

  // Out-of-order frame from t=30ms with COMPLIANT arrives
  const stepOutOrder = tracker.update(1, 'MissingVest', 'COMPLIANT', 30);
  assert.strictEqual(stepOutOrder.state, 'ACTIVE');
  assert.strictEqual(stepOutOrder.action, 'NONE');

  // Out-of-order frame from t=20ms with UNCERTAIN arrives
  const stepOutOrder2 = tracker.update(1, 'MissingVest', 'UNCERTAIN', 20);
  assert.strictEqual(stepOutOrder2.state, 'ACTIVE');
  assert.strictEqual(stepOutOrder2.action, 'NONE');

  // Active incidents list still contains the incident with correct duration
  const active = tracker.getActiveIncidents();
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].ruleType, 'MissingVest');

  // Legitimate in-order compliance at t=100ms resolves the incident
  const stepResolved = tracker.update(1, 'MissingVest', 'COMPLIANT', 100);
  assert.strictEqual(stepResolved.state, 'RESOLVED');
  assert.strictEqual(stepResolved.action, 'RESOLVED');
});

test('regression: handles missing, invalid, non-finite, and string timestamps safely', () => {
  const tracker = new ViolationTracker({ onsetDebounceMs: 50 });

  // Valid ISO string timestamp
  const isoTime = '2026-10-21T12:00:00.000Z';
  const isoMs = Date.parse(isoTime);
  const stepIso = tracker.update(1, 'MissingHardhat', 'VIOLATION', isoTime);
  assert.strictEqual(stepIso.state, 'DEBOUNCING');

  // Null timestamp: falls back to last known timestamp safely without jumping or throwing
  const stepNull = tracker.update(1, 'MissingHardhat', 'VIOLATION', null);
  assert.strictEqual(stepNull.state, 'DEBOUNCING');

  // Undefined timestamp: falls back safely
  const stepUndefined = tracker.update(1, 'MissingHardhat', 'VIOLATION', undefined);
  assert.strictEqual(stepUndefined.state, 'DEBOUNCING');

  // NaN & Infinity timestamps: handled safely without throwing or producing NaN durations
  const stepNaN = tracker.update(1, 'MissingHardhat', 'VIOLATION', NaN);
  assert.strictEqual(stepNaN.state, 'DEBOUNCING');

  const stepInf = tracker.update(1, 'MissingHardhat', 'VIOLATION', Infinity);
  assert.strictEqual(stepInf.state, 'DEBOUNCING');

  // Negative timestamp: rejected safely
  const stepNeg = tracker.update(1, 'MissingHardhat', 'VIOLATION', -500);
  assert.strictEqual(stepNeg.state, 'DEBOUNCING');

  // In-order timestamp advancing beyond debounce activates cleanly
  const stepActive = tracker.update(1, 'MissingHardhat', 'VIOLATION', isoMs + 60);
  assert.strictEqual(stepActive.state, 'ACTIVE');
  assert.strictEqual(stepActive.action, 'STARTED');
  assert.ok(Number.isFinite(stepActive.incident.startedAtMs));
  assert.ok(stepActive.incident.durationMs >= 0);
});

console.log(`\nAll ${testsRun} violationTracker tests passed successfully!\n`);
