"""
Self-contained test runner using Python's built-in unittest module.
Allows testing all components without requiring pytest or external packages.
"""

import unittest
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Import test functions
from tests.test_geometry import (
    test_calculate_distance,
    test_calculate_angle_3points,
    test_calculate_angle_with_vertical,
    test_calculate_angle_with_horizontal,
    test_point_in_polygon,
    test_get_bottom_center_point,
)
from tests.test_schemas import test_schema_serialization
from tests.test_danger_zone import test_danger_zone_detection, test_danger_zone_ppe_enforcement
from tests.test_fall import test_fall_detection_upright_worker, test_fall_detection_fallen_worker
from tests.test_posture import test_posture_safe_standing, test_unsafe_lifting_posture
from tests.test_pipeline import test_pipeline_end_to_end


class TestWorkplaceSafetyCV(unittest.TestCase):

    def test_01_geometry(self):
        test_calculate_distance()
        test_calculate_angle_3points()
        test_calculate_angle_with_vertical()
        test_calculate_angle_with_horizontal()
        test_point_in_polygon()
        test_get_bottom_center_point()

    def test_02_schemas(self):
        test_schema_serialization()

    def test_03_danger_zone(self):
        test_danger_zone_detection()
        test_danger_zone_ppe_enforcement()

    def test_04_fall_detector(self):
        test_fall_detection_upright_worker()
        test_fall_detection_fallen_worker()

    def test_05_posture_detector(self):
        test_posture_safe_standing()
        test_unsafe_lifting_posture()

    def test_06_pipeline_end_to_end(self):
        test_pipeline_end_to_end()


if __name__ == "__main__":
    suite = unittest.TestLoader().loadTestsFromTestCase(TestWorkplaceSafetyCV)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
