import { RiskEngine } from '../engine/riskEngine.js';
import { FIXTURES } from './fixtures.js';
import { adaptDetectionFrame, prepareScenarioFrames } from './adapter.js';
import { VisionPipeline } from './visionPipeline.js';
import { storage } from './storage.js';

// Initializes the RiskEngine orchestrator with instant debounce for interactive responsiveness
const engine = new RiskEngine({ onsetDebounceMs: 0 });

// Application state for camera streams, pipelines, and performance telemetry
let mediaStream = null;
let animationFrameId = null;
let lastInferenceTime = 0;
const INFERENCE_INTERVAL_MS = 100; // Throttle camera inference to ~10 FPS for optimal performance
let streamIntervalId = null;
let streamFrameCounter = 1;
let currentMode = 'camera'; // 'camera' | 'test'
let lastWorkerPayload = null;

// Pipeline orchestrator
const pipeline = new VisionPipeline({
  onStateChange: (state) => updateModelStatusBadges(state),
});

// DOM Elements
const kpiOverallScore = document.getElementById('kpiOverallScore');
const kpiScoreBar = document.getElementById('kpiScoreBar');
const kpiSeverity = document.getElementById('kpiSeverity');
const kpiWorkerCount = document.getElementById('kpiWorkerCount');
const kpiActiveIncidents = document.getElementById('kpiActiveIncidents');
const kpiDebounceState = document.getElementById('kpiDebounceState');

const workerListContainer = document.getElementById('workerListContainer');
const activeWorkerBadge = document.getElementById('activeWorkerBadge');
const ppeFindingsContent = document.getElementById('ppeFindingsContent');
const postureFindingsContent = document.getElementById('postureFindingsContent');
const fallFindingsContent = document.getElementById('fallFindingsContent');
const eventLogContainer = document.getElementById('eventLogContainer');

const visualizerCanvas = document.getElementById('visualizerCanvas');
const canvasCtx = visualizerCanvas.getContext('2d');
const webcamVideo = document.getElementById('webcamVideo');

const cameraStandbyOverlay = document.getElementById('cameraStandbyOverlay');
const streamWatermark = document.getElementById('streamWatermark');
const fpsTelemetry = document.getElementById('fpsTelemetry');
const cameraControls = document.getElementById('cameraControls');
const videoUploadControls = document.getElementById('videoUploadControls');
const testHarnessControls = document.getElementById('testHarnessControls');

const videoFileInput = document.getElementById('videoFileInput');
const btnPlayVideo = document.getElementById('btnPlayVideo');
const btnPauseVideo = document.getElementById('btnPauseVideo');
const btnRestartVideo = document.getElementById('btnRestartVideo');
const videoStatusMsg = document.getElementById('videoStatusMsg');
const videoLoopToggle = document.getElementById('videoLoopToggle');

const btnStartCamera = document.getElementById('btnStartCamera');
const btnStopCamera = document.getElementById('btnStopCamera');
const cameraStatusMsg = document.getElementById('cameraStatusMsg');
const cameraErrorAlert = document.getElementById('cameraErrorAlert');
const pipelineStatusMsg = document.getElementById('pipelineStatusMsg');

const badgePoseState = document.getElementById('badgePoseState');
const badgePpeState = document.getElementById('badgePpeState');
const badgeStorageState = document.getElementById('badgeStorageState');
const badgeOfflineState = document.getElementById('badgeOfflineState');

const fixtureSelector = document.getElementById('fixtureSelector');
const btnProcessSingle = document.getElementById('btnProcessSingle');
const btnPlayStream = document.getElementById('btnPlayStream');
const btnPauseStream = document.getElementById('btnPauseStream');
const btnResetEngine = document.getElementById('btnResetEngine');
const btnClearLog = document.getElementById('btnClearLog');
const btnInjectCustomJson = document.getElementById('btnInjectCustomJson');
const customJsonInput = document.getElementById('customJsonInput');

const customOnnxFileInput = document.getElementById('customOnnxFileInput');
const onnxLoadFeedback = document.getElementById('onnxLoadFeedback');

const btnOpenHistory = document.getElementById('btnOpenHistory');
const historyTableBody = document.getElementById('historyTableBody');
const btnExportHistory = document.getElementById('btnExportHistory');
const btnClearHistory = document.getElementById('btnClearHistory');

// Maps severity tier to styling classes and colors.
function getSeverityBadgeClass(sev) {
  switch (String(sev).toUpperCase()) {
    case 'CRITICAL': return 'bg-danger text-light';
    case 'HIGH': return 'bg-warning text-dark';
    case 'MEDIUM': return 'bg-info text-dark';
    default: return 'bg-success text-light';
  }
}

