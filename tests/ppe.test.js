import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ppeRule } from '../engine/rules/ppe.js';
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

// Graceful loader for real integration files
function loadJsonIfExists(relativePath) {
  const fullPath = path.resolve(import.meta.dirname, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

console.log('Running ppe.test.js test suite...\n');

// Standard person fixture: height = 400px (100 to 500), width = 200px (100 to 300)
// Head region (0 to 0.28): [100, 100, 300, 212]
// Torso region (0.20 to 0.65): [100, 180, 300, 360]
const standardPerson = {
  bbox: { x1: 100, y1: 100, x2: 300, y2: 500, confidence: 0.95 },
};

// -------------------------------------------------------------
// 1. Fully compliant worker (COMPLIANT -> returns empty array [])
// -------------------------------------------------------------
test('COMPLIANT: returns zero findings when qualifying helmet and vest are present', () => {
  const items = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.92 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 0, 'Compliant worker should produce empty results array');
});

// -------------------------------------------------------------
// 2. Confirmed VIOLATION: Missing helmet
// -------------------------------------------------------------
test('VIOLATION: flags MissingHardhat violation when only vest is present', () => {
  const items = [
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'VIOLATION');
  assert.strictEqual(results[0].type, 'MissingHardhat');
  assert.strictEqual(results[0].confidence, 0.95);
  assert.strictEqual(results[0].points, CONFIG.violations.MissingHardhat.base);
  assert.strictEqual(results[0].evidence.itemType, 'hardhat');
  assert.strictEqual(results[0].evidence.bestCandidate, null);
  assert.ok(results[0].evidence.reason.toLowerCase().includes('no hardhat candidate detected'));
});

// -------------------------------------------------------------
// 3. Confirmed VIOLATION: Missing vest
// -------------------------------------------------------------
test('VIOLATION: flags MissingVest violation when only helmet is present', () => {
  const items = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.92 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'VIOLATION');
  assert.strictEqual(results[0].type, 'MissingVest');
  assert.strictEqual(results[0].confidence, 0.95);
  assert.strictEqual(results[0].points, CONFIG.violations.MissingVest.base);
  assert.strictEqual(results[0].evidence.itemType, 'vest');
  assert.strictEqual(results[0].evidence.bestCandidate, null);
  assert.ok(results[0].evidence.reason.toLowerCase().includes('no vest candidate detected'));
});

// -------------------------------------------------------------
// 4. Confirmed VIOLATION: Both items missing
// -------------------------------------------------------------
test('VIOLATION: flags both MissingHardhat and MissingVest when items list is empty', () => {
  const results = ppeRule(standardPerson, []);
  assert.strictEqual(results.length, 2);
  const types = results.map((r) => r.type);
  assert.ok(types.includes('MissingHardhat'));
  assert.ok(types.includes('MissingVest'));
  for (const r of results) {
    assert.strictEqual(r.status, 'VIOLATION');
    assert.ok(r.points > 0, 'Violation must carry base penalty points');
  }
});

// -------------------------------------------------------------
// 5. Confirmed VIOLATION: Insufficient overlap (disjoint / wrong position)
// -------------------------------------------------------------
test('VIOLATION: flags MissingHardhat when hardhat is outside head region (e.g. at waist)', () => {
  // Hardhat placed down at waist level [140, 280, 240, 340] -> zero overlap with head region [100, 100, 300, 212]
  const items = [
    { type: 'hardhat', bbox: [140, 280, 240, 340], confidence: 0.90 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'VIOLATION');
  assert.strictEqual(results[0].type, 'MissingHardhat');
  assert.strictEqual(results[0].evidence.bestCandidate.ioa, 0);
  assert.strictEqual(results[0].points, CONFIG.violations.MissingHardhat.base);
});

// -------------------------------------------------------------
// 6. UNCERTAIN: Candidate exists with low confidence (below minConf)
// -------------------------------------------------------------
test('UNCERTAIN: flags UncertainHardhat without penalty points when hardhat confidence is low (0.35 < 0.40)', () => {
  const items = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.35 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'UNCERTAIN');
  assert.strictEqual(results[0].type, 'UncertainHardhat');
  assert.strictEqual(results[0].points, 0, 'UNCERTAIN findings must carry 0 penalty points');
  assert.ok(results[0].evidence.reason.includes('below threshold'));
});

test('UNCERTAIN: flags UncertainVest without penalty points when vest confidence is low (0.25 < 0.40)', () => {
  const items = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.92 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.25 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'UNCERTAIN');
  assert.strictEqual(results[0].type, 'UncertainVest');
  assert.strictEqual(results[0].points, 0, 'UNCERTAIN findings must carry 0 penalty points');
});

