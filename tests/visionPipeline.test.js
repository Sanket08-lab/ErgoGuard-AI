import assert from 'node:assert/strict';
import { VisionPipeline } from '../frontend-demo/visionPipeline.js';
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

console.log('Running visionPipeline.test.js test suite...\n');

test('calculatePersonBoundingBox: correctly envelopes landmarks with anatomical padding', () => {
  const pipeline = new VisionPipeline();
  const width = 640;
  const height = 480;

  // Normalized landmarks for worker centered between x=[0.3, 0.5] and y=[0.2, 0.8]
  const mockLandmarks = [
    { x: 0.35, y: 0.20, z: 0, visibility: 0.95 }, // Head
    { x: 0.30, y: 0.30, z: 0, visibility: 0.90 }, // Left shoulder
    { x: 0.50, y: 0.30, z: 0, visibility: 0.90 }, // Right shoulder
    { x: 0.35, y: 0.55, z: 0, visibility: 0.85 }, // Left hip
    { x: 0.45, y: 0.55, z: 0, visibility: 0.85 }, // Right hip
    { x: 0.35, y: 0.80, z: 0, visibility: 0.80 }, // Ankle
  ];

  const bbox = pipeline.calculatePersonBoundingBox(mockLandmarks, width, height);
  assert.ok(bbox, 'Bounding box must be computed');
  assert.ok(bbox.width > 0, 'Bounding box width must be positive');
  assert.ok(bbox.height > 0, 'Bounding box height must be positive');
  assert.ok(bbox.height >= 120, 'Worker pixel height must meet minPersonHeightPx threshold');
  assert.ok(bbox.confidence > 0.8, 'Average landmark visibility must be reflected');
});

test('calculatePersonBoundingBox: returns null when insufficient visible landmarks exist', () => {
  const pipeline = new VisionPipeline();
  const mockLowVisibilityLandmarks = [
    { x: 0.35, y: 0.20, z: 0, visibility: 0.1 },
    { x: 0.30, y: 0.30, z: 0, visibility: 0.15 },
  ];

  const bbox = pipeline.calculatePersonBoundingBox(mockLowVisibilityLandmarks, 640, 480);
  assert.equal(bbox, null, 'Must reject low visibility landmarks');
});

test('truthful PPE unavailable state: flags UNCERTAIN without false compliance or false violation', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });

  // Worker payload generated when PPE model is unavailable
  const framePayload = {
    frame_id: 1,
    timestamp: Date.now(),
    camera_id: 'local_webcam',
    workers: [
      {
        track_id: 1,
        bbox: { x1: 150, y1: 100, x2: 300, y2: 450, confidence: 0.95 },
        ppe: {
          helmet: { detected: true, confidence: 0.2, bounding_box: null },
          vest: { detected: true, confidence: 0.2, bounding_box: null },
        },
        landmarks: {
          11: { x: 190, y: 150, z: 0, visibility: 0.9 },
          12: { x: 250, y: 150, z: 0, visibility: 0.9 },
          23: { x: 195, y: 280, z: 0, visibility: 0.9 },
          24: { x: 245, y: 280, z: 0, visibility: 0.9 },
        },
      },
    ],
  };

  const result = engine.processFrame(framePayload);
  assert.ok(result, 'Engine must evaluate frame');

  const worker = result.workers[0];
  const ppeFindings = worker.findings.filter((f) => f.type?.includes('Hardhat') || f.type?.includes('Vest'));

  // Assert both PPE findings are UNCERTAIN
  assert.equal(ppeFindings.length, 2, 'Must produce findings for both hardhat and vest');
  assert.ok(ppeFindings.every((f) => f.status === 'UNCERTAIN'), 'Unavailable PPE must be UNCERTAIN');
  assert.ok(ppeFindings.every((f) => f.points === 0), 'Uncertain findings must carry zero penalty points');
  assert.equal(result.overallRisk.score, 0, 'Uncertain PPE must not generate false risk score');
  assert.equal(result.overallRisk.severity, 'LOW', 'Worker must remain LOW severity when upright with uncertain PPE');
});

test('vision pipeline frame with unsafe stoop: flags posture violation from landmark geometry', () => {
  const engine = new RiskEngine({ onsetDebounceMs: 0 });

  // Worker bending forward > 60° with straight knees
  const framePayload = {
    frame_id: 2,
    timestamp: Date.now(),
    camera_id: 'local_webcam',
    workers: [
      {
        track_id: 1,
        bbox: { x1: 200, y1: 100, x2: 350, y2: 450, confidence: 0.9 },
        ppe: {
          helmet: { detected: true, confidence: 0.2, bounding_box: null },
          vest: { detected: true, confidence: 0.2, bounding_box: null },
        },
        landmarks: {
          11: { x: 280, y: 190, z: 0, visibility: 0.9 }, // Shoulders forward (dx=60, dy=60 relative to hips = 45°)
          12: { x: 280, y: 190, z: 0, visibility: 0.9 },
          23: { x: 220, y: 250, z: 0, visibility: 0.9 }, // Hips
          24: { x: 220, y: 250, z: 0, visibility: 0.9 },
          25: { x: 220, y: 350, z: 0, visibility: 0.9 }, // Straight knees (180°)
          26: { x: 220, y: 350, z: 0, visibility: 0.9 },
          27: { x: 220, y: 440, z: 0, visibility: 0.9 }, // Straight ankles
          28: { x: 220, y: 440, z: 0, visibility: 0.9 },
        },
      },
    ],
  };

  const result = engine.processFrame(framePayload);
  const worker = result.workers[0];
  const unsafeFinding = worker.findings.find((f) => f.type === 'UnsafePosture');

  assert.ok(unsafeFinding, 'Bent trunk with straight knees must flag UnsafePosture violation');
  assert.equal(unsafeFinding.status, 'VIOLATION');
  assert.equal(unsafeFinding.points, 40);
  assert.equal(result.overallRisk.score, 40);
  assert.equal(result.overallRisk.severity, 'MEDIUM');
});

console.log(`\nAll ${testsRun} vision pipeline tests passed successfully!\n`);
