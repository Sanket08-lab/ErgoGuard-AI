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

// Upright person fixture: H=400, W=150
const uprightPerson = { x1: 100, y1: 100, x2: 250, y2: 500, confidence: 0.95 };

// Horizontal fallen person fixture: H=100, W=300 (aspect ratio = 0.33)
const fallenPerson = { x1: 100, y1: 400, x2: 400, y2: 500, confidence: 0.92 };

test('NORMAL: upright standing worker produces clean status and zero fall findings', () => {
  const res = fallRule(uprightPerson);
  assert.strictEqual(res.status, 'COMPLIANT');
  assert.strictEqual(res.fallState, 'NORMAL');
  assert.strictEqual(res.isFallen, false);
  assert.strictEqual(res.emergencyAlert, false);
  assert.ok(res.aspectRatio > 2.0);
  assert.strictEqual(res.findings.length, 0);
});

test('RAPID_DESCENT: rapid vertical drop flags UNCERTAIN pending floor confirmation', () => {
  // Step 1: Worker at yCenter = 200 (height 400)
  const p1 = { x1: 100, y1: 0, x2: 250, y2: 400 };
  const s1 = fallRule(p1, null, {}, { timestamp: 0 });

  // Step 2: 100ms later, worker vertical center drops by 60px (60/400 = 0.15 normalized height > 0.08)
  const p2 = { x1: 100, y1: 60, x2: 250, y2: 460 };
  const s2 = fallRule(p2, null, s1.updatedTrackState, { timestamp: 100 });

  assert.strictEqual(s2.fallState, 'RAPID_DESCENT');
  assert.strictEqual(s2.status, 'UNCERTAIN');
  assert.strictEqual(s2.isFallen, false);
  assert.strictEqual(s2.findings[0].points, 0);
});

test('FALLEN: horizontal worker confirms fall violation after 333ms floor persistence', () => {
  let trackState = {};

  // t = 0: First horizontal observation (aspect ratio 0.33 < 0.85) -> pending confirmation (< 333ms)
  const step1 = fallRule(fallenPerson, null, trackState, { timestamp: 0 });
  assert.strictEqual(step1.isFallen, false);
  assert.strictEqual(step1.findings.length, 0);
  trackState = step1.updatedTrackState;

  // t = 200ms: Still pending confirmation
  const step2 = fallRule(fallenPerson, null, trackState, { timestamp: 200 });
  assert.strictEqual(step2.isFallen, false);
  trackState = step2.updatedTrackState;

  // t = 350ms (>= 333ms confirmation threshold): Confirmed FALLEN
  const step3 = fallRule(fallenPerson, null, trackState, { timestamp: 350 });
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
  const res = fallRule(fallenPerson, null, trackState, { timestamp: 5200 });

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

  // Worker stands back up at t=3000ms (aspect ratio = 2.67 > 0.85)
  const res = fallRule(uprightPerson, null, fallenState, { timestamp: 3000 });

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
