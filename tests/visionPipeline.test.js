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

test('calculatePersonBoundingBox: successfully detects seated/waist-up webcam user with occluded hips', () => {
  const pipeline = new VisionPipeline();
  // Seated webcam view: nose (0), ears (7,8), shoulders (11,12) clearly visible; hips/legs below frame (< 0.20)
  const webcamLandmarks = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  webcamLandmarks[0] = { x: 0.50, y: 0.20, visibility: 0.95 }; // nose
  webcamLandmarks[7] = { x: 0.45, y: 0.22, visibility: 0.90 }; // left ear
  webcamLandmarks[8] = { x: 0.55, y: 0.22, visibility: 0.90 }; // right ear
  webcamLandmarks[11] = { x: 0.40, y: 0.35, visibility: 0.95 }; // left shoulder
  webcamLandmarks[12] = { x: 0.60, y: 0.35, visibility: 0.95 }; // right shoulder
  webcamLandmarks[13] = { x: 0.35, y: 0.50, visibility: 0.85 }; // left elbow
  webcamLandmarks[14] = { x: 0.65, y: 0.50, visibility: 0.85 }; // right elbow
  webcamLandmarks[23] = { x: 0.42, y: 0.90, visibility: 0.10 }; // hip occluded by desk
  webcamLandmarks[24] = { x: 0.58, y: 0.90, visibility: 0.10 }; // hip occluded by desk

  const bbox = pipeline.calculatePersonBoundingBox(webcamLandmarks, 640, 480);
  assert.ok(bbox, 'Live webcam user with occluded hips must be detected');
  assert.ok(bbox.width > 100, 'Bounding box width must span shoulders');
  assert.ok(bbox.height > 100, 'Bounding box height must span head to torso');
  assert.ok(bbox.confidence >= 0.70, 'Confidence must reflect visible upper body');
});

test('calculatePersonBoundingBox: rejects non-human metal frame/wheelbarrow lacking head/torso structure', () => {
  const pipeline = new VisionPipeline();
  // Horizontal metal wheelbarrow frame with scattered spurious keypoints, zero head presence
  const wheelbarrowLandmarks = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.05 }));
  wheelbarrowLandmarks[13] = { x: 0.20, y: 0.80, visibility: 0.40 }; // random points on wheel/tray
  wheelbarrowLandmarks[14] = { x: 0.50, y: 0.82, visibility: 0.40 };
  wheelbarrowLandmarks[15] = { x: 0.70, y: 0.81, visibility: 0.40 };
  wheelbarrowLandmarks[16] = { x: 0.85, y: 0.79, visibility: 0.40 };

  const bbox = pipeline.calculatePersonBoundingBox(wheelbarrowLandmarks, 640, 480);
  assert.strictEqual(bbox, null, 'Non-human equipment lacking upper body/torso must be rejected');
});

test('calculatePersonBoundingBox: returns null on empty frame or zero landmarks', () => {
  const pipeline = new VisionPipeline();
  assert.strictEqual(pipeline.calculatePersonBoundingBox(null, 640, 480), null);
  assert.strictEqual(pipeline.calculatePersonBoundingBox([], 640, 480), null);
});

test('multi-person detection: pose detector defaults numPoses to 4 for concurrent tracking', () => {
  const pipeline = new VisionPipeline();
  assert.equal(pipeline.poseDetector.numPoses, 4, 'Pose detector must default to numPoses=4');

  const customPipeline = new VisionPipeline({ pose: { numPoses: 6 } });
  assert.equal(customPipeline.poseDetector.numPoses, 6, 'Custom numPoses option must be respected');
});

