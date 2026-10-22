// Encapsulates browser-local ONNX Runtime Web execution for YOLOv8 PPE detection with graceful fallback.
export class LocalPPEDetector {
  constructor(options = {}) {
    this.modelPath = options.modelPath ?? './models/yolov8n-ppe.onnx';
    this.state = 'UNAVAILABLE'; // 'UNAVAILABLE' | 'LOADING' | 'READY' | 'ERROR'
    this.errorMessage = 'PPE MODEL NOT AVAILABLE (No trained ONNX weights provided)';
    this.session = null;
    // Verified 6 classes from Nexus3/yolov8n-ppe-detection-6classes
    this.classes = options.classes ?? ['gloves', 'vest', 'goggles', 'helmet', 'mask', 'safety_shoe'];
    this.confidenceThreshold = options.confidenceThreshold ?? 0.20;
    this.iouThreshold = options.iouThreshold ?? 0.45;
    this.inputSize = 640;
    this.preprocessCanvas = null;
    this.preprocessCtx = null;
  }

  // Attempts to initialize ONNX Runtime Web session if model weights are available locally.
  async init() {
    this.state = 'LOADING';

    // Verify onnxruntime-web global runtime is available
    if (typeof window !== 'undefined' && window.ort) {
      window.ort.env.wasm.wasmPaths = new URL('./vendor/ort/', window.location.href).href;
    } else {
      this.state = 'UNAVAILABLE';
      this.errorMessage = 'ONNX Runtime Web library is not loaded.';
      console.warn('[PPEDetector] ONNX Runtime Web library is not loaded on window.');
      return false;
    }

    try {
      console.log(`[PPEDetector] Loading YOLO Nexus ONNX model from: ${this.modelPath}`);

      // Test if model file exists before attempting to create inference session
      const headResponse = await fetch(this.modelPath, { method: 'HEAD' });
      if (!headResponse.ok) {
        this.state = 'UNAVAILABLE';
        this.errorMessage = 'PPE MODEL NOT AVAILABLE (yolov8n-ppe.onnx not found)';
        console.warn(`[PPEDetector] Model file not accessible: ${this.modelPath} (HTTP ${headResponse.status})`);
        return false;
      }

      // Initialize ONNX WebAssembly inference session
      this.session = await window.ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      this.state = 'READY';
      this.errorMessage = null;
      console.log(`[PPEDetector] Session initialized successfully. Inputs: [${this.session.inputNames.join(', ')}], Outputs: [${this.session.outputNames.join(', ')}], Classes: [${this.classes.join(', ')}], ConfThreshold: ${this.confidenceThreshold}`);
      return true;
    } catch (err) {
      this.state = 'UNAVAILABLE';
      this.errorMessage = `PPE MODEL NOT AVAILABLE (${err.message || 'Model load failed'})`;
      console.error('[PPEDetector] Initialization error:', err);
      return false;
    }
  }

  // Allows loading custom ONNX model weights directly from a user-selected File or ArrayBuffer.
  async loadModelFromBuffer(arrayBuffer) {
    if (!window.ort) throw new Error('ONNX Runtime Web is not loaded');
    this.state = 'LOADING';
    try {
      this.session = await window.ort.InferenceSession.create(arrayBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      this.state = 'READY';
      this.errorMessage = null;
      return true;
    } catch (err) {
      this.state = 'ERROR';
      this.errorMessage = `Failed to initialize custom ONNX model: ${err.message}`;
      throw err;
    }
  }

  // Resizes input frame to 640x640 and converts pixel data to normalized Float32 CHW tensor format.
  preprocess(imageSource) {
    if (!this.preprocessCanvas) {
      this.preprocessCanvas = document.createElement('canvas');
      this.preprocessCanvas.width = this.inputSize;
      this.preprocessCanvas.height = this.inputSize;
      this.preprocessCtx = this.preprocessCanvas.getContext('2d', { willReadFrequently: true });
    }

    const ctx = this.preprocessCtx;
    ctx.drawImage(imageSource, 0, 0, this.inputSize, this.inputSize);
    const imgData = ctx.getImageData(0, 0, this.inputSize, this.inputSize).data;

    // Fast contiguous Float32Array planar allocation [1, 3, 640, 640]
    const planeSize = this.inputSize * this.inputSize;
    const float32Data = new Float32Array(3 * planeSize);
    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      float32Data[p] = imgData[i] / 255.0; // R
      float32Data[planeSize + p] = imgData[i + 1] / 255.0; // G
      float32Data[2 * planeSize + p] = imgData[i + 2] / 255.0; // B
    }

    if (!this.loggedPreprocess) {
      console.log(`[PPEDetector Preprocess] Verified input: shape=[1, 3, ${this.inputSize}, ${this.inputSize}], layout=NCHW Float32, RGB order normalized [0, 1]`);
      this.loggedPreprocess = true;
    }

    return new window.ort.Tensor('float32', float32Data, [1, 3, this.inputSize, this.inputSize]);
  }

