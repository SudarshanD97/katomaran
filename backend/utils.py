from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def date_folder(ts_iso: str) -> str:
    return ts_iso[:10]


def ensure_dir(path: str | Path) -> Path:
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def embedding_hash(vector: Iterable[float] | np.ndarray) -> str:
    arr = np.asarray(list(vector), dtype=np.float32).tobytes()
    return hashlib.sha1(arr).hexdigest()[:16]


def cosine_similarity(a: Iterable[float], b: Iterable[float]) -> float:
    va = np.asarray(list(a), dtype=np.float32)
    vb = np.asarray(list(b), dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0.0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def crop_face(frame, bbox: tuple[int, int, int, int]):
    x1, y1, x2, y2 = bbox
    height, width = frame.shape[:2]
    x1 = max(0, min(width - 1, x1))
    y1 = max(0, min(height - 1, y1))
    x2 = max(0, min(width, x2))
    y2 = max(0, min(height, y2))
    return frame[y1:y2, x1:x2].copy()
