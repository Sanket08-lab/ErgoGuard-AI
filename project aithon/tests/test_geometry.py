from src.utils.geometry import (
    calculate_angle_3points,
    calculate_angle_with_vertical,
    calculate_angle_with_horizontal,
    calculate_distance,
    point_in_polygon,
    get_bottom_center_point,
)


def test_calculate_distance():
    assert calculate_distance((0, 0), (3, 4)) == 5.0
    assert calculate_distance((10, 10), (10, 10)) == 0.0


def test_calculate_angle_3points():
    # Right angle (90 degrees)
    a = (0.0, 10.0)
    b = (0.0, 0.0)
    c = (10.0, 0.0)
    assert calculate_angle_3points(a, b, c) == 90.0

    # Straight line (180 degrees)
    a = (-10.0, 0.0)
    b = (0.0, 0.0)
    c = (10.0, 0.0)
    assert calculate_angle_3points(a, b, c) == 180.0


def test_calculate_angle_with_vertical():
    # Straight vertical line: p_top=(100, 50), p_bottom=(100, 150)
    assert calculate_angle_with_vertical((100, 50), (100, 150)) == 0.0

    # 45-degree tilt
    angle = calculate_angle_with_vertical((150, 50), (100, 100))
    assert 44.0 <= angle <= 46.0


def test_calculate_angle_with_horizontal():
    # Completely horizontal: p1=(0, 100), p2=(200, 100)
    assert calculate_angle_with_horizontal((0, 100), (200, 100)) == 0.0

    # Vertical line: angle with horizontal is 90
    assert calculate_angle_with_horizontal((100, 0), (100, 200)) == 90.0


def test_point_in_polygon():
    polygon = [
        [100.0, 100.0],
        [300.0, 100.0],
        [300.0, 300.0],
        [100.0, 300.0]
    ]

    # Center is inside
    assert point_in_polygon((200.0, 200.0), polygon) is True

    # Far outside
    assert point_in_polygon((50.0, 50.0), polygon) is False
    assert point_in_polygon((400.0, 200.0), polygon) is False


def test_get_bottom_center_point():
    bbox = [100, 50, 200, 250]
    fx, fy = get_bottom_center_point(bbox)
    assert fx == 150.0
    assert fy == 250.0
