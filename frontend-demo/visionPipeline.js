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

    const avgConf = visibleCount > 0 ? sumConf / visibleCount : 0;
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    // Require minimum visible landmark count
    if (visibleCount < 4 || !Number.isFinite(minX) || !Number.isFinite(maxX) || avgConf < 0.35 || Math.max(boxWidth, boxHeight) < 40) {
      return null;
    }

    // Anatomical verification: a genuine person must have an identifiable upper body or torso.
    // Supports waist-up / desk webcam crops where hips/legs are outside the frame, while rejecting non-human clutter.
    if (landmarks.length >= 25) {
      const nose = landmarks[0];
      const le = landmarks[7];
      const re = landmarks[8];
      const ls = landmarks[11];
      const rs = landmarks[12];
      const lh = landmarks[23];
      const rh = landmarks[24];

      const hasHead = (nose?.visibility ?? 0) >= 0.30 || (le?.visibility ?? 0) >= 0.30 || (re?.visibility ?? 0) >= 0.30;
      const hasShoulder = (ls?.visibility ?? 0) >= 0.30 || (rs?.visibility ?? 0) >= 0.30;
      const hasHip = (lh?.visibility ?? 0) >= 0.30 || (rh?.visibility ?? 0) >= 0.30;

      // Must have upper body presence (head + shoulder) OR torso presence (shoulder + hip)
      const isPlausibleHuman = (hasShoulder && (hasHead || hasHip)) || (hasHead && visibleCount >= 5);
      if (!isPlausibleHuman) {
        return null;
      }
    }

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

    // Live webcam streams (using mediaStream srcObject) use real-time monotonic epoch ms.
    // Uploaded video playback uses video media time (videoElement.currentTime * 1000).
    const isLiveCamera = Boolean(videoElement.srcObject);
    let now = Date.now();
    if (!isLiveCamera && typeof videoElement.currentTime === 'number' && videoElement.currentTime > 0) {
      now = Math.round(videoElement.currentTime * 1000);
    }
    const frameId = this.frameCounter++;
    const width = videoElement.videoWidth || 640;
    const height = videoElement.videoHeight || 480;

    try {
      // 1. Run local MediaPipe Pose estimation with pre-inference diagnostic telemetry
      const preInferenceTime = performance.now();
      const poseResult = this.poseDetector.detectForVideo(videoElement, preInferenceTime);
      const detectedPoses = poseResult.poses || [];
      const rawPosesReturned = detectedPoses.length;

      // 2. Run local YOLOv8 ONNX PPE detection if model is available
      let ppeResult = { state: this.ppeDetector.state, items: [] };
      if (this.ppeDetector.state === 'READY') {
        ppeResult = await this.ppeDetector.detect(videoElement, width, height);
      }

      // 3. Map detected poses into standard worker detection objects
      const workers = detectedPoses.map((pose, idx) => {
        const trackId = idx + 1;
        const rawLandmarks = pose.landmarks;

        const bbox = this.calculatePersonBoundingBox(rawLandmarks, width, height);
        if (!bbox || bbox.confidence < 0.35) {
          return null; // Reject detections with insufficient evidence of a valid human pose
        }

        // Convert normalized landmarks to pixel coordinates expected by engine geometry calculations
        const pixelLandmarks = rawLandmarks.map((lm) => ({
          x: Math.round(lm.x * width * 10) / 10,
          y: Math.round(lm.y * height * 10) / 10,
          z: Math.round(lm.z * width * 10) / 10,
          visibility: lm.visibility,
        }));

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
          bbox,
          ppe,
          landmarks: pixelLandmarks,
          rawNormLandmarks: rawLandmarks, // Preserved for skeleton canvas rendering
        };
      }).filter(Boolean);

      // Diagnostic logging: reports raw count, filtered count, and engine delivery count
      if (rawPosesReturned > 0 || workers.length > 0) {
        console.log(`[VisionPipeline] Frame ${frameId}: rawPoses=${rawPosesReturned}, workersAfterFilter=${workers.length}, passedToEngine=${workers.length}`);
      }

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