  // Executes ONNX inference and applies Non-Maximum Suppression to decode YOLO bounding boxes.
  async detect(imageSource, originalWidth, originalHeight) {
    if (this.state !== 'READY' || !this.session) {
      return {
        state: this.state,
        items: [],
        message: this.errorMessage || 'PPE MODEL NOT AVAILABLE',
      };
    }

    try {
      const tensor = this.preprocess(imageSource);
      const feeds = {};
      feeds[this.session.inputNames[0]] = tensor;

      const outputMap = await this.session.run(feeds);
      const outputTensor = outputMap[this.session.outputNames[0]];

      if (!outputTensor || !outputTensor.data) {
        throw new Error('PPE model returned empty or null output tensor');
      }

      // Output shape is [1, 4 + numClasses, 8400]
      const detections = this.postprocess(outputTensor.data, outputTensor.dims, originalWidth, originalHeight);

      if (this.frameLogCount === undefined) this.frameLogCount = 0;
      this.frameLogCount++;
      if (this.frameLogCount <= 5 || this.frameLogCount % 30 === 0 || detections.length > 0) {
        console.log(`[PPEDetector] Frame #${this.frameLogCount}: tensor dims=[${outputTensor.dims.join(',')}], detections=${detections.length} (${detections.map((d) => `${d.type}:${(d.confidence * 100).toFixed(0)}%`).join(', ') || 'none'})`);
      }

      return {
        state: 'READY',
        items: detections,
        message: `Detected ${detections.length} PPE items`,
      };
    } catch (err) {
      console.error('[PPEDetector] Inference error:', err);
      return {
        state: 'ERROR',
        items: [],
        message: `Inference failed: ${err.message}`,
      };
    }
  }

  // Decodes bounding boxes and performs confidence filtering and IoU suppression.
  postprocess(data, dims, originalWidth, originalHeight) {
    const numClasses = dims[1] - 4;
    const numAnchors = dims[2];
    const origW = (originalWidth && originalWidth > 0) ? originalWidth : this.inputSize;
    const origH = (originalHeight && originalHeight > 0) ? originalHeight : this.inputSize;
    const scaleX = origW / this.inputSize;
    const scaleY = origH / this.inputSize;

    const candidates = [];

    for (let a = 0; a < numAnchors; a++) {
      let maxConf = 0;
      let maxClass = -1;

      for (let c = 0; c < numClasses; c++) {
        const conf = data[(4 + c) * numAnchors + a];
        if (conf > maxConf) {
          maxConf = conf;
          maxClass = c;
        }
      }

      if (maxConf >= this.confidenceThreshold) {
        const cx = data[0 * numAnchors + a];
        const cy = data[1 * numAnchors + a];
        const w = data[2 * numAnchors + a];
        const h = data[3 * numAnchors + a];

        const x1 = Math.max(0, (cx - w / 2) * scaleX);
        const y1 = Math.max(0, (cy - h / 2) * scaleY);
        const x2 = Math.min(origW, (cx + w / 2) * scaleX);
        const y2 = Math.min(origH, (cy + h / 2) * scaleY);

        candidates.push({
          type: this.classes[maxClass] ?? `class_${maxClass}`,
          confidence: maxConf,
          detected: true,
          bbox: [x1, y1, x2, y2],
        });
      }
    }

    // Sort descending by confidence for greedy NMS
    candidates.sort((a, b) => b.confidence - a.confidence);

    const kept = [];
    while (candidates.length > 0) {
      const best = candidates.shift();
      kept.push(best);

      for (let i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].type === best.type && this.computeIoU(best.bbox, candidates[i].bbox) > this.iouThreshold) {
          candidates.splice(i, 1);
        }
      }
    }

    return kept;
  }

  // Computes intersection-over-union between two bounding box coordinates.
  computeIoU(boxA, boxB) {
    const x1 = Math.max(boxA[0], boxB[0]);
    const y1 = Math.max(boxA[1], boxB[1]);
    const x2 = Math.min(boxA[2], boxB[2]);
    const y2 = Math.min(boxA[3], boxB[3]);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
    const union = areaA + areaB - intersection;

    return union <= 0 ? 0 : intersection / union;
  }

  // Releases ONNX session and pre-processing buffer resources.
  close() {
    if (this.session) {
      try {
        this.session.release();
      } catch (e) {
        // Suppress session release exceptions
      }
      this.session = null;
    }
    this.state = 'UNAVAILABLE';
  }
}
