# Workplace Safety AI — Computer Vision System

> **Role: Member 3 — AI / Computer Vision**
>
> **Project Scope**: Industrial workplace safety monitoring — detect worker fatigue, unsafe posture, missing protective equipment (PPE), worker falls, and danger-zone intrusions, outputting a standardized Detection JSON format for frontend and backend teammates.

---

## 📋 Member 3 Deliverables Checklist

- [x] **PPE Detection**: Detects Hardhat/Helmet, High-Visibility Safety Vest, and flags non-compliance.
- [x] **Posture & Fatigue Detection using MediaPipe**:
  - Unsafe lifting & bending analysis (REBA ergonomics: spine inclination vs straight knee flexion).
  - Worker fatigue tracking (prolonged head droop, lethargic immobility, slumped posture, fatigue score $0.0 - 1.0$).
- [x] **Fall Detection**:
  - Bounding box aspect ratio collapse ($H/W < 0.85$).
  - Torso horizontal alignment with floor ($< 30^\circ$).
  - Vertical descent velocity tracking.
  - Floor persistence timer and Man-Down Emergency alerting.
- [x] **Danger-Zone Detection**:
  - Configurable polygonal exclusion zones (pixel or normalized coordinates).
  - Worker foot-point ray-casting containment.
  - Dwell time tracking and unauthorized presence alarms.
  - Mandatory PPE enforcement in specific hazard zones (e.g. crane swing or forklift lane).
- [x] **Standard Detection JSON Generation**:
  - Production-grade typed schema (Pydantic models) with automated file snapshots (`output/detections.json`) and streaming JSONL (`output/detections.jsonl`).
- [x] **Frontend & Backend Integration Server**:
  - FastAPI REST endpoints (`/api/detections/latest`, `/api/danger-zones`, `/api/health`) and real-time WebSocket (`/ws/detections`).

---

## 🏗️ Repository Architecture

```
project-aithi/
├── README.md                      # Comprehensive documentation & JSON contract for teammates
├── requirements.txt               # Project dependencies
├── config.yaml                    # Configurable thresholds, camera settings, and models
├── sample_danger_zones.json       # Geofenced danger zones definition
├── main.py                        # Central CLI runner (webcam, video file, or synthetic mock)
├── api_server.py                  # FastAPI + WebSocket server for frontend integration
├── run_tests.py                   # Self-contained test suite runner
│
├── src/
│   ├── config.py                  # Configuration loader with safe fallbacks
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py             # Standard Detection JSON schemas (Pydantic)
│   ├── detectors/
│   │   ├── __init__.py
│   │   ├── base.py                # Base detector interface
│   │   ├── ppe_detector.py        # Helmet & Vest detector (YOLO + heuristic color analysis)
│   │   ├── posture_detector.py    # MediaPipe Pose & Ergonomic fatigue tracker
│   │   ├── fall_detector.py       # Aspect ratio, torso angle & floor immobility detector
│   │   └── danger_zone_detector.py# Polygonal exclusion geofencing & dwell tracker
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── tracker.py             # Multi-worker persistent track_id assigner
│   │   ├── visualizer.py          # OpenCV HUD, zone polygons & bounding box renderer
│   │   └── safety_pipeline.py     # Master pipeline orchestrator
│   ├── output/
│   │   ├── __init__.py
│   │   └── json_exporter.py       # JSON snapshot and JSONL streaming exporter
│   └── utils/
│       ├── __init__.py
│       ├── geometry.py            # Angles, distance & ray-casting polygon containment
│       └── logger.py              # Structured logging utility
│
├── examples/
│   ├── standard_detection_output.json # Sample detection JSON payload for frontend team
│   └── generate_synthetic_demo.py     # End-to-end simulated verification script
│
└── tests/
    ├── test_geometry.py           # Mathematical & geometry test cases
    ├── test_schemas.py            # Pydantic JSON structure tests
    ├── test_danger_zone.py        # Zone containment & PPE rule tests
    ├── test_fall.py               # Fall & floor persistence tests
    ├── test_posture.py            # MediaPipe lifting posture & fatigue tests
    └── test_pipeline.py           # End-to-end pipeline test
```

---

## 📡 Standard Detection JSON Contract (For Frontend & Backend)

The pipeline produces the following standardized JSON format every frame or detection tick:

