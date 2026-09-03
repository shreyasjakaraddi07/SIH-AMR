# Decentralized Multi-AMR Warehouse Coordination Simulator

## SIH 2026 Problem Statement 26123

This project provides the foundational architecture for a decentralized multi-AMR (autonomous mobile robot) warehouse coordination simulator.

### Architecture Freeze Checkpoint (Phase 0)

**Do not change these signatures after Phase 0 without team agreement — this is the architecture freeze checkpoint.**

The architecture is defined by frozen interfaces ensuring pluggability of components.

#### Frozen Datamodels (`models.py`)

- `RobotState`: Full observable state vector for a single robot.
- `IntentMessage`: Lightweight broadcast message used for peer-to-peer coordination.
- `Task`: A single pick-and-place warehouse task.

#### Frozen Pluggable Interfaces (`interfaces.py`)

- `Planner`: Defines `plan(start, goal, costmap) -> path`
- `TaskAllocator`: Defines `allocate(robots, tasks) -> assignment dict`
- `ConflictResolver`: Defines `check_and_resolve(reservations, proposed_path) -> resolution`
- `CommsChannel`: Defines `send(message)` and `receive() -> list[messages]`
- `SecurityValidator`: Defines `validate(message) -> accept/quarantine/reject`

### Project Structure

- `/sim` - simulation engine
- `/robot` - per-robot local modules (state, planner, coordination, security, task manager)
- `/allocator` - task allocation layer
- `/comms` - communication abstraction
- `/dashboard` - backend + frontend
- `/experiments` - benchmark runner
- `/tests` - test suite

### Metrics (`metrics.py`)

Predefined metrics matching reference doc Section 16.2.

### Config (`config.py`)

Warehouse grid map format and loader.

### Start

`This starts the data API that the dashboard talks to`
`python -m uvicorn dashboard.backend.main:app --reload`

`Navigate to the frontend folder`
`cd d:\sih26\SIH-AMR\dashboard\frontend`

`Start the visual dashboard`
`npm run dev`
