"""
FastAPI & WebSocket Server for Frontend and Backend Integration.
Provides:
- GET /api/detections/latest : Latest standardized JSON detection frame
- GET /api/danger-zones      : Configured hazard zone geofences
- GET /api/health            : Service health & AI model readiness
- WebSocket /ws/detections   : Real-time live detection event stream for React/Next.js/Vue dashboards
"""

import json
from pathlib import Path
from typing import List
import asyncio

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
except ImportError:
    FastAPI = None

app = FastAPI(
    title="Workplace Safety AI / Computer Vision API",
    description="Live AI Detection Stream for PPE, MediaPipe Posture/Fatigue, Fall Detection, and Danger Zones",
    version="1.0.0"
) if FastAPI is not None else None

if app is not None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

DETECTIONS_JSON_PATH = "output/detections.json"
DANGER_ZONES_PATH = "sample_danger_zones.json"


class ConnectionManager:
    """Manages active WebSocket subscribers for live AI detection events."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager() if FastAPI is not None else None


if app is not None:
    @app.get("/api/health")
    async def health_check():
        return {
            "status": "online",
            "service": "Workplace Safety AI / Computer Vision (Member 3)",
            "modules": [
                "PPE Detection",
                "MediaPipe Posture & Fatigue",
                "Fall Detection",
                "Danger-Zone Detection",
                "Standard Detection JSON"
            ]
        }

    @app.get("/api/detections/latest")
    async def get_latest_detection():
        path = Path(DETECTIONS_JSON_PATH)
        if not path.exists():
            # Fallback to example standard output
            sample_path = Path("examples/standard_detection_output.json")
            if sample_path.exists():
                with open(sample_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            return JSONResponse(status_code=404, content={"error": "No detections generated yet."})

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data

    @app.get("/api/danger-zones")
    async def get_danger_zones():
        path = Path(DANGER_ZONES_PATH)
        if not path.exists():
            return JSONResponse(status_code=404, content={"error": "Danger zones not configured."})
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @app.websocket("/ws/detections")
    async def websocket_detections(websocket: WebSocket):
        await manager.connect(websocket)
        last_mtime = 0.0
        path = Path(DETECTIONS_JSON_PATH)

        try:
            while True:
                if path.exists():
                    mtime = path.stat().st_mtime
                    if mtime > last_mtime:
                        last_mtime = mtime
                        with open(path, "r", encoding="utf-8") as f:
                            content = f.read()
                        await websocket.send_text(content)
                await asyncio.sleep(0.1)  # 10Hz poll/push for live frames
        except WebSocketDisconnect:
            manager.disconnect(websocket)
        except Exception:
            manager.disconnect(websocket)


def start_server():
    if FastAPI is None:
        print("[API Server] FastAPI or uvicorn not installed. Please install: pip install fastapi uvicorn")
        return
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    start_server()