// Reflects vision model initialization states in the top status bar.
function updateModelStatusBadges(state) {
  if (state.poseState === 'READY') {
    badgePoseState.className = 'badge bg-success-subtle text-success border border-success';
    badgePoseState.textContent = 'Pose Lite: Ready (Local)';
  } else if (state.poseState === 'LOADING') {
    badgePoseState.className = 'badge bg-info-subtle text-info border border-info';
    badgePoseState.textContent = 'Pose Lite: Loading...';
  } else if (state.poseState === 'ERROR') {
    badgePoseState.className = 'badge bg-danger-subtle text-danger border border-danger';
    badgePoseState.textContent = 'Pose Lite: Error';
  }

  if (state.ppeState === 'READY') {
    badgePpeState.className = 'badge bg-success-subtle text-success border border-success';
    badgePpeState.textContent = 'PPE: Ready (YOLOv8 ONNX)';
  } else if (state.ppeState === 'UNAVAILABLE') {
    badgePpeState.className = 'badge bg-warning-subtle text-warning border border-warning';
    badgePpeState.textContent = 'PPE MODEL NOT AVAILABLE';
  } else if (state.ppeState === 'LOADING') {
    badgePpeState.className = 'badge bg-info-subtle text-info border border-info';
    badgePpeState.textContent = 'PPE: Checking...';
  }
}

// Appends formatted event payload entry to the scrolling incident event bus log.
function logEvent(type, detail) {
  const timeStr = new Date(detail.timestamp ?? Date.now()).toLocaleTimeString();
  const entry = document.createElement('div');

  let typeClass = 'risk';
  let badgeLabel = type;

  if (type === 'violation:started') {
    typeClass = 'started';
    badgeLabel = 'ALERT STARTED';
  } else if (type === 'violation:escalated') {
    typeClass = 'escalated';
    badgeLabel = 'ESCALATED';
  } else if (type === 'violation:resolved') {
    typeClass = 'resolved';
    badgeLabel = 'RESOLVED';
  } else if (type === 'risk:updated') {
    typeClass = 'risk';
    badgeLabel = 'RISK UPDATE';
  }

  entry.className = `log-entry ${typeClass}`;

  const workerInfo = detail.workerId ? `Worker #${detail.workerId}` : `Overall: ${detail.overallScore ?? 0}`;
  const ruleInfo = detail.ruleType ? `| Rule: ${detail.ruleType}` : '';
  const sevInfo = detail.incident?.severity ? `[${detail.incident.severity}]` : (detail.overallSeverity ? `[${detail.overallSeverity}]` : '');

  entry.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <span>
        <strong class="text-uppercase" style="font-size:0.7rem;">${badgeLabel}</strong>
        ${workerInfo} ${ruleInfo} <span class="badge ${getSeverityBadgeClass(detail.incident?.severity ?? detail.overallSeverity)} py-0 px-1">${sevInfo}</span>
      </span>
      <span class="text-muted" style="font-size:0.7rem;">${timeStr}</span>
    </div>
  `;

  if (eventLogContainer.children.length === 1 && eventLogContainer.children[0].classList.contains('text-muted')) {
    eventLogContainer.innerHTML = '';
  }

  eventLogContainer.insertBefore(entry, eventLogContainer.firstChild);

  while (eventLogContainer.children.length > 50) {
    eventLogContainer.removeChild(eventLogContainer.lastChild);
  }
}

// Connects native engine events to application state, UI telemetry, and IndexedDB persistence.
function wireEngineEvents() {
  engine.addEventListener('risk:updated', (e) => {
    logEvent('risk:updated', e.detail);
    updateRiskKpis(e.detail.overallScore, e.detail.overallSeverity, e.detail.workers?.length ?? 0);

    // Persist periodic frame safety scores to IndexedDB
    storage.recordInspection({
      timestamp: e.detail.timestamp,
      frameId: e.detail.frameId,
      overallScore: e.detail.overallScore,
      overallSeverity: e.detail.overallSeverity,
      workerCount: e.detail.workers?.length ?? 0,
      activeIncidentsCount: engine.tracker.getActiveIncidents().length,
      workers: e.detail.workers,
    });
  });

  engine.addEventListener('violation:started', (e) => {
    logEvent('violation:started', e.detail);
    storage.recordViolationEvent('violation:started', e.detail);
  });

  engine.addEventListener('violation:escalated', (e) => {
    logEvent('violation:escalated', e.detail);
    storage.recordViolationEvent('violation:escalated', e.detail);
  });

  engine.addEventListener('violation:resolved', (e) => {
    logEvent('violation:resolved', e.detail);
    storage.recordViolationEvent('violation:resolved', e.detail);
  });
}

// Updates top-level KPI cards with computed score, progress bar, and severity badges.
function updateRiskKpis(score, severity, workerCount) {
  const roundedScore = Math.round(score * 10) / 10;
  kpiOverallScore.textContent = roundedScore;

  kpiScoreBar.style.width = `${Math.min(100, Math.max(0, roundedScore))}%`;

  kpiScoreBar.className = 'progress-bar';
  if (severity === 'CRITICAL') kpiScoreBar.classList.add('bg-danger');
  else if (severity === 'HIGH') kpiScoreBar.classList.add('bg-warning');
  else if (severity === 'MEDIUM') kpiScoreBar.classList.add('bg-info');
  else kpiScoreBar.classList.add('bg-success');

  kpiSeverity.textContent = severity;
  kpiSeverity.className = `badge fs-6 px-3 py-2 ${getSeverityBadgeClass(severity)}`;

  kpiWorkerCount.textContent = workerCount;

  const activeCount = engine.tracker.getActiveIncidents().length;
  kpiActiveIncidents.textContent = activeCount;
  kpiActiveIncidents.className = `fs-2 fw-bold ${activeCount > 0 ? 'text-danger' : 'text-success'}`;
}

// Renders individual worker cards with findings, risk score, and bounding coordinates.
function renderWorkerCards(workers) {
  activeWorkerBadge.textContent = `${workers.length} Worker${workers.length === 1 ? '' : 's'}`;

  if (!workers || workers.length === 0) {
    workerListContainer.innerHTML = '<div class="text-muted text-center py-3 small">No workers detected in this frame.</div>';
    return;
  }

  workerListContainer.innerHTML = '';
  workers.forEach((w) => {
    const card = document.createElement('div');
    card.className = 'worker-card';

    const findingsHtml = (w.findings || []).map((f) => {
      const isViol = f.status === 'VIOLATION';
      const isUnc = f.status === 'UNCERTAIN';
      const isSkip = f.status === 'SKIPPED';
      const cls = isViol ? 'violation' : (isUnc ? 'uncertain' : (isSkip ? 'skipped' : 'compliant'));
      const sevBadge = f.evidence?.severity ? ` [${f.evidence.severity}]` : '';
      return `<span class="finding-chip ${cls}">${f.type || f.status}${sevBadge} (+${f.points || 0}pt)</span>`;
    }).join(' ') || '<span class="text-muted small">No safety findings flagged</span>';

    const bboxStr = w.bbox ? `[${Math.round(w.bbox.x1 ?? 0)}, ${Math.round(w.bbox.y1 ?? 0)}, ${Math.round(w.bbox.x2 ?? 0)}, ${Math.round(w.bbox.y2 ?? 0)}]` : 'N/A';

    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-1">
        <div>
          <strong class="text-primary">Worker #${w.trackId}</strong>
          <span class="text-muted ms-2" style="font-size:0.75rem;">BBox: ${bboxStr}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="fw-bold fs-6">${w.riskScore}</span>
          <span class="badge ${getSeverityBadgeClass(w.severity)}">${w.severity}</span>
        </div>
      </div>
      <div class="d-flex flex-wrap gap-1 mt-1">
        ${findingsHtml}
      </div>
    `;

    workerListContainer.appendChild(card);
  });
}