test('multi-person detection: processes 3 simultaneous visible workers into 3 independent skeletons', async () => {
  const pipeline = new VisionPipeline();
  const engine = new RiskEngine({ onsetDebounceMs: 0 });

  // Generate 3 distinct worker pose landmark sets spread across the camera view
  function makeMockWorkerLandmarks(centerX, centerY) {
    const landmarks = Array(33).fill(null).map(() => ({ x: centerX, y: centerY, z: 0, visibility: 0.1 }));
    landmarks[0] = { x: centerX, y: centerY - 0.20, z: 0, visibility: 0.95 }; // nose
    landmarks[7] = { x: centerX - 0.05, y: centerY - 0.18, z: 0, visibility: 0.90 }; // left ear
    landmarks[8] = { x: centerX + 0.05, y: centerY - 0.18, z: 0, visibility: 0.90 }; // right ear
    landmarks[11] = { x: centerX - 0.08, y: centerY - 0.05, z: 0, visibility: 0.92 }; // left shoulder
    landmarks[12] = { x: centerX + 0.08, y: centerY - 0.05, z: 0, visibility: 0.92 }; // right shoulder
    landmarks[23] = { x: centerX - 0.06, y: centerY + 0.15, z: 0, visibility: 0.88 }; // left hip
    landmarks[24] = { x: centerX + 0.06, y: centerY + 0.15, z: 0, visibility: 0.88 }; // right hip
    landmarks[25] = { x: centerX - 0.06, y: centerY + 0.30, z: 0, visibility: 0.85 }; // left knee
    landmarks[26] = { x: centerX + 0.06, y: centerY + 0.30, z: 0, visibility: 0.85 }; // right knee
    landmarks[27] = { x: centerX - 0.06, y: centerY + 0.45, z: 0, visibility: 0.80 }; // left ankle
    landmarks[28] = { x: centerX + 0.06, y: centerY + 0.45, z: 0, visibility: 0.80 }; // right ankle
    return landmarks;
  }

  // 3 people: Left worker (x=0.2), Middle worker (x=0.5), Right worker (x=0.8)
  const worker1Landmarks = makeMockWorkerLandmarks(0.20, 0.45);
  const worker2Landmarks = makeMockWorkerLandmarks(0.50, 0.45);
  const worker3Landmarks = makeMockWorkerLandmarks(0.80, 0.45);

  // Mock pose detector detectForVideo output with 3 simultaneous detected poses
  pipeline.poseDetector.state = 'READY';
  pipeline.poseDetector.detectForVideo = () => ({
    poses: [
      { poseIndex: 0, landmarks: worker1Landmarks },
      { poseIndex: 1, landmarks: worker2Landmarks },
      { poseIndex: 2, landmarks: worker3Landmarks },
    ],
    timestampMs: Date.now(),
    state: 'READY',
  });

  const mockVideo = { readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1.0 };
  const payload = await pipeline.processVideoFrame(mockVideo);

  assert.ok(payload, 'Pipeline must successfully return frame payload');
  assert.equal(payload.rawPoseCount, 3, 'Must report 3 raw poses returned by model');
  assert.equal(payload.workers.length, 3, 'Must retain all 3 workers after filtering');

  // Verify each worker has distinct trackId, valid bbox, pixel landmarks, and rawNormLandmarks for skeleton drawing
  const [w1, w2, w3] = payload.workers;
  assert.equal(w1.track_id, 1);
  assert.equal(w2.track_id, 2);
  assert.equal(w3.track_id, 3);

  assert.ok(w1.bbox.x2 < w2.bbox.x1, 'Worker 1 bbox must be to the left of Worker 2');
  assert.ok(w2.bbox.x2 < w3.bbox.x1, 'Worker 2 bbox must be to the left of Worker 3');

  assert.ok(w1.rawNormLandmarks && w1.rawNormLandmarks.length === 33, 'Worker 1 raw skeleton landmarks preserved');
  assert.ok(w2.rawNormLandmarks && w2.rawNormLandmarks.length === 33, 'Worker 2 raw skeleton landmarks preserved');
  assert.ok(w3.rawNormLandmarks && w3.rawNormLandmarks.length === 33, 'Worker 3 raw skeleton landmarks preserved');

  // Evaluate frame payload in RiskEngine to verify multi-worker safety evaluation
  const engineResult = engine.processFrame(payload);
  assert.ok(engineResult, 'Engine must process 3-worker payload');
  assert.equal(engineResult.workers.length, 3, 'Engine must evaluate exactly 3 workers');
  assert.equal(engineResult.workers[0].trackId, 1);
  assert.equal(engineResult.workers[1].trackId, 2);
  assert.equal(engineResult.workers[2].trackId, 3);
});

test('calculatePersonBoundingBox: retains distant worker with average visibility between 0.35 and 0.49', () => {
  const pipeline = new VisionPipeline();
  // Distant worker with lower visibility (0.42 average)
  const distantWorker = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  distantWorker[0] = { x: 0.50, y: 0.20, visibility: 0.45 }; // nose
  distantWorker[7] = { x: 0.45, y: 0.22, visibility: 0.42 }; // ear
  distantWorker[8] = { x: 0.55, y: 0.22, visibility: 0.42 }; // ear
  distantWorker[11] = { x: 0.42, y: 0.35, visibility: 0.45 }; // shoulder
  distantWorker[12] = { x: 0.58, y: 0.35, visibility: 0.45 }; // shoulder
  distantWorker[23] = { x: 0.44, y: 0.65, visibility: 0.40 }; // hip
  distantWorker[24] = { x: 0.56, y: 0.65, visibility: 0.40 }; // hip

  const bbox = pipeline.calculatePersonBoundingBox(distantWorker, 640, 480);
  assert.ok(bbox, 'Distant worker with average visibility >= 0.35 must have bounding box');
  assert.ok(bbox.confidence >= 0.35 && bbox.confidence < 0.50, 'Confidence is between 0.35 and 0.50');
});

console.log(`\nAll ${testsRun} vision pipeline tests passed successfully!\n`);
