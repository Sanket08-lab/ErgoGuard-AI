"""
Configuration loader for the Safety AI Vision System.
Loads YAML configuration with comprehensive fallback defaults.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import os

try:
    import yaml
except ImportError:
    yaml = None


@dataclass
class SystemConfig:
    camera_id: str = "cam_floor_01"
    fps: int = 30
    resolution: List[int] = field(default_factory=lambda: [1280, 720])


@dataclass
class PPEConfig:
    enabled: bool = True
    model_path: str = "models/yolov8n-ppe.pt"
    confidence_threshold: float = 0.45
    iou_threshold: float = 0.45
    required_ppe: List[str] = field(default_factory=lambda: ["helmet", "vest"])


@dataclass
class PostureFatigueConfig:
    enabled: bool = True
    min_detection_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    model_complexity: int = 1
    trunk_inclination_unsafe_deg: float = 45.0
    trunk_inclination_severe_deg: float = 65.0
    neck_flexion_unsafe_deg: float = 35.0
    knee_flexion_straight_deg: float = 30.0
    safe_lift_knee_flexion_deg: float = 60.0
    head_droop_angle_deg: float = 40.0
    fatigue_dwell_frames: int = 60
    immobility_seconds_threshold: float = 15.0


@dataclass
class FallConfig:
    enabled: bool = True
    aspect_ratio_fall_threshold: float = 0.85
    torso_angle_horizontal_deg: float = 30.0
    velocity_descent_threshold_px: float = 25.0
    confirmation_frames: int = 10
    recovery_timeout_seconds: float = 5.0


@dataclass
class DangerZoneConfig:
    enabled: bool = True
    zones_file: str = "sample_danger_zones.json"
    tracking_point: str = "feet"
    enforce_ppe_rules: bool = True


@dataclass
class OutputConfig:
    save_json: bool = True
    output_json_path: str = "output/detections.json"
    stream_jsonl: bool = True
    jsonl_path: str = "output/detections.jsonl"
    print_summary_console: bool = True
    api_port: int = 8000


@dataclass
class AppConfig:
    system: SystemConfig = field(default_factory=SystemConfig)
    ppe: PPEConfig = field(default_factory=PPEConfig)
    posture_fatigue: PostureFatigueConfig = field(default_factory=PostureFatigueConfig)
    fall: FallConfig = field(default_factory=FallConfig)
    danger_zone: DangerZoneConfig = field(default_factory=DangerZoneConfig)
    output: OutputConfig = field(default_factory=OutputConfig)

    @classmethod
    def load_from_file(cls, config_path: str = "config.yaml") -> "AppConfig":
        """Load configuration from YAML file or return defaults."""
        path = Path(config_path)
        if not path.exists():
            return cls()

        data: Dict[str, Any] = {}
        if yaml is not None:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception as e:
                print(f"[Config] Warning: Could not read {config_path}: {e}, using defaults.")
                return cls()

        cfg = cls()
        if "system" in data:
            s = data["system"]
            cfg.system = SystemConfig(
                camera_id=s.get("camera_id", cfg.system.camera_id),
                fps=s.get("fps", cfg.system.fps),
                resolution=s.get("resolution", cfg.system.resolution),
            )
        if "ppe" in data:
            p = data["ppe"]
            cfg.ppe = PPEConfig(
                enabled=p.get("enabled", cfg.ppe.enabled),
                model_path=p.get("model_path", cfg.ppe.model_path),
                confidence_threshold=p.get("confidence_threshold", cfg.ppe.confidence_threshold),
                iou_threshold=p.get("iou_threshold", cfg.ppe.iou_threshold),
                required_ppe=p.get("required_ppe", cfg.ppe.required_ppe),
            )
        if "posture_fatigue" in data:
            pf = data["posture_fatigue"]
            th = pf.get("thresholds", {})
            cfg.posture_fatigue = PostureFatigueConfig(
                enabled=pf.get("enabled", cfg.posture_fatigue.enabled),
                min_detection_confidence=pf.get("min_detection_confidence", cfg.posture_fatigue.min_detection_confidence),
                min_tracking_confidence=pf.get("min_tracking_confidence", cfg.posture_fatigue.min_tracking_confidence),
                model_complexity=pf.get("model_complexity", cfg.posture_fatigue.model_complexity),
                trunk_inclination_unsafe_deg=th.get("trunk_inclination_unsafe_deg", cfg.posture_fatigue.trunk_inclination_unsafe_deg),
                trunk_inclination_severe_deg=th.get("trunk_inclination_severe_deg", cfg.posture_fatigue.trunk_inclination_severe_deg),
                neck_flexion_unsafe_deg=th.get("neck_flexion_unsafe_deg", cfg.posture_fatigue.neck_flexion_unsafe_deg),
                knee_flexion_straight_deg=th.get("knee_flexion_straight_deg", cfg.posture_fatigue.knee_flexion_straight_deg),
                safe_lift_knee_flexion_deg=th.get("safe_lift_knee_flexion_deg", cfg.posture_fatigue.safe_lift_knee_flexion_deg),
                head_droop_angle_deg=th.get("head_droop_angle_deg", cfg.posture_fatigue.head_droop_angle_deg),
                fatigue_dwell_frames=th.get("fatigue_dwell_frames", cfg.posture_fatigue.fatigue_dwell_frames),
                immobility_seconds_threshold=th.get("immobility_seconds_threshold", cfg.posture_fatigue.immobility_seconds_threshold),
            )
        if "fall" in data:
            fl = data["fall"]
            cfg.fall = FallConfig(
                enabled=fl.get("enabled", cfg.fall.enabled),
                aspect_ratio_fall_threshold=fl.get("aspect_ratio_fall_threshold", cfg.fall.aspect_ratio_fall_threshold),
                torso_angle_horizontal_deg=fl.get("torso_angle_horizontal_deg", cfg.fall.torso_angle_horizontal_deg),
                velocity_descent_threshold_px=fl.get("velocity_descent_threshold_px", cfg.fall.velocity_descent_threshold_px),
                confirmation_frames=fl.get("confirmation_frames", cfg.fall.confirmation_frames),
                recovery_timeout_seconds=fl.get("recovery_timeout_seconds", cfg.fall.recovery_timeout_seconds),
            )
        if "danger_zone" in data:
            dz = data["danger_zone"]
            cfg.danger_zone = DangerZoneConfig(
                enabled=dz.get("enabled", cfg.danger_zone.enabled),
                zones_file=dz.get("zones_file", cfg.danger_zone.zones_file),
                tracking_point=dz.get("tracking_point", cfg.danger_zone.tracking_point),
                enforce_ppe_rules=dz.get("enforce_ppe_rules", cfg.danger_zone.enforce_ppe_rules),
            )
        if "output" in data:
            out = data["output"]
            cfg.output = OutputConfig(
                save_json=out.get("save_json", cfg.output.save_json),
                output_json_path=out.get("output_json_path", cfg.output.output_json_path),
                stream_jsonl=out.get("stream_jsonl", cfg.output.stream_jsonl),
                jsonl_path=out.get("jsonl_path", cfg.output.jsonl_path),
                print_summary_console=out.get("print_summary_console", cfg.output.print_summary_console),
                api_port=out.get("api_port", cfg.output.api_port),
            )
        return cfg
