"""
Geometric utility functions for 2D/3D keypoints, joint angles, and polygon testing.
Designed for MediaPipe pose analysis and danger zone boundary calculations.
"""

import math
from typing import List, Tuple, Union

try:
    import numpy as np
except ImportError:
    np = None


def calculate_distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Calculate Euclidean distance between two 2D points."""
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def calculate_angle_3points(
    a: Tuple[float, float],
    b: Tuple[float, float],
    c: Tuple[float, float]
) -> float:
    """
    Calculate the interior angle at vertex b given three points a-b-c.
    Returns angle in degrees (0 to 180).
    """
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])

    dot_product = ba[0] * bc[0] + ba[1] * bc[1]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2)

    if mag_ba * mag_bc == 0:
        return 0.0

    cosine_angle = dot_product / (mag_ba * mag_bc)
    # Clamp cosine to [-1, 1] to avoid float domain errors
    cosine_angle = max(-1.0, min(1.0, cosine_angle))
    angle = math.acos(cosine_angle)
    return round(math.degrees(angle), 2)


def calculate_angle_with_vertical(
    p_top: Tuple[float, float],
    p_bottom: Tuple[float, float]
) -> float:
    """
    Calculate the inclination angle of vector (p_bottom -> p_top) relative to the vertical line.
    0 deg = perfectly upright/vertical.
    90 deg = completely horizontal.
    """
    dx = p_top[0] - p_bottom[0]
    dy = p_bottom[1] - p_top[1]  # In screen coords, top has smaller Y

    angle_rad = math.atan2(abs(dx), max(1e-6, dy))
    return round(math.degrees(angle_rad), 2)


def calculate_angle_with_horizontal(
    p1: Tuple[float, float],
    p2: Tuple[float, float]
) -> float:
    """
    Calculate the angle of line between p1 and p2 relative to the horizontal floor.
    0 deg = parallel to the ground (fallen).
    90 deg = upright / vertical.
    """
    dx = abs(p2[0] - p1[0])
    dy = abs(p2[1] - p1[1])

    angle_rad = math.atan2(dy, max(1e-6, dx))
    return round(math.degrees(angle_rad), 2)


def point_in_polygon(
    point: Tuple[float, float],
    polygon: List[Union[List[float], Tuple[float, float]]]
) -> bool:
    """
    Ray-casting algorithm to test if a point (x, y) is inside a 2D polygon.
    Works for convex and non-convex polygons without external dependencies.
    """
    x, y = point
    n = len(polygon)
    inside = False

    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside


def get_bottom_center_point(
    bbox: Union[List[int], Tuple[int, int, int, int]]
) -> Tuple[float, float]:
    """
    Extract the bottom-center point (worker feet location) from a bounding box [x1, y1, x2, y2].
    """
    x1, y1, x2, y2 = bbox
    foot_x = (x1 + x2) / 2.0
    foot_y = float(y2)
    return foot_x, foot_y
