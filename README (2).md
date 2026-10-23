# 🛡️ ErgoGuard-AI

**Browser-local workplace safety and ergonomics intelligence.**
ErgoGuard-AI turns an ordinary camera into an on-device safety monitor. It watches workers for unsafe lifting posture, possible fatigue, missing PPE (hardhat and high-visibility vest) and falls, then combines everything into an explainable 0–100 risk score. The AI and the rule engine run inside the browser. **No video, image or body-landmark data is uploaded anywhere.**

> Built for **AITHON 2.0**, organised by AIESA (Artificial Intelligence & Data Science Engineering Student Association).

> ⚠️ **Prototype notice.** ErgoGuard-AI is a hackathon prototype and **decision-support tool, not a certified safety system**. It must never replace physical guards, emergency stops, supervision or any legally required safety measure. Detection accuracy has **not yet been measured on labelled real-world footage** (see [Known limitations](#13-known-limitations-and-honest-status)).

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Feature status at a glance](#2-feature-status-at-a-glance)
3. [How it works](#3-how-it-works)
4. [The safety rules in detail](#4-the-safety-rules-in-detail)
5. [Tech stack](#5-tech-stack)
6. [Repository structure](#6-repository-structure)
7. [Getting started](#7-getting-started)
8. [Using the engine as a library](#8-using-the-engine-as-a-library)
9. [Configuration reference](#9-configuration-reference)
10. [Data, storage and privacy](#10-data-storage-and-privacy)
11. [Deployment, sharing and kiosk mode](#11-deployment-sharing-and-kiosk-mode)
12. [Testing](#12-testing)
13. [Known limitations and honest status](#13-known-limitations-and-honest-status)
14. [Roadmap](#14-roadmap)
15. [The Python reference implementation](#15-the-python-reference-implementation)
16. [Troubleshooting](#16-troubleshooting)
17. [License and acknowledgements](#17-license-and-acknowledgements)

---

## 1. What it does

Manual-handling injuries, missing protective equipment and unnoticed falls are common and costly in factories and warehouses. Cloud video-analytics products need uploads, subscriptions and IT staff. ErgoGuard-AI takes the opposite approach: everything runs locally on one computer with a camera.

For each person in view, ErgoGuard-AI:

- finds 33 body landmarks with **MediaPipe Pose** (WebAssembly, in the browser);
- measures trunk, neck and knee angles and flags **unsafe lifting** (forward bend with straight knees);
- tracks head droop, slouching and stillness as a rough **fatigue / low-alertness indicator**;
- checks whether a **hardhat** is on the head and a **vest** on the torso, using box-overlap rules (YOLOv8 via ONNX Runtime Web, when a model is supplied);
- detects **falls** and "man-down" emergencies, distinguishing a real fall from bending over;
- turns all findings into a **risk score** and a **severity tier** (LOW, MEDIUM, HIGH, CRITICAL);
- raises **debounced, de-duplicated alerts** with a full incident lifecycle (started, escalated, resolved);
- stores scores and incidents **locally** in IndexedDB, and exports them as JSON.

**Best-fit use case:** fixed manual-handling workstations (packing tables, assembly benches, loading stations) in small and mid-size factories and warehouses, with one camera per station at a front or side angle and a person 2–4 m away.

---

## 2. Feature status at a glance

| Feature | Status | Notes |
|---|---|---|
| Webcam input (`getUserMedia`) | ✅ Implemented | 640×480 ideal, front camera |
| Simulation mode with 6 test scenarios | ✅ Implemented | Works with no camera |
| MediaPipe Pose Lite (33 landmarks, WASM, GPU→CPU fallback) | ✅ Implemented | Up to 2 people per frame |
| Posture / unsafe-lifting rule | ✅ Implemented | 2D angles from a single camera |
| Fatigue indicator | 🟡 Rough proxy | Head droop + slouch + stillness; not validated |
| Fall + man-down rule | ✅ Implemented | Distinguishes bending from falling |
| PPE rule (helmet, vest, IoA zones) | ✅ Rule implemented | Needs a trained ONNX model for live PPE |
| YOLOv8 ONNX PPE detector | 🟡 Code ready, weights not included | Live PPE is "UNCERTAIN" until a model is loaded |
| Risk score, severity, hysteresis | ✅ Implemented | |
| Violation lifecycle (debounce, grace, cooldown) | ✅ Implemented | |
| IndexedDB storage (Dexie) + JSON export | ✅ Implemented | Requires `vendor/dexie/dist/dexie.mjs` |
| Offline support (service worker) | ✅ Implemented | |
| Kiosk mode (`?kiosk=1`) | ✅ Implemented | Auto-start, self-healing camera, wake lock |
| Python reference pipeline + FastAPI/WebSocket | ✅ Implemented | Includes danger zones |
| Face-blur privacy filter | 🗺 Roadmap | Not implemented |
| Web Worker inference | 🗺 Roadmap | Engine is worker-ready but runs on the main thread |
| Audio alerts | 🗺 Roadmap | Visual alerts only |
| CSV / PDF reports | 🗺 Roadmap | JSON export only |
| IP camera (RTSP) input | 🗺 Roadmap | Needs a local stream gateway |
| Webhook / ERP integration | 🗺 Roadmap | Python version has REST + WebSocket |

---

## 3. How it works

```
 Camera frame
      │
      ▼
 ┌──────────────────────────┐
 │ 1. Ingestion             │  getUserMedia → hidden <video>
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐
 │ 2. AI inference          │  MediaPipe Pose Lite  → 33 landmarks
 │   (WASM, local)          │  YOLOv8 via ONNX Web  → helmet / vest boxes (optional)
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐
 │ 3. Rule + risk engine    │  ppeRule · postureRule · fallRule
 │   (engine/, no DOM)      │  → ViolationTracker → riskScorer → severity
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐
 │ 4. UI                    │  Canvas overlay · worker cards · KPI cards · event log
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐
 │ 5. Local persistence     │  IndexedDB (Dexie) · JSON export
 └──────────────────────────┘
```

**Frame loop.** Every ~100 ms (about 10 FPS) `app.js` hands the current video frame to `VisionPipeline`. The pipeline runs pose estimation, optionally runs the YOLO PPE model, builds one "worker" object per detected person (pixel landmarks, bounding box, PPE info) and passes the frame to `RiskEngine.processFrame()`. The engine returns per-worker findings, scores and incidents, and emits events that the UI and storage layer listen to.

**Design principles**

- **Uncertain is a first-class answer.** If evidence is missing (low confidence, occluded torso, no landmarks, no PPE model), the rule returns `UNCERTAIN` or `SKIPPED` with **0 penalty points**. The system never accuses a worker without evidence.
- **Engine has no DOM access.** `engine/` is pure ES-module JavaScript that runs in the browser, a Web Worker or Node.js.
- **Everything configurable lives in `engine/config.js`.**
- **Zero backend.** Static files only.

---

## 4. The safety rules in detail

### 4.1 Geometry primitives (`engine/geometry.js`)

| Function | Meaning |
|---|---|
| `angleAt(a, b, c)` | Angle at vertex `b` between rays `b→a` and `b→c`: `acos(dot / (\|v1\|·\|v2\|))`, cosine clamped to [−1, 1]. ~180° is a straight joint. |
| `angleFromVertical(a, b)` | Inclination of a segment from vertical: `atan2(horizontal, vertical)`. 0° upright, 90° horizontal. |
| `iou(a, b)` | Intersection over union of two boxes. |
| `ioa(a, b)` | Intersection over the area of **box a** only. Used for PPE because a helmet box is tiny next to a person box, so IoU stays low even when the helmet is worn. |

Boxes may be arrays or objects (`x1/y1/x2/y2`, `xmin…`, `minX…`, `left/top…`, or `x/y/width/height`).

### 4.2 PPE rule (`engine/rules/ppe.js`)

1. The person box is sliced into a **head region** (top 0–28% of height) and a **torso region** (20–65%).
2. A hardhat counts as present if its confidence is ≥ **0.4** and `ioa(hardhatBox, headRegion)` ≥ **0.5**. A vest uses the torso region with the same limits.
3. Outcomes: `COMPLIANT`, `VIOLATION` (no candidate, or candidate outside the region), or `UNCERTAIN` (low confidence, malformed or zero-area box, malformed confidence).
4. People under **120 px** tall are `SKIPPED`. Person confidence below **0.5** is `UNCERTAIN`.
5. Labels containing "no" (for example `NO-Hardhat`) are ignored as positive detections.
6. When no PPE model is loaded, the adapter supplies a sentinel (`detected: true`, `confidence: 0.2`) so the rule returns `UNCERTAIN` and scores 0.

### 4.3 Posture rule (`engine/rules/posture.js`)

- **Trunk angle:** line from mid-shoulder to mid-hip against vertical.
- **Neck angle:** line from ear (or mid-ear) to mid-shoulder against vertical.
- **Knee angles:** hip–knee–ankle for each leg; the smaller is used.

| Condition | Result |
|---|---|
| Trunk ≥ **45°** and knees ≥ **150°** (straight) | `UNSAFE_LIFTING` violation, `HIGH` |
| …and trunk ≥ **60°** | `CRITICAL` |
| Trunk ≥ 45° with bent knees | `SAFE` (squat lift) |
| Trunk > 28° | `SLOUCHING` (medium, not scored by itself) |
| Neck > 35° | `FORWARD_HEAD` (medium, not scored by itself) |

The returned `rebaRiskScore` is a **label mapped from the severity (8/7/3/1)**. It is *not* a computed REBA score.

If shoulders or hips are not visible (visibility < 0.5) the result is `UNCERTAIN`; with no landmarks it is `SKIPPED`.

### 4.4 Fatigue indicator (inside `posture.js`)

Three timers accumulate per worker:

| Signal | Rule | Weight |
|---|---|---|
| Head droop | neck > 40° (decays at 2× speed when recovered) | up to 0.50 |
| Slouching | trunk > 28° (decays at 1×) | up to 0.30 |
| Immobility | box centre moves < 8 px | up to 0.20 |

`fatigueScore = min(1, droop + slouch + immobility)`. A worker is flagged as fatigued if the score is ≥ **0.60**, or there are 2+ indicators, or droop lasts ≥ **3 s**. This is a **proxy**, not a medical or validated measure; treat it as "possible low alertness".

### 4.5 Fall rule (`engine/rules/fall.js`)

A naive "box wider than tall" test also fires when someone bends over. This rule separates the two:

1. **Aspect ratio** (height ÷ width) must collapse to ≤ **0.85**; otherwise no fall.
2. If it collapsed but landmarks are missing or unreliable → `UNCERTAIN` (never auto-confirmed).
3. If the **legs support the pelvis** (hips at least 18% of body height above the ankles/knees, leg axis within 50° of vertical) → the person is bending or reaching, **not** fallen.
4. Otherwise, if the **torso is within 30°** of the floor → floor posture.
5. Floor posture for ≥ **333 ms** → `FALLEN` (violation, 88% confidence, severity HIGH).
6. Floor posture for ≥ **5 s** → `FALLEN_INACTIVE` with `emergencyAlert: true` (96% confidence, severity CRITICAL, the "man-down" case).
7. Rapid descent (box centre drops ≥ 8% of body height within a 600 ms window) is only an `UNCERTAIN` "awaiting confirmation" warning worth 0 points.

### 4.6 Violation lifecycle (`engine/violationTracker.js`)

A per-worker, per-rule state machine (`workerId:ruleType`):

```
INACTIVE ──violation──▶ DEBOUNCING ──persists ≥ debounce──▶ ACTIVE ──┐
    ▲                        │ flicker                                │ repeats suppressed
    │                        ▼                                        ▼
    └────── RESOLVED ◀── compliant / grace expired ◀──────────── COOLDOWN
```

| Timing | Default | Purpose |
|---|---|---|
| Onset debounce | 167 ms | A violation must persist before alerting |
| Grace period | 500 ms | Short loss of evidence keeps the incident open |
| Cooldown | 15 000 ms | Same alert is not repeated; a higher severity still escalates |

Events are emitted as `violation:started`, `violation:escalated` and `violation:resolved`. Out-of-order timestamps are ignored. *(The bundled demo `app.js` creates the engine with `onsetDebounceMs: 0` for instant feedback; fall detection keeps its own 333 ms confirmation.)*

### 4.7 Risk score and severity (`riskScorer.js`, `severity.js`)

**Score:** a probabilistic union of the penalties of all confirmed violations:

```
score = 100 × ( 1 − ∏ (1 − pᵢ / 100) )
```

| Violation | Base points |
|---|---|
| FallEvent | 90 |
| MissingHardhat | 55 |
| WorkerFatigue | 45 |
| UnsafePosture | 40 |
| MissingVest | 35 |

Examples: missing hardhat + missing vest → `1 − 0.45×0.65` = **70.75**; add unsafe posture → `1 − 0.45×0.65×0.60` = **82.45**. The score never exceeds 100 and each extra violation adds less than the one before. Only `VIOLATION` findings contribute. The same formula combines workers into the frame's overall score.

**Severity tiers:** LOW < 25 ≤ MEDIUM < 50 ≤ HIGH < 75 ≤ CRITICAL.
**Hysteresis:** upgrades are immediate, but a downgrade requires the score to fall **5 points below** the boundary (CRITICAL only drops once the score is below 70), which stops the badge flickering.

---

## 5. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), Bootstrap 5, HTML5 Canvas |
| Pose estimation | MediaPipe Tasks Vision, PoseLandmarker **Lite** (`.task` model, WebAssembly, GPU delegate with CPU fallback) |
| PPE detection | YOLOv8 exported to ONNX, run with ONNX Runtime Web (WASM) |
| Storage | IndexedDB through Dexie.js |
| Offline | Service worker pre-cache + web app manifest |
| Engine tests | Node.js built-in `assert` (Node 22+) |
| Python reference | OpenCV, MediaPipe, Ultralytics YOLO, Pydantic, FastAPI, Uvicorn |

All browser dependencies are **vendored locally** in `frontend-demo/vendor/`, so there is no CDN dependency at runtime.

---

## 6. Repository structure

```
ErgoGuard-AI/
├── README.md
├── LICENSE                         MIT
├── .agent/rules/ergoguard.md       Coding rules for AI assistants (vanilla JS, no DOM in engine, zero backend)
│
├── engine/                         Pure JS safety engine (no DOM access)
│   ├── config.js                   All thresholds, penalties and timings
│   ├── geometry.js                 angleAt, angleFromVertical, iou, ioa
│   ├── riskEngine.js               Orchestrator (EventTarget): processFrame(), reset()
│   ├── riskScorer.js               Probabilistic risk score
│   ├── severity.js                 Severity tiers + hysteresis
│   ├── violationTracker.js         Debounce / grace / cooldown state machine
│   └── rules/
│       ├── ppe.js                  Hardhat and vest compliance
│       ├── posture.js              Ergonomic posture + fatigue indicator
│       └── fall.js                 Fall + man-down detection
│
├── frontend-demo/                  Browser app (no build step)
│   ├── index.html · style.css · app.js
│   ├── visionPipeline.js           Camera frame → engine worker objects
│   ├── poseDetector.js             MediaPipe PoseLandmarker wrapper
│   ├── ppeDetector.js              YOLOv8 ONNX wrapper + NMS
│   ├── adapter.js                  Normalises frame payloads
│   ├── fixtures.js                 Six replayable test scenarios
│   ├── storage.js                  Dexie / IndexedDB service
│   ├── sw.js · manifest.json       Offline cache + PWA manifest
│   ├── models/                     pose_landmarker_lite.task (YOLO .onnx goes here)
│   └── vendor/                     MediaPipe, ONNX Runtime, Dexie, Bootstrap (local copies)
│
├── tests/                          JS unit tests + browser verification scripts
├── docs/modules/                   Short module notes (geometry, ppe)
│
└── project aithon/                 Python reference implementation (original hackathon backend)
    ├── main.py · api_server.py · run_tests.py
    ├── config.yaml · sample_danger_zones.json · requirements.txt
    ├── src/{detectors,pipeline,models,output,utils}/
    ├── examples/ · output/ · tests/
```

> The Python folder name contains a space, so quote it in shell commands: `cd "project aithon"`.

---

## 7. Getting started

### 7.1 Prerequisites

- A modern Chromium-based browser (Chrome or Edge recommended) for the demo.
- **Node.js 22+** to run the engine tests.
- **Python 3.10+** only if you want the Python reference pipeline.

### 7.2 Run the browser demo

The app uses ES modules, so it must be served over HTTP from the **repository root** (opening `index.html` directly will not work).

```bash
# from the repository root
python -m http.server 8000
# or
npx serve .
```

Open **http://localhost:8000/frontend-demo/** (for `npx serve`, use the port it prints).

> `localhost` counts as a secure context, so the camera works. Any other address needs **HTTPS** (see [Section 11](#11-deployment-sharing-and-kiosk-mode)).

### 7.3 Two modes

- **Live Camera (AI):** click **Start Camera & Monitoring**, allow camera access, and stand in view. The skeleton, boxes, risk cards and incident log update live.
- **Simulation / Fixtures:** works with no camera. Pick a scenario and press **Process Frame** or **Stream @ 5Hz**:
  1. Standard inspection (missing vest and bent trunk)
  2. Fully compliant worker
  3. Missing hardhat and unsafe stoop
  4. Fall phase 1: rapid vertical descent (uncertain)
  5. Fall phase 2: fallen on floor (confirmed)
  6. Ergonomic fatigue (prolonged head droop and immobility)

  You can also paste your own frame JSON ([format below](#8-using-the-engine-as-a-library)).

### 7.4 Enable PPE detection with a YOLO model

PPE detection needs an ONNX model that is **not included** in this repo.

1. Obtain a YOLOv8 PPE model and export it to ONNX at 640×640 (`yolo export model=best.pt format=onnx imgsz=640`).
2. Save it as `frontend-demo/models/yolov8n-ppe.onnx`, **or** upload it from the "Load Custom YOLOv8 PPE ONNX Model" panel in the app.
3. If the model's class order differs from the default `['helmet','vest','goggles','gloves','boots']`, pass the correct list through the `classes` option of `LocalPPEDetector`. **Class names should be lowercase** so the helmet/vest matching works (it matches names containing `helmet`, `hardhat`, `vest`, `hi-vis`).
4. The output tensor must be `[1, 4 + numClasses, 8400]` (standard YOLOv8 detection export).

Until a model is loaded the badge reads "PPE MODEL NOT AVAILABLE" and PPE is reported as `UNCERTAIN` with zero penalty.

### 7.5 Run the tests

```bash
node --test tests/*.test.js           # 11 engine test files
python "project aithon/run_tests.py"  # 6 Python tests
```

### 7.6 Run the Python reference pipeline

```bash
cd "project aithon"
pip install -r requirements.txt
python run_tests.py                   # self-contained test runner
python main.py --source mock          # synthetic demo, no camera/GPU needed
python main.py --source 0             # webcam
python main.py --source video.mp4 --save-video output/annotated.mp4
python api_server.py                  # REST + WebSocket (port 8000)
```

If you run the browser demo and the API server at the same time, give one of them a different port.

---

## 8. Using the engine as a library

The engine is independent of the demo UI and can be used in any app, Web Worker or Node script.

```js
import { RiskEngine } from './engine/riskEngine.js';

const engine = new RiskEngine({
  onsetDebounceMs: 167,      // violation must persist this long before alerting
  gracePeriodMs: 500,        // tolerance for brief loss of evidence
  cooldownMs: 15000,         // suppress duplicate alerts
  riskUpdateIntervalMs: 200, // max 5 Hz risk:updated events
});

engine.addEventListener('violation:started', (e) => console.log(e.detail));
const result = engine.processFrame(framePayload);
```

### Events

| Event | When | `e.detail` |
|---|---|---|
| `risk:updated` | At most every 200 ms | `{ frameId, timestamp, workers:[{trackId, riskScore, severity}], overallScore, overallSeverity }` |
| `violation:started` | Violation persisted past debounce | `{ workerId, ruleType, incident, frameId, timestamp }` |
| `violation:escalated` | Active incident reached a higher severity | same shape |
| `violation:resolved` | Compliant, or grace expired | same shape |

`incident` = `{ id, workerId, ruleType, severity, startedAtMs, lastSeenAtMs, durationMs, details }`.
Rule types: `MissingHardhat`, `MissingVest`, `UnsafePosture`, `WorkerFatigue`, `FallEvent`.

### Input frame (`processFrame`)

```json
{
  "frame_id": 142,
  "timestamp": 1729332930450,
  "camera_id": "cam_floor_01",
  "workers": [
    {
      "track_id": 1,
      "bbox": { "x1": 150, "y1": 120, "x2": 290, "y2": 520, "confidence": 0.94 },
      "ppe": {
        "helmet": { "detected": true,  "confidence": 0.92, "bounding_box": [190, 120, 250, 180] },
        "vest":   { "detected": false, "confidence": 0.15, "bounding_box": null }
      },
      "landmarks": {
        "11": { "x": 200, "y": 220, "z": 0, "visibility": 0.9 },
        "12": { "x": 240, "y": 220, "z": 0, "visibility": 0.9 },
        "23": { "x": 190, "y": 340, "z": 0, "visibility": 0.85 },
        "24": { "x": 230, "y": 340, "z": 0, "visibility": 0.85 }
      }
    }
  ]
}
```

- `timestamp` may be epoch milliseconds or an ISO string.
- `landmarks` may be an array of 33 points or an object keyed by MediaPipe index. Useful indices: ears 7/8, shoulders 11/12, hips 23/24, knees 25/26, ankles 27/28.
- Coordinates should be **pixels** in the same space as `bbox`.

### Return value

```js
{
  frameId, timestamp,
  workers: [{ trackId, bbox, riskScore, severity, rawSeverity, findings, breakdown, posture, fall }],
  activeIncidents: [ /* incident objects */ ],
  overallRisk: { score, severity }
}
```

To run the engine in a Web Worker, create it inside the worker, send frames with `postMessage`, and forward its events back. The engine already has no DOM access.

---

## 9. Configuration reference

All defaults are in **`engine/config.js`**.

| Group | Key | Default |
|---|---|---|
| Confidence | `minConf.person / hardhat / vest / landmark` | 0.5 / 0.4 / 0.4 / 0.5 |
| Posture | `trunkBendDeg` · `stoopTrunkDeg` · `straightKneeDeg` | 60 · 45 · 150 |
| PPE | `headRegion` · `torsoRegion` | [0, 0.28] · [0.2, 0.65] |
| PPE | `hardhatIoA` · `vestIoA` · `minPersonHeightPx` | 0.5 · 0.5 · 120 |
| Penalties | Fall · Hardhat · Fatigue · Posture · Vest | 90 · 55 · 45 · 40 · 35 |
| Severity | Medium · High · Critical cut-offs | 25 · 50 · 75 |
| Severity | `severityHysteresis` | 5 |
| Timing (ms) | debounce · grace · cooldown | 167 · 500 · 15 000 |
| Timing (ms) | fall confirmation · fall recovery timeout | 333 · 5 000 |
| Timing (ms) | fatigue dwell · immobility · risk update | 2 000 · 15 000 · 200 |
| Fall | `aspectRatioThreshold` · `torsoAngleThresholdDeg` · `normalizedVelocityThreshold` | 0.85 · 30 · 0.08 |

Some posture thresholds are currently **hard-coded in `rules/posture.js`** (slouch 28°, forward head 35°, head droop 40°, immobility 8 px). Moving them into `config.js` is on the roadmap.

The Python version is configured through `project aithon/config.yaml` and `sample_danger_zones.json`.

---

## 10. Data, storage and privacy

- **Nothing leaves the device.** Video frames, images and landmarks are processed in memory and discarded. No code sends them to any server.
- **What is stored** (IndexedDB database `ErgoGuardDB`, in the browser only):
  - `inspections`: overall score, severity, worker count, per-worker summary. At most one record per second unless the score changes.
  - `violations`: incident id, worker, rule, severity, start/last-seen/resolved times and duration.
  - `settings`: reserved.
- **Export:** the History panel exports inspections and violations as JSON, and can clear all records.
- **Locality:** data lives in one browser on one computer. Another PC or browser sees nothing.
- **Offline:** `sw.js` pre-caches the app, engine, vendor libraries and the pose model so the app keeps working without internet.
- **Employee monitoring:** if you use this on real staff, the employer remains responsible for informing workers, obtaining any consent required and complying with applicable privacy and labour law. The fatigue indicator in particular should **not** be used for discipline.

---

## 11. Deployment, sharing and kiosk mode

### Sharing a link

The app is **static files only**, so any free static host works (Netlify, Cloudflare Pages, Vercel, GitHub Pages).

1. Make sure `frontend-demo/vendor/dexie/dist/dexie.mjs` is **in the repository**. The default `.gitignore` ignores folders named `dist`; remove that rule for this folder (or relocate the file and update the import in `storage.js`), otherwise the hosted app fails to load.
2. Publish the **whole repository** (the app imports `../engine/`), with the site root at the repo root. The app then lives at `https://<your-site>/frontend-demo/`.
3. **HTTPS is required** for camera access (free hosts provide it). A plain `http://192.168…` address will not allow the camera.
4. `ppeDetector.js` points ONNX Runtime to `/frontend-demo/vendor/ort/`, so host at a domain root (Netlify, Cloudflare, Vercel, or a custom domain). On a GitHub Pages *project* site (`/<repo>/…`) that path breaks, which only matters once a PPE model is loaded.
5. For a quick demo from your laptop, expose the local server through a tunnel (for example ngrok or Cloudflare Tunnel) to get a temporary HTTPS link.

Each visitor runs the AI on **their own device and camera**; the first load downloads roughly 90 MB, then it is cached. Visitors without a camera can use Simulation mode.

### Kiosk mode (unattended workstation)

Open the app with **`?kiosk=1`**:

```
http://localhost:8000/frontend-demo/index.html?kiosk=1
```

Kiosk mode (an appended block at the end of `app.js`, with a small matching block in `style.css`):

- starts the camera automatically once the pose model has loaded;
- hides operator controls (press **Ctrl+Alt+K** to show or hide them);
- checks every 5 s and restarts the camera if it is unplugged or the engine goes quiet for 15 s;
- requests a screen **Wake Lock** so the display does not sleep;
- reloads the page every 6 hours, only when no incident is active, to release memory.

**Setting up the workstation PC**

1. Run a local web server automatically at startup (serving the repo root).
2. Create a Chrome/Edge shortcut to the `?kiosk=1` address with the browser's `--kiosk` option, and put it in the startup folder.
3. Open it once, allow the camera and remember the choice.
4. Disable sleep and screen-off in the OS power settings, enable automatic login, and avoid update restarts during shifts.

### IP cameras

Browsers cannot play **RTSP**, which most industrial cameras use. Place a small local gateway on the factory network (for example go2rtc or MediaMTX) that republishes the stream as WebRTC, HLS or MJPEG with CORS enabled, and feed that into the `<video>` element. The pipeline already accepts any `<video>` source, so only the input changes. This is **not built into the app yet**.

---

## 12. Testing

| Suite | Command | What it covers |
|---|---|---|
| Engine unit tests | `node --test tests/*.test.js` | geometry, PPE, posture, fall (incl. scenarios), tracker, scorer, severity, engine, vision pipeline, storage logic |
| Python tests | `python "project aithon/run_tests.py"` | geometry, schemas, danger zones, fall, posture, end-to-end pipeline |
| Browser verification | `node tests/browserVerification.mjs` · `node tests/offlineVerification.mjs` | End-to-end and offline checks using headless Chrome |

Notes:

- The two browser verification scripts use a **Windows Chrome path** (`C:\Program Files\Google\Chrome\Application\chrome.exe`); edit it for macOS or Linux.
- The storage test uses an **in-memory mock**, not real Dexie/IndexedDB.
- All tests use **hand-made inputs**. They verify that the logic behaves as designed, **not** that detection is accurate on real footage.

---

## 13. Known limitations and honest status

**Accuracy**
- Accuracy, precision, recall and false-alarm rates have **not been measured** on labelled real video. Thresholds are sensible defaults, not tuned values.
- Angles come from a **single 2D camera**, so results depend on the viewing direction. Overhead or very oblique cameras and distant (small) workers perform poorly.
- MediaPipe Pose Lite can fail with occlusion, bulky clothing and small people. The browser pipeline tracks up to 2 people.
- A fall behind equipment (no pose) is reported as uncertain, so it can be missed. People working lying down (for example under vehicles) may look like falls.
- The "REBA" value is a label, not a REBA calculation. The fatigue indicator is a rough proxy.
- "Unsafe lifting" fires on a forward bend with straight knees, with or without a load.

**PPE**
- No trained PPE weights are included; live PPE is `UNCERTAIN` until a model is loaded.
- Detected items are not matched to individual workers yet: the first helmet and vest found in the frame is used for everyone.
- The Python PPE check uses an HSV colour heuristic (white helmet on a white wall, or a yellow shirt, can fool it); its YOLO model is loaded but its detections are not passed to the check.

**Architecture**
- Browser track IDs are list positions (`index + 1`), so two people swapping order can swap histories. The Python tracker (IoU + distance) is more stable but simple.
- Inference runs on the **main thread** (about 10 FPS), not in a Web Worker.
- Zero backend means: one always-open viewer per camera, history stored per browser, and no push, SMS or email alerts when nobody is watching.
- Webcam only. Industrial IP cameras need a gateway.
- Each browser tab runs its own inference, so only a few cameras per PC are realistic.
- Some thresholds are hard-coded rather than in `config.js`; `app.js` reads `minKneeAngleDeg`, which the posture rule does not return (the knee readout shows N/A).
- `.gitignore` ignores `dist` folders, which drops `vendor/dexie/dist/` from fresh clones (see [Troubleshooting](#16-troubleshooting)).

**Safety**
- This is decision support. It is **not** a certified safety function (for example under ISO 13849) and must not replace guards or emergency stops.

---

## 14. Roadmap

1. Build a labelled evaluation set from real workstations and report precision, recall and false alarms per hour.
2. Integrate a trained PPE model and match detections to each worker with `ioa()`.
3. Run a person detector first and pose on each person's crop; add a robust tracker (for example ByteTrack).
4. Move the engine and inference into Web Workers.
5. Posture exposure reporting: minutes spent in risky posture per shift, with real REBA/RULA scoring validated against an ergonomist.
6. CSV and PDF shift reports (jsPDF).
7. Audio alerts and an optional small local service for siren/SMS and shared storage.
8. Face-blur privacy filter for the on-screen view.
9. RTSP support through a local gateway, with camera-placement guidance.
10. Move remaining thresholds into `config.js`.

---

## 15. The Python reference implementation

`project aithon/` is the original hackathon backend. It produces the same detection contract and adds **danger-zone** monitoring.

**Pipeline** (`src/pipeline/safety_pipeline.py`): YOLOv8n person detection (class 0, confidence ≥ 0.35) → `SimpleTracker` (IoU > 0.3, then centroid distance < 120 px) → PPE → posture and fatigue → fall → danger zones → a typed Pydantic `DetectionFramePayload` → JSON/JSONL export and API.

**Danger zones** (`sample_danger_zones.json`): polygons in normalised or pixel coordinates. A worker is "inside" when the foot point (bottom-centre of the box) is in the polygon (ray casting). Zones can set a maximum dwell time (0 means no entry allowed) and required PPE; violations include unauthorised entry, dwell exceeded and in-zone PPE failure.

**API server** (`python api_server.py`):

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Service status |
| `GET /api/detections/latest` | Latest detection JSON |
| `GET /api/danger-zones` | Configured zones |
| `WS /ws/detections` | Live stream of detection frames |
| `/docs` | Swagger UI |

**Differences from the JS engine.** The Python fall detector flags a fall when the aspect ratio is low **or** the torso is near horizontal, and counts frames instead of milliseconds, so bending over can trigger it. The JS engine is the improved version ("fall-detection-fix"). Python PPE uses colour heuristics and timestamps use wall-clock time.

**Detection JSON (summary).** Each frame contains `version`, `timestamp`, `frame_id`, `camera_id`, `fps_processing`, a `summary` (worker, PPE, posture, fatigue, fall, zone and alert counts), a `workers` array (`bbox`, `ppe`, `posture`, `fatigue`, `fall`, `danger_zone`, `violations`), the `danger_zones` with live occupancy, and `critical_alerts`. See `project aithon/examples/standard_detection_output.json` for a full example.

---

## 16. Troubleshooting

| Problem | Cause and fix |
|---|---|
| Page is blank or the console says it cannot load `dexie.mjs` | `frontend-demo/vendor/dexie/dist/dexie.mjs` is missing (ignored by `.gitignore`). Restore the Dexie `dist` folder, or point the import in `storage.js` at an existing Dexie module. |
| Camera does not start | Use `localhost` or HTTPS, allow the permission, and close other apps using the camera. |
| Modules fail with CORS errors | Do not open `index.html` as a file. Serve the repository root over HTTP. |
| "PPE MODEL NOT AVAILABLE" | Expected until you add `models/yolov8n-ppe.onnx` or upload one. |
| PPE labels are wrong or never match | Check the model's class order and use lowercase class names. |
| PPE model fails to load when hosted | ONNX Runtime path is `/frontend-demo/vendor/ort/`; host at the domain root. |
| Pose model slow or fails | The GPU delegate falls back to CPU automatically; use a lighter resolution or a faster PC. |
| Offline mode does not cache everything | Pre-caching is all-or-nothing; a missing file (like the Dexie dist) stops it. Fix missing files and reload. |
| `node --test` fails on import syntax | Use Node 22 or newer. |
| Port 8000 already in use | Run the demo server and the Python API server on different ports. |

---

## 17. License and acknowledgements

Released under the **MIT License** (see [`LICENSE`](LICENSE)).

Built with: [MediaPipe](https://ai.google.dev/edge/mediapipe) (Pose Landmarker), [ONNX Runtime Web](https://onnxruntime.ai/), [Ultralytics YOLOv8](https://docs.ultralytics.com/), [Dexie.js](https://dexie.org/), [Bootstrap 5](https://getbootstrap.com/), OpenCV, Pydantic and FastAPI. Check the licence of any third-party model weights you add (YOLOv8 tooling is AGPL-3.0).
