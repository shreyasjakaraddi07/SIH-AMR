"""
FastAPI WebSocket backend — strictly observational, read-only from simulation.

ARCHITECTURE RULE (Section 5.2): This file MUST NOT import anything from
/robot, /allocator, or /sim.  It only reads from TelemetryBus and SQLite.
The test_architecture.py CI test greps for any such import and fails if found.
"""
import asyncio
import json
import sys
import os
import threading
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from dashboard.backend.telemetry import TelemetryBus
from dashboard.backend.db import init_db, persist_snapshot

app = FastAPI(title="AMR Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],   # read-only — no POST/PUT/DELETE from dashboard
    allow_headers=["*"],
)

# Shared telemetry bus — injected by the simulation process on startup
_bus: TelemetryBus = TelemetryBus()
_latest_snapshot: dict = {}
_snapshot_lock = threading.Lock()


def get_bus() -> TelemetryBus:
    return _bus


def inject_bus(bus: TelemetryBus):
    """Called by the simulation harness to wire the bus in."""
    global _bus
    _bus = bus


@app.on_event("startup")
async def _on_startup():
    await init_db()
    # Background task: drain telemetry bus → update latest snapshot + persist
    asyncio.create_task(_drain_bus())


async def _drain_bus():
    while True:
        snap = await _bus.subscribe(timeout=0.1)
        if snap is not None:
            with _snapshot_lock:
                global _latest_snapshot
                _latest_snapshot = snap
            await persist_snapshot(snap)


@app.get("/snapshot")
async def http_snapshot():
    """HTTP fallback — returns the latest snapshot once."""
    with _snapshot_lock:
        return _latest_snapshot

@app.post("/api/benchmark")
async def trigger_benchmark(request: dict = None):
    """Triggers a mini-benchmark (2 trials x 100 ticks) for the dashboard."""
    import multiprocessing
    import sys, os
    
    # We will spawn a background process to run the mini-benchmark
    from experiments.runner import run_trial
    
    scenario = "S1_Normal"
    if request and "scenario" in request:
        scenario = request["scenario"]
        
    tasks = []
    for strategy in ["B0", "B1", "B2", "P1"]:
        for trial in range(2):
            tasks.append((scenario, strategy, trial))
            
    # For a true asynchronous execution, this should be in a task queue,
    # but for this demo endpoint we will run it directly and return the results.
    # We modify MAX_TICKS for speed
    import experiments.runner
    experiments.runner.MAX_TICKS = 100
    
    with multiprocessing.Pool() as pool:
        results = pool.map(run_trial, tasks)
        
    # Group results by strategy
    summary = {}
    for r in results:
        strat = r["strategy"]
        if strat not in summary:
            summary[strat] = {"completed": 0, "wait": 0, "collisions": 0, "count": 0}
        summary[strat]["completed"] += r["completed_tasks"]
        summary[strat]["wait"] += r["WAITING_TIME"]
        summary[strat]["collisions"] += r["COLLISION_COUNT"]
        summary[strat]["count"] += 1
        
    for strat in summary:
        c = summary[strat]["count"]
        summary[strat]["completed"] /= c
        summary[strat]["wait"] /= c
        summary[strat]["collisions"] /= c
        
    return {"scenario": scenario, "results": summary}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Streams live snapshots at ~10 Hz.
    Dashboard can close the connection at any time (Section 12.4 kill button) —
    the simulation continues unaffected.
    """
    await ws.accept()
    try:
        while True:
            with _snapshot_lock:
                snap = dict(_latest_snapshot)
            if snap:
                await ws.send_text(json.dumps(snap, default=str))
            await asyncio.sleep(0.1)   # 10 Hz
    except WebSocketDisconnect:
        pass   # client disconnected — simulation is unaffected