// -------------------------------------------------------------
// 7. Independence: Helmet and vest evaluations do not affect each other
// -------------------------------------------------------------
test('independent evaluation: simultaneous confirmed violation and uncertain finding', () => {
  // Helmet missing (VIOLATION) + Vest candidate has low confidence (UNCERTAIN)
  const items = [
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.25 },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 2);

  const helmet = results.find((r) => r.type === 'MissingHardhat');
  const vest = results.find((r) => r.type === 'UncertainVest');

  assert.ok(helmet, 'Missing hardhat should be flagged');
  assert.strictEqual(helmet.status, 'VIOLATION');
  assert.strictEqual(helmet.points, CONFIG.violations.MissingHardhat.base);

  assert.ok(vest, 'Uncertain vest should be flagged');
  assert.strictEqual(vest.status, 'UNCERTAIN');
  assert.strictEqual(vest.points, 0);
});

// -------------------------------------------------------------
// 8. SKIPPED: Worker height below minPersonHeightPx (120px)
// -------------------------------------------------------------
test('SKIPPED: returns SKIPPED finding when person height is below 120px threshold', () => {
  const shortPerson = { bbox: { x1: 100, y1: 100, x2: 200, y2: 200 } }; // height = 100 < 120
  const results = ppeRule(shortPerson, []);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'SKIPPED');
  assert.strictEqual(results[0].type, 'SkippedWorker');
  assert.strictEqual(results[0].points, 0, 'SKIPPED result must have 0 penalty points');
});

test('SKIPPED boundary: height 119px is SKIPPED, height 120px is evaluated', () => {
  const person119 = [0, 0, 100, 119];
  const person120 = [0, 0, 100, 120];

  const res119 = ppeRule(person119, []);
  assert.strictEqual(res119[0].status, 'SKIPPED');

  const res120 = ppeRule(person120, []);
  assert.strictEqual(res120.length, 2, 'Height 120px must be evaluated');
  assert.strictEqual(res120[0].status, 'VIOLATION');
});

// -------------------------------------------------------------
// 9. INVALID: Malformed or missing inputs cannot be mistaken for compliant
// -------------------------------------------------------------
test('INVALID: returns INVALID finding when person is null or undefined', () => {
  const resNull = ppeRule(null, []);
  assert.strictEqual(resNull.length, 1);
  assert.strictEqual(resNull[0].status, 'INVALID');
  assert.strictEqual(resNull[0].points, 0);

  const resUndef = ppeRule(undefined, []);
  assert.strictEqual(resUndef.length, 1);
  assert.strictEqual(resUndef[0].status, 'INVALID');
});

test('INVALID: returns INVALID finding when person bounding box is null or empty', () => {
  const resNullBox = ppeRule({ bbox: null }, []);
  assert.strictEqual(resNullBox[0].status, 'INVALID');

  const resEmpty = ppeRule({}, []);
  assert.strictEqual(resEmpty[0].status, 'INVALID');
});

test('INVALID: returns INVALID finding when person coordinates are non-finite or NaN', () => {
  const resNaN = ppeRule([0, 0, NaN, 200], []);
  assert.strictEqual(resNaN[0].status, 'INVALID');

  const resInf = ppeRule([0, 0, Infinity, 200], []);
  assert.strictEqual(resInf[0].status, 'INVALID');

  const resStr = ppeRule({ x1: 0, y1: 0, x2: 'invalid', y2: 200 }, []);
  assert.strictEqual(resStr[0].status, 'INVALID');
});

test('INVALID: returns INVALID finding when items parameter is null or undefined', () => {
  const resNullItems = ppeRule(standardPerson, null);
  assert.strictEqual(resNullItems[0].status, 'INVALID');

  const resUndefItems = ppeRule(standardPerson, undefined);
  assert.strictEqual(resUndefItems[0].status, 'INVALID');
});

test('INVALID & UNCERTAIN: handles malformed person confidence', () => {
  // Malformed non-numeric confidence
  const malformedPerson = {
    bbox: { x1: 100, y1: 100, x2: 300, y2: 500, confidence: NaN },
  };
  const resMalformed = ppeRule(malformedPerson, []);
  assert.strictEqual(resMalformed[0].status, 'INVALID');

  // Low person confidence (< minConf.person 0.5) is UNCERTAIN
  const lowConfPerson = {
    bbox: { x1: 100, y1: 100, x2: 300, y2: 500, confidence: 0.3 },
  };
  const resLow = ppeRule(lowConfPerson, []);
  assert.strictEqual(resLow[0].status, 'UNCERTAIN');
  assert.strictEqual(resLow[0].type, 'UncertainPerson');
});

// -------------------------------------------------------------
// 10. Zero-area bounding boxes & Reversed coordinates
// -------------------------------------------------------------
test('zero-area: rejects zero-area person box as INVALID', () => {
  const zeroPerson = [100, 100, 100, 100]; // width = 0, height = 0
  const results = ppeRule(zeroPerson, []);
  assert.strictEqual(results[0].status, 'INVALID');
  assert.ok(results[0].evidence.reason.includes('zero area'));
});

