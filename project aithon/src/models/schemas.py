"""
Standardized Detection JSON Schemas for Workplace Safety AI.
Provides typed, validated structures for:
- PPE compliance
- Posture & Ergonomics
- Worker Fatigue
- Fall Events
- Danger Zone Intrusions
"""

from enum import Enum
from typing import Dict, List, Optional
from datetime import datetime

try:
    from pydantic import BaseModel, Field
except ImportError:
    # Minimal fallback if pydantic is not installed
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

        def model_dump(self):
            out = {}
            for k, v in self.__dict__.items():
                if hasattr(v, "model_dump"):
                    out[k] = v.model_dump()
                elif hasattr(v, "value"):
                    out[k] = v.value
                elif isinstance(v, list):
                    out[k] = [i.model_dump() if hasattr(i, "model_dump") else (i.value if hasattr(i, "value") else i) for i in v]
                elif isinstance(v, dict):
                    out[k] = {dk: dv.model_dump() if hasattr(dv, "model_dump") else dv for dk, dv in v.items()}
                else:
                    out[k] = v
            return out

        def dict(self):
            return self.model_dump()

    def Field(*args, **kwargs):  # type: ignore
        default = kwargs.get("default", None)
        return default


class ViolationSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PostureState(str, Enum):
    SAFE = "SAFE"
    UNSAFE_LIFTING = "UNSAFE_LIFTING"
    SLOUCHING = "SLOUCHING"
    FORWARD_HEAD = "FORWARD_HEAD"
    EXTREME_BEND = "EXTREME_BEND"
    UNKNOWN = "UNKNOWN"


class FallState(str, Enum):
    NORMAL = "NORMAL"
    RAPID_DESCENT = "RAPID_DESCENT"
    FALLEN = "FALLEN"
    FALLEN_INACTIVE = "FALLEN_INACTIVE"


class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    width: Optional[int] = None
    height: Optional[int] = None
    center_x: Optional[int] = None
    center_y: Optional[int] = None

    def __init__(self, **data):
        super().__init__(**data)
        if self.width is None:
            self.width = max(0, self.x2 - self.x1)
        if self.height is None:
            self.height = max(0, self.y2 - self.y1)
        if self.center_x is None:
            self.center_x = (self.x1 + self.x2) // 2
        if self.center_y is None:
            self.center_y = (self.y1 + self.y2) // 2


class PPEItemStatus(BaseModel):
    detected: bool
    confidence: float = 0.0
    bounding_box: Optional[List[int]] = None


class PPEStatus(BaseModel):
    compliant: bool
    helmet: PPEItemStatus
    vest: PPEItemStatus
    goggles: Optional[PPEItemStatus] = None
    gloves: Optional[PPEItemStatus] = None
    boots: Optional[PPEItemStatus] = None
    missing_required_ppe: List[str] = []


class PostureAngles(BaseModel):
    trunk_inclination_deg: float
    neck_flexion_deg: float
    left_knee_angle_deg: Optional[float] = None
    right_knee_angle_deg: Optional[float] = None
    reba_risk_score: Optional[int] = None


class PostureStatus(BaseModel):
    status: PostureState
    risk_level: ViolationSeverity
    confidence: float
    angles: PostureAngles
    description: str


class FatigueStatus(BaseModel):
    is_fatigued: bool
    fatigue_score: float  # Range: 0.0 to 1.0
    indicators: List[str] = []
    head_droop_duration_seconds: float = 0.0
    immobility_seconds: float = 0.0
    description: str = "Worker posture indicates normal alertness."


class FallStatus(BaseModel):
    is_fallen: bool
    state: FallState
    confidence: float
    time_on_ground_seconds: float = 0.0
    aspect_ratio: float
    torso_angle_deg: float
    emergency_alert: bool = False


class DangerZoneStatus(BaseModel):
    is_inside: bool
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    severity: Optional[ViolationSeverity] = None
    time_in_zone_seconds: float = 0.0
    violation_type: Optional[str] = None


class ViolationEvent(BaseModel):
    violation_type: str  # e.g., "MISSING_PPE", "UNSAFE_POSTURE", "WORKER_FATIGUE", "FALL_DETECTED", "DANGER_ZONE_INTRUSION"
    severity: ViolationSeverity
    message: str
    timestamp: str
    zone_id: Optional[str] = None


class WorkerDetection(BaseModel):
    track_id: int
    bbox: BoundingBox
    ppe: PPEStatus
    posture: PostureStatus
    fatigue: FatigueStatus
    fall: FallStatus
    danger_zone: DangerZoneStatus
    violations: List[ViolationEvent] = []


class DangerZonePolygon(BaseModel):
    zone_id: str
    zone_name: str
    severity: ViolationSeverity
    description: str
    polygon: List[List[float]]
    required_ppe: List[str] = []
    max_dwell_seconds: float = 0.0
    current_occupancy: int = 0


class FrameSummary(BaseModel):
    total_workers: int
    compliant_ppe_workers: int
    unsafe_posture_count: int
    fatigued_workers_count: int
    active_falls_count: int
    danger_zone_intrusions_count: int
    total_violations_count: int
    critical_alerts_count: int


class DetectionFramePayload(BaseModel):
    version: str = "1.0.0"
    timestamp: str
    frame_id: int
    camera_id: str
    fps_processing: float
    summary: FrameSummary
    workers: List[WorkerDetection] = []
    danger_zones: List[DangerZonePolygon] = []
    critical_alerts: List[ViolationEvent] = []

    def to_dict(self) -> dict:
        """Export to standard JSON dict."""
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()
