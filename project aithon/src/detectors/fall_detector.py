"""
Fall Detector for Industrial Workplace Monitoring.
Combines:
- Bounding box aspect ratio collapse (Height / Width < 0.85)
- Torso angle alignment with ground (< 30 deg to horizontal)
- Rapid vertical descent velocity
- Floor persistence and inactivity tracking (Emergency Alarm trigger)
"""

from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
import time

from .base import BaseDetector
from ..models.schemas import (
    BoundingBox,
    FallState,
    FallStatus,
    ViolationEvent,
    ViolationSeverity,
)
from ..utils.geometry import calculate_angle_with_horizontal

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None


class FallDetector(BaseDetector):
    """
    Detects worker slips, trips, falls, and emergency floor immobility.
    """

    def __init__(
        self,
        aspect_ratio_threshold: float = 0.85,
        torso_angle_threshold_deg: float = 30.0,
        velocity_descent_threshold_px: float = 25.0,
        confirmation_frames: int = 10,
        recovery_timeout_seconds: float = 5.0,
        enabled: bool = True,
    ):
        super().__init__(name="FallDetector", enabled=enabled)
        self.aspect_ratio_threshold = aspect_ratio_threshold
        self.torso_angle_threshold_deg = torso_angle_threshold_deg
        self.velocity_descent_threshold_px = velocity_descent_threshold_px
        self.confirmation_frames = confirmation_frames
        self.recovery_timeout_seconds = recovery_timeout_seconds

        # Worker temporal track: worker_id -> tracking states
        self.worker_tracks = defaultdict(lambda: {
            "history_y": [],
            "ground_frames": 0,
            "fall_start_time": None,
            "state": FallState.NORMAL,
        })

    def process(self, frame: Any, **kwargs) -> Dict[str, Any]:
        return {}

    def analyze_worker_fall(
        self,
        bbox: BoundingBox,
        worker_id: int = 1,
        pose_landmarks: Optional[Any] = None,
        fps: float = 30.0,
        frame_shape: Optional[Tuple[int, int]] = None
    ) -> Tuple[FallStatus, List[ViolationEvent]]:
        """
        Evaluate worker bounding box, trajectory, and torso inclination for fall detection.
        """
        w = max(1, bbox.width or (bbox.x2 - bbox.x1))
        h = max(1, bbox.height or (bbox.y2 - bbox.y1))
        aspect_ratio = round(h / float(w), 2)
        center_y = float(bbox.center_y or (bbox.y1 + bbox.y2) / 2)

        track = self.worker_tracks[worker_id]
        history_y = track["history_y"]
        history_y.append(center_y)
        if len(history_y) > 15:
            history_y.pop(0)

        # 1. Vertical Velocity (Downward drop)
        is_rapid_descent = False
        if len(history_y) >= 4:
            dy = history_y[-1] - history_y[-4]  # Positive dy means moving downward on screen
            if dy > self.velocity_descent_threshold_px:
                is_rapid_descent = True

        # 2. Torso Angle relative to horizontal floor
        torso_angle_deg = 85.0  # Upright default
        if pose_landmarks:
            torso_angle_deg = self._extract_torso_angle(pose_landmarks, frame_shape)
        else:
            # Estimate torso angle from aspect ratio if landmarks not available
            if aspect_ratio < 0.70:
                torso_angle_deg = 20.0
            elif aspect_ratio < 1.0:
                torso_angle_deg = 35.0
            else:
                torso_angle_deg = 85.0

        # 3. Floor condition test
        is_horizontal = (aspect_ratio < self.aspect_ratio_threshold) or (torso_angle_deg < self.torso_angle_threshold_deg)

        if is_horizontal:
            track["ground_frames"] += 1
            if track["fall_start_time"] is None:
                track["fall_start_time"] = time.time()
        else:
            # Worker recovered or upright
            track["ground_frames"] = max(0, track["ground_frames"] - 2)
            if track["ground_frames"] == 0:
                track["fall_start_time"] = None
                track["state"] = FallState.NORMAL

        # Determine fall state
        ground_frames = track["ground_frames"]
        time_on_ground = 0.0
        if track["fall_start_time"]:
            time_on_ground = round(time.time() - track["fall_start_time"], 1)

        is_fallen = False
        emergency_alert = False
        confidence = 0.0
        violations = []

        if ground_frames >= self.confirmation_frames:
            is_fallen = True
            if time_on_ground >= self.recovery_timeout_seconds:
                track["state"] = FallState.FALLEN_INACTIVE
                emergency_alert = True
                confidence = 0.96
                violations.append(ViolationEvent(
                    violation_type="MAN_DOWN_EMERGENCY",
                    severity=ViolationSeverity.CRITICAL,
                    message=(
                        f"CRITICAL: Worker #{worker_id} has fallen and remained inactive on floor for "
                        f"{time_on_ground:.1f}s. Immediate medical assistance required!"
                    ),
                    timestamp="",
                ))
            else:
                track["state"] = FallState.FALLEN
                confidence = 0.88
                violations.append(ViolationEvent(
                    violation_type="WORKER_FALL_DETECTED",
                    severity=ViolationSeverity.HIGH,
                    message=f"Worker #{worker_id} fall detected! Aspect ratio: {aspect_ratio}, Torso angle: {torso_angle_deg:.1f} deg.",
                    timestamp="",
                ))
        elif is_rapid_descent:
            track["state"] = FallState.RAPID_DESCENT
            confidence = 0.65
        else:
            track["state"] = FallState.NORMAL
            confidence = 0.05

        fall_status = FallStatus(
            is_fallen=is_fallen,
            state=track["state"],
            confidence=round(confidence, 2),
            time_on_ground_seconds=time_on_ground,
            aspect_ratio=aspect_ratio,
            torso_angle_deg=round(torso_angle_deg, 1),
            emergency_alert=emergency_alert
        )

        return fall_status, violations

    def _extract_torso_angle(self, pose_landmarks, frame_shape: Optional[Tuple[int, int]]) -> float:
        """Calculate shoulder-hip axis angle relative to horizontal ground."""
        h = frame_shape[0] if frame_shape else 720
        w = frame_shape[1] if frame_shape else 1280

        try:
            if hasattr(pose_landmarks, "landmark"):
                # Left shoulder (11), Right shoulder (12), Left hip (23), Right hip (24)
                ls = pose_landmarks.landmark[11]
                rs = pose_landmarks.landmark[12]
                lh = pose_landmarks.landmark[23]
                rh = pose_landmarks.landmark[24]

                mid_shoulder = ((ls.x + rs.x) / 2.0 * w, (ls.y + rs.y) / 2.0 * h)
                mid_hip = ((lh.x + rh.x) / 2.0 * w, (lh.y + rh.y) / 2.0 * h)
                return calculate_angle_with_horizontal(mid_shoulder, mid_hip)
        except Exception:
            pass

        return 85.0
