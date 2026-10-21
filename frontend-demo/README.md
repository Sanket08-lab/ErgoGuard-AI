# ErgoGuard-AI Temporary Frontend Demo & Integration Harness

> **Context:** This directory contains an isolated, temporary frontend demo designed for **integration testing and demonstrating the safety risk engine**. A teammate is independently developing the production frontend. This harness can be replaced at any time without touching any engine code.

---

## 1. How to Launch the Demo

Because modern web browsers enforce CORS restrictions on ES modules loaded via the `file://` protocol, you must serve the repository with a standard local HTTP server from the **repository root**:

### Option A: Using Node (`npx serve` or `npx http-server`)
```bash
# Run from repository root:
npx serve .
# Open: http://localhost:3000/frontend-demo/
```

### Option B: Using Python built-in server
```bash
# Run from repository root:
python -m http.server 8000
# Open: http://localhost:8000/frontend-demo/
```

---

## 2. Interface Contract for the Final Frontend

The safety engine lives inside `engine/riskEngine.js`. It runs in any standard JavaScript environment (Browser main thread, Web Worker, or Node.js) with **zero DOM access**.

### Import & Initialization
```javascript
import { RiskEngine } from '../engine/riskEngine.js';

// Initialize the engine orchestrator
const engine = new RiskEngine({
  onsetDebounceMs: 167,    // Debounce time before alerting on violation (~5 frames @ 30 FPS)
  gracePeriodMs: 500,      // Grace buffer before resolving temporary loss of detection
  cooldownMs: 15000,       // Cooldown window preventing duplicate alerts
  riskUpdateIntervalMs: 200 // Max 5 Hz emission rate for risk:updated events
});
```

### Event Bus Listeners
The engine extends the standard `EventTarget` interface. Subscribe to events using `addEventListener`:

| Event Name | Trigger Condition | Payload (`e.detail`) |
| :--- | :--- | :--- |
| `risk:updated` | Dispatched at max 5 Hz (>= 200ms) with per-worker & overall frame risk scores | `{ frameId, timestamp, workers: [{ trackId, riskScore, severity }], overallScore, overallSeverity }` |
| `violation:started` | Fired when a violation persists past onset debounce | `{ workerId, ruleType, incident: { id, workerId, ruleType, severity, startedAtMs, lastSeenAtMs, durationMs, details }, frameId, timestamp }` |
| `violation:escalated` | Fired when an ongoing incident jumps to a higher severity tier | `{ workerId, ruleType, incident, frameId, timestamp }` |
| `violation:resolved` | Fired when a worker returns to full compliance or grace expires | `{ workerId, ruleType, incident, frameId, timestamp }` |

### Input Format (`processFrame`)
Call `engine.processFrame(payload)` on each video frame:
```json
{
  "frame_id": 142,
  "timestamp": "2026-10-19T10:15:30.450Z",
  "camera_id": "cam_floor_01",
  "workers": [
    {
      "track_id": 1,
      "bbox": { "x1": 150, "y1": 120, "x2": 290, "y2": 520, "confidence": 0.94 },
      "ppe": {
        "helmet": { "detected": true, "confidence": 0.92, "bounding_box": [190, 120, 250, 180] },
        "vest": { "detected": false, "confidence": 0.15, "bounding_box": null }
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

### Return Object (`processFrame`)
```javascript
{
  frameId: 142,
  timestamp: 1729332930450,
  workers: [
    {
      trackId: 1,
      bbox: { ... },
      riskScore: 35,
      severity: "MEDIUM",
      findings: [ ... ],
      posture: { ... },
      fall: { ... }
    }
  ],
  activeIncidents: [ ... ],
  overallRisk: {
    score: 35,
    severity: "MEDIUM"
  }
}
```

---

## 3. How to Replace this Temporary Frontend

When the production frontend is ready:
1. **No engine changes needed:** All business logic, scoring formulas, severity classification, debounce timing, and fall/posture/PPE rules reside strictly in `engine/`.
2. **Web Worker Deployment:** For production, move `RiskEngine` instantiation into a dedicated Web Worker to prevent UI stutter on low-end industrial tablets. Pass frame detection payloads via `postMessage()`.
3. **Remove or Retain:** You can simply remove the `frontend-demo/` directory, or keep it as an offline regression test harness.