test('zero-area: rejects zero-area candidate PPE box as UNCERTAIN', () => {
  const items = [
    { type: 'hardhat', bbox: [150, 120, 150, 180], confidence: 0.9 }, // width = 0
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];
  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'UNCERTAIN');
  assert.ok(results[0].evidence.reason.includes('zero-area'));
});

test('reversed coordinates: correctly normalizes reversed coordinates for person and PPE items', () => {
  // Reversed person: [300, 500, 100, 100] (x2 < x1, y2 < y1) -> normalized to [100, 100, 300, 500]
  const reversedPerson = [300, 500, 100, 100];
  // Reversed hardhat: [260, 190, 140, 110]
  // Reversed vest: [280, 340, 120, 200]
  const reversedItems = [
    { type: 'hardhat', bbox: [260, 190, 140, 110], confidence: 0.92 },
    { type: 'vest', bbox: [280, 340, 120, 200], confidence: 0.88 },
  ];

  const results = ppeRule(reversedPerson, reversedItems);
  assert.strictEqual(results.length, 0, 'Reversed coordinates must normalize properly and qualify');
});

// -------------------------------------------------------------
// 11. Malformed confidence values on items
// -------------------------------------------------------------
test('malformed confidence: flags UNCERTAIN when PPE item confidence is NaN or string', () => {
  const items = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: NaN },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: '0.88' },
  ];

  const results = ppeRule(standardPerson, items);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].status, 'UNCERTAIN');
  assert.strictEqual(results[1].status, 'UNCERTAIN');
  assert.ok(results[0].evidence.reason.includes('malformed'));
});

// -------------------------------------------------------------
// 12. Pre-validated heuristic detection (Exception for missing bbox)
// -------------------------------------------------------------
test('heuristic detection: allows missing bbox when explicitly detected: true with valid confidence', () => {
  // Upstream heuristic detector pre-classified worker crop as detected: true
  const heuristicItems = [
    { type: 'hardhat', detected: true, confidence: 0.85, bbox: null },
    { type: 'vest', detected: true, confidence: 0.80, bbox: null },
  ];

  const results = ppeRule(standardPerson, heuristicItems);
  assert.strictEqual(results.length, 0, 'Pre-validated heuristic detection must qualify');
});

test('heuristic detection: does not infer compliance when arbitrary item has missing bbox without detected: true', () => {
  const arbitraryMissing = [
    { type: 'hardhat', confidence: 0.85, bbox: null }, // detected: true is absent
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.88 },
  ];

  const results = ppeRule(standardPerson, arbitraryMissing);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, 'UNCERTAIN');
  assert.ok(results[0].evidence.reason.includes('malformed bounding box'));
});

// -------------------------------------------------------------
// 13. Nested PPE summaries (bbox, bounding_box, and worker.ppe)
// -------------------------------------------------------------
test('nested summaries: supports items formatted with bbox and bounding_box in worker.ppe', () => {
  const workerWithPPE = {
    bbox: { x1: 100, y1: 100, x2: 300, y2: 500, confidence: 0.95 },
    ppe: {
      compliant: true,
      helmet: {
        detected: true,
        confidence: 0.92,
        bounding_box: [140, 110, 260, 190],
      },
      vest: {
        detected: true,
        confidence: 0.88,
        bbox: [120, 200, 280, 340], // uses bbox instead of bounding_box
      },
    },
  };

  const results = ppeRule(workerWithPPE, workerWithPPE.ppe);
  assert.strictEqual(results.length, 0, 'Nested PPE with either bbox or bounding_box must qualify');

  // Also support passing the entire worker object as items
  const resultsDirectWorker = ppeRule(workerWithPPE, workerWithPPE);
  assert.strictEqual(resultsDirectWorker.length, 0, 'Passing worker object directly as items must unwrap ppe');
});

