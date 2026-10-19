"""
Master Safety AI Computer Vision Pipeline.
Orchestrates:
1. Worker Detection & Tracking
2. PPE Detection (Helmet, Vest)
3. Posture & Worker Fatigue Analysis (MediaPipe)
4. Fall Detection & Floor Inactivity Alerts
5. Danger Zone Intrusion & Dwell Tracking
6. Standard Detection JSON Payload Generation
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import time

from ..config import AppConfig
from ..detectors.danger_zone_detector import DangerZoneDetector
from ..detectors.fall_detector import FallDetector
from ..detectors.posture_detector import PostureDetector
from ..detectors.ppe_detector import PPEDetector
from ..models.schemas import (
    BoundingBox,
    DetectionFramePayload,
    FrameSummary,
    ViolationEvent,
    ViolationSeverity,
    WorkerDetection,
)
from .tracker import SimpleTracker
from .visualizer import Visualizer

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class SafetyPipeline:
    """
    Main Computer Vision pipeline orchestrating all four safety detection modules.
    """

    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or AppConfig()

        # Initialize sub-detectors
        self.ppe_detector = PPEDetector(
            model_path=self.config.ppe.model_path,
            confidence_threshold=self.config.ppe.confidence_threshold,
            required_ppe=self.config.ppe.required_ppe,
            enabled=self.config.ppe.enabled,
        )

        self.posture_detector = PostureDetector(
            min_detection_confidence=self.config.posture_fatigue.min_detection_confidence,
            min_tracking_confidence=self.config.posture_fatigue.min_tracking_confidence,
            model_complexity=self.config.posture_fatigue.model_complexity,
            trunk_unsafe_deg=self.config.posture_fatigue.trunk_inclination_unsafe_deg,
            trunk_severe_deg=self.config.posture_fatigue.trunk_inclination_severe_deg,
            neck_unsafe_deg=self.config.posture_fatigue.neck_flexion_unsafe_deg,
            knee_straight_deg=self.config.posture_fatigue.knee_flexion_straight_deg,
            head_droop_deg=self.config.posture_fatigue.head_droop_angle_deg,
            fatigue_dwell_frames=self.config.posture_fatigue.fatigue_dwell_frames,
            enabled=self.config.posture_fatigue.enabled,
        )

        self.fall_detector = FallDetector(
            aspect_ratio_threshold=self.config.fall.aspect_ratio_fall_threshold,
            torso_angle_threshold_deg=self.config.fall.torso_angle_horizontal_deg,
            velocity_descent_threshold_px=self.config.fall.velocity_descent_threshold_px,
            confirmation_frames=self.config.fall.confirmation_frames,
            recovery_timeout_seconds=self.config.fall.recovery_timeout_seconds,
            enabled=self.config.fall.enabled,
        )

        self.danger_zone_detector = DangerZoneDetector(
            zones_file=self.config.danger_zone.zones_file,
            enforce_ppe_rules=self.config.danger_zone.enforce_ppe_rules,
            enabled=self.config.danger_zone.enabled,
        )

        self.tracker = SimpleTracker()
        self.visualizer = Visualizer()

        # Frame rate calculation
        self.prev_frame_time = time.time()
        self.fps = 0.0

        # Person detector
        self.person_detector = None
        self._init_person_detector()

    def _init_person_detector(self) -> None:
        """Initialize YOLO detector for person bounding boxes."""
        if YOLO is not None:
            try:
                self.person_detector = YOLO("yolov8n.pt")
            except Exception as e:
                print(f"[SafetyPipeline] Note: YOLO model auto-loading postponed: {e}")

    def detect_persons(self, frame: Any) -> List[BoundingBox]:
        """Detect person bounding boxes in frame using YOLO."""
        if self.person_detector is None or frame is None:
            return []

        boxes = []
        try:
            results = self.person_detector(frame, classes=[0], verbose=False)
            for r in results:
                for b in r.boxes:
                    coords = b.xyxy[0].cpu().numpy()
                    conf = float(b.conf[0].cpu().numpy())
                    if conf >= 0.35:
                        boxes.append(BoundingBox(
                            x1=int(coords[0]),
                            y1=int(coords[1]),
                            x2=int(coords[2]),
                            y2=int(coords[3]),
                            confidence=round(conf, 2),
                        ))
        except Exception as e:
            print(f"[SafetyPipeline] Person detection error: {e}")

        return boxes

    def process_frame(
        self,
        frame: Any,
        frame_id: int = 0,
        manual_boxes: Optional[List[BoundingBox]] = None,
        camera_id: Optional[str] = None
    ) -> Tuple[Any, DetectionFramePayload]:
        """
        Process a single video frame through all detection modules.
        Returns annotated frame and standard Detection JSON payload.
        """
        start_time = time.time()
        cam_id = camera_id or self.config.system.camera_id
        timestamp_str = datetime.now(timezone.utc).isoformat()

        # FPS calculation
        now = time.time()
        dt = now - self.prev_frame_time
        if dt > 0:
            self.fps = 0.9 * self.fps + 0.1 * (1.0 / dt)
        self.prev_frame_time = now

        # Frame dimensions
        h, w = (frame.shape[:2]) if frame is not None else (720, 1280)

        # 1. Person localization (Auto-YOLO or provided manual boxes)
        raw_boxes = manual_boxes if manual_boxes is not None else self.detect_persons(frame)

        # 2. Track workers across frames
        tracked_workers = self.tracker.update(raw_boxes)

        worker_detections: List[WorkerDetection] = []
        all_violations: List[ViolationEvent] = []
        critical_alerts: List[ViolationEvent] = []

        zone_occupancy_counts = {z.get("zone_id"): 0 for z in self.danger_zone_detector.zones}

        # 3. Analyze each tracked worker
        for track_id, bbox in tracked_workers:
            worker_violations = []

            # (A) PPE Analysis
            ppe_status, ppe_viols = self.ppe_detector.analyze_worker_ppe(frame, bbox)
            for v in ppe_viols:
                v.timestamp = timestamp_str
            worker_violations.extend(ppe_viols)

            # (B) Posture & Fatigue Analysis (MediaPipe)
            posture_status, fatigue_status, posture_viols = self.posture_detector.analyze_crop_or_landmarks(
                frame=frame,
                bbox=bbox,
                worker_id=track_id,
                fps=self.fps if self.fps > 5 else 30.0
            )
            for v in posture_viols:
                v.timestamp = timestamp_str
            worker_violations.extend(posture_viols)

            # (C) Fall Detection
            fall_status, fall_viols = self.fall_detector.analyze_worker_fall(
                bbox=bbox,
                worker_id=track_id,
                fps=self.fps if self.fps > 5 else 30.0,
                frame_shape=(h, w)
            )
            for v in fall_viols:
                v.timestamp = timestamp_str
            worker_violations.extend(fall_viols)

            # (D) Danger Zone Intrusion Detection
            dz_status, dz_viols = self.danger_zone_detector.evaluate_worker(
                bbox=bbox,
                worker_id=track_id,
                ppe_status=ppe_status,
                frame_shape=(h, w)
            )
            for v in dz_viols:
                v.timestamp = timestamp_str
            worker_violations.extend(dz_viols)

            if dz_status.is_inside and dz_status.zone_id:
                zone_occupancy_counts[dz_status.zone_id] = zone_occupancy_counts.get(dz_status.zone_id, 0) + 1

            # Assemble Worker Detection
            worker_obj = WorkerDetection(
                track_id=track_id,
                bbox=bbox,
                ppe=ppe_status,
                posture=posture_status,
                fatigue=fatigue_status,
                fall=fall_status,
                danger_zone=dz_status,
                violations=worker_violations,
            )
            worker_detections.append(worker_obj)

            # Collect frame-level alerts
            all_violations.extend(worker_violations)
            for v in worker_violations:
                if v.severity in (ViolationSeverity.HIGH, ViolationSeverity.CRITICAL):
                    critical_alerts.append(v)

        # Danger zone resolved polygons with live occupancy
        danger_zones_summary = self.danger_zone_detector.get_danger_zone_polygons_for_frame((h, w))
        for dz in danger_zones_summary:
            dz.current_occupancy = zone_occupancy_counts.get(dz.zone_id, 0)

        # Build Frame Summary
        total_workers = len(worker_detections)
        compliant_ppe = sum(1 for w in worker_detections if w.ppe.compliant)
        unsafe_postures = sum(1 for w in worker_detections if w.posture.status != "SAFE")
        fatigued_count = sum(1 for w in worker_detections if w.fatigue.is_fatigued)
        active_falls = sum(1 for w in worker_detections if w.fall.is_fallen)
        dz_intrusions = sum(1 for w in worker_detections if w.danger_zone.is_inside)

        summary = FrameSummary(
            total_workers=total_workers,
            compliant_ppe_workers=compliant_ppe,
            unsafe_posture_count=unsafe_postures,
            fatigued_workers_count=fatigued_count,
            active_falls_count=active_falls,
            danger_zone_intrusions_count=dz_intrusions,
            total_violations_count=len(all_violations),
            critical_alerts_count=len(critical_alerts),
        )

        payload = DetectionFramePayload(
            version="1.0.0",
            timestamp=timestamp_str,
            frame_id=frame_id,
            camera_id=cam_id,
            fps_processing=round(self.fps, 1),
            summary=summary,
            workers=worker_detections,
            danger_zones=danger_zones_summary,
            critical_alerts=critical_alerts,
        )

        # Render visual annotations
        annotated_frame = self.visualizer.render(frame, payload)

        return annotated_frame, payload
