"""
Workplace Safety AI / Computer Vision - Main CLI Entrypoint
Member 3 Deliverables:
- PPE Detection
- Posture Detection using MediaPipe
- Fall Detection
- Danger-Zone Detection
- Standard Detection JSON Generation

Usage:
  python main.py --source mock               # Run built-in synthetic verification demo
  python main.py --source 0                  # Run on primary webcam
  python main.py --source path/to/video.mp4  # Run on prerecorded industrial footage
  python main.py --no-gui                    # Headless mode for server / backend streaming
"""

import argparse
import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config import AppConfig
from src.pipeline.safety_pipeline import SafetyPipeline
from src.output.json_exporter import JSONExporter
from src.utils.logger import setup_logger

try:
    import cv2
except ImportError:
    cv2 = None


def parse_args():
    parser = argparse.ArgumentParser(description="Workplace Safety AI / Computer Vision System")
    parser.add_argument("--source", type=str, default="mock",
                        help="Video source: '0' (webcam), path to .mp4/.avi file, 'rtsp://...', or 'mock'")
    parser.add_argument("--config", type=str, default="config.yaml",
                        help="Path to YAML configuration file")
    parser.add_argument("--danger-zones", type=str, default=None,
                        help="Path to danger zones definition JSON")
    parser.add_argument("--no-gui", action="store_true",
                        help="Disable OpenCV GUI window (headless server mode)")
    parser.add_argument("--save-video", type=str, default=None,
                        help="Path to save annotated output video (.mp4)")
    parser.add_argument("--max-frames", type=int, default=None,
                        help="Limit max frames to process (for batch / testing)")
    return parser.parse_args()


def main():
    args = parse_args()
    logger = setup_logger("Main")

    logger.info("Initializing Workplace Safety AI System...")
    config = AppConfig.load_from_file(args.config)
    if args.danger_zones:
        config.danger_zone.zones_file = args.danger_zones

    pipeline = SafetyPipeline(config=config)
    exporter = JSONExporter(
        json_file_path=config.output.output_json_path,
        jsonl_stream_path=config.output.jsonl_path
    )

    # If user selected mock/demo mode
    if args.source.lower() in ("mock", "demo", "test"):
        logger.info("Starting synthetic demo verification mode...")
        from examples.generate_synthetic_demo import run_synthetic_demo
        run_synthetic_demo()
        return

    # Check for OpenCV
    if cv2 is None:
        logger.error("OpenCV is not installed. Please run: pip install opencv-python")
        sys.exit(1)

    # Determine input source
    source_val = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source_val)

    if not cap.isOpened():
        logger.error(f"Cannot open video source: {args.source}")
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    logger.info(f"Connected to stream: {args.source} [{width}x{height} @ {fps:.1f} FPS]")

    # Video Writer
    video_writer = None
    if args.save_video:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        Path(args.save_video).parent.mkdir(parents=True, exist_ok=True)
        video_writer = cv2.VideoWriter(args.save_video, fourcc, fps, (width, height))
        logger.info(f"Saving output video to: {args.save_video}")

    frame_id = 0
    show_window = not args.no_gui

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.info("Stream ended or frame could not be read.")
                break

            frame_id += 1
            if args.max_frames and frame_id > args.max_frames:
                logger.info(f"Reached max frame limit ({args.max_frames}). Stopping.")
                break

            # Process frame through safety pipeline
            annotated_frame, payload = pipeline.process_frame(
                frame=frame,
                frame_id=frame_id,
            )

            # Export standard detection JSON
            exporter.export(payload)

            # Write to video if enabled
            if video_writer:
                video_writer.write(annotated_frame)

            # Display GUI window
            if show_window:
                cv2.imshow("Workplace Safety AI Vision (Member 3)", annotated_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord("q"):  # ESC or Q to quit
                    logger.info("User requested exit.")
                    break

            if frame_id % 30 == 0:
                s = payload.summary
                logger.info(
                    f"Frame {frame_id:04d} | Workers: {s.total_workers} | "
                    f"PPE Violations: {s.total_workers - s.compliant_ppe_workers} | "
                    f"Unsafe Postures: {s.unsafe_posture_count} | "
                    f"Zone Intrusions: {s.danger_zone_intrusions_count} | "
                    f"Active Falls: {s.active_falls_count}"
                )

    except KeyboardInterrupt:
        logger.info("Terminated by user keyboard interrupt.")
    finally:
        cap.release()
        if video_writer:
            video_writer.release()
        if show_window and cv2 is not None:
            cv2.destroyAllWindows()
        logger.info("Pipeline closed cleanly.")


if __name__ == "__main__":
    main()
