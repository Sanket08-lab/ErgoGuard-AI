import assert from 'node:assert/strict';
import {
  SEVERITY_LEVELS,
  getRawSeverity,
  classifySeverity,
  compareSeverity,
  isSeverityHigher,
  isSeverityEqualOrHigher,
} from '../engine/severity.js';

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

console.log('Running severity.test.js test suite...\n');

// 1. Raw classification cutoffs
test('raw classification: maps 0-24 to LOW', () => {
  assert.strictEqual(getRawSeverity(0), SEVERITY_LEVELS.LOW);
  assert.strictEqual(getRawSeverity(10), SEVERITY_LEVELS.LOW);
  assert.strictEqual(getRawSeverity(24.9), SEVERITY_LEVELS.LOW);
});

test('raw classification: maps 25-49 to MEDIUM', () => {
  assert.strictEqual(getRawSeverity(25), SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(getRawSeverity(49.9), SEVERITY_LEVELS.MEDIUM);
});

test('raw classification: maps 50-74 to HIGH', () => {
  assert.strictEqual(getRawSeverity(50), SEVERITY_LEVELS.HIGH);
  assert.strictEqual(getRawSeverity(74.9), SEVERITY_LEVELS.HIGH);
});

test('raw classification: maps 75-100 to CRITICAL', () => {
  assert.strictEqual(getRawSeverity(75), SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(getRawSeverity(100), SEVERITY_LEVELS.CRITICAL);
});

test('raw classification: clamps negative and >100', () => {
  assert.strictEqual(getRawSeverity(-10), SEVERITY_LEVELS.LOW);
  assert.strictEqual(getRawSeverity(150), SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(getRawSeverity(NaN), SEVERITY_LEVELS.LOW);
  assert.strictEqual(getRawSeverity(null), SEVERITY_LEVELS.LOW);
});

// 2. Upgrades happen immediately
test('upgrades: transition immediately when crossing boundary', () => {
  const step1 = classifySeverity(25, SEVERITY_LEVELS.LOW);
  assert.strictEqual(step1.severity, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(step1.transitioned, true);

  const step2 = classifySeverity(50, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(step2.severity, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(step2.transitioned, true);

  const step3 = classifySeverity(75, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(step3.severity, SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(step3.transitioned, true);
});

// 3. Hysteresis on downgrades (margin = 5)
test('hysteresis: CRITICAL holds until score drops below 70', () => {
  // Score drops to 72 (below 75 but above 75 - 5 = 70)
  const held = classifySeverity(72, SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(held.severity, SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(held.rawSeverity, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(held.transitioned, false);

  // Score drops to 69 (below 70)
  const dropped = classifySeverity(69, SEVERITY_LEVELS.CRITICAL);
  assert.strictEqual(dropped.severity, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(dropped.transitioned, true);
});

test('hysteresis: HIGH holds until score drops below 45', () => {
  // Score drops to 48 (above 45)
  const held = classifySeverity(48, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(held.severity, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(held.transitioned, false);

  // Score drops to 44 (below 45)
  const dropped = classifySeverity(44, SEVERITY_LEVELS.HIGH);
  assert.strictEqual(dropped.severity, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(dropped.transitioned, true);
});

test('hysteresis: MEDIUM holds until score drops below 20', () => {
  // Score drops to 22 (above 20)
  const held = classifySeverity(22, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(held.severity, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(held.transitioned, false);

  // Score drops to 18 (below 20)
  const dropped = classifySeverity(18, SEVERITY_LEVELS.MEDIUM);
  assert.strictEqual(dropped.severity, SEVERITY_LEVELS.LOW);
  assert.strictEqual(dropped.transitioned, true);
});

test('hysteresis: custom margin supported', () => {
  // Margin = 2: drop below 50 - 2 = 48
  const held = classifySeverity(48.5, SEVERITY_LEVELS.HIGH, { hysteresisMargin: 2 });
  assert.strictEqual(held.severity, SEVERITY_LEVELS.HIGH);

  const dropped = classifySeverity(47.5, SEVERITY_LEVELS.HIGH, { hysteresisMargin: 2 });
  assert.strictEqual(dropped.severity, SEVERITY_LEVELS.MEDIUM);
});

// 4. Comparison helpers
test('comparisons: compareSeverity correctly orders tiers', () => {
  assert.ok(compareSeverity(SEVERITY_LEVELS.CRITICAL, SEVERITY_LEVELS.HIGH) > 0);
  assert.ok(compareSeverity(SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.MEDIUM) > 0);
  assert.ok(compareSeverity(SEVERITY_LEVELS.MEDIUM, SEVERITY_LEVELS.LOW) > 0);
  assert.strictEqual(compareSeverity(SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.HIGH), 0);
  assert.ok(compareSeverity(SEVERITY_LEVELS.LOW, SEVERITY_LEVELS.CRITICAL) < 0);

  assert.strictEqual(isSeverityHigher(SEVERITY_LEVELS.CRITICAL, SEVERITY_LEVELS.HIGH), true);
  assert.strictEqual(isSeverityHigher(SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.HIGH), false);
  assert.strictEqual(isSeverityEqualOrHigher(SEVERITY_LEVELS.HIGH, SEVERITY_LEVELS.HIGH), true);
});

console.log(`\nAll ${testsRun} severity tests passed successfully!\n`);
