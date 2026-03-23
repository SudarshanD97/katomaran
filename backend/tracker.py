from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .types import Detection, TrackState


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area == 0:
        return 0.0
    area_a = max(1, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(1, (bx2 - bx1) * (by2 - by1))
    return inter_area / float(area_a + area_b - inter_area)


@dataclass
class TrackEvent:
    kind: str
    track: TrackState


class TrackManager:
    def __init__(self, max_lost_frames: int) -> None:
        self.max_lost_frames = max_lost_frames
        self._tracks: dict[int, TrackState] = {}
        self._next_track_id = 1

    def update(
        self,
        detections: list[Detection],
        frame_index: int,
        timestamp: str,
        source: str,
    ) -> list[TrackEvent]:
        events: list[TrackEvent] = []
        used_track_ids: set[int] = set()

        for detection in detections:
            best_track_id = None
            best_score = 0.0
            for track_id, track in self._tracks.items():
                if track_id in used_track_ids:
                    continue
                score = _iou(track.bbox, detection.bbox)
                if score > best_score:
                    best_score = score
                    best_track_id = track_id

            if best_track_id is not None and best_score > 0.2:
                track = self._tracks[best_track_id]
                track.bbox = detection.bbox
                track.last_seen_frame = frame_index
                track.last_seen_timestamp = timestamp
                track.missed_frames = 0
                track.latest_image_path = track.latest_image_path or ""
                track.best_confidence = max(track.best_confidence, detection.confidence)
                track.source = source
                used_track_ids.add(best_track_id)
            else:
                track = TrackState(
                    track_id=self._next_track_id,
                    bbox=detection.bbox,
                    visitor_id=detection.visitor_id or "",
                    last_seen_frame=frame_index,
                    first_seen_frame=frame_index,
                    last_seen_timestamp=timestamp,
                    source=source,
                    best_confidence=detection.confidence,
                )
                self._tracks[self._next_track_id] = track
                used_track_ids.add(self._next_track_id)
                self._next_track_id += 1
                events.append(TrackEvent("entry_candidate", track))

        for track_id, track in list(self._tracks.items()):
            if track_id in used_track_ids:
                if not track.entered:
                    track.entered = True
                    events.append(TrackEvent("entry", track))
                continue

            track.missed_frames += 1
            if track.missed_frames >= self.max_lost_frames and not track.exit_logged:
                track.exit_logged = True
                events.append(TrackEvent("exit", track))
                del self._tracks[track_id]

        return events

    def active_tracks(self) -> list[TrackState]:
        return list(self._tracks.values())
