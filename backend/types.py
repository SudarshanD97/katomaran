from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Detection:
    bbox: tuple[int, int, int, int]
    confidence: float
    face_crop: object | None = None
    embedding: object | None = None
    visitor_id: Optional[str] = None
    matched: bool = False


@dataclass
class TrackState:
    track_id: int
    bbox: tuple[int, int, int, int]
    visitor_id: str
    last_seen_frame: int
    first_seen_frame: int
    last_seen_timestamp: str
    missed_frames: int = 0
    entered: bool = False
    exit_logged: bool = False
    representative_image_path: str = ""
    latest_image_path: str = ""
    best_confidence: float = 0.0
    source: str = ""


@dataclass
class EventRecord:
    visitor_id: str
    event_type: str
    timestamp: str
    track_id: int
    image_path: str
    embedding_hash: str = ""
    source: str = ""
    extra: dict[str, object] = field(default_factory=dict)
