from src.detectors.posture_detector import PostureDetector
from src.models.schemas import BoundingBox, PostureState, ViolationSeverity


def test_posture_safe_standing():
    detector = PostureDetector()
    box = BoundingBox(x1=100, y1=100, x2=200, y2=400, confidence=0.9)

    # Synthetic upright landmarks:
    # 11: left_shoulder (140, 150), 12: right_shoulder (160, 150) -> mid: (150, 150)
    # 23: left_hip (145, 260), 24: right_hip (155, 260) -> mid: (150, 260) -> vertical!
    # 7: left_ear (145, 120), 8: right_ear (155, 120) -> mid: (150, 120)
    # 25: left_knee (145, 330), 26: right_knee (155, 330)
    # 27: left_ankle (145, 390), 28: right_ankle (155, 390)
    landmarks = {
        11: (140.0, 150.0, 0.9),
        12: (160.0, 150.0, 0.9),
        23: (145.0, 260.0, 0.9),
        24: (155.0, 260.0, 0.9),
        7: (145.0, 120.0, 0.9),
        8: (155.0, 120.0, 0.9),
        25: (145.0, 330.0, 0.9),
        26: (155.0, 330.0, 0.9),
        27: (145.0, 390.0, 0.9),
        28: (155.0, 390.0, 0.9),
    }

    p_stat, f_stat, viols = detector.analyze_crop_or_landmarks(
        frame=None,
        bbox=box,
        worker_id=1,
        external_landmarks=landmarks
    )

    assert p_stat.status == PostureState.SAFE
    assert p_stat.angles.trunk_inclination_deg < 10.0
    assert f_stat.is_fatigued is False


def test_unsafe_lifting_posture():
    detector = PostureDetector(trunk_unsafe_deg=40.0)
    box = BoundingBox(x1=100, y1=100, x2=300, y2=400, confidence=0.9)

    # Worker bending trunk forward (DX = 120, DY = 60 -> ~63 deg inclination) with straight knees (180 deg)
    landmarks = {
        11: (260.0, 210.0, 0.9),
        12: (280.0, 210.0, 0.9),  # Shoulders forward and low
        23: (150.0, 270.0, 0.9),
        24: (160.0, 270.0, 0.9),  # Hips back
        7: (280.0, 190.0, 0.9),
        8: (300.0, 190.0, 0.9),
        25: (150.0, 340.0, 0.9),
        26: (160.0, 340.0, 0.9),  # Knees straight
        27: (150.0, 400.0, 0.9),
        28: (160.0, 400.0, 0.9),
    }

    p_stat, f_stat, viols = detector.analyze_crop_or_landmarks(
        frame=None,
        bbox=box,
        worker_id=2,
        external_landmarks=landmarks
    )

    assert p_stat.status == PostureState.UNSAFE_LIFTING
    assert p_stat.risk_level in (ViolationSeverity.HIGH, ViolationSeverity.CRITICAL)
    assert any(v.violation_type == "UNSAFE_LIFTING_POSTURE" for v in viols)
