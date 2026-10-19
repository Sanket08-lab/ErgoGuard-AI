"""
Synthetic Demo Generator for Safety AI Computer Vision.
Demonstrates:
1. Worker 1: Missing PPE vest + Unsafe Bending/Lifting Posture (MediaPipe simulated)
2. Worker 2: Danger Zone Intrusion (Forklift Lane) + Head Droop Fatigue
3. Worker 3: Fall Event (Aspect ratio collapse + horizontal torso on ground)
Generates standard JSON output and saves annotated frame for verification.
"""

import sys
import os
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import AppConfig
from src.pipeline.safety_pipeline import SafetyPipeline
from src.output.json_exporter import JSONExporter
from src.models.schemas import BoundingBox

try:
    import numpy as np
    import cv2
except ImportError:
    np = None
    cv2 = None


def run_synthetic_demo():
    print("=" * 70)
    print("Running Industrial Safety AI Computer Vision Demo (Member 3)")
    print("=" * 70)

    # 1. Initialize configuration and pipeline
    config = AppConfig.load_from_file("config.yaml")
    pipeline = SafetyPipeline(config=config)
    exporter = JSONExporter(
        json_file_path="output/detections.json",
        jsonl_stream_path="output/detections.jsonl"
    )

    # 2. Create synthetic test canvas
    h, w = 720, 1280
    if np is not None:
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        # Create subtle background warehouse texture
        frame[:] = (40, 42, 45)
        if cv2 is not None:
            cv2.putText(frame, "WAREHOUSE FLOOR CAM #01 - LIVE SIMULATION", (50, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (120, 120, 120), 2)
    else:
        frame = None

    # 3. Define 3 synthetic worker scenarios:
    # Worker 1: Upright, bending forward (lumbar stress), missing vest
    worker_1_box = BoundingBox(x1=160, y1=140, x2=290, y2=540, confidence=0.95)

    # Worker 2: Standing in forklift danger zone (center-right, X: 600-750)
    worker_2_box = BoundingBox(x1=600, y1=240, x2=740, y2=640, confidence=0.92)

    # Worker 3: Fallen on ground (low height, wide width: aspect ratio < 0.7)
    worker_3_box = BoundingBox(x1=880, y1=500, x2=1160, y2=620, confidence=0.89)

    manual_boxes = [worker_1_box, worker_2_box, worker_3_box]

    print("\nProcessing simulated frame with 3 worker scenarios...")

    # Run for 12 consecutive frames to trigger fall confirmation and fatigue tracking
    latest_payload = None
    annotated = None

    for f_idx in range(1, 15):
        annotated, latest_payload = pipeline.process_frame(
            frame=frame,
            frame_id=f_idx,
            manual_boxes=manual_boxes
        )

    # 4. Export standard Detection JSON
    json_str = exporter.export(latest_payload)

    # 5. Save annotated visualization image
    if annotated is not None and cv2 is not None:
        Path("output").mkdir(parents=True, exist_ok=True)
        cv2.imwrite("output/annotated_demo_frame.jpg", annotated)
        print("[OK] Annotated visual preview saved to: output/annotated_demo_frame.jpg")

    print(f"[OK] Standard Detection JSON saved to: {config.output.output_json_path}")
    print(f"[OK] Streaming JSONL appended to: {config.output.jsonl_path}")

    # 6. Display Summary to console
    s = latest_payload.summary
    print("\n" + "-" * 40 + " SUMMARY " + "-" * 40)
    print(f"  Total Workers Detected     : {s.total_workers}")
    print(f"  Compliant PPE Workers      : {s.compliant_ppe_workers}/{s.total_workers}")
    print(f"  Unsafe Postures Detected   : {s.unsafe_posture_count}")
    print(f"  Fatigued Workers           : {s.fatigued_workers_count}")
    print(f"  Active Fall Alarms         : {s.active_falls_count}")
    print(f"  Danger Zone Intrusions     : {s.danger_zone_intrusions_count}")
    print(f"  Total Active Violations    : {s.total_violations_count}")
    print(f"  Critical Emergency Alerts  : {s.critical_alerts_count}")
    print("-" * 89)

    print("\nActive Critical Alerts:")
    for alert in latest_payload.critical_alerts:
        print(f"  [!] [{alert.severity}] {alert.violation_type}: {alert.message}")

    print("\nWorker Details:")
    for w in latest_payload.workers:
        print(f"  Worker #{w.track_id}:")
        print(f"    - BBox: [{w.bbox.x1}, {w.bbox.y1}, {w.bbox.x2}, {w.bbox.y2}]")
        print(f"    - PPE: Helmet={w.ppe.helmet.detected}, Vest={w.ppe.vest.detected}, Compliant={w.ppe.compliant}")
        print(f"    - Posture: {w.posture.status.value} (Trunk: {w.posture.angles.trunk_inclination_deg}deg, Neck: {w.posture.angles.neck_flexion_deg}deg)")
        print(f"    - Fatigue: Score={w.fatigue.fatigue_score}, Alert={w.fatigue.is_fatigued}")
        print(f"    - Fall: State={w.fall.state.value}, AspectRatio={w.fall.aspect_ratio}")
        print(f"    - Danger Zone: Inside={w.danger_zone.is_inside} ({w.danger_zone.zone_name})")

    print("\n[OK] Verification complete! Standard Detection JSON is ready for frontend/backend teammates.")


if __name__ == "__main__":
    run_synthetic_demo()
