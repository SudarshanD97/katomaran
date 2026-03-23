from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2

from .types import Detection


@dataclass
class DetectorOutput:
    detections: list[Detection]


class YoloFaceDetector:
    def __init__(self, model_path: str, confidence_threshold: float, iou_threshold: float) -> None:
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self._mode = "cascade"
        self._model = None

        try:
            from ultralytics import YOLO  # type: ignore

            self._model = YOLO(model_path)
            self._mode = "yolo"
        except Exception:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._cascade = cv2.CascadeClassifier(cascade_path)

    def detect(self, frame) -> list[Detection]:
        if self._mode == "yolo" and self._model is not None:
            results = self._model.predict(frame, conf=self.confidence_threshold, iou=self.iou_threshold, verbose=False)
            detections: list[Detection] = []
            for result in results:
                boxes = getattr(result, "boxes", None)
                if boxes is None:
                    continue
                for box in boxes:
                    xyxy = box.xyxy[0].tolist()
                    detections.append(
                        Detection(
                            bbox=(int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])),
                            confidence=float(box.conf[0]),
                        )
                    )
            return detections

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        return [Detection(bbox=(x, y, x + w, y + h), confidence=0.5) for (x, y, w, h) in faces]