// Renders findings breakdown into dedicated PPE, Posture, and Fall panels.
function renderFindingsTabs(workers) {
  const allFindings = workers.flatMap((w) => (w.findings || []).map((f) => ({ ...f, workerId: w.trackId })));

  // 1. Posture Findings
  const postureWorkers = workers.map((w) => ({ workerId: w.trackId, posture: w.posture }));
  postureFindingsContent.innerHTML = postureWorkers.map((item) => {
    const post = item.posture;
    if (!post || !post.angles) return `<div class="text-muted py-1">Worker #${item.workerId}: No posture telemetry available.</div>`;
    const durSec = post.angles.stoopDurationMs ? ` | Stoop: <strong class="text-light">${(post.angles.stoopDurationMs / 1000).toFixed(1)}s</strong>` : '';
    return `
      <div class="border-bottom border-secondary pb-1 mb-1">
        <strong>Worker #${item.workerId}:</strong>
        <span class="badge ${post.riskLevel === 'CRITICAL' ? 'bg-danger' : (post.riskLevel === 'HIGH' ? 'bg-warning text-dark' : 'bg-secondary')}">${post.postureState ?? 'NORMAL'}</span>
        <div class="text-muted mt-1" style="font-size:0.75rem;">
          Trunk Inclination: <strong class="text-light">${post.angles.trunkInclinationDeg?.toFixed(1) ?? 'N/A'}°</strong> |
          Neck Flexion: <strong class="text-light">${post.angles.neckFlexionDeg?.toFixed(1) ?? 'N/A'}°</strong> |
          Min Knee Angle: <strong class="text-light">${post.angles.minKneeAngleDeg?.toFixed(1) ?? 'N/A'}°</strong>${durSec}
        </div>
      </div>
    `;
  }).join('') || '<div class="text-muted text-center py-2">No active posture findings.</div>';

  // 2. Fall Findings
  const fallWorkers = workers.map((w) => ({ workerId: w.trackId, fall: w.fall }));
  fallFindingsContent.innerHTML = fallWorkers.map((item) => {
    const fall = item.fall;
    if (!fall) return `<div class="text-muted py-1">Worker #${item.workerId}: No fall telemetry available.</div>`;
    const isFall = fall.isFallen || fall.fallState === 'FALLEN';
    return `
      <div class="border-bottom border-secondary pb-1 mb-1">
        <strong>Worker #${item.workerId}:</strong>
        <span class="badge ${isFall ? 'bg-danger' : 'bg-success'}">${fall.fallState ?? 'NORMAL'}</span>
        <span class="text-muted ms-2">Torso Floor Angle: <strong class="text-light">${fall.torsoFloorAngleDeg ?? 'N/A'}°</strong> | Aspect Ratio: <strong class="text-light">${fall.aspectRatio?.toFixed(2) ?? 'N/A'}</strong></span>
        ${fall.emergencyAlert ? '<span class="badge bg-danger ms-2">EMERGENCY ALERT</span>' : ''}
      </div>
    `;
  }).join('') || '<div class="text-muted text-center py-2">No fall kinematics flagged.</div>';

  // 3. PPE Findings
  const ppeFindings = allFindings.filter((f) => f.type?.includes('Hardhat') || f.type?.includes('Vest') || f.type?.includes('PPE') || f.type === 'SkippedWorker');
  if (pipeline.ppeDetector.state !== 'READY') {
    ppeFindingsContent.innerHTML = `
      <div class="p-2 border border-warning rounded bg-warning bg-opacity-10">
        <div class="text-warning fw-bold mb-1">⚠️ PPE MODEL NOT AVAILABLE</div>
        <p class="small text-muted mb-0">
          The YOLOv8 ONNX PPE detector is not loaded. PPE compliance is marked <strong>UNCERTAIN</strong> with zero penalty points. Workers are not falsely confirmed compliant or in violation.
        </p>
      </div>
    `;
  } else if (ppeFindings.length === 0) {
    ppeFindingsContent.innerHTML = '<div class="text-success py-2">✓ All workers compliant with head and torso PPE safety requirements.</div>';
  } else {
    ppeFindingsContent.innerHTML = ppeFindings.map((f) => `
      <div class="border-bottom border-secondary pb-1 mb-1">
        <span class="badge ${f.status === 'VIOLATION' ? 'bg-danger' : 'bg-warning text-dark'}">${f.status}</span>
        <strong>Worker #${f.workerId}:</strong> ${f.type}
        <span class="text-muted">(${f.evidence?.reason ?? 'Compliance check failed'})</span>
      </div>
    `).join('');
  }
}

