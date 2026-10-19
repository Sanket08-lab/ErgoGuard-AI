from src.detectors.fall_detector import FallDetector
from src.models.schemas import BoundingBox, FallState


def test_fall_detection_upright_worker():
    detector = FallDetector(confirmation_frames=5)
    # Upright standing: w=100, h=300 -> aspect ratio = 3.0
    standing_box = BoundingBox(x1=100, y1=100, x2=200, y2=400, confidence=0.95)

    status, viols = detector.analyze_worker_fall(standing_box, worker_id=1)
    assert status.is_fallen is False
    assert status.state == FallState.NORMAL
    assert status.aspect_ratio == 3.0
    assert len(viols) == 0


def test_fall_detection_fallen_worker():
    detector = FallDetector(confirmation_frames=3, aspect_ratio_threshold=0.85)
    # Fallen horizontal on ground: w=300, h=120 -> aspect ratio = 0.40
    fallen_box = BoundingBox(x1=200, y1=450, x2=500, y2=570, confidence=0.90)

    # Process 4 frames to confirm fall
    for _ in range(4):
        status, viols = detector.analyze_worker_fall(fallen_box, worker_id=2)

    assert status.is_fallen is True
    assert status.state in (FallState.FALLEN, FallState.FALLEN_INACTIVE)
    assert len(viols) >= 1
    assert any("FALL" in v.violation_type for v in viols)
