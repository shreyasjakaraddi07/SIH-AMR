"""
SQLite persistence for per-tick metrics.
Needed by Phase 7 benchmark analysis.
"""
import json
import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "runs.db")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS metric_snapshots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    tick      INTEGER NOT NULL,
    snapshot  TEXT    NOT NULL,
    recorded_at REAL  NOT NULL
);
"""

_db: aiosqlite.Connection = None


async def init_db():
    global _db
    _db = await aiosqlite.connect(DB_PATH)
    await _db.execute(CREATE_TABLE)
    await _db.commit()


async def persist_snapshot(snapshot: dict):
    if _db is None:
        return
    tick = snapshot.get("tick", -1)
    blob = json.dumps(snapshot, default=str)
    import time
    await _db.execute(
        "INSERT INTO metric_snapshots (tick, snapshot, recorded_at) VALUES (?, ?, ?)",
        (tick, blob, time.time())
    )
    await _db.commit()


async def close_db():
    if _db:
        await _db.close()
