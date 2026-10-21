"""
Multi-Worker Centroid & IoU Tracker.
Maintains persistent track_id across consecutive frames for temporal analysis:
- Posture fatigue tracking
- Fall immobility duration
- Danger zone dwell time
"""

from typing import Dict, List, Tuple
import math
from ..models.schemas import BoundingBox


def calculate_iou(boxA: BoundingBox, boxB: BoundingBox) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes."""
    xA = max(boxA.x1, boxB.x1)
    yA = max(boxA.y1, boxB.y1)
    xB = min(boxA.x2, boxB.x2)
    yB = min(boxA.y2, boxB.y2)

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(1, (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1))
    boxBArea = max(1, (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1))

    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou


class SimpleTracker:
    """
    Lightweight tracker associating detections across frames using IoU and centroid distance.
    """

    def __init__(self, max_disappeared: int = 30, distance_threshold: float = 120.0):
        self.next_track_id = 1
        self.tracks: Dict[int, BoundingBox] = {}
        self.disappeared: Dict[int, int] = {}
        self.max_disappeared = max_disappeared
        self.distance_threshold = distance_threshold

    def update(self, detected_boxes: List[BoundingBox]) -> List[Tuple[int, BoundingBox]]:
        """
        Match detected bounding boxes with existing tracks.
        Returns list of (track_id, BoundingBox).
        """
        if len(detected_boxes) == 0:
            for track_id in list(self.disappeared.keys()):
                self.disappeared[track_id] += 1
                if self.disappeared[track_id] > self.max_disappeared:
                    self._deregister(track_id)
            return []

        # If no existing tracks, register all detections
        if len(self.tracks) == 0:
            results = []
            for bbox in detected_boxes:
                tid = self._register(bbox)
                results.append((tid, bbox))
            return results

        track_ids = list(self.tracks.keys())
        prev_boxes = [self.tracks[tid] for tid in track_ids]

        # Cost matrix based on IoU and centroid distance
        matched_detections = set()
        matched_tracks = set()
        results = []

        # 1. First pass: Match by high IoU (> 0.3)
        for d_idx, d_box in enumerate(detected_boxes):
            best_iou = 0.0
            best_t_idx = -1
            for t_idx, t_box in enumerate(prev_boxes):
                if t_idx in matched_tracks:
                    continue
                iou = calculate_iou(d_box, t_box)
                if iou > best_iou:
                    best_iou = iou
                    best_t_idx = t_idx

            if best_iou > 0.3 and best_t_idx != -1:
                tid = track_ids[best_t_idx]
                self.tracks[tid] = d_box
                self.disappeared[tid] = 0
                matched_detections.add(d_idx)
                matched_tracks.add(best_t_idx)
                results.append((tid, d_box))

        # 2. Second pass: Match remaining by centroid distance
        for d_idx, d_box in enumerate(detected_boxes):
            if d_idx in matched_detections:
                continue
            dc_x = (d_box.x1 + d_box.x2) / 2
            dc_y = (d_box.y1 + d_box.y2) / 2

            best_dist = float("inf")
            best_t_idx = -1

            for t_idx, t_box in enumerate(prev_boxes):
                if t_idx in matched_tracks:
                    continue
                tc_x = (t_box.x1 + t_box.x2) / 2
                tc_y = (t_box.y1 + t_box.y2) / 2
                dist = math.sqrt((dc_x - tc_x) ** 2 + (dc_y - tc_y) ** 2)

                if dist < best_dist:
                    best_dist = dist
                    best_t_idx = t_idx

            if best_dist < self.distance_threshold and best_t_idx != -1:
                tid = track_ids[best_t_idx]
                self.tracks[tid] = d_box
                self.disappeared[tid] = 0
                matched_detections.add(d_idx)
                matched_tracks.add(best_t_idx)
                results.append((tid, d_box))
            else:
                # New worker detected
                tid = self._register(d_box)
                matched_detections.add(d_idx)
                results.append((tid, d_box))

        # Update unmatched tracks
        for t_idx, tid in enumerate(track_ids):
            if t_idx not in matched_tracks:
                self.disappeared[tid] += 1
                if self.disappeared[tid] > self.max_disappeared:
                    self._deregister(tid)

        return results

    def _register(self, bbox: BoundingBox) -> int:
        tid = self.next_track_id
        self.next_track_id += 1
        self.tracks[tid] = bbox
        self.disappeared[tid] = 0
        return tid

    def _deregister(self, track_id: int) -> None:
        if track_id in self.tracks:
            del self.tracks[track_id]
        if track_id in self.disappeared:
            del self.disappeared[track_id]