// MediaPipe Pose Landmark Skeleton Connection Indices
const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
];

// Draws video frame, skeletal joints, posture telemetry, and bounding boxes on HTML5 Canvas.
function renderCanvas(videoSource, workers, isLiveCamera = false) {
  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;

  canvasCtx.clearRect(0, 0, width, height);

  // 1. Draw video background in camera mode
  if (isLiveCamera && videoSource && videoSource.readyState >= 2) {
    canvasCtx.drawImage(videoSource, 0, 0, width, height);
  } else {
    // Technical visualizer grid in simulation mode
    canvasCtx.fillStyle = '#0b0f19';
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    canvasCtx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(x, 0);
      canvasCtx.lineTo(x, height);
      canvasCtx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, y);
      canvasCtx.lineTo(width, y);
      canvasCtx.stroke();
    }
  }

  if (!workers || workers.length === 0) {
    if (!isLiveCamera) {
      canvasCtx.fillStyle = '#64748b';
      canvasCtx.font = '14px system-ui';
      canvasCtx.textAlign = 'center';
      canvasCtx.fillText('No active worker detections. Inject frame to visualize.', width / 2, height / 2);
    }
    return;
  }

  workers.forEach((w) => {
    // 2. Draw skeletal bones and joints if pose landmarks are available
    const rawLm = w.rawNormLandmarks;
    if (rawLm && Array.isArray(rawLm)) {
      // Draw bones
      canvasCtx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      canvasCtx.lineWidth = 3;
      POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const pt1 = rawLm[startIdx];
        const pt2 = rawLm[endIdx];
        if (pt1 && pt2 && (pt1.visibility ?? 1) >= 0.3 && (pt2.visibility ?? 1) >= 0.3) {
          canvasCtx.beginPath();
          canvasCtx.moveTo(pt1.x * width, pt1.y * height);
          canvasCtx.lineTo(pt2.x * width, pt2.y * height);
          canvasCtx.stroke();
        }
      });

      // Draw joint nodes
      rawLm.forEach((lm) => {
        if ((lm.visibility ?? 1) >= 0.3) {
          canvasCtx.beginPath();
          canvasCtx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
          canvasCtx.fillStyle = '#38bdf8';
          canvasCtx.fill();
          canvasCtx.strokeStyle = '#ffffff';
          canvasCtx.lineWidth = 1.5;
          canvasCtx.stroke();
        }
      });
    }

    // 3. Draw Bounding Box color-coded by severity
    const b = w.bbox;
    if (!b) return;

    const x1 = b.x1 ?? b.xmin ?? 0;
    const y1 = b.y1 ?? b.ymin ?? 0;
    const x2 = b.x2 ?? b.xmax ?? 0;
    const y2 = b.y2 ?? b.ymax ?? 0;
    const boxW = x2 - x1;
    const boxH = y2 - y1;

    let strokeColor = '#10b981';
    if (w.severity === 'CRITICAL') strokeColor = '#ef4444';
    else if (w.severity === 'HIGH') strokeColor = '#f97316';
    else if (w.severity === 'MEDIUM') strokeColor = '#f59e0b';

    canvasCtx.strokeStyle = strokeColor;
    canvasCtx.lineWidth = 2.5;
    canvasCtx.strokeRect(x1, y1, boxW, boxH);

    // Label tag
    const tagH = 22;
    const tagW = Math.min(220, Math.max(140, boxW));
    canvasCtx.fillStyle = strokeColor;
    canvasCtx.fillRect(x1, Math.max(0, y1 - tagH), tagW, tagH);

    canvasCtx.fillStyle = '#0f172a';
    canvasCtx.font = 'bold 11px system-ui';
    canvasCtx.textAlign = 'left';
    canvasCtx.fillText(`Worker #${w.trackId} | Score: ${w.riskScore} [${w.severity}]`, x1 + 4, Math.max(15, y1 - 7));

    // Telemetry label below box
    const trunkAngle = w.posture?.angles?.trunkInclinationDeg?.toFixed(0);
    const postureStr = trunkAngle ? `Trunk: ${trunkAngle}°` : '';
    const ppeBadge = pipeline.ppeDetector.state === 'READY' ? 'PPE Active' : 'PPE: N/A';
    canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    canvasCtx.fillRect(x1, Math.min(height - 18, y2 + 2), Math.min(180, boxW), 16);
    canvasCtx.fillStyle = '#94a3b8';
    canvasCtx.font = '10px system-ui';
    canvasCtx.fillText(`${postureStr} | ${ppeBadge}`, x1 + 4, Math.min(height - 6, y2 + 14));
  });
}

