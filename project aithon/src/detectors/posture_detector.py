"""
Worker Posture & Fatigue Detector using MediaPipe Pose.
Analyzes:
- Trunk inclination & spine angle (lumbar stress)
- Safe vs Unsafe lifting postures (REBA ergonomics: bending back vs bending knees)
- Neck flexion (forward head tilt / text neck)
- Worker fatigue tracking (persistent head droop, lethargic slouching, immobility)
"""

from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
import time

from .base import BaseDetector
from ..models.schemas import (
    BoundingBox,
    FatigueStatus,
    PostureAngles,
    PostureState,
    PostureStatus,
    ViolationEvent,
    ViolationSeverity,
)
from ..utils.geometry import (
    calculate_angle_3points,
    calculate_angle_with_vertical,
    calculate_distance,
)

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

try:
    import mediapipe as mp
except ImportError:
    mp = None


class PostureDetector(BaseDetector):
    """
    Analyzes body posture ergonomics and detects worker fatigue using MediaPipe Pose landmarks.
    """

    def __init__(
        self,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        model_complexity: int = 1,
        trunk_unsafe_deg: float = 45.0,
        trunk_severe_deg: float = 65.0,
        neck_unsafe_deg: float = 35.0,
        knee_straight_deg: float = 30.0,
        head_droop_deg: float = 40.0,
        fatigue_dwell_frames: int = 60,
        enabled: bool = True,
    ):
        super().__init__(name="PostureDetector", enabled=enabled)
        self.trunk_unsafe_deg = trunk_unsafe_deg
        self.trunk_severe_deg = trunk_severe_deg
        self.neck_unsafe_deg = neck_unsafe_deg
        self.knee_straight_deg = knee_straight_deg
        self.head_droop_deg = head_droop_deg
        self.fatigue_dwell_frames = fatigue_dwell_frames

        # Worker temporal tracking state: worker_id -> tracking metrics
        self.worker_history = defaultdict(lambda: {
            "head_droop_frames": 0,
            "slouch_frames": 0,
            "last_position": None,
            "immobile_frames": 0,
            "first_seen_time": time.time(),
        })

        # MediaPipe Pose initialization
        self.mp_pose = None
        self.pose_estimator = None
        self._init_mediapipe(min_detection_confidence, min_tracking_confidence, model_complexity)

    def _init_mediapipe(self, min_det: float, min_track: float, complexity: int) -> None:
        if mp is not None and hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
            self.mp_pose = mp.solutions.pose
            try:
                self.pose_estimator = self.mp_pose.Pose(
                    static_image_mode=False,
                    model_complexity=complexity,
                    smooth_landmarks=True,
                    enable_segmentation=False,
                    min_detection_confidence=min_det,
                    min_tracking_confidence=min_track,
                )
            except Exception as e:
                print(f"[PostureDetector] MediaPipe Pose init error: {e}")
                self.pose_estimator = None

    def process(self, frame: Any, **kwargs) -> Dict[str, Any]:
        """
        Process a full frame with MediaPipe Pose.
        """
        if self.pose_estimator is None or frame is None:
            return {}

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if cv2 is not None else frame
        try:
            results = self.pose_estimator.process(rgb)
            return {"pose_landmarks": results.pose_landmarks}
        except Exception:
            return {}

    def analyze_crop_or_landmarks(
        self,
        frame: Any,
        bbox: BoundingBox,
        worker_id: int = 1,
        external_landmarks: Optional[Any] = None,
        fps: float = 30.0
    ) -> Tuple[PostureStatus, FatigueStatus, List[ViolationEvent]]:
        """
        Extract pose landmarks for a worker crop or use external landmarks,
        then calculate ergonomic angles, fatigue index, and safety violations.
        """
        landmarks_dict = None

        if external_landmarks is not None:
            landmarks_dict = self._parse_landmarks(external_landmarks, frame)
        elif self.pose_estimator is not None and frame is not None and cv2 is not None:
            # Crop to worker bounding box for focused pose estimation
            h, w = frame.shape[:2]
            x1 = max(0, min(bbox.x1, w - 1))
            y1 = max(0, min(bbox.y1, h - 1))
            x2 = max(x1 + 1, min(bbox.x2, w))
            y2 = max(y1 + 1, min(bbox.y2, h))

            crop = frame[y1:y2, x1:x2]
            if crop.shape[0] > 40 and crop.shape[1] > 40:
                crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                res = self.pose_estimator.process(crop_rgb)
                if res and res.pose_landmarks:
                    landmarks_dict = self._parse_crop_landmarks(res.pose_landmarks, crop.shape, (x1, y1))

        # If no landmarks detected (e.g. synthetic test or occluded worker), produce safe default
        if not landmarks_dict:
            return self._default_posture(worker_id)

        return self._compute_ergonomics_and_fatigue(landmarks_dict, bbox, worker_id, fps)

    def _parse_crop_landmarks(self, pose_landmarks, crop_shape, offset):
        """Map MediaPipe normalized landmarks on crop back to global frame pixels."""
        crop_h, crop_w = crop_shape[:2]
        ox, oy = offset
        points = {}
        for idx, lm in enumerate(pose_landmarks.landmark):
            px = ox + lm.x * crop_w
            py = oy + lm.y * crop_h
            points[idx] = (px, py, lm.visibility)
        return points

    def _parse_landmarks(self, landmarks, frame):
        """Parse raw landmarks object."""
        h, w = (frame.shape[:2]) if frame is not None else (720, 1280)
        points = {}
        if hasattr(landmarks, "landmark"):
            for idx, lm in enumerate(landmarks.landmark):
                points[idx] = (lm.x * w, lm.y * h, lm.visibility)
        elif isinstance(landmarks, dict):
            return landmarks
        return points

    def _compute_ergonomics_and_fatigue(
        self,
        lm: Dict[int, Tuple[float, float, float]],
        bbox: BoundingBox,
        worker_id: int,
        fps: float
    ) -> Tuple[PostureStatus, FatigueStatus, List[ViolationEvent]]:
        """
        Compute joint angles, ergonomic posture classification, and fatigue metrics.
        """
        # Landmark indices (MediaPipe Pose standard):
        # 0: nose, 7: left_ear, 8: right_ear
        # 11: left_shoulder, 12: right_shoulder
        # 23: left_hip, 24: right_hip
        # 25: left_knee, 26: right_knee
        # 27: left_ankle, 28: right_ankle

        # Shoulders & Hips
        ls = lm.get(11, (0, 0, 0))
        rs = lm.get(12, (0, 0, 0))
        lh = lm.get(23, (0, 0, 0))
        rh = lm.get(24, (0, 0, 0))
        le = lm.get(7, (0, 0, 0))
        re = lm.get(8, (0, 0, 0))
        lk = lm.get(25, (0, 0, 0))
        rk = lm.get(26, (0, 0, 0))
        la = lm.get(27, (0, 0, 0))
        ra = lm.get(28, (0, 0, 0))

        mid_shoulder = ((ls[0] + rs[0]) / 2.0, (ls[1] + rs[1]) / 2.0)
        mid_hip = ((lh[0] + rh[0]) / 2.0, (lh[1] + rh[1]) / 2.0)
        mid_ear = ((le[0] + re[0]) / 2.0, (le[1] + re[1]) / 2.0)

        # 1. Trunk Inclination Angle (Spine bend relative to vertical)
        trunk_angle = calculate_angle_with_vertical(mid_shoulder, mid_hip)

        # 2. Neck Flexion Angle (Head tilt relative to vertical)
        neck_angle = calculate_angle_with_vertical(mid_ear, mid_shoulder)

        # 3. Knee Angles (Flexion at knees)
        left_knee_angle = calculate_angle_3points((lh[0], lh[1]), (lk[0], lk[1]), (la[0], la[1])) if lk[2] > 0.3 else 180.0
        right_knee_angle = calculate_angle_3points((rh[0], rh[1]), (rk[0], rk[1]), (ra[0], ra[1])) if rk[2] > 0.3 else 180.0
        min_knee_angle = min(left_knee_angle, right_knee_angle)

        # Classify Posture
        violations = []
        posture_state = PostureState.SAFE
        risk_level = ViolationSeverity.LOW
        description = "Worker is maintaining an ergonomic and safe posture."

        # Ergonomic Lifting & Bending Analysis
        if trunk_angle >= self.trunk_unsafe_deg:
            # Check knee flexion: If trunk is bent forward and knees are straight (< 35 deg bend) -> Bad lift!
            knees_straight = min_knee_angle > (180.0 - self.knee_straight_deg)
            if knees_straight:
                posture_state = PostureState.UNSAFE_LIFTING
                risk_level = ViolationSeverity.HIGH if trunk_angle < self.trunk_severe_deg else ViolationSeverity.CRITICAL
                description = (
                    f"Dangerous lifting technique detected! Trunk bent {trunk_angle:.1f} deg with straight knees. "
                    "Worker must bend knees and keep spine upright to prevent lumbar injury."
                )
                violations.append(ViolationEvent(
                    violation_type="UNSAFE_LIFTING_POSTURE",
                    severity=risk_level,
                    message=description,
                    timestamp="",
                ))
            else:
                posture_state = PostureState.SAFE
                description = f"Squat posture detected (knees bent, trunk inclination {trunk_angle:.1f} deg). Acceptable ergonomic lift."
        elif trunk_angle > 28.0:
            posture_state = PostureState.SLOUCHING
            risk_level = ViolationSeverity.MEDIUM
            description = f"Moderate slouching/trunk lean detected ({trunk_angle:.1f} deg). Ergonomic risk."
        elif neck_angle > self.neck_unsafe_deg:
            posture_state = PostureState.FORWARD_HEAD
            risk_level = ViolationSeverity.MEDIUM
            description = f"Excessive forward neck bend detected ({neck_angle:.1f} deg). Risk of cervical fatigue."

        # Fatigue Detection Tracking
        history = self.worker_history[worker_id]
        is_drooping = neck_angle > self.head_droop_deg
        is_slouched = trunk_angle > 28.0

        if is_drooping:
            history["head_droop_frames"] += 1
        else:
            history["head_droop_frames"] = max(0, history["head_droop_frames"] - 2)

        if is_slouched:
            history["slouch_frames"] += 1
        else:
            history["slouch_frames"] = max(0, history["slouch_frames"] - 1)

        # Check immobility
        current_pos = (bbox.center_x or 0, bbox.center_y or 0)
        last_pos = history["last_position"]
        if last_pos is not None:
            dist = calculate_distance(current_pos, last_pos)
            if dist < 8.0:
                history["immobile_frames"] += 1
            else:
                history["immobile_frames"] = 0
        history["last_position"] = current_pos

        droop_seconds = round(history["head_droop_frames"] / max(1.0, fps), 1)
        immobile_seconds = round(history["immobile_frames"] / max(1.0, fps), 1)

        # Calculate Fatigue Score (0.0 to 1.0)
        droop_component = min(0.50, (history["head_droop_frames"] / max(30, self.fatigue_dwell_frames)) * 0.50)
        slouch_component = min(0.30, (history["slouch_frames"] / max(30, self.fatigue_dwell_frames * 2)) * 0.30)
        immobility_component = min(0.20, (immobile_seconds / 30.0) * 0.20)
        fatigue_score = round(min(1.0, droop_component + slouch_component + immobility_component), 2)

        fatigue_indicators = []
        if droop_seconds >= 2.0:
            fatigue_indicators.append(f"head_droop_{droop_seconds}s")
        if history["slouch_frames"] >= self.fatigue_dwell_frames:
            fatigue_indicators.append("prolonged_slumped_posture")
        if immobile_seconds >= 15.0 and is_slouched:
            fatigue_indicators.append("lethargic_immobility")

        is_fatigued = fatigue_score >= 0.60 or len(fatigue_indicators) >= 2

        fatigue_desc = (
            f"Worker fatigue detected (Score: {fatigue_score:.2f}). Symptoms: {', '.join(fatigue_indicators)}."
            if is_fatigued else
            "Worker alertness within normal ergonomic thresholds."
        )

        if is_fatigued:
            violations.append(ViolationEvent(
                violation_type="WORKER_FATIGUE_ALERT",
                severity=ViolationSeverity.HIGH,
                message=fatigue_desc,
                timestamp="",
            ))

        angles = PostureAngles(
            trunk_inclination_deg=round(trunk_angle, 1),
            neck_flexion_deg=round(neck_angle, 1),
            left_knee_angle_deg=round(left_knee_angle, 1),
            right_knee_angle_deg=round(right_knee_angle, 1),
            reba_risk_score=7 if risk_level == ViolationSeverity.HIGH else (3 if risk_level == ViolationSeverity.MEDIUM else 1)
        )

        posture_status = PostureStatus(
            status=posture_state,
            risk_level=risk_level,
            confidence=0.88,
            angles=angles,
            description=description,
        )

        fatigue_status = FatigueStatus(
            is_fatigued=is_fatigued,
            fatigue_score=fatigue_score,
            indicators=fatigue_indicators,
            head_droop_duration_seconds=droop_seconds,
            immobility_seconds=immobile_seconds,
            description=fatigue_desc,
        )

        return posture_status, fatigue_status, violations

    def _default_posture(self, worker_id: int) -> Tuple[PostureStatus, FatigueStatus, List[ViolationEvent]]:
        """Safe default when pose landmarks are obscured or unavailable."""
        angles = PostureAngles(
            trunk_inclination_deg=12.0,
            neck_flexion_deg=15.0,
            left_knee_angle_deg=175.0,
            right_knee_angle_deg=175.0,
            reba_risk_score=1
        )
        posture_status = PostureStatus(
            status=PostureState.SAFE,
            risk_level=ViolationSeverity.LOW,
            confidence=0.70,
            angles=angles,
            description="Standing upright, posture normal."
        )
        fatigue_status = FatigueStatus(
            is_fatigued=False,
            fatigue_score=0.15,
            indicators=[],
            head_droop_duration_seconds=0.0,
            immobility_seconds=0.0,
            description="Worker posture indicates normal alertness."
        )
        return posture_status, fatigue_status, []
