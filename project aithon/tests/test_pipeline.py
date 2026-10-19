from src.config import AppConfig
from src.pipeline.safety_pipeline import SafetyPipeline
from src.models.schemas import BoundingBox
from src.output.json_exporter import JSONExporter


def test_pipeline_end_to_end():
    config = AppConfig()
    pipeline = SafetyPipeline(config=config)
    exporter = JSONExporter(
        json_file_path="output/test_output.json",
        jsonl_stream_path=None
    )

    boxes = [
        BoundingBox(x1=100, y1=100, x2=200, y2=400, confidence=0.95),
        BoundingBox(x1=500, y1=450, x2=800, y2=550, confidence=0.90),
    ]

    # Process frame
    _, payload = pipeline.process_frame(frame=None, frame_id=1, manual_boxes=boxes)

    assert payload.version == "1.0.0"
    assert payload.summary.total_workers == 2
    assert len(payload.workers) == 2

    # Check worker 2 fall detection
    worker2 = payload.workers[1]
    assert worker2.fall.aspect_ratio < 0.85

    # Check export
    json_str = exporter.export(payload)
    assert "workers" in json_str
    assert "summary" in json_str