// Bounded development-only diagnostic buffer (maximum 50 records)
const devDiagnosticsBuffer = [];

function recordDiagnosticFrame(result, framePayload) {
  if (!result || !result.workers) return;
  for (const w of result.workers) {
    const postureFinding = (w.findings || []).find((f) => f.type === 'UnsafePosture');
    const record = {
      timestamp: result.timestamp,
      workerId: w.trackId,
      landmarkConfidence: w.bbox?.confidence ?? 1.0,
      landmarksValid: Boolean(w.landmarks && w.landmarks.length >= 25),
      trunkInclinationDeg: w.posture?.angles?.trunkInclinationDeg ?? null,
      trunkInclinationDefinition: '2D image-plane torso inclination from vertical (0°=upright, 90°=horizontal)',
      leftKneeAngleDeg: w.posture?.angles?.leftKneeAngleDeg ?? null,
      rightKneeAngleDeg: w.posture?.angles?.rightKneeAngleDeg ?? null,
      minKneeAngleDeg: w.posture?.angles?.minKneeAngleDeg ?? null,
      postureClass: w.posture?.postureState ?? 'UNKNOWN',
      postureDurationMs: w.posture?.angles?.stoopDurationMs ?? 0,
      isHazardous: Boolean(postureFinding),
      reason: postureFinding?.evidence?.reason || w.posture?.description || 'Ergonomically compliant',
      violationPoints: postureFinding ? postureFinding.points : 0,
      violationSeverity: postureFinding?.evidence?.severity ?? (postureFinding ? 'MEDIUM' : 'LOW'),
      workerRiskScore: w.riskScore,
      workerSeverity: w.severity,
      overallRiskScore: result.overallRisk?.score ?? 0,
      overallSeverity: result.overallRisk?.severity ?? 'LOW',
      fallState: w.fall?.fallState ?? 'NORMAL',
      isFallen: Boolean(w.fall?.isFallen),
    };
    devDiagnosticsBuffer.push(record);
    if (devDiagnosticsBuffer.length > 50) {
      devDiagnosticsBuffer.shift();
    }
  }
}

// Dispatches an adapted frame payload into the RiskEngine orchestrator and reflects output on UI.
function processFrameInput(framePayload, isLiveCamera = false) {
  if (!framePayload) return null;

  const adapted = adaptDetectionFrame(framePayload);
  const result = engine.processFrame(adapted);
  if (!result) return null;

  // Preserve raw landmarks on worker objects for canvas rendering
  if (framePayload.workers) {
    result.workers.forEach((w, i) => {
      w.rawNormLandmarks = framePayload.workers[i]?.rawNormLandmarks;
    });
  }

  // Record bounded diagnostic telemetry
  recordDiagnosticFrame(result, framePayload);

  lastWorkerPayload = result.workers;
  renderWorkerCards(result.workers);
  renderFindingsTabs(result.workers);
  renderCanvas(webcamVideo, result.workers, isLiveCamera);
  updateRiskKpis(result.overallRisk.score, result.overallRisk.severity, result.workers.length);

  // Diagnostic log for real-time monitoring and multi-person tracking verification
  if (result.workers?.length > 0) {
    const workerSummaries = result.workers.map((w) => {
      const postFinding = (w.findings || []).find((f) => f.type === 'UnsafePosture');
      const findingStr = postFinding ? `UnsafePosture(+${postFinding.points}pt)` : 'compliant';
      const hasSkeleton = Boolean(w.rawNormLandmarks && w.rawNormLandmarks.length > 0);
      return `Worker#${w.trackId}[${w.severity}, score=${w.riskScore}, posture=${w.posture?.postureState ?? 'NORMAL'}, skeleton=${hasSkeleton ? 'active' : 'none'}, ${findingStr}]`;
    }).join(' | ');
    console.log(`[App] Frame ${result.frameId}: activeWorkers=${result.workers.length} -> ${workerSummaries}`);
  }

  return result;
}

