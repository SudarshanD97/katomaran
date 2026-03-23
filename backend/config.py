from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class DetectorConfig:
    model: str
    confidence_threshold: float
    iou_threshold: float


@dataclass
class RecognizerConfig:
    model: str
    similarity_threshold: float
    register_on_first_seen: bool


@dataclass
class TrackerConfig:
    algorithm: str
    max_lost_frames: int


@dataclass
class StorageConfig:
    db: str
    logs_dir: str


@dataclass
class AppConfig:
    input_source: str
    rtsp_fallback: str
    detection_skip_frames: int
    detector: DetectorConfig
    recognizer: RecognizerConfig
    tracker: TrackerConfig
    storage: StorageConfig


def load_config(path: str | Path) -> AppConfig:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return AppConfig(
        input_source=raw["input_source"],
        rtsp_fallback=raw.get("rtsp_fallback", ""),
        detection_skip_frames=int(raw.get("detection_skip_frames", 4)),
        detector=DetectorConfig(**raw["detector"]),
        recognizer=RecognizerConfig(**raw["recognizer"]),
        tracker=TrackerConfig(**raw["tracker"]),
        storage=StorageConfig(**raw["storage"]),
    )
