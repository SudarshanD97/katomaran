from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable

from .types import EventRecord


class VisitorDB:
    def __init__(self, db_path: str) -> None:
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS visitors (
                visitor_id TEXT PRIMARY KEY,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                representative_image_path TEXT NOT NULL,
                source TEXT NOT NULL,
                embedding TEXT NOT NULL,
                embedding_hash TEXT NOT NULL
            );
            """
        )
        cursor = self.conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'")
        row = cursor.fetchone()
        if row and "UNIQUE" in row["sql"].upper():
            self.conn.executescript(
                """
                CREATE TABLE events_temp AS SELECT id, visitor_id, event_type, timestamp, track_id, image_path, embedding_hash, source, extra_json FROM events;
                DROP TABLE events;
                CREATE TABLE events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    visitor_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    track_id INTEGER NOT NULL,
                    image_path TEXT NOT NULL,
                    embedding_hash TEXT NOT NULL,
                    source TEXT NOT NULL,
                    extra_json TEXT NOT NULL
                );
                INSERT INTO events (id, visitor_id, event_type, timestamp, track_id, image_path, embedding_hash, source, extra_json)
                SELECT id, visitor_id, event_type, timestamp, track_id, image_path, embedding_hash, source, extra_json FROM events_temp;
                DROP TABLE events_temp;
                """
            )
        else:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    visitor_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    track_id INTEGER NOT NULL,
                    image_path TEXT NOT NULL,
                    embedding_hash TEXT NOT NULL,
                    source TEXT NOT NULL,
                    extra_json TEXT NOT NULL
                );
                """
            )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def load_registry(self) -> list[dict[str, object]]:
        rows = self.conn.execute(
            "SELECT visitor_id, embedding, embedding_hash, representative_image_path, source FROM visitors"
        ).fetchall()
        return [
            {
                "visitor_id": row["visitor_id"],
                "embedding": json.loads(row["embedding"]),
                "embedding_hash": row["embedding_hash"],
                "representative_image_path": row["representative_image_path"],
                "source": row["source"],
            }
            for row in rows
        ]

    def upsert_visitor(
        self,
        visitor_id: str,
        timestamp: str,
        representative_image_path: str,
        embedding: Iterable[float],
        source: str,
    ) -> None:
        embedding_json = json.dumps([float(x) for x in embedding])
        embedding_hash = self._hash_embedding(embedding_json)
        self.conn.execute(
            """
            INSERT INTO visitors(visitor_id, first_seen, last_seen, representative_image_path, source, embedding, embedding_hash)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(visitor_id) DO UPDATE SET
                last_seen=excluded.last_seen,
                representative_image_path=excluded.representative_image_path,
                source=excluded.source,
                embedding=excluded.embedding,
                embedding_hash=excluded.embedding_hash
            """,
            (visitor_id, timestamp, timestamp, representative_image_path, source, embedding_json, embedding_hash),
        )
        self.conn.commit()

    def update_last_seen(self, visitor_id: str, timestamp: str) -> None:
        self.conn.execute("UPDATE visitors SET last_seen=? WHERE visitor_id=?", (timestamp, visitor_id))
        self.conn.commit()

    def update_representative_image(self, visitor_id: str, image_path: str) -> None:
        self.conn.execute(
            "UPDATE visitors SET representative_image_path=? WHERE visitor_id=?",
            (image_path, visitor_id),
        )
        self.conn.commit()

    def record_event(self, event: EventRecord) -> bool:
        try:
            self.conn.execute(
                """
                INSERT INTO events(visitor_id, event_type, timestamp, track_id, image_path, embedding_hash, source, extra_json)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.visitor_id,
                    event.event_type,
                    event.timestamp,
                    event.track_id,
                    event.image_path,
                    event.embedding_hash,
                    event.source,
                    json.dumps(event.extra, sort_keys=True),
                ),
            )
            self.conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def unique_count(self) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS count FROM visitors").fetchone()
        return int(row["count"] if row else 0)

    def _hash_embedding(self, embedding_json: str) -> str:
        import hashlib

        return hashlib.sha1(embedding_json.encode("utf-8")).hexdigest()[:16]