// Executes periodic real-time camera or video inference loop throttled to avoid UI lag.
async function runCameraLoop(timestamp) {
  const isVideoActive = currentMode === 'video' && webcamVideo.src && !webcamVideo.paused && !webcamVideo.ended;
  if (!mediaStream && !isVideoActive) return;

  const elapsed = timestamp - lastInferenceTime;
  if (elapsed >= INFERENCE_INTERVAL_MS) {
    const fps = lastInferenceTime > 0 ? Math.round(1000 / Math.max(1, elapsed)) : 0;
    lastInferenceTime = timestamp;
    const frameStartTime = performance.now();

    const payload = await pipeline.processVideoFrame(webcamVideo);
    if (payload) {
      processFrameInput(payload, true);
    }

    const latency = Math.round(performance.now() - frameStartTime);
    fpsTelemetry.textContent = `FPS: ${fps} | Latency: ${latency}ms | Model: Pose Lite`;
  }

  animationFrameId = requestAnimationFrame(runCameraLoop);
}

// Requests webcam access via WebRTC getUserMedia and initializes local inference loop.
async function startWebcam() {
  cameraErrorAlert.classList.add('d-none');
  cameraStatusMsg.textContent = 'Requesting camera permissions...';

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    webcamVideo.srcObject = mediaStream;
    await webcamVideo.play();

    visualizerCanvas.width = webcamVideo.videoWidth || 640;
    visualizerCanvas.height = webcamVideo.videoHeight || 480;

    cameraStandbyOverlay.classList.add('d-none');
    btnStartCamera.disabled = true;
    btnStopCamera.disabled = false;
    cameraStatusMsg.textContent = 'Camera active. Processing frames on-device.';
    pipelineStatusMsg.textContent = 'MONITORING ACTIVE';
    pipelineStatusMsg.className = 'badge bg-success text-light';

    lastInferenceTime = performance.now();
    animationFrameId = requestAnimationFrame(runCameraLoop);
  } catch (err) {
    console.error('Camera access error:', err);
    cameraErrorAlert.textContent = `Camera Error: ${err.name} - ${err.message || 'Permission denied or webcam unavailable.'}`;
    cameraErrorAlert.classList.remove('d-none');
    cameraStatusMsg.textContent = 'Camera initialization failed.';
  }
}

// Stops active webcam media stream tracks, cancels animation loop, and resets UI.
function stopWebcam() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (currentMode === 'camera') {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    webcamVideo.srcObject = null;
    cameraStandbyOverlay.classList.remove('d-none');
    btnStartCamera.disabled = false;
    btnStopCamera.disabled = true;
    cameraStatusMsg.textContent = 'Camera stopped.';
    pipelineStatusMsg.textContent = 'MONITORING STOPPED';
    pipelineStatusMsg.className = 'badge bg-secondary text-light';
    fpsTelemetry.textContent = 'FPS: 0 | Latency: 0ms';

    // Render cleared canvas
    renderCanvas(null, [], false);
  }
}

// Starts local video playback and runs continuous frame inference loop.
async function startVideoPlayback() {
  if (!webcamVideo.src) return;
  try {
    webcamVideo.loop = videoLoopToggle.checked;
    await webcamVideo.play();

    visualizerCanvas.width = webcamVideo.videoWidth || 640;
    visualizerCanvas.height = webcamVideo.videoHeight || 480;

    cameraStandbyOverlay.classList.add('d-none');
    btnPlayVideo.disabled = true;
    btnPauseVideo.disabled = false;
    btnRestartVideo.disabled = false;
    videoStatusMsg.textContent = 'Processing demo video locally with AI...';
    pipelineStatusMsg.textContent = 'MONITORING ACTIVE';
    pipelineStatusMsg.className = 'badge bg-success text-light';

    if (!animationFrameId) {
      lastInferenceTime = performance.now();
      animationFrameId = requestAnimationFrame(runCameraLoop);
    }
  } catch (err) {
    console.error('Video playback error:', err);
    videoStatusMsg.textContent = `Playback error: ${err.message}`;
  }
}

// Pauses video playback and pauses frame inference loop.
function pauseVideoPlayback() {
  webcamVideo.pause();
  btnPlayVideo.disabled = false;
  btnPauseVideo.disabled = true;
  videoStatusMsg.textContent = 'Video paused.';
  pipelineStatusMsg.textContent = 'MONITORING PAUSED';
  pipelineStatusMsg.className = 'badge bg-warning text-dark';
}

