"""
Base Detector abstract class for modular Computer Vision detectors.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseDetector(ABC):
    """Abstract base class for all workplace safety detectors."""

    def __init__(self, name: str, enabled: bool = True):
        self.name = name
        self.enabled = enabled

    @abstractmethod
    def process(self, frame: Any, **kwargs) -> Dict[str, Any]:
        """
        Process an input video frame or cropped region.
        Must return detection results in a dictionary or model instance.
        """
        pass

    def reset(self) -> None:
        """Reset internal temporal states / tracking queues if needed."""
        pass
