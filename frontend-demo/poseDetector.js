import { FilesetResolver, PoseLandmarker } from './vendor/tasks-vision/vision_bundle.mjs';

// Encapsulates browser-local MediaPipe Pose Landmarker Lite inference with zero cloud communication.
export class LocalPoseDetector {
  constructor(options = {}) {
    // Configures local asset paths relative to frontend-demo
    this.wasmPath = options.wasmPath ?? './vendor/tasks-vision/wasm';
    this.modelPath = options.modelPath ?? './models/pose_landmarker_lite.task';
    this.numPoses = options.numPoses ?? options.maxPoses ?? 4;
    this.runningMode = options.runningMode ?? 'VIDEO';
    // Calibrated to 0.25 to prevent dropping secondary or angled persons in multi-person webcam feeds
    this.minPoseDetectionConfidence = options.minPoseDetectionConfidence ?? 0.25;
    this.minPosePresenceConfidence = options.minPosePresenceConfidence ?? 0.25;
    this.minTrackingConfidence = options.minTrackingConfidence ?? 0.25;
    this.state = 'UNINITIALIZED'; // 'UNINITIALIZED' | 'LOADING' | 'READY' | 'ERROR'
    this.errorMessage = null;
    this.landmarker = null;
    this.lastInferenceTimeMs = 0;
  }

  // Initializes local MediaPipe vision WebAssembly runtime and loads the Pose Lite task model.
  async init() {
    if (this.state === 'READY' && this.landmarker) return true;
    this.state = 'LOADING';
    this.errorMessage = null;

    try {
      // Resolve WebAssembly binaries from local repository directory without CDN dependency
      const vision = await FilesetResolver.forVisionTasks(this.wasmPath);

      // Attempt initialization with GPU delegate first, fallback to CPU if WebGL is unavailable
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: this.modelPath,
            delegate: 'GPU',
          },
          runningMode: this.runningMode,
          numPoses: this.numPoses,
          minPoseDetectionConfidence: this.minPoseDetectionConfidence,
          minPosePresenceConfidence: this.minPosePresenceConfidence,
          minTrackingConfidence: this.minTrackingConfidence,
        });
      } catch (gpuErr) {
        console.warn('[PoseDetector] GPU delegate failed, falling back to CPU delegate:', gpuErr);
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: this.modelPath,
            delegate: 'CPU',
          },
          runningMode: this.runningMode,
          numPoses: this.numPoses,
          minPoseDetectionConfidence: this.minPoseDetectionConfidence,
          minPosePresenceConfidence: this.minPosePresenceConfidence,
          minTrackingConfidence: this.minTrackingConfidence,
        });
      }

      this.state = 'READY';
      return true;
    } catch (err) {
      this.state = 'ERROR';
      this.errorMessage = err.message || 'Failed to load MediaPipe Pose model';
      console.error('[PoseDetector] Model initialization error:', err);
      return false;
    }
  }

  // Executes synchronous pose estimation on the current HTMLVideoElement frame.
  detectForVideo(videoElement, timestampMs) {
    if (this.state !== 'READY' || !this.landmarker) {
      return { poses: [], timestampMs, state: this.state, error: this.errorMessage };
    }

    if (!videoElement || videoElement.readyState < 2) {
      return { poses: [], timestampMs, state: this.state };
    }

    // MediaPipe VIDEO mode requires monotonically increasing timestamps
    const now = Math.max(timestampMs || performance.now(), this.lastInferenceTimeMs + 1);
    this.lastInferenceTimeMs = now;

    try {
      const results = this.runningMode === 'IMAGE'
        ? this.landmarker.detect(videoElement)
        : this.landmarker.detectForVideo(videoElement, now);
      const rawLandmarksList = results?.landmarks ?? [];

      // Multi-person diagnostic telemetry per task 5
      const vw = videoElement.videoWidth || 0;
      const vh = videoElement.videoHeight || 0;
      const poseDetails = rawLandmarksList.map((lms, idx) => {
        const nose = lms[0];
        const avgVis = lms.reduce((acc, p) => acc + (p.visibility ?? 1.0), 0) / lms.length;
        const noseStr = nose ? `nose=[${Math.round(nose.x * vw)},${Math.round(nose.y * vh)},vis=${(nose.visibility ?? 1.0).toFixed(2)}]` : 'nose=N/A';
        return `Pose#${idx + 1}(${noseStr}, avgVis=${avgVis.toFixed(2)})`;
      }).join('; ');

      console.log(`[PoseDetector] Frame @${Math.round(now)}ms: dims=${vw}x${vh}, model=${this.modelPath}, runningMode=${this.runningMode}, conf=[det=${this.minPoseDetectionConfidence},pres=${this.minPosePresenceConfidence},track=${this.minTrackingConfidence}], numPoses=${this.numPoses}, poses returned=${rawLandmarksList.length}${rawLandmarksList.length > 0 ? ` -> ${poseDetails}` : ''}`);

      // Maps detected poses into standardized landmark arrays
      const poses = rawLandmarksList.map((landmarks, poseIdx) => {
        return {
          poseIndex: poseIdx,
          landmarks: landmarks.map((pt) => ({
            x: pt.x,
            y: pt.y,
            z: pt.z ?? 0,
            visibility: typeof pt.visibility === 'number' ? pt.visibility : 1.0,
          })),
        };
      });

      return {
        poses,
        timestampMs: now,
        state: 'READY',
      };
    } catch (err) {
      console.error('[PoseDetector] Frame inference error:', err);
      return { poses: [], timestampMs: now, state: 'ERROR', error: err.message };
    }
  }

  // Releases WebAssembly memory and terminates active vision task runners.
  close() {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (e) {
        // Suppress cleanup exceptions during shutdown
      }
      this.landmarker = null;
    }
    this.state = 'UNINITIALIZED';
  }
}