// Rewinds video to beginning and resumes inference playback.
function restartVideoPlayback() {
  webcamVideo.currentTime = 0;
  startVideoPlayback();
}

// Fetches the active test scenario fixture and injects prepared sequence into engine.
function executeSelectedFixture() {
  const key = fixtureSelector.value;
  const baseFixture = FIXTURES[key] ?? FIXTURES.standard;

  const frames = prepareScenarioFrames(key, baseFixture, Date.now(), streamFrameCounter++);
  let lastResult = null;
  for (const frame of frames) {
    lastResult = processFrameInput(frame, false);
  }
  return lastResult;
}

// Starts periodic simulation stream delivering fixture frames at 5 Hz (200ms).
function startStreamSimulation() {
  if (streamIntervalId) return;

  btnPlayStream.disabled = true;
  btnPauseStream.disabled = false;

  streamIntervalId = setInterval(() => {
    executeSelectedFixture();
  }, 200);
}

// Halts periodic test frame simulation.
function pauseStreamSimulation() {
  if (streamIntervalId) {
    clearInterval(streamIntervalId);
    streamIntervalId = null;
  }
  btnPlayStream.disabled = false;
  btnPauseStream.disabled = true;
}

// Switches UI between Live Camera, Video File Upload, and Simulation/Fixtures mode.
function setStreamMode(mode) {
  currentMode = mode;
  pauseStreamSimulation();

  if (mode === 'camera') {
    if (webcamVideo.src && !mediaStream) {
      webcamVideo.pause();
    }
    cameraControls.classList.remove('d-none');
    videoUploadControls.classList.add('d-none');
    testHarnessControls.classList.add('d-none');
    streamWatermark.textContent = 'LIVE WEBCAM AI';
    streamWatermark.className = 'position-absolute top-0 start-0 m-2 badge bg-primary bg-opacity-75 text-white fw-bold';
    if (!mediaStream) {
      cameraStandbyOverlay.classList.remove('d-none');
      renderCanvas(null, [], false);
    } else {
      cameraStandbyOverlay.classList.add('d-none');
      renderCanvas(webcamVideo, lastWorkerPayload, true);
    }
  } else if (mode === 'video') {
    stopWebcam();
    cameraControls.classList.add('d-none');
    videoUploadControls.classList.remove('d-none');
    testHarnessControls.classList.add('d-none');
    streamWatermark.textContent = 'VIDEO DEMO AI';
    streamWatermark.className = 'position-absolute top-0 start-0 m-2 badge bg-warning text-dark fw-bold';
    if (!webcamVideo.src) {
      cameraStandbyOverlay.classList.remove('d-none');
      renderCanvas(null, [], false);
    } else {
      cameraStandbyOverlay.classList.add('d-none');
      if (!webcamVideo.paused) {
        startVideoPlayback();
      }
    }
  } else {
    stopWebcam();
    if (webcamVideo.src) {
      webcamVideo.pause();
    }
    cameraControls.classList.add('d-none');
    videoUploadControls.classList.add('d-none');
    testHarnessControls.classList.remove('d-none');
    cameraStandbyOverlay.classList.add('d-none');
    streamWatermark.textContent = 'SIMULATION / FIXTURE DATA (Not live inference)';
    streamWatermark.className = 'position-absolute top-0 start-0 m-2 badge bg-info bg-opacity-75 text-white fw-bold';
    executeSelectedFixture();
  }
}

// Loads and populates stored inspection records inside the IndexedDB modal.
async function populateHistoryModal() {
  historyTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Loading history from IndexedDB...</td></tr>';
  const inspections = await storage.getRecentInspections(50);

  if (inspections.length === 0) {
    historyTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No inspection history records stored yet.</td></tr>';
    return;
  }

  historyTableBody.innerHTML = inspections.map((row) => {
    const timeStr = new Date(row.timestamp).toLocaleTimeString();
    return `
      <tr>
        <td class="font-monospace">${timeStr}</td>
        <td>#${row.frameId}</td>
        <td class="fw-bold">${row.overallScore}</td>
        <td><span class="badge ${getSeverityBadgeClass(row.overallSeverity)} py-0 px-1">${row.overallSeverity}</span></td>
        <td>${row.workerCount}</td>
        <td>${row.activeIncidentsCount}</td>
      </tr>
    `;
  }).join('');
}

