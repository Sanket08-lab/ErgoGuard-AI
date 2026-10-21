// Normalizes incoming frame payloads to the exact DetectionFramePayload schema expected by the RiskEngine.
export function adaptDetectionFrame(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const frameId = raw.frame_id ?? raw.frameId ?? 0;
  let timestamp = Date.now();
  if (typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)) {
    timestamp = raw.timestamp;
  } else if (typeof raw.timestamp === 'string') {
    const parsed = Date.parse(raw.timestamp);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }

  const rawWorkers = raw.workers ?? [];
  const workers = rawWorkers.map((w, idx) => {
    if (!w) return null;
    const trackId = w.track_id ?? w.trackId ?? (idx + 1);
    const bbox = w.bbox ?? w;

    // Prevents missing PPE evidence from being penalized as a confirmed violation.
    let ppe = w.ppe ?? w.items ?? null;
    if (ppe === null || ppe === undefined) {
      ppe = {
        helmet: { detected: true, confidence: 0.2, bounding_box: null },
        vest: { detected: true, confidence: 0.2, bounding_box: null },
      };
    }

    // Preserves null when pose is unavailable so postureRule returns SKIPPED with zero points.
    const landmarks = w.landmarks ?? w.pose_landmarks ?? w.pose ?? null;

    return {
      track_id: trackId,
      bbox,
      ppe,
      landmarks,
    };
  }).filter(Boolean);

  return {
    frame_id: frameId,
    timestamp,
    camera_id: raw.camera_id ?? raw.cameraId ?? 'cam_demo',
    workers,
    items: raw.items ?? raw.ppe_items ?? [],
  };
}

// Prepares scenario frame sequences to satisfy temporal engine requirements for falls and fatigue.
export function prepareScenarioFrames(scenarioKey, baseFixture, currentTimestamp, frameCounter) {
  const adapted = adaptDetectionFrame(baseFixture);
  adapted.timestamp = currentTimestamp;
  adapted.frame_id = frameCounter;

  // Static single-frame evaluation scenarios
  if (scenarioKey === 'standard' || scenarioKey === 'compliant' || scenarioKey === 'missing_hardhat') {
    return [adapted];
  }

  // Rapid descent requires a preceding vertical position within 600ms to calculate descent velocity.
  if (scenarioKey === 'fall_descent') {
    const preFrame = JSON.parse(JSON.stringify(adapted));
    preFrame.frame_id = frameCounter - 1;
    preFrame.timestamp = currentTimestamp - 100;
    if (preFrame.workers[0]?.bbox) {
      // Prior position: upright worker centered at y=300
      preFrame.workers[0].bbox = { x1: 200, y1: 100, x2: 360, y2: 500, confidence: 0.90 };
    }
    return [preFrame, adapted];
  }

  // Confirmed fall requires persisting horizontal on the floor for at least 333ms.
  if (scenarioKey === 'fall_confirmed') {
    const preFrame = JSON.parse(JSON.stringify(adapted));
    preFrame.frame_id = frameCounter - 1;
    preFrame.timestamp = currentTimestamp - 400; // 400ms prior floor contact
    return [preFrame, adapted];
  }

  // Worker fatigue requires accumulating head droop dwell over at least 3.0 seconds.
  if (scenarioKey === 'fatigue') {
    const preFrame = JSON.parse(JSON.stringify(adapted));
    preFrame.frame_id = frameCounter - 1;
    preFrame.timestamp = currentTimestamp - 3200; // 3.2s prior droop observation
    return [preFrame, adapted];
  }

  return [adapted];
}
