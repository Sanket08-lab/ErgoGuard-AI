import assert from 'node:assert/strict';
import { calculateRiskScore } from '../engine/riskScorer.js';

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

console.log('Running riskScorer.test.js test suite...\n');

test('empty input: returns score 0 and empty breakdown', () => {
  const result = calculateRiskScore([]);
  assert.strictEqual(result.score, 0);
  assert.deepStrictEqual(result.findingsBreakdown, []);

  const nullResult = calculateRiskScore(null);
  assert.strictEqual(nullResult.score, 0);
  assert.deepStrictEqual(nullResult.findingsBreakdown, []);
});

test('single violation: assigns base score accurately', () => {
  const findings = [
    { type: 'MissingHardhat', status: 'VIOLATION', points: 55, confidence: 0.95 },
  ];
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 55);
  assert.strictEqual(result.findingsBreakdown.length, 1);
  assert.strictEqual(result.findingsBreakdown[0].contributed, true);
  assert.strictEqual(result.findingsBreakdown[0].effectivePoints, 55);
});

test('probabilistic aggregation: combines multiple concurrent violations', () => {
  // Hardhat (55) + Vest (35) -> 1 - (1 - 0.55)*(1 - 0.35) = 1 - 0.45*0.65 = 1 - 0.2925 = 70.75 -> 70.8
  const findings = [
    { type: 'MissingHardhat', status: 'VIOLATION', points: 55 },
    { type: 'MissingVest', status: 'VIOLATION', points: 35 },
  ];
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 70.8);
  assert.strictEqual(result.findingsBreakdown.length, 2);
});

test('severe multi-violation: combines Fall (90), Hardhat (55), Vest (35)', () => {
  // 1 - 0.10 * 0.45 * 0.65 = 1 - 0.02925 = 97.075 -> 97.1
  const findings = [
    { type: 'FallEvent', status: 'VIOLATION', points: 90 },
    { type: 'MissingHardhat', status: 'VIOLATION', points: 55 },
    { type: 'MissingVest', status: 'VIOLATION', points: 35 },
  ];
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 97.1);
});

test('non-violations generate zero risk score', () => {
  const findings = [
    { type: 'UncertainHardhat', status: 'UNCERTAIN', points: 0, confidence: 0.32 },
    { type: 'SkippedWorker', status: 'SKIPPED', points: 0 },
    { type: 'CompliantGear', status: 'COMPLIANT', points: 0 },
  ];
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.findingsBreakdown.length, 3);
  assert.strictEqual(result.findingsBreakdown.every((f) => !f.contributed), true);
});

test('mixed findings: only VIOLATION status contributes points', () => {
  const findings = [
    { type: 'MissingHardhat', status: 'VIOLATION', points: 55 },
    { type: 'UncertainVest', status: 'UNCERTAIN', points: 35 },
  ];
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 55);
  assert.strictEqual(result.findingsBreakdown[0].contributed, true);
  assert.strictEqual(result.findingsBreakdown[1].contributed, false);
});

test('sum method: aggregates points using bounded sum', () => {
  const findings = [
    { type: 'MissingHardhat', status: 'VIOLATION', points: 55 },
    { type: 'MissingVest', status: 'VIOLATION', points: 35 },
  ];
  const result = calculateRiskScore(findings, { method: 'sum' });
  assert.strictEqual(result.score, 90);
});

test('config fallback: resolves base points from CONFIG when finding.points is omitted', () => {
  const findings = [
    { type: 'MissingVest', status: 'VIOLATION' }, // configured base 35
    { type: 'Fatigue', status: 'VIOLATION' },     // configured base 45
  ];
  // 1 - 0.65 * 0.55 = 1 - 0.3575 = 64.25 -> 64.3
  const result = calculateRiskScore(findings);
  assert.strictEqual(result.score, 64.3);
  assert.strictEqual(result.findingsBreakdown[0].basePoints, 35);
  assert.strictEqual(result.findingsBreakdown[1].basePoints, 45);
});

console.log(`\nAll ${testsRun} riskScorer tests passed successfully!\n`);
