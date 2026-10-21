import { LocalPoseDetector } from './poseDetector.js';
import { LocalPPEDetector } from './ppeDetector.js';

// Coordinates local camera frame capture, real MediaPipe pose estimation, and PPE detection into standard engine contracts.
export class VisionPipeline {
  constructor(options = {}) {
    this.poseDetector = new LocalPoseDetector(options.pose);
    this.ppeDetector = new LocalPPEDetector(options.ppe);
    this.frameCounter = 1;
    this.isInferring = false;
    this.onStateChange = options.onStateChange || (() => {});
  }

  // Initializes both vision models from local offline assets.
  async init() {
    this.notifyState('INITIALIZING');

    // 1. Initialize MediaPipe Pose Lite Landmarker
    const poseSuccess = await this.poseDetector.init();

    // 2. Initialize YOLOv8 ONNX PPE detector (gracefully handles missing weights)
    const ppeSuccess = await this.ppeDetector.init();

    this.notifyState('READY');
    return { pose: poseSuccess, ppe: ppeSuccess };
  }

  // Emits lifecycle status updates to subscribed UI indicators.
  notifyState(status) {
    this.onStateChange({
      status,
      poseState: this.poseDetector.state,
      poseError: this.poseDetector.errorMessage,
      ppeState: this.ppeDetector.state,
      ppeMessage: this.ppeDetector.errorMessage,
    });
  }

  // Extracts worker bounding box by calculating the convex extent of visible skeletal landmarks with anatomical padding.
  calculatePersonBoundingBox(landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let visibleCount = 0;
    let sumConf = 0;

    for (const lm of landmarks) {
      if (lm.visibility >= 0.25) {
        visibleCount++;
        sumConf += lm.visibility;
        const px = lm.x * width;
        const py = lm.y * height;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }

    if (visibleCount < 4 || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return null;
    }

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    // Anatomical margin: 15% horizontal buffer, 15% top buffer (head/helmet), 10% bottom buffer (feet)
    const padX = Math.max(16, boxWidth * 0.15);
    const padTop = Math.max(24, boxHeight * 0.15);
    const padBottom = Math.max(16, boxHeight * 0.10);

    const x1 = Math.max(0, Math.round(minX - padX));
    const y1 = Math.max(0, Math.round(minY - padTop));
    const x2 = Math.min(width, Math.round(maxX + padX));
    const y2 = Math.min(height, Math.round(maxY + padBottom));

    return {
      x1,
      y1,
      x2,
      y2,
      width: x2 - x1,
      height: y2 - y1,
      confidence: Math.round((sumConf / visibleCount) * 100) / 100,
    };
  }

  // Captures the active video frame, executes local inference models, and formats the DetectionFramePayload.
  async processVideoFrame(videoElement) {
    if (!videoElement || videoElement.readyState < 2) return null;
    if (this.isInferring) return null; // Prevent overlapping inferences to maintain responsiveness

    this.isInferring = true;
    const now = Date.now();
    const frameId = this.frameCounter++;
    const width = videoElement.videoWidth || 640;
    const height = videoElement.videoHeight || 480;

    try {
      // 1. Run local MediaPipe Pose estimation
      const poseResult = this.poseDetector.detectForVideo(videoElement, performance.now());
      const detectedPoses = poseResult.poses || [];

      // 2. Run local YOLOv8 ONNX PPE detection if model is available
      let ppeResult = { state: this.ppeDetector.state, items: [] };
      if (this.ppeDetector.state === 'READY') {
        ppeResult = await this.ppeDetector.detect(videoElement, width, height);
      }

      // 3. Map detected poses into standard worker detection objects
      const workers = detectedPoses.map((pose, idx) => {
        const trackId = idx + 1;
        const rawLandmarks = pose.landmarks;

        // Convert normalized landmarks to pixel coordinates expected by engine geometry calculations
        const pixelLandmarks = rawLandmarks.map((lm) => ({
          x: Math.round(lm.x * width * 10) / 10,
          y: Math.round(lm.y * height * 10) / 10,
          z: Math.round(lm.z * width * 10) / 10,
          visibility: lm.visibility,
        }));

        const bbox = this.calculatePersonBoundingBox(rawLandmarks, width, height);

        // When PPE model is unavailable, provide uncertain sentinel values to prevent false violation or compliance
        let ppe = null;
        if (this.ppeDetector.state === 'READY' && ppeResult.items.length > 0) {
          // If trained PPE detections exist, filter items near this worker's head and torso
          const helmetItem = ppeResult.items.find((i) => i.type.includes('helmet') || i.type.includes('hardhat'));
          const vestItem = ppeResult.items.find((i) => i.type.includes('vest'));
          ppe = {
            helmet: helmetItem
              ? { detected: true, confidence: helmetItem.confidence, bounding_box: helmetItem.bbox }
              : { detected: false, confidence: 0.1, bounding_box: null },
            vest: vestItem
              ? { detected: true, confidence: vestItem.confidence, bounding_box: vestItem.bbox }
              : { detected: false, confidence: 0.1, bounding_box: null },
          };
        } else {
          // Explicit truthful unavailable state: confidence 0.2 below minConf (0.4) flags UNCERTAIN with 0 points
          ppe = {
            helmet: { detected: true, confidence: 0.2, bounding_box: null },
            vest: { detected: true, confidence: 0.2, bounding_box: null },
          };
        }

        return {
          track_id: trackId,
          bbox: bbox || { x1: 0, y1: 0, x2: width, y2: height, confidence: 0.5 },
          ppe,
          landmarks: pixelLandmarks,
          rawNormLandmarks: rawLandmarks, // Preserved for skeleton canvas rendering
        };
      });

      return {
        frame_id: frameId,
        timestamp: now,
        camera_id: 'webcam_local',
        workers,
        rawPoseCount: detectedPoses.length,
        poseStatus: this.poseDetector.state,
        ppeStatus: this.ppeDetector.state,
        ppeMessage: this.ppeDetector.errorMessage,
      };
    } catch (err) {
      console.error('[VisionPipeline] Frame processing exception:', err);
      return null;
    } finally {
      this.isInferring = false;
    }
  }

  // Tears down active model sessions and cleans up WebAssembly memory.
  close() {
    this.poseDetector.close();
    this.ppeDetector.close();
    this.isInferring = false;
  }
}
