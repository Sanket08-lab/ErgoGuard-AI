// Provides typed test fixtures adhering to DetectionFramePayload schema for deterministic engine verification.

export const FIXTURES = {
  // Real fixture matching project aithon/examples/standard_detection_output.json
  standard: {
    version: '1.0.0',
    timestamp: '2026-10-19T10:15:30.450Z',
    frame_id: 142,
    camera_id: 'cam_floor_01',
    fps_processing: 29.4,
    workers: [
      {
        track_id: 1,
        bbox: {
          x1: 150,
          y1: 120,
          x2: 290,
          y2: 520,
          confidence: 0.94,
          width: 140,
          height: 400,
          center_x: 220,
          center_y: 320,
        },
        ppe: {
          compliant: false,
          helmet: {
            detected: true,
            confidence: 0.92,
            bounding_box: [190, 120, 250, 180],
          },
          vest: {
            detected: false,
            confidence: 0.15,
            bounding_box: null,
          },
        },
        landmarks: {
          11: { x: 200, y: 220, z: 0, visibility: 0.9 },
          12: { x: 240, y: 220, z: 0, visibility: 0.9 },
          23: { x: 190, y: 340, z: 0, visibility: 0.85 },
          24: { x: 230, y: 340, z: 0, visibility: 0.85 },
          25: { x: 180, y: 440, z: 0, visibility: 0.8 },
          26: { x: 220, y: 440, z: 0, visibility: 0.8 },
          27: { x: 180, y: 510, z: 0, visibility: 0.8 },
          28: { x: 220, y: 510, z: 0, visibility: 0.8 },
        },
      },
      {
        track_id: 2,
        bbox: {
          x1: 420,
          y1: 140,
          x2: 560,
          y2: 540,
          confidence: 0.91,
          width: 140,
          height: 400,
          center_x: 490,
          center_y: 340,
        },
        ppe: {
          compliant: true,
          helmet: {
            detected: true,
            confidence: 0.89,
            bounding_box: [460, 140, 520, 200],
          },
          vest: {
            detected: true,
            confidence: 0.94,
            bounding_box: [430, 210, 550, 380],
          },
        },
        landmarks: null,
      },
    ],
  },

  // Compliant worker with all PPE and upright posture
  compliant: {
    version: '1.0.0',
    timestamp: Date.now(),
    frame_id: 101,
    camera_id: 'cam_floor_01',
    fps_processing: 30.0,
    workers: [
      {
        track_id: 1,
        bbox: { x1: 200, y1: 100, x2: 360, y2: 500, confidence: 0.95 },
        ppe: {
          compliant: true,
          helmet: { detected: true, confidence: 0.95, bounding_box: [240, 100, 320, 170] },
          vest: { detected: true, confidence: 0.92, bounding_box: [220, 180, 340, 360] },
        },
        landmarks: {
          11: { x: 250, y: 190, z: 0, visibility: 0.9 },
          12: { x: 310, y: 190, z: 0, visibility: 0.9 },
          23: { x: 250, y: 320, z: 0, visibility: 0.9 },
          24: { x: 310, y: 320, z: 0, visibility: 0.9 },
          25: { x: 250, y: 420, z: 0, visibility: 0.9 },
          26: { x: 310, y: 420, z: 0, visibility: 0.9 },
          27: { x: 250, y: 490, z: 0, visibility: 0.9 },
          28: { x: 310, y: 490, z: 0, visibility: 0.9 },
        },
      },
    ],
  },

  // Worker missing hardhat with severe trunk stoop and straight knees
  missing_hardhat: {
    version: '1.0.0',
    timestamp: Date.now(),
    frame_id: 202,
    camera_id: 'cam_floor_01',
    fps_processing: 30.0,
    workers: [
      {
        track_id: 3,
        bbox: { x1: 220, y1: 150, x2: 380, y2: 520, confidence: 0.93 },
        ppe: {
          compliant: false,
          helmet: { detected: false, confidence: 0.1, bounding_box: null },
          vest: { detected: true, confidence: 0.88, bounding_box: [230, 240, 370, 420] },
        },
        landmarks: {
          11: { x: 220, y: 290, z: 0, visibility: 0.9 },
          12: { x: 260, y: 290, z: 0, visibility: 0.9 },
          23: { x: 320, y: 350, z: 0, visibility: 0.9 },
          24: { x: 350, y: 350, z: 0, visibility: 0.9 },
          25: { x: 320, y: 440, z: 0, visibility: 0.9 },
          26: { x: 350, y: 440, z: 0, visibility: 0.9 },
          27: { x: 320, y: 510, z: 0, visibility: 0.9 },
          28: { x: 350, y: 510, z: 0, visibility: 0.9 },
        },
      },
    ],
  },

  // Rapid vertical descent triggering UNCERTAIN fall evaluation
  fall_descent: {
    version: '1.0.0',
    timestamp: Date.now(),
    frame_id: 303,
    camera_id: 'cam_floor_01',
    fps_processing: 30.0,
    workers: [
      {
        track_id: 4,
        bbox: { x1: 200, y1: 260, x2: 360, y2: 660, confidence: 0.90 }, // Rapidly descended box
        ppe: {
          helmet: { detected: true, confidence: 0.85, bounding_box: [240, 260, 300, 310] },
          vest: { detected: true, confidence: 0.85, bounding_box: [220, 310, 340, 500] },
        },
        landmarks: null,
      },
    ],
  },

  // Fallen worker horizontally on the floor
  fall_confirmed: {
    version: '1.0.0',
    timestamp: Date.now(),
    frame_id: 305,
    camera_id: 'cam_floor_01',
    fps_processing: 30.0,
    workers: [
      {
        track_id: 4,
        bbox: { x1: 100, y1: 420, x2: 450, y2: 510, confidence: 0.92 }, // Aspect ratio: 90/350 = 0.26 (width >> height)
        ppe: null, // Fallen worker on floor - PPE evaluation skipped due to height < 120px
        landmarks: null, // Pose evaluation skipped while fallen
      },
    ],
  },

  // Worker fatigue due to excessive head droop and slouch dwell
  fatigue: {
    version: '1.0.0',
    timestamp: Date.now(),
    frame_id: 404,
    camera_id: 'cam_floor_01',
    fps_processing: 30.0,
    workers: [
      {
        track_id: 5,
        bbox: { x1: 200, y1: 120, x2: 340, y2: 480, confidence: 0.92 },
        ppe: {
          helmet: { detected: true, confidence: 0.88, bounding_box: [230, 130, 300, 190] },
          vest: { detected: true, confidence: 0.90, bounding_box: [210, 200, 330, 360] },
        },
        landmarks: {
          7: { x: 300, y: 150, z: 0, visibility: 0.90 }, // Left ear forward of shoulders
          8: { x: 320, y: 150, z: 0, visibility: 0.90 }, // Right ear forward of shoulders
          11: { x: 250, y: 190, z: 0, visibility: 0.95 }, // Left shoulder slouched (> 28° trunk angle)
          12: { x: 300, y: 190, z: 0, visibility: 0.95 }, // Right shoulder slouched
          23: { x: 190, y: 330, z: 0, visibility: 0.95 }, // Left hip
          24: { x: 240, y: 330, z: 0, visibility: 0.95 }, // Right hip
        },
      },
    ],
  },
};