```json
{
  "version": "1.0.0",
  "timestamp": "2026-10-19T10:15:30.450Z",
  "frame_id": 142,
  "camera_id": "cam_floor_01",
  "fps_processing": 29.4,
  "summary": {
    "total_workers": 3,
    "compliant_ppe_workers": 1,
    "unsafe_posture_count": 1,
    "fatigued_workers_count": 1,
    "active_falls_count": 0,
    "danger_zone_intrusions_count": 1,
    "total_violations_count": 3,
    "critical_alerts_count": 1
  },
  "workers": [
    {
      "track_id": 1,
      "bbox": {
        "x1": 150, "y1": 120, "x2": 290, "y2": 520,
        "confidence": 0.94, "width": 140, "height": 400,
        "center_x": 220, "center_y": 320
      },
      "ppe": {
        "compliant": false,
        "helmet": { "detected": true, "confidence": 0.92 },
        "vest": { "detected": false, "confidence": 0.15 },
        "goggles": { "detected": false, "confidence": 0.0 },
        "gloves": { "detected": false, "confidence": 0.0 },
        "missing_required_ppe": ["vest"]
      },
      "posture": {
        "status": "UNSAFE_LIFTING",
        "risk_level": "HIGH",
        "confidence": 0.88,
        "angles": {
          "trunk_inclination_deg": 52.4,
          "neck_flexion_deg": 38.1,
          "left_knee_angle_deg": 168.0,
          "right_knee_angle_deg": 172.5,
          "reba_risk_score": 7
        },
        "description": "Dangerous lifting technique detected! Trunk bent 52.4 deg with straight knees."
      },
      "fatigue": {
        "is_fatigued": false,
        "fatigue_score": 0.28,
        "indicators": [],
        "head_droop_duration_seconds": 0.4,
        "immobility_seconds": 3.2,
        "description": "Worker alertness within normal ergonomic thresholds."
      },
      "fall": {
        "is_fallen": false,
        "state": "NORMAL",
        "confidence": 0.05,
        "time_on_ground_seconds": 0.0,
        "aspect_ratio": 2.86,
        "torso_angle_deg": 82.0,
        "emergency_alert": false
      },
      "danger_zone": {
        "is_inside": false,
        "zone_id": null,
        "zone_name": null,
        "severity": null,
        "time_in_zone_seconds": 0.0,
        "violation_type": null
      },
      "violations": [
        {
          "violation_type": "MISSING_PPE_VEST",
          "severity": "HIGH",
          "message": "Worker is missing high-visibility safety vest.",
          "timestamp": "2026-10-19T10:15:30.450Z",
          "zone_id": null
        }
      ]
    }
  ],
  "danger_zones": [
    {
      "zone_id": "DZ-02",
      "zone_name": "Forklift Transit Lane",
      "severity": "HIGH",
      "description": "Corridor for forklift operations. Pedestrians must not loiter.",
      "polygon": [[576.0, 216.0], [960.0, 216.0], [1088.0, 684.0], [512.0, 684.0]],
      "required_ppe": ["vest", "helmet"],
      "max_dwell_seconds": 5.0,
      "current_occupancy": 1
    }
  ],
  "critical_alerts": [
    {
      "violation_type": "DANGER_ZONE_DWELL_EXCEEDED",
      "severity": "HIGH",
      "message": "Dwell limit exceeded! Worker #2 has remained in Forklift Transit Lane for 7.8s.",
      "timestamp": "2026-10-19T10:15:30.450Z",
      "zone_id": "DZ-02"
    }
  ]
}
```

---

## 🚀 Quickstart & Setup

### 1. Installation

```bash
# Clone the repository
git clone <your-github-repo-url>
cd project-aithi

# Optional: Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Run Verification Tests

All 6 test suites execute using standard library test runner:
```bash
python run_tests.py
```

### 3. Run Synthetic Demo (No camera or GPU required)

```bash
python main.py --source mock
# OR
python examples/generate_synthetic_demo.py
```
This generates:
- `output/detections.json` (Formatted snapshot)
- `output/detections.jsonl` (Real-time stream)
- `output/annotated_demo_frame.jpg` (Visual overlay)

### 4. Run on Live Webcam

```bash
python main.py --source 0
```

### 5. Run on Video File

```bash
python main.py --source test_warehouse.mp4 --save-video output/annotated.mp4
```

### 6. Run API / WebSocket Server for Teammates

```bash
python api_server.py
```
- Interactive Swagger docs: `http://localhost:8000/docs`
- Latest detection snapshot: `http://localhost:8000/api/detections/latest`
- Live WebSocket stream for React/Next.js dashboard: `ws://localhost:8000/ws/detections`

---

## ⚙️ Configuration (`config.yaml`)

Thresholds for all detectors can be tuned without modifying code:
- **PPE**: Minimum confidence, required equipment list (`["helmet", "vest"]`).
- **Posture & Fatigue**:
  - `trunk_inclination_unsafe_deg`: Angle threshold for unsafe bending ($45^\circ$).
  - `neck_flexion_unsafe_deg`: Forward head tilt limit ($35^\circ$).
  - `fatigue_dwell_frames`: Consecutive frames of drooping/slumping to flag worker fatigue.
- **Fall Detection**:
  - `aspect_ratio_fall_threshold`: Aspect ratio drop ($< 0.85$).
  - `torso_angle_horizontal_deg`: Torso floor angle ($< 30^\circ$).
  - `recovery_timeout_seconds`: Inactivity window before critical `MAN_DOWN_EMERGENCY`.
- **Danger Zones**: Geofence polygon coordinates and PPE enforcement rules.

---

## 📤 Pushing to GitHub

To push your completed computer vision work to your team's GitHub repository:

```bash
# 1. Initialize git (if not already done)
git init

# 2. Add all files
git add .

# 3. Create your commit
git commit -m "feat(ai-cv): Implement PPE, MediaPipe posture & fatigue, fall detection, danger zones, and standard detection JSON"

# 4. Link your remote GitHub repository
git remote add origin https://github.com/<YOUR_ORGANIZATION_OR_USERNAME>/<REPO_NAME>.git

# 5. Push to main branch
git branch -M main
git push -u origin main
```

Now your teammates can pull the repository and start building the frontend dashboard and backend services immediately using the standard JSON schema!
