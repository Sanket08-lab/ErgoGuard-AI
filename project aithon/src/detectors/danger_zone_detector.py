"""
Danger-Zone & Restricted Area Intrusion Detector.
Features:
- Configurable polygonal exclusion and hazard zones
- High-precision foot-point and bounding box ray-casting containment
- Dwell time tracking and unauthorized presence alerting
- Strict zone-specific PPE rule enforcement (e.g. mandatory helmet in crane swing zone)
"""

from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
import json
from pathlib import Path
import time

from .base import BaseDetector
from ..models.schemas import (
    BoundingBox,
    DangerZonePolygon,
    DangerZoneStatus,
    PPEStatus,
    ViolationEvent,
    ViolationSeverity,
)
from ..utils.geometry import get_bottom_center_point, point_in_polygon

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None


class DangerZoneDetector(BaseDetector):
    """
    Monitors polygonal hazard zones and detects unauthorized intrusions or PPE compliance failures in zones.
    """

    def __init__(
        self,
        zones_file: Optional[str] = "sample_danger_zones.json",
        enforce_ppe_rules: bool = True,
        enabled: bool = True
    ):
        super().__init__(name="DangerZoneDetector", enabled=enabled)
        self.zones_file = zones_file
        self.enforce_ppe_rules = enforce_ppe_rules
        self.zones: List[Dict[str, Any]] = []
        self._load_zones()

        # Intrusion tracker: (worker_id, zone_id) -> entry_timestamp
        self.intrusion_tracker = defaultdict(lambda: None)

    def _load_zones(self) -> None:
        """Load hazard zone definitions from JSON."""
        if not self.zones_file:
            return

        path = Path(self.zones_file)
        if not path.exists():
            print(f"[DangerZoneDetector] Zones file not found: {self.zones_file}")
            return

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.zones = data.get("zones", [])
        except Exception as e:
            print(f"[DangerZoneDetector] Error reading {self.zones_file}: {e}")

    def add_zone(self, zone_dict: Dict[str, Any]) -> None:
        """Dynamically add or update a hazard zone."""
        self.zones.append(zone_dict)

    def process(self, frame: Any, **kwargs) -> Dict[str, Any]:
        return {}

    def get_danger_zone_polygons_for_frame(self, frame_shape: Tuple[int, int]) -> List[DangerZonePolygon]:
        """Convert loaded zones into resolved frame models with occupancy."""
        h, w = frame_shape[:2]
        zone_models = []

        for z in self.zones:
            coords = self._resolve_polygon(z.get("polygon", []), w, h, z.get("coordinate_mode", "normalized"))
            zone_models.append(DangerZonePolygon(
                zone_id=z.get("zone_id", "DZ-XX"),
                zone_name=z.get("zone_name", "Hazard Zone"),
                severity=ViolationSeverity(z.get("severity", "HIGH")),
                description=z.get("description", ""),
                polygon=coords,
                required_ppe=z.get("required_ppe", []),
                max_dwell_seconds=float(z.get("max_dwell_seconds", 0.0)),
                current_occupancy=0  # updated during pipeline run
            ))
        return zone_models

    def evaluate_worker(
        self,
        bbox: BoundingBox,
        worker_id: int,
        ppe_status: Optional[PPEStatus] = None,
        frame_shape: Tuple[int, int] = (720, 1280)
    ) -> Tuple[DangerZoneStatus, List[ViolationEvent]]:
        """
        Check if worker's feet are inside any active danger zones.
        Evaluates presence, dwell time, and zone PPE compliance.
        """
        h, w = frame_shape[:2]
        foot_x, foot_y = get_bottom_center_point((bbox.x1, bbox.y1, bbox.x2, bbox.y2))

        active_zone = None
        current_time = time.time()
        time_in_zone = 0.0
        violations = []

        for z in self.zones:
            zone_id = z.get("zone_id", "DZ-XX")
            zone_name = z.get("zone_name", "Hazard Zone")
            severity_str = z.get("severity", "HIGH")
            severity = ViolationSeverity(severity_str)
            req_ppe = z.get("required_ppe", [])
            max_dwell = float(z.get("max_dwell_seconds", 0.0))

            polygon = self._resolve_polygon(z.get("polygon", []), w, h, z.get("coordinate_mode", "normalized"))

            # Test point-in-polygon containment
            if point_in_polygon((foot_x, foot_y), polygon):
                active_zone = z
                entry_key = (worker_id, zone_id)

                if self.intrusion_tracker[entry_key] is None:
                    self.intrusion_tracker[entry_key] = current_time

                time_in_zone = round(current_time - self.intrusion_tracker[entry_key], 1)

                # Check unauthorized presence / zero dwell tolerance
                if max_dwell == 0.0:
                    violations.append(ViolationEvent(
                        violation_type="DANGER_ZONE_UNAUTHORIZED_ENTRY",
                        severity=severity,
                        message=f"Unauthorized entry! Worker #{worker_id} entered restricted area: {zone_name} ({zone_id}).",
                        timestamp="",
                        zone_id=zone_id
                    ))
                elif time_in_zone > max_dwell:
                    violations.append(ViolationEvent(
                        violation_type="DANGER_ZONE_DWELL_EXCEEDED",
                        severity=severity,
                        message=(
                            f"Dwell limit exceeded! Worker #{worker_id} has remained in {zone_name} for "
                            f"{time_in_zone:.1f}s (Max allowed: {max_dwell:.1f}s)."
                        ),
                        timestamp="",
                        zone_id=zone_id
                    ))

                # Check zone-specific PPE requirements
                if self.enforce_ppe_rules and ppe_status and req_ppe:
                    missing_in_zone = []
                    if "helmet" in req_ppe and not ppe_status.helmet.detected:
                        missing_in_zone.append("helmet")
                    if "vest" in req_ppe and not ppe_status.vest.detected:
                        missing_in_zone.append("safety vest")
                    if "goggles" in req_ppe and (not ppe_status.goggles or not ppe_status.goggles.detected):
                        missing_in_zone.append("protective goggles")

                    if missing_in_zone:
                        violations.append(ViolationEvent(
                            violation_type="DANGER_ZONE_PPE_VIOLATION",
                            severity=ViolationSeverity.CRITICAL,
                            message=(
                                f"CRITICAL: Worker #{worker_id} in {zone_name} without mandatory equipment: "
                                f"{', '.join(missing_in_zone)}!"
                            ),
                            timestamp="",
                            zone_id=zone_id
                        ))
                break
            else:
                # Clear tracker if worker left the zone
                entry_key = (worker_id, zone_id)
                self.intrusion_tracker[entry_key] = None

        if active_zone:
            return DangerZoneStatus(
                is_inside=True,
                zone_id=active_zone.get("zone_id"),
                zone_name=active_zone.get("zone_name"),
                severity=ViolationSeverity(active_zone.get("severity", "HIGH")),
                time_in_zone_seconds=time_in_zone,
                violation_type=violations[0].violation_type if violations else "MONITORED_PRESENCE"
            ), violations

        return DangerZoneStatus(
            is_inside=False,
            zone_id=None,
            zone_name=None,
            severity=None,
            time_in_zone_seconds=0.0,
            violation_type=None
        ), []

    def _resolve_polygon(
        self,
        poly: List[List[float]],
        width: int,
        height: int,
        coord_mode: str
    ) -> List[List[float]]:
        """Scale normalized coordinates to pixel coordinates if needed."""
        if coord_mode == "normalized":
            return [[round(p[0] * width, 1), round(p[1] * height, 1)] for p in poly]
        return poly
