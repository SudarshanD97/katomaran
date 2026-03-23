from __future__ import annotations

import logging
from pathlib import Path

import cv2

from .config import AppConfig
from .db import VisitorDB
from .detector import YoloFaceDetector
from .logger import setup_logging
from .recognizer import FaceRecognizer
from .registry import FaceRegistry
from .tracker import TrackManager, TrackEvent
from .types import Detection, EventRecord
from .utils import crop_face, date_folder, ensure_dir, embedding_hash, utc_now_iso


class VisitorPipeline:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        ensure_dir(Path(config.storage.logs_dir) / "entries")
        ensure_dir(Path(config.storage.logs_dir) / "exits")
        ensure_dir(Path(config.storage.logs_dir) / "frames")

        self.logger = setup_logging(str(Path(config.storage.logs_dir) / "events.log"))
        self.db = VisitorDB(config.storage.db)
        self.detector = YoloFaceDetector(
            config.detector.model,
            config.detector.confidence_threshold,
            config.detector.iou_threshold,
        )
        self.recognizer = FaceRecognizer()
        self.registry = FaceRegistry(self.db, config.recognizer.similarity_threshold)
        self.tracker = TrackManager(config.tracker.max_lost_frames)
        self.is_running = True

    def stop(self) -> None:
        self.is_running = False

    def run(self, source: str | None = None) -> int:
        capture_source = source or self.config.input_source
        capture = cv2.VideoCapture(capture_source)
        if not capture.isOpened() and self.config.rtsp_fallback:
            self.logger.info(f"source={capture_source} unavailable, retrying RTSP fallback")
            capture = cv2.VideoCapture(self.config.rtsp_fallback)

        if not capture.isOpened():
            raise RuntimeError(f"Unable to open video source: {capture_source}")

        frame_index = 0
        while self.is_running:
            ok, frame = capture.read()
            if not ok:
                break

            timestamp = utc_now_iso()
            detections = self._detect_if_needed(frame, frame_index, timestamp, capture_source)
            if detections is not None:
                for detection in detections:
                    if detection.embedding is None:
                        detection.face_crop = crop_face(frame, detection.bbox)
                        detection.embedding = self.recognizer.embed(detection.face_crop)

                    match = self.registry.match_or_register(
                        detection.embedding,
                        timestamp=timestamp,
                        source=capture_source,
                        image_path=self._preview_image_path(timestamp, detection.visitor_id),
                    )
                    detection.visitor_id = match.visitor_id
                    detection.matched = match.matched

                    if match.matched:
                        self.logger.info(
                            f"recognition visitor_id={match.visitor_id} similarity={match.similarity:.4f} hash={match.embedding_hash}"
                        )
                    else:
                        self.logger.info(f"registration visitor_id={match.visitor_id} hash={match.embedding_hash}")

                    detection.embedding = list(float(x) for x in detection.embedding)

                events = self.tracker.update(detections, frame_index, timestamp, capture_source)
                for event in events:
                    self._handle_event(frame, event, timestamp, capture_source)

            frame_index += 1

        capture.release()
        self.db.close()
        return self.registry.count()

    def _detect_if_needed(
        self,
        frame,
        frame_index: int,
        timestamp: str,
        source: str,
    ) -> list[Detection] | None:
        if frame_index % (self.config.detection_skip_frames + 1) != 0:
            return None

        detections = self.detector.detect(frame)
        self.logger.info(f"detection frame={frame_index} count={len(detections)}")
        return detections

    def _handle_event(self, frame, event: TrackEvent, timestamp: str, source: str) -> None:
        track = event.track
        face_crop = crop_face(frame, track.bbox)
        day = date_folder(timestamp)

        if event.kind == "entry":
            image_path = self._write_event_image(face_crop, "entries", day, track.visitor_id, timestamp)
            if not track.representative_image_path:
                track.representative_image_path = image_path
                self.db.update_representative_image(track.visitor_id, image_path)
            event_record = EventRecord(
                visitor_id=track.visitor_id,
                event_type="entry",
                timestamp=timestamp,
                track_id=track.track_id,
                image_path=image_path,
                embedding_hash=embedding_hash([0.0]),
                source=source,
                extra={"track_state": "inside", "confidence": track.best_confidence},
            )
            if self.db.record_event(event_record):
                self.logger.info(f"entry visitor_id={track.visitor_id} track={track.track_id} image={image_path}")

        elif event.kind == "exit":
            image_path = self._write_event_image(face_crop, "exits", day, track.visitor_id, timestamp)
            event_record = EventRecord(
                visitor_id=track.visitor_id,
                event_type="exit",
                timestamp=timestamp,
                track_id=track.track_id,
                image_path=image_path,
                embedding_hash=embedding_hash([0.0]),
                source=source,
                extra={"track_state": "exited", "confidence": track.best_confidence},
            )
            if self.db.record_event(event_record):
                self.logger.info(f"exit visitor_id={track.visitor_id} track={track.track_id} image={image_path}")

    def _write_event_image(self, face_crop, event_type: str, day: str, visitor_id: str, timestamp: str) -> str:
        folder = ensure_dir(Path(self.config.storage.logs_dir) / event_type / day)
        filename = f"{visitor_id}_{timestamp[11:19].replace(':', '')}.jpg"
        path = folder / filename
        cv2.imwrite(str(path), face_crop)
        return str(path)

    def _preview_image_path(self, timestamp: str, visitor_id: str | None) -> str:
        day = date_folder(timestamp)
        visitor = visitor_id or "pending"
        return str(Path(self.config.storage.logs_dir) / "entries" / day / f"{visitor}_{timestamp[11:19].replace(':', '')}.jpg")
