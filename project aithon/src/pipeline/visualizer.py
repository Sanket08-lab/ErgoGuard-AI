"""
Visualizer for Workplace Safety AI Computer Vision.
Renders real-time HUD annotations, bounding boxes, danger zones, and alert badges.
"""

from typing import Any, List, Optional
from ..models.schemas import (
    DetectionFramePayload,
    FallState,
    PostureState,
    ViolationSeverity,
    WorkerDetection,
)

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None


class Visualizer:
    """
    Renders intuitive industrial safety overlays onto video frames.
    """

    COLOR_SAFE = (0, 200, 0)        # Green
    COLOR_WARNING = (0, 165, 255)   # Amber / Orange
    COLOR_DANGER = (0, 0, 255)      # Red
    COLOR_ZONE_FILL = (0, 0, 200)   # Dark Red

    def __init__(self, show_hud: bool = True):
        self.show_hud = show_hud

    def render(self, frame: Any, payload: DetectionFramePayload) -> Any:
        """
        Draw all safety analytics, zones, and worker statuses onto a copy of the frame.
        """
        if frame is None or cv2 is None or np is None:
            return frame

        canvas = frame.copy()
        h, w = canvas.shape[:2]

        # 1. Draw Danger Zones (Polygons with alpha overlay)
        overlay = canvas.copy()
        for zone in payload.danger_zones:
            pts = np.array(zone.polygon, np.int32).reshape((-1, 1, 2))
            # Tint fill
            color = (0, 0, 220) if zone.severity == ViolationSeverity.CRITICAL else (0, 140, 255)
            cv2.fillPoly(overlay, [pts], color)
            # Outline
            cv2.polylines(canvas, [pts], isClosed=True, color=color, thickness=2)

            # Zone Label
            if len(zone.polygon) > 0:
                lx, ly = int(zone.polygon[0][0]), int(zone.polygon[0][1])
                badge_text = f"[{zone.zone_id}] {zone.zone_name}"
                cv2.putText(canvas, badge_text, (lx, max(20, ly - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)

        # Apply transparency for danger zones
        cv2.addWeighted(overlay, 0.25, canvas, 0.75, 0, canvas)

        # 2. Draw Detected Workers
        for worker in payload.workers:
            self._draw_worker(canvas, worker)

        # 3. Draw Heads-Up-Display (HUD) Stats Panel
        if self.show_hud:
            self._draw_hud(canvas, payload)

        return canvas

    def _draw_worker(self, canvas: Any, worker: WorkerDetection) -> None:
        """Draw bounding box and status tag for an individual worker."""
        bbox = worker.bbox
        x1, y1, x2, y2 = bbox.x1, bbox.y1, bbox.x2, bbox.y2

        # Choose color according to worst severity
        box_color = self.COLOR_SAFE
        if worker.fall.is_fallen or worker.danger_zone.is_inside:
            box_color = self.COLOR_DANGER
        elif not worker.ppe.compliant or worker.posture.status != PostureState.SAFE or worker.fatigue.is_fatigued:
            box_color = self.COLOR_WARNING

        # Bounding box
        cv2.rectangle(canvas, (x1, y1), (x2, y2), box_color, 2)

        # Status text badges
        helm_tag = "H:OK" if worker.ppe.helmet.detected else "H:MISSING"
        vest_tag = "V:OK" if worker.ppe.vest.detected else "V:MISSING"
        posture_tag = worker.posture.status.value
        fall_tag = worker.fall.state.value

        line1 = f"Worker #{worker.track_id} [{helm_tag}|{vest_tag}]"
        line2 = f"Post: {posture_tag} | Fall: {fall_tag}"

        if worker.fatigue.is_fatigued:
            line2 += f" | FATIGUE ({worker.fatigue.fatigue_score:.2f})"

        # Label background
        label_y = max(35, y1 - 25)
        cv2.rectangle(canvas, (x1, label_y - 15), (x1 + 240, label_y + 20), (20, 20, 20), -1)
        cv2.putText(canvas, line1, (x1 + 4, label_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.42, box_color, 1, cv2.LINE_AA)
        cv2.putText(canvas, line2, (x1 + 4, label_y + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1, cv2.LINE_AA)

        # Alert flag for active danger zone or fall
        if worker.danger_zone.is_inside:
            dz_badge = f"ZONE INTRUSION: {worker.danger_zone.zone_name} ({worker.danger_zone.time_in_zone_seconds:.1f}s)"
            cv2.rectangle(canvas, (x1, y2 + 2), (x1 + 280, y2 + 22), (0, 0, 180), -1)
            cv2.putText(canvas, dz_badge, (x1 + 4, y2 + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1, cv2.LINE_AA)

        if worker.fall.is_fallen:
            fall_badge = f"EMERGENCY: FALL DETECTED ({worker.fall.time_on_ground_seconds:.1f}s)"
            cv2.rectangle(canvas, (x1, y2 + 24), (x1 + 280, y2 + 44), (0, 0, 255), -1)
            cv2.putText(canvas, fall_badge, (x1 + 4, y2 + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    def _draw_hud(self, canvas: Any, payload: DetectionFramePayload) -> None:
        """Draw top banner with summary metrics."""
        w = canvas.shape[1]
        cv2.rectangle(canvas, (0, 0), (w, 42), (18, 18, 18), -1)

        summary = payload.summary
        hud_text = (
            f"FPS: {payload.fps_processing:.1f} | Workers: {summary.total_workers} | "
            f"PPE Violations: {summary.total_workers - summary.compliant_ppe_workers} | "
            f"Unsafe Postures: {summary.unsafe_posture_count} | "
            f"Fatigued: {summary.fatigued_workers_count} | "
            f"Zone Intrusions: {summary.danger_zone_intrusions_count} | "
            f"Active Falls: {summary.active_falls_count}"
        )

        alarm_color = (0, 220, 0) if summary.critical_alerts_count == 0 else (0, 0, 255)
        cv2.putText(canvas, "SAFETY AI MONITOR", (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, hud_text, (240, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.48, alarm_color, 1, cv2.LINE_AA)
