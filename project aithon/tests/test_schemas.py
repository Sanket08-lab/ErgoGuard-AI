import json
from src.models.schemas import (
    BoundingBox,
    PPEItemStatus,
    PPEStatus,
    PostureAngles,
    PostureState,
    PostureStatus,
    FatigueStatus,
    FallState,
    FallStatus,
    DangerZoneStatus,
    ViolationSeverity,
    ViolationEvent,
    WorkerDetection,
    FrameSummary,
    DetectionFramePayload,
)


def test_schema_serialization():
    bbox = BoundingBox(x1=100, y1=100, x2=200, y2=400, confidence=0.92)
    assert bbox.width == 100
    assert bbox.height == 300
    assert bbox.center_x == 150
    assert bbox.center_y == 250

    ppe = PPEStatus(
        compliant=False,
        helmet=PPEItemStatus(detected=True, confidence=0.95),
        vest=PPEItemStatus(detected=False, confidence=0.10),
        missing_required_ppe=["vest"]
    )

    posture = PostureStatus(
        status=PostureState.UNSAFE_LIFTING,
        risk_level=ViolationSeverity.HIGH,
        confidence=0.88,
        angles=PostureAngles(trunk_inclination_deg=48.2, neck_flexion_deg=22.0, reba_risk_score=7),
        description="Dangerous bending test"
    )

    fatigue = FatigueStatus(
        is_fatigued=False,
        fatigue_score=0.18,
        indicators=[]
    )

    fall = FallStatus(
        is_fallen=False,
        state=FallState.NORMAL,
        confidence=0.05,
        aspect_ratio=3.0,
        torso_angle_deg=85.0
    )

    dz = DangerZoneStatus(
        is_inside=False
    )

    worker = WorkerDetection(
        track_id=1,
        bbox=bbox,
        ppe=ppe,
        posture=posture,
        fatigue=fatigue,
        fall=fall,
        danger_zone=dz,
        violations=[
            ViolationEvent(
                violation_type="MISSING_PPE_VEST",
                severity=ViolationSeverity.HIGH,
                message="Missing vest",
                timestamp="2026-10-19T10:00:00Z"
            )
        ]
    )

    summary = FrameSummary(
        total_workers=1,
        compliant_ppe_workers=0,
        unsafe_posture_count=1,
        fatigued_workers_count=0,
        active_falls_count=0,
        danger_zone_intrusions_count=0,
        total_violations_count=1,
        critical_alerts_count=0
    )

    payload = DetectionFramePayload(
        version="1.0.0",
        timestamp="2026-10-19T10:00:00Z",
        frame_id=1,
        camera_id="cam_01",
        fps_processing=30.0,
        summary=summary,
        workers=[worker],
        danger_zones=[],
        critical_alerts=[]
    )

    data = payload.to_dict()
    assert data["version"] == "1.0.0"
    assert data["summary"]["total_workers"] == 1
    assert data["workers"][0]["track_id"] == 1
    assert data["workers"][0]["ppe"]["missing_required_ppe"] == ["vest"]

    # Verify JSON serializability
    json_str = json.dumps(data)
    assert len(json_str) > 0
