from __future__ import annotations

import cv2
import numpy as np


class FaceRecognizer:
    def __init__(self) -> None:
        self._model = None
        self._mode = "fallback"
        try:
            from insightface.app import FaceAnalysis  # type: ignore

            self._model = FaceAnalysis(name="buffalo_l")
            self._model.prepare(ctx_id=0, det_size=(640, 640))
            self._mode = "insightface"
        except Exception:
            self._model = None

    def embed(self, face_crop) -> np.ndarray:
        if face_crop is None or face_crop.size == 0:
            return np.zeros(128, dtype=np.float32)

        if self._mode == "insightface" and self._model is not None:
            faces = self._model.get(face_crop)
            if faces:
                return faces[0].embedding.astype(np.float32)

        resized = cv2.resize(face_crop, (16, 16), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        histogram = cv2.calcHist([gray], [0], None, [128], [0, 256]).flatten().astype(np.float32)
        norm = np.linalg.norm(histogram) or 1.0
        return histogram / norm
