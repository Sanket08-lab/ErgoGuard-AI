from src.detectors.danger_zone_detector import DangerZoneDetector
from src.models.schemas import BoundingBox, PPEItemStatus, PPEStatus


def test_danger_zone_detection():
    detector = DangerZoneDetector(zones_file=None)
    # Add a square hazard zone in pixels: X: 400..600, Y: 400..600
    detector.add_zone({
        "zone_id": "TEST-DZ-01",
        "zone_name": "Test Hazardous Area",
        "severity": "CRITICAL",
        "coordinate_mode": "pixel",
        "polygon": [
            [400.0, 400.0],
            [600.0, 400.0],
            [600.0, 600.0],
            [400.0, 600.0]
        ],
        "required_ppe": ["helmet", "vest"],
        "max_dwell_seconds": 0.0
    })

    # Worker 1: Feet at (500, 500) -> INSIDE
    worker_inside_box = BoundingBox(x1=480, y1=300, x2=520, y2=500, confidence=0.9)
    status_in, viols_in = detector.evaluate_worker(
        bbox=worker_inside_box,
        worker_id=1,
        frame_shape=(720, 1280)
    )
    assert status_in.is_inside is True
    assert status_in.zone_id == "TEST-DZ-01"
    assert len(viols_in) >= 1

    # Worker 2: Feet at (100, 100) -> OUTSIDE
    worker_outside_box = BoundingBox(x1=80, y1=50, x2=120, y2=100, confidence=0.9)
    status_out, viols_out = detector.evaluate_worker(
        bbox=worker_outside_box,
        worker_id=2,
        frame_shape=(720, 1280)
    )
    assert status_out.is_inside is False
    assert status_out.zone_id is None
    assert len(viols_out) == 0


def test_danger_zone_ppe_enforcement():
    detector = DangerZoneDetector(zones_file=None, enforce_ppe_rules=True)
    detector.add_zone({
        "zone_id": "CRANE-01",
        "zone_name": "Crane Overhead Swing Zone",
        "severity": "CRITICAL",
        "coordinate_mode": "pixel",
        "polygon": [[100, 100], [300, 100], [300, 300], [100, 300]],
        "required_ppe": ["helmet"],
        "max_dwell_seconds": 10.0
    })

    box = BoundingBox(x1=180, y1=100, x2=220, y2=200, confidence=0.9)

    # Worker has NO helmet
    non_compliant_ppe = PPEStatus(
        compliant=False,
        helmet=PPEItemStatus(detected=False, confidence=0.1),
        vest=PPEItemStatus(detected=True, confidence=0.9),
        missing_required_ppe=["helmet"]
    )

    status, viols = detector.evaluate_worker(
        bbox=box,
        worker_id=3,
        ppe_status=non_compliant_ppe,
        frame_shape=(720, 1280)
    )

    assert status.is_inside is True
    assert any(v.violation_type == "DANGER_ZONE_PPE_VIOLATION" for v in viols)