// -------------------------------------------------------------
// 14. Exact IoA threshold boundaries (0.50 vs 0.49)
// -------------------------------------------------------------
test('boundary IoA: helmet with exact 0.50 IoA qualifies; 0.49 IoA fails as VIOLATION', () => {
  // Head region: [100, 100, 300, 212]
  // Candidate width = 100 (100 to 200), height = 100 (area = 10000)
  // At y: 162 to 262: intersection with head region is y: 162 to 212 (height = 50)
  // IoA = (100 * 50) / 10000 = 0.500000 exactly!
  const qualifyingHelmet = [
    { type: 'hardhat', bbox: [100, 162, 200, 262], confidence: 0.9 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.9 },
  ];
  assert.strictEqual(ppeRule(standardPerson, qualifyingHelmet).length, 0, 'Exact 0.50 IoA must qualify');

  // Shift helmet 1px down: y: 163 to 263. Intersection height = 49 (area = 4900).
  // IoA = 4900 / 10000 = 0.490000 (< 0.50)
  const failingHelmet = [
    { type: 'hardhat', bbox: [100, 163, 200, 263], confidence: 0.9 },
    { type: 'vest', bbox: [120, 200, 280, 340], confidence: 0.9 },
  ];
  const viols = ppeRule(standardPerson, failingHelmet);
  assert.strictEqual(viols.length, 1);
  assert.strictEqual(viols[0].status, 'VIOLATION');
  assert.strictEqual(viols[0].type, 'MissingHardhat');
  assert.strictEqual(viols[0].evidence.bestCandidate.ioa, 0.49);
});

test('boundary IoA: vest with exact 0.50 IoA qualifies; 0.49 IoA fails as VIOLATION', () => {
  // Torso region: [100, 180, 300, 360]
  // Candidate width = 100 (100 to 200), height = 100 (area = 10000)
  // At y: 130 to 230: intersection with torso region is y: 180 to 230 (height = 50)
  // IoA = (100 * 50) / 10000 = 0.500000 exactly!
  const qualifyingVest = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.9 },
    { type: 'vest', bbox: [100, 130, 200, 230], confidence: 0.9 },
  ];
  assert.strictEqual(ppeRule(standardPerson, qualifyingVest).length, 0, 'Exact 0.50 IoA must qualify');

  // Shift vest 1px up: y: 129 to 229. Intersection height = 49 (area = 4900).
  // IoA = 4900 / 10000 = 0.490000 (< 0.50)
  const failingVest = [
    { type: 'hardhat', bbox: [140, 110, 260, 190], confidence: 0.9 },
    { type: 'vest', bbox: [100, 129, 200, 229], confidence: 0.9 },
  ];
  const viols = ppeRule(standardPerson, failingVest);
  assert.strictEqual(viols.length, 1);
  assert.strictEqual(viols[0].status, 'VIOLATION');
  assert.strictEqual(viols[0].type, 'MissingVest');
  assert.strictEqual(viols[0].evidence.bestCandidate.ioa, 0.49);
});

// -------------------------------------------------------------
// 15. Integration with actual JSON files from project aithon/
// -------------------------------------------------------------
test('integration: evaluates actual standard_detection_output.json from project aithon', () => {
  const stdData = loadJsonIfExists('../project aithon/examples/standard_detection_output.json');
  if (!stdData) {
    console.log('    ⚠ standard_detection_output.json not found, skipping integration test');
    return;
  }

  // Worker 1: Helmet present, Vest detected: false
  const w1 = stdData.workers[0];
  const w1Res = ppeRule(w1, w1.ppe);
  assert.strictEqual(w1Res.length, 1);
  assert.strictEqual(w1Res[0].status, 'VIOLATION');
  assert.strictEqual(w1Res[0].type, 'MissingVest');
  assert.strictEqual(w1Res[0].points, CONFIG.violations.MissingVest.base);

  // Worker 2: Helmet and Vest both detected and compliant
  const w2 = stdData.workers[1];
  const w2Res = ppeRule(w2, w2.ppe);
  assert.strictEqual(w2Res.length, 0, 'Worker 2 in standard output is fully compliant');
});

test('integration: evaluates actual test_output.json from project aithon', () => {
  const testData = loadJsonIfExists('../project aithon/output/test_output.json');
  if (!testData) {
    console.log('    ⚠ test_output.json not found, skipping integration test');
    return;
  }

  // Worker 1: Heuristic detected: true with conf >= 0.8
  const w1 = testData.workers[0];
  const w1Res = ppeRule(w1, w1.ppe);
  assert.strictEqual(w1Res.length, 0, 'Worker 1 with pre-validated heuristic detections must be COMPLIANT');

  // Worker 2: Height = 100px (< 120px threshold)
  const w2 = testData.workers[1];
  const w2Res = ppeRule(w2, w2.ppe);
  assert.strictEqual(w2Res.length, 1);
  assert.strictEqual(w2Res[0].status, 'SKIPPED');
  assert.strictEqual(w2Res[0].type, 'SkippedWorker');
  assert.strictEqual(w2Res[0].points, 0);
});

test('integration: handles empty workers array in detections.json gracefully', () => {
  const detData = loadJsonIfExists('../project aithon/output/detections.json');
  if (!detData) {
    console.log('    ⚠ detections.json not found, skipping test');
    return;
  }

  assert.ok(Array.isArray(detData.workers));
  assert.strictEqual(detData.workers.length, 0);
});

console.log(`\nAll ${testsRun} PPE rule tests passed successfully!`);
