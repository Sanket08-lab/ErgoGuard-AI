"""
Standard Detection JSON Exporter.
Serializes DetectionFramePayload to formatted JSON files, streaming JSONL logs,
or console outputs for frontend and backend teammates.
"""

from pathlib import Path
from typing import Optional, Union
import json

from ..models.schemas import DetectionFramePayload


class JSONExporter:
    """
    Handles file saving, streaming JSONL, and formatting for detection payloads.
    """

    def __init__(
        self,
        json_file_path: Optional[str] = "output/detections.json",
        jsonl_stream_path: Optional[str] = "output/detections.jsonl",
        pretty_print: bool = True
    ):
        self.json_file_path = json_file_path
        self.jsonl_stream_path = jsonl_stream_path
        self.pretty_print = pretty_print

        # Ensure output directories exist
        if self.json_file_path:
            Path(self.json_file_path).parent.mkdir(parents=True, exist_ok=True)
        if self.jsonl_stream_path:
            Path(self.jsonl_stream_path).parent.mkdir(parents=True, exist_ok=True)

    def export(self, payload: Union[DetectionFramePayload, dict]) -> str:
        """
        Convert payload to JSON string, update json file and append to jsonl stream.
        Returns the serialized JSON string.
        """
        data = payload.to_dict() if hasattr(payload, "to_dict") else payload

        indent = 2 if self.pretty_print else None
        json_str = json.dumps(data, indent=indent, default=str)

        # 1. Write latest snapshot to JSON file
        if self.json_file_path:
            try:
                with open(self.json_file_path, "w", encoding="utf-8") as f:
                    f.write(json_str)
            except Exception as e:
                print(f"[JSONExporter] Failed to write {self.json_file_path}: {e}")

        # 2. Append single-line JSON to JSONL stream
        if self.jsonl_stream_path:
            try:
                compact_str = json.dumps(data, default=str)
                with open(self.jsonl_stream_path, "a", encoding="utf-8") as f:
                    f.write(compact_str + "\n")
            except Exception as e:
                print(f"[JSONExporter] Failed to append to {self.jsonl_stream_path}: {e}")

        return json_str

    @staticmethod
    def to_pretty_json(payload: Union[DetectionFramePayload, dict]) -> str:
        """Serialize payload to indented JSON string without writing to disk."""
        data = payload.to_dict() if hasattr(payload, "to_dict") else payload
        return json.dumps(data, indent=2, default=str)
