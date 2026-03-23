from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Iterable

from .db import VisitorDB
from .utils import cosine_similarity, embedding_hash


@dataclass
class RegistryMatch:
    visitor_id: str
    matched: bool
    similarity: float
    embedding_hash: str


class FaceRegistry:
    def __init__(self, db: VisitorDB, similarity_threshold: float) -> None:
        self.db = db
        self.threshold = similarity_threshold
        self._registry: list[dict[str, object]] = db.load_registry()

    def refresh(self) -> None:
        self._registry = self.db.load_registry()

    def match_or_register(self, embedding: Iterable[float], timestamp: str, source: str, image_path: str) -> RegistryMatch:
        vector = list(float(x) for x in embedding)
        best_id = ""
        best_score = -1.0

        for row in self._registry:
            score = cosine_similarity(vector, row["embedding"])
            if score > best_score:
                best_id = str(row["visitor_id"])
                best_score = score

        if best_score >= self.threshold and best_id:
            self.db.update_last_seen(best_id, timestamp)
            return RegistryMatch(best_id, True, best_score, embedding_hash(vector))

        visitor_id = self._generate_id()
        self.db.upsert_visitor(visitor_id, timestamp, image_path, vector, source)
        self.refresh()
        return RegistryMatch(visitor_id, False, 1.0, embedding_hash(vector))

    def count(self) -> int:
        return self.db.unique_count()

    def _generate_id(self) -> str:
        return f"V-{uuid.uuid4().hex[:8].upper()}"