// Registers interactive event listeners for buttons and file inputs.
function setupEventListeners() {
  // Mode selection
  document.getElementById('modeCamera').addEventListener('change', () => setStreamMode('camera'));
  document.getElementById('modeVideo').addEventListener('change', () => setStreamMode('video'));
  document.getElementById('modeTest').addEventListener('change', () => setStreamMode('test'));

  // Video File Upload controls
  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (mediaStream) stopWebcam();
    pauseStreamSimulation();

    const url = URL.createObjectURL(file);
    webcamVideo.srcObject = null;
    webcamVideo.src = url;
    webcamVideo.loop = videoLoopToggle.checked;

    webcamVideo.onloadedmetadata = () => {
      visualizerCanvas.width = webcamVideo.videoWidth || 640;
      visualizerCanvas.height = webcamVideo.videoHeight || 480;
    };

    videoStatusMsg.textContent = `Loaded "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB). Starting detection...`;
    btnPlayVideo.disabled = false;
    btnPauseVideo.disabled = true;
    btnRestartVideo.disabled = false;

    startVideoPlayback();
  });

  btnPlayVideo.addEventListener('click', startVideoPlayback);
  btnPauseVideo.addEventListener('click', pauseVideoPlayback);
  btnRestartVideo.addEventListener('click', restartVideoPlayback);

  videoLoopToggle.addEventListener('change', () => {
    webcamVideo.loop = videoLoopToggle.checked;
  });

  webcamVideo.addEventListener('ended', () => {
    if (!webcamVideo.loop) {
      btnPlayVideo.disabled = false;
      btnPauseVideo.disabled = true;
      videoStatusMsg.textContent = 'Video playback ended. Click "Restart" to replay.';
      pipelineStatusMsg.textContent = 'MONITORING IDLE';
      pipelineStatusMsg.className = 'badge bg-secondary text-light';
    }
  });

  // Camera controls
  btnStartCamera.addEventListener('click', startWebcam);
  btnStopCamera.addEventListener('click', stopWebcam);

  // Test Harness controls
  btnProcessSingle.addEventListener('click', executeSelectedFixture);
  btnPlayStream.addEventListener('click', startStreamSimulation);
  btnPauseStream.addEventListener('click', pauseStreamSimulation);

  // Custom JSON injection
  btnInjectCustomJson.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(customJsonInput.value.trim());
      processFrameInput(parsed, false);
    } catch (err) {
      alert(`Invalid JSON format: ${err.message}`);
    }
  });

  // Clear log
  btnClearLog.addEventListener('click', () => {
    eventLogContainer.innerHTML = '<div class="text-muted text-center py-3">Log cleared. Awaiting new engine events...</div>';
  });

  // Reset engine
  btnResetEngine.addEventListener('click', () => {
    pauseStreamSimulation();
    engine.reset();
    updateRiskKpis(0, 'LOW', 0);
    renderWorkerCards([]);
    renderFindingsTabs([]);
    renderCanvas(null, [], false);
    logEvent('risk:updated', { overallScore: 0, overallSeverity: 'LOW', timestamp: Date.now() });
  });

  // Custom ONNX Model upload
  customOnnxFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onnxLoadFeedback.textContent = `Loading ${file.name}...`;
    try {
      const arrayBuffer = await file.arrayBuffer();
      await pipeline.ppeDetector.loadModelFromBuffer(arrayBuffer);
      onnxLoadFeedback.textContent = `✓ Successfully loaded custom ONNX PPE model: ${file.name}`;
      onnxLoadFeedback.className = 'small mt-1 text-success';
      updateModelStatusBadges(pipeline);
    } catch (err) {
      onnxLoadFeedback.textContent = `✗ Failed to load ONNX model: ${err.message}`;
      onnxLoadFeedback.className = 'small mt-1 text-danger';
    }
  });

  // Inspection history modal
  btnOpenHistory.addEventListener('click', populateHistoryModal);

  btnExportHistory.addEventListener('click', async () => {
    const jsonStr = await storage.exportAsJSON();
    if (!jsonStr) return;
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ergoguard-inspections-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClearHistory.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all inspection records from IndexedDB?')) {
      await storage.clearAll();
      populateHistoryModal();
    }
  });
}

// Registers offline Service Worker and initializes IndexedDB and vision models.
async function init() {
  wireEngineEvents();
  setupEventListeners();

  // 1. Initialize IndexedDB storage
  const storageReady = await storage.init();
  if (storageReady) {
    badgeStorageState.className = 'badge bg-success-subtle text-success border border-success';
    badgeStorageState.textContent = 'IndexedDB: Ready';
  }

  // 2. Register Service Worker for offline operation
  if ('serviceWorker' in navigator) {
    try {
      const swReg = await navigator.serviceWorker.register('./sw.js');
      if (swReg) swReg.update();
      badgeOfflineState.className = 'badge bg-success-subtle text-success border border-success';
      badgeOfflineState.textContent = 'Offline: Ready';
    } catch (swErr) {
      console.warn('[App] Service worker registration error:', swErr);
      badgeOfflineState.textContent = 'Offline: Standby';
    }
  }

  // 3. Initialize Vision Pipeline (MediaPipe Pose Lite + YOLOv8 ONNX)
  await pipeline.init();

  // Draw initial canvas standby state
  renderCanvas(null, [], false);
}

// Ensure init() executes regardless of whether DOMContentLoaded already fired
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose pipeline and engine on window for telemetry inspection and testing
if (typeof window !== 'undefined') {
  window.__ergoguard = {
    pipeline,
    engine,
    storage,
    processFrameInput,
    renderCanvas,
    visualizerCanvas,
    getDiagnostics: () => [...devDiagnosticsBuffer],
  };
}
