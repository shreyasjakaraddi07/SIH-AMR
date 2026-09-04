import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const WS_URL = 'ws://localhost:8000/ws';

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('S1_Normal');
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [simRate, setSimRate] = useState(0.8);
  const [toggles, setToggles] = useState({
    lidar: true,
    paths: true,
    ruler: true,
    tags: true,
  });
  const wsRef = useRef(null);

  const changeSpeed = async (rate) => {
    setSimRate(rate);
    try {
      await fetch('http://localhost:8000/api/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate })
      });
    } catch (e) {
      console.error("Failed to set speed:", e);
    }
  };

  const connectWs = () => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (e) => {
        try {
          const snap = JSON.parse(e.data);
          setData(snap);

          if (snap.robots) {
            snap.robots.forEach((r) => {
              if (r.status === 'DEGRADED') {
                setSecurityAlerts((prev) => {
                  if (!prev.find((a) => a.id === r.robot_id)) {
                    return [...prev, { id: r.robot_id, msg: `[FDIR_ALERT] ${r.robot_id} entering degraded fallback` }];
                  }
                  return prev;
                });
              }
            });
          }
        } catch (err) {
          console.error("Snapshot error:", err);
        }
      };
      wsRef.current = ws;
    } catch (err) {
      console.error("WS error:", err);
    }
  };

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const killWs = () => {
    if (wsRef.current) {
      wsRef.current.close();
      setConnected(false);
    }
  };

  const safeData = useMemo(() => {
    if (!data || Object.keys(data).length === 0) {
      return {
        tick: 0,
        robots: [],
        tasks: [],
        metrics: {},
        conflicts: [],
        deadlocks: [],
        grid: []
      };
    }
    return data;
  }, [data]);

  return (
    <div className="app-container">
      {/* 2000s Industrial Workbench Simulation Control Bar */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-badge">MONA</span>
          <div className="brand-titles">
            <h1>
              <span>MONA_AMR_SIMULATOR</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--sim-text-dim)', fontWeight: 400 }}>[STAGE/GAZEBO_2D]</span>
            </h1>
            <div className="brand-subtitle">MODULAR OPEN NAVIGATING AMR • FDIR DISPATCH v2.6.4</div>
          </div>
        </div>

        <div className="header-meta">
          <div className="meta-box">
            <span className="meta-label">SCENARIO:</span>
            <span className="meta-val">{selectedScenario}</span>
          </div>

          <div className="meta-box">
            <span className="meta-label">STEP:</span>
            <span className="meta-val">T+{safeData.tick || 0}</span>
          </div>

          <div className={`connection-indicator ${connected ? 'online' : 'offline'}`}>
            <span className="status-led"></span>
            <span>{connected ? 'LINK_ACTIVE 10Hz' : 'LINK_DOWN'}</span>
          </div>

          <div>
            {connected ? (
              <button className="btn-terminal danger" onClick={killWs}>
                [KILL_COMM]
              </button>
            ) : (
              <button className="btn-terminal" onClick={connectWs}>
                [RECONNECT]
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Simulation Viewport & Instrument Panels */}
      <main className="dashboard-body">
        {/* Left Column: 2D Simulation World */}
        <section className="map-view-container">
          <div className="map-control-bar">
            <div className="map-heading">
              <span>// SIM_STAGE_WORLD</span>
              <span style={{ color: 'var(--sim-text-dim)', fontSize: '0.7rem' }}>
                {safeData.grid?.length ? `GRID: ${safeData.grid[0]?.length}x${safeData.grid.length}` : 'INITIALIZING'}
              </span>
            </div>

            <div className="map-toggles">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.4rem', borderRight: '1px solid var(--sim-border)', paddingRight: '0.5rem' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--sim-text-dim)' }}>SPEED:</span>
                <button
                  className={`toggle-btn ${simRate === 1.4 ? 'active' : ''}`}
                  onClick={() => changeSpeed(1.4)}
                  title="0.5x Slower pace (1.4s / step)"
                >
                  0.5x
                </button>
                <button
                  className={`toggle-btn ${simRate === 0.8 ? 'active' : ''}`}
                  onClick={() => changeSpeed(0.8)}
                  title="1.0x Normal smooth pace (0.8s / step)"
                >
                  1.0x
                </button>
                <button
                  className={`toggle-btn ${simRate === 0.4 ? 'active' : ''}`}
                  onClick={() => changeSpeed(0.4)}
                  title="2.0x Fast pace (0.4s / step)"
                >
                  2.0x
                </button>
              </div>

              <button
                className={`toggle-btn ${toggles.lidar ? 'active' : ''}`}
                onClick={() => setToggles(prev => ({ ...prev, lidar: !prev.lidar }))}
              >
                [LIDAR_RAYS]
              </button>
              <button
                className={`toggle-btn ${toggles.paths ? 'active' : ''}`}
                onClick={() => setToggles(prev => ({ ...prev, paths: !prev.paths }))}
              >
                [PLANNED_PATH]
              </button>
              <button
                className={`toggle-btn ${toggles.ruler ? 'active' : ''}`}
                onClick={() => setToggles(prev => ({ ...prev, ruler: !prev.ruler }))}
              >
                [AXIS_RULER]
              </button>
              <button
                className={`toggle-btn ${toggles.tags ? 'active' : ''}`}
                onClick={() => setToggles(prev => ({ ...prev, tags: !prev.tags }))}
              >
                [CELL_TAGS]
              </button>
            </div>
          </div>

          <WarehouseMap
            robots={safeData.robots}
            tasks={safeData.tasks}
            grid={safeData.grid}
            toggles={toggles}
            simRate={simRate}
            activeRobotId={activeRobotId}
            setActiveRobotId={setActiveRobotId}
          />

          <div className="map-status-strip">
            <span>COORDINATE_FRAME: /map | ODOMETRY: DIFF_DRIVE | RESOLUTION: 1.0m/CELL</span>
            <span>AMRS_ACTIVE: {safeData.robots?.length || 0} | CARGO_IN_TRANSIT: {safeData.tasks?.filter(t => t.status === 'IN_PROGRESS' || t.status === 3).length || 0}</span>
          </div>
        </section>

        {/* Right Column: Low-Level Telemetry & Diagnostics */}
        <aside className="sidebar-container">
          <BenchmarkPanel scenario={selectedScenario} setScenario={setSelectedScenario} />
          <MetricsPanel metrics={safeData.metrics} />
          <TasksPanel tasks={safeData.tasks} />
          <RobotsPanel robots={safeData.robots} activeRobotId={activeRobotId} setActiveRobotId={setActiveRobotId} />
          <ConflictsPanel conflicts={safeData.conflicts} />
          <SecurityPanel alerts={securityAlerts} />
        </aside>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------------
   GAZEBO / PLAYER-STAGE 2D SIMULATION MAP
   -------------------------------------------------------------------------- */
function WarehouseMap({ robots = [], tasks = [], grid = [], toggles, simRate = 0.8, activeRobotId, setActiveRobotId }) {
  const CELL = 42; // Simulation cell scale

  if (!grid || grid.length === 0) {
    return (
      <div className="map-viewport">
        <div style={{ color: 'var(--sim-text-dim)', fontSize: '0.8rem' }}>
          [STAGE] Waiting for warehouse world map...
        </div>
      </div>
    );
  }

  const mapH = grid.length;
  const mapW = grid[0].length;
  const width = mapW * CELL;
  const height = mapH * CELL;

  // Selected robot object for OSD
  const selectedRobot = activeRobotId ? robots.find(r => r.robot_id === activeRobotId) : (robots[0] || null);

  return (
    <div className="map-viewport">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="warehouse-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Engineering 1m Grid Pattern */}
          <pattern id="cad-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect width={CELL} height={CELL} fill="#14171c" stroke="#21252e" strokeWidth="1" />
            <circle cx={CELL / 2} cy={CELL / 2} r="1" fill="#383e4a" />
          </pattern>

          {/* Yellow/Black Safety Caution Stripes for Bays */}
          <pattern id="caution-stripes" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#eab308" strokeWidth="5" />
            <line x1="5" y1="0" x2="5" y2="10" stroke="#1c1917" strokeWidth="5" />
          </pattern>

          {/* Solid Hazard Striping for Dynamic Obstacles */}
          <pattern id="obstacle-stripes" width="8" height="8" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="4" />
            <line x1="4" y1="0" x2="4" y2="8" stroke="#18181b" strokeWidth="4" />
          </pattern>
        </defs>

        {/* 1. Base Simulation Floor */}
        <rect x="0" y="0" width={width} height={height} fill="url(#cad-grid)" />

        {/* 2. Grid Axis Coordinate Ticks & Rulers */}
        {toggles.ruler && (
          <g>
            {/* Horizontal Column Numbers */}
            {grid[0].map((_, x) => (
              <text
                key={`ruler-x-${x}`}
                x={x * CELL + CELL / 2}
                y={9}
                fontSize="7"
                fontFamily="JetBrains Mono"
                fill="#4a5263"
                textAnchor="middle"
              >
                {x}
              </text>
            ))}
            {/* Vertical Row Numbers */}
            {grid.map((_, y) => (
              <text
                key={`ruler-y-${y}`}
                x={3}
                y={y * CELL + CELL / 2 + 2}
                fontSize="7"
                fontFamily="JetBrains Mono"
                fill="#4a5263"
                textAnchor="start"
              >
                {y}
              </text>
            ))}
          </g>
        )}

        {/* 3. Static Warehouse Environment: Storage Racks, Pickups, Dropoffs */}
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const isRack = cell === '#';
            const isPickup = cell === 'P';
            const isDropoff = cell === 'D';
            const cx = x * CELL;
            const cy = y * CELL;

            if (isRack) {
              return (
                <g key={`rack-${x}-${y}`}>
                  {/* Heavy Solid Shelving Bay */}
                  <rect
                    x={cx + 1}
                    y={cy + 1}
                    width={CELL - 2}
                    height={CELL - 2}
                    fill="#23262f"
                    stroke="#3f4554"
                    strokeWidth="1.5"
                  />
                  {/* Diagonal Structural Steel Cross Bracing */}
                  <line x1={cx + 2} y1={cy + 2} x2={cx + CELL - 2} y2={cy + CELL - 2} stroke="#2e333e" strokeWidth="1" />
                  <line x1={cx + CELL - 2} y1={cy + 2} x2={cx + 2} y2={cy + CELL - 2} stroke="#2e333e" strokeWidth="1" />

                  {/* Stored Industrial Timber Pallet & Boxes */}
                  <rect x={cx + 4} y={cy + 4} width={CELL / 2 - 5} height={CELL - 8} fill="#8d6e63" stroke="#5d4037" strokeWidth="1" />
                  <rect x={cx + CELL / 2 + 1} y={cy + 4} width={CELL / 2 - 5} height={CELL - 8} fill="#455a64" stroke="#263238" strokeWidth="1" />

                  {/* Stencil Coordinates */}
                  {toggles.tags && (
                    <text
                      x={cx + CELL / 2}
                      y={cy + CELL / 2 + 3}
                      fontSize="7"
                      fontFamily="JetBrains Mono"
                      fontWeight="bold"
                      fill="#ffffff"
                      textAnchor="middle"
                    >
                      {x},{y}
                    </text>
                  )}
                </g>
              );
            }

            if (isPickup) {
              return (
                <g key={`pickup-${x}-${y}`}>
                  <rect
                    x={cx + 2}
                    y={cy + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    fill="#15261d"
                    stroke="#15803d"
                    strokeWidth="1.5"
                  />
                  {/* Perimeter Warning Tape */}
                  <rect x={cx + 2} y={cy + 2} width={CELL - 4} height={4} fill="url(#caution-stripes)" />
                  <rect x={cx + 2} y={cy + CELL - 6} width={CELL - 4} height={4} fill="url(#caution-stripes)" />

                  <text
                    x={cx + CELL / 2}
                    y={cy + CELL / 2 + 4}
                    fontSize="9"
                    fontFamily="JetBrains Mono"
                    fontWeight="800"
                    fill="#22c55e"
                    textAnchor="middle"
                  >
                    PK-01
                  </text>
                </g>
              );
            }

            if (isDropoff) {
              return (
                <g key={`dropoff-${x}-${y}`}>
                  <rect
                    x={cx + 2}
                    y={cy + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    fill="#10232e"
                    stroke="#0284c7"
                    strokeWidth="1.5"
                  />
                  {/* Perimeter Warning Tape */}
                  <rect x={cx + 2} y={cy + 2} width={CELL - 4} height={4} fill="url(#caution-stripes)" />
                  <rect x={cx + 2} y={cy + CELL - 6} width={CELL - 4} height={4} fill="url(#caution-stripes)" />

                  <text
                    x={cx + CELL / 2}
                    y={cy + CELL / 2 + 4}
                    fontSize="9"
                    fontFamily="JetBrains Mono"
                    fontWeight="800"
                    fill="#38bdf8"
                    textAnchor="middle"
                  >
                    DP-01
                  </text>
                </g>
              );
            }

            return null;
          })
        )}

        {/* 4. Planned Waypoint Trajectories (Nav2 / A* Plan) */}
        {toggles.paths && robots.map((r) => {
          if (!r.planned_path || r.planned_path.length === 0) return null;
          const currentPos = [r.position[0] * CELL + CELL / 2, r.position[1] * CELL + CELL / 2];
          const pts = [currentPos, ...r.planned_path.map(p => [p[0] * CELL + CELL / 2, p[1] * CELL + CELL / 2])];
          const isWaiting = r.status === 'WAITING';
          const pathColor = isWaiting ? '#eab308' : '#22c55e';

          return (
            <g key={`nav2-path-${r.robot_id}`}>
              {/* Discrete Waypoint Polyline */}
              <polyline
                points={pts.map(p => p.join(',')).join(' ')}
                fill="none"
                stroke={pathColor}
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              {/* Waypoint Nodes */}
              {r.planned_path.map((p, idx) => (
                <rect
                  key={`node-${r.robot_id}-${idx}`}
                  x={p[0] * CELL + CELL / 2 - 2}
                  y={p[1] * CELL + CELL / 2 - 2}
                  width="4"
                  height="4"
                  fill={pathColor}
                />
              ))}
              {/* Target Goal Cell Box */}
              {r.planned_path.length > 0 && (
                <rect
                  x={r.planned_path[r.planned_path.length - 1][0] * CELL + 3}
                  y={r.planned_path[r.planned_path.length - 1][1] * CELL + 3}
                  width={CELL - 6}
                  height={CELL - 6}
                  fill="none"
                  stroke={pathColor}
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              )}
            </g>
          );
        })}

        {/* 5. MONA Robots (Accurate to vladubase/mona_robot URDF Spec) */}
        {robots.map((r) => {
          const cx = r.position[0] * CELL + CELL / 2;
          const cy = r.position[1] * CELL + CELL / 2;
          const heading = r.heading || 0;
          const isWaiting = r.status === 'WAITING';
          const isOffline = r.status === 'OFFLINE';
          const isDegraded = r.status === 'DEGRADED';
          const hasCargo = r.has_cargo || false;
          const isSelected = activeRobotId === r.robot_id;

          // Industrial MONA Palette
          const chassisColor = isOffline ? '#475569' : (isDegraded ? '#dc2626' : (isWaiting ? '#ca8a04' : '#ff8c00'));

          return (
            <g
              key={r.robot_id}
              style={{
                transform: `translate(${cx}px, ${cy}px)`,
                transition: `transform ${simRate}s linear`,
                cursor: 'pointer'
              }}
              onClick={() => setActiveRobotId(r.robot_id)}
            >
              {/* 2D Planar LiDAR Laser Scan Rays (RViz LaserScan Simulation) */}
              {toggles.lidar && !isOffline && (
                <g transform={`rotate(${heading})`} style={{ transition: 'transform 0.35s ease-in-out' }}>
                  {/* Multiple planar laser beams fanning out */}
                  {[-45, -30, -15, 0, 15, 30, 45].map((angle, i) => {
                    const rayLen = isWaiting ? 26 : 42;
                    const rad = (angle - 90) * (Math.PI / 180);
                    const rx = Math.cos(rad) * rayLen;
                    const ry = Math.sin(rad) * rayLen;
                    return (
                      <g key={`scan-ray-${i}`}>
                        <line
                          x1="0"
                          y1="-8"
                          x2={rx}
                          y2={ry}
                          stroke="#ef4444"
                          strokeWidth="1"
                          strokeOpacity="0.75"
                          strokeDasharray="3 1"
                        />
                        {/* Laser Hit Point */}
                        <circle cx={rx} cy={ry} r="1.5" fill="#ef4444" />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* MONA Chassis (Rotates to Heading) */}
              <g transform={`rotate(${heading})`} style={{ transition: 'transform 0.35s ease-in-out' }}>
                {/* Left & Right Differential Drive Rubber Wheels with Hubs */}
                <rect x="-17" y="-9" width="4" height="18" fill="#090a0f" stroke="#27272a" strokeWidth="1" />
                <rect x="13" y="-9" width="4" height="18" fill="#090a0f" stroke="#27272a" strokeWidth="1" />

                {/* Front & Rear Swivel Casters */}
                <circle cx="0" cy="-13" r="2" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
                <circle cx="0" cy="13" r="2" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />

                {/* Main Differential Drive Chassis (1.25m x 0.8m ratio from mona.urdf.xacro) */}
                <rect
                  x="-13"
                  y="-15"
                  width="26"
                  height="30"
                  fill={chassisColor}
                  stroke="#000000"
                  strokeWidth="1.5"
                />

                {/* Dark Steel Front Bumper & Safety Lip */}
                <rect x="-13" y="-15" width="26" height="5" fill="#18181b" stroke="#27272a" strokeWidth="1" />

                {/* Central LiDAR Sensor Puck (Hokuyo / SICK planar scanner) */}
                <circle cx="0" cy="-5" r="5" fill="#09090b" stroke="#27272a" strokeWidth="1" />
                <circle cx="0" cy="-5" r="2" fill="#ef4444" />

                {/* Direction of Motion Arrow */}
                <polygon points="0,-14 -3,-9 3,-9" fill="#ffffff" />

                {/* Cargo Pallet Payload on Back Deck */}
                {hasCargo && (
                  <g transform="translate(0, 5)">
                    <rect x="-10" y="-5" width="20" height="11" fill="#78350f" stroke="#451a03" strokeWidth="1" />
                    <rect x="-8" y="-4" width="16" height="9" fill="#d97706" stroke="#b45309" strokeWidth="0.8" />
                  </g>
                )}
              </g>

              {/* Identification Callout Tag (Always Upright) */}
              <g transform="translate(0, 20)">
                <rect
                  x="-16"
                  y="-6"
                  width="32"
                  height="12"
                  fill="#000000"
                  stroke={isSelected ? '#22c55e' : '#52525b'}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="3"
                  fontSize="7.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="bold"
                  fill={isSelected ? '#22c55e' : '#ffffff'}
                  textAnchor="middle"
                >
                  {r.robot_id.replace('robot-', 'AMR')}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Low-Level OSD Telemetry Box (HUD) */}
      {selectedRobot && (
        <div className="diag-overlay">
          <div className="diag-line" style={{ borderBottom: '1px solid var(--sim-border)', paddingBottom: '0.2rem' }}>
            <span className="label">NODE:</span>
            <span className="val" style={{ color: 'var(--mona-orange)' }}>{selectedRobot.robot_id}</span>
            <span style={{ color: 'var(--sim-text-dim)' }}>[{selectedRobot.status}]</span>
          </div>
          <div className="diag-line">
            <span className="label">POSE [X,Y]:</span>
            <span className="val">({selectedRobot.position[0].toFixed(2)}, {selectedRobot.position[1].toFixed(2)})</span>
          </div>
          <div className="diag-line">
            <span className="label">THETA:</span>
            <span className="val">{(selectedRobot.heading || 0).toFixed(1)} deg</span>
          </div>
          <div className="diag-line">
            <span className="label">BATTERY:</span>
            <span className="val" style={{ color: selectedRobot.battery > 30 ? 'var(--sim-green)' : 'var(--sim-red)' }}>
              {selectedRobot.battery.toFixed(0)}%
            </span>
          </div>
          <div className="diag-line">
            <span className="label">PAYLOAD:</span>
            <span className="val">{selectedRobot.has_cargo ? 'PALLET_LOADED' : 'UNLOADED'}</span>
          </div>
          {selectedRobot.current_task_id && (
            <div className="diag-line">
              <span className="label">TASK_ID:</span>
              <span className="val" style={{ fontSize: '0.65rem' }}>{selectedRobot.current_task_id.substring(0, 8)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   PERFORMANCE METRICS PANEL (LOW-LEVEL INSTRUMENT GAUGES)
   -------------------------------------------------------------------------- */
function MetricsPanel({ metrics = {} }) {
  const makespan = metrics.makespan ?? metrics.MAKESPAN ?? 0;
  const throughput = metrics.throughput ?? metrics.THROUGHPUT ?? 0;
  const collisions = metrics.collision_count ?? metrics.COLLISION_COUNT ?? 0;
  const deadlocks = metrics.deadlock_count ?? metrics.DEADLOCK_COUNT ?? 0;
  const replans = metrics.replan_count ?? metrics.REPLAN_COUNT ?? 0;
  const waitTime = metrics.waiting_time ?? metrics.WAITING_TIME ?? 0;

  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 01_SYSTEM_PERFORMANCE</span>
        <span className="panel-title-tag">[METRICS_BUS]</span>
      </div>

      <div className="metrics-table-grid">
        <div className="data-well accent">
          <div className="data-well-label">MAKESPAN</div>
          <div className="data-well-val">{makespan.toFixed(0)} <span style={{ fontSize: '0.65rem' }}>t</span></div>
        </div>

        <div className="data-well good">
          <div className="data-well-label">THROUGHPUT</div>
          <div className="data-well-val">{throughput.toFixed(3)} <span style={{ fontSize: '0.65rem' }}>t/s</span></div>
        </div>

        <div className={`data-well ${collisions > 0 ? 'err' : 'good'}`}>
          <div className="data-well-label">COLLISIONS</div>
          <div className="data-well-val">{collisions}</div>
        </div>

        <div className={`data-well ${deadlocks > 0 ? 'warn' : 'good'}`}>
          <div className="data-well-label">DEADLOCKS</div>
          <div className="data-well-val">{deadlocks}</div>
        </div>

        <div className="data-well accent">
          <div className="data-well-label">RE-PLANS</div>
          <div className="data-well-val">{replans}</div>
        </div>

        <div className="data-well warn">
          <div className="data-well-label">WAIT_TIME</div>
          <div className="data-well-val">{waitTime.toFixed(0)} <span style={{ fontSize: '0.65rem' }}>t</span></div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   TASK QUEUE REGISTERS (Q / A / W / C)
   -------------------------------------------------------------------------- */
function TasksPanel({ tasks = [] }) {
  const queued = tasks.filter(t => t.status === 'QUEUED' || t.status === 1).length;
  const assigned = tasks.filter(t => t.status === 'ASSIGNED' || t.status === 2).length;
  const inprog = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 3).length;
  const comp = tasks.filter(t => t.status === 'COMPLETED' || t.status === 4).length;
  const total = queued + assigned + inprog + comp || 1;

  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 02_TASK_ALLOCATOR_REGISTERS</span>
        <span className="panel-title-tag">TOTAL: {tasks.length}</span>
      </div>

      <div className="task-registers">
        <div className="task-register reg-q">
          <div className="reg-label">Q (QUEUED)</div>
          <div className="reg-val" style={{ color: 'var(--sim-blue)' }}>{queued}</div>
        </div>
        <div className="task-register reg-a">
          <div className="reg-label">A (ASSIGNED)</div>
          <div className="reg-val" style={{ color: 'var(--sim-yellow)' }}>{assigned}</div>
        </div>
        <div className="task-register reg-w">
          <div className="reg-label">W (WORKING)</div>
          <div className="reg-val" style={{ color: 'var(--mona-orange)' }}>{inprog}</div>
        </div>
        <div className="task-register reg-c">
          <div className="reg-label">C (DONE)</div>
          <div className="reg-val" style={{ color: 'var(--sim-green)' }}>{comp}</div>
        </div>
      </div>

      {/* Segmented Queue Bar */}
      <div className="segmented-queue-bar">
        <div className="seg-q" style={{ width: `${(queued / total) * 100}%` }}></div>
        <div className="seg-a" style={{ width: `${(assigned / total) * 100}%` }}></div>
        <div className="seg-w" style={{ width: `${(inprog / total) * 100}%` }}></div>
        <div className="seg-c" style={{ width: `${(comp / total) * 100}%` }}></div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   ROBOT FLEET DIAGNOSTICS PANEL
   -------------------------------------------------------------------------- */
function RobotsPanel({ robots = [], activeRobotId, setActiveRobotId }) {
  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 03_MONA_FLEET_NODES</span>
        <span className="panel-title-tag">ONLINE: {robots.length}</span>
      </div>

      <div className="robot-nodes-list">
        {robots.map((r) => {
          const isSelected = activeRobotId === r.robot_id;
          const statusLower = (r.status || 'idle').toLowerCase();
          const batColor = r.battery > 50 ? 'var(--sim-green)' : (r.battery > 20 ? 'var(--sim-yellow)' : 'var(--sim-red)');

          return (
            <div
              key={r.robot_id}
              className="robot-node-card"
              style={{ borderColor: isSelected ? 'var(--sim-green)' : 'var(--sim-border)' }}
              onClick={() => setActiveRobotId(r.robot_id)}
            >
              <div className="node-header">
                <span className="node-id">{r.robot_id.toUpperCase()}</span>
                <span className={`node-state-pill ${statusLower}`}>{r.status}</span>
                {r.has_cargo && (
                  <span style={{ fontSize: '0.65rem', background: '#78350f', color: '#fff', padding: '0.1rem 0.3rem', border: '1px solid #d97706' }}>
                    PALLET
                  </span>
                )}
              </div>

              <div className="node-specs">
                <span>POS: ({r.position[0].toFixed(1)}, {r.position[1].toFixed(1)})</span>
                <span>BAT: {r.battery.toFixed(0)}%</span>
              </div>

              <div className="node-battery-bar">
                <div className="fill" style={{ width: `${r.battery}%`, background: batColor }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   TERMINAL CONFLICT / RESOLUTION LOG
   -------------------------------------------------------------------------- */
function ConflictsPanel({ conflicts = [] }) {
  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 04_COORDINATION_EVENT_STREAM</span>
        <span className="panel-title-tag">{conflicts.length} EVENTS</span>
      </div>

      {conflicts.length === 0 ? (
        <div style={{ padding: '0.5rem', color: 'var(--sim-text-dim)', fontSize: '0.7rem', background: '#0d0f12', border: '1px solid var(--sim-border)' }}>
          [OK] Dynamic reservations nominal. Zero active conflicts.
        </div>
      ) : (
        <div className="terminal-event-log">
          {conflicts.slice(-6).reverse().map((c, i) => (
            <div key={i} className="log-entry">
              <span className="log-tick">[T+{c.tick}]</span>
              <span className="log-type">{c.type.replace('_CONFLICT', '')}</span>
              <span className="log-detail">{c.robot_id} &lt;-&gt; {c.peer_id}</span>
              <span className="log-outcome">&gt;&gt; {c.outcome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   BENCHMARK HARNESS
   -------------------------------------------------------------------------- */
function BenchmarkPanel({ scenario, setScenario }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const runBenchmark = async () => {
    setRunning(true);
    setResults(null);
    try {
      const res = await fetch('http://localhost:8000/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const resData = await res.json();
      setResults(resData.results);
    } catch (e) {
      console.error("Benchmark error:", e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 05_BENCHMARK_HARNESS</span>
        <span className="panel-title-tag">SIM_TRIALS</span>
      </div>

      <div className="scenario-select-row">
        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          className="scenario-select"
        >
          <option value="S1_Normal">S1: Normal Warehouse</option>
          <option value="S2_Crossing">S2: Crossing Traffic</option>
          <option value="S3_Narrow">S3: Narrow Aisle Stress</option>
          <option value="S4_Blocked">S4: Blocked Aisle</option>
          <option value="S5_Failure">S5: Robot Failure</option>
          <option value="S6_CommDelay">S6: Comm Delay</option>
        </select>
        <button className="btn-terminal" onClick={runBenchmark} disabled={running}>
          {running ? '[TESTING...]' : '[EXEC_BENCH]'}
        </button>
      </div>

      {results && (
        <table className="bench-table">
          <thead>
            <tr>
              <th>STRATEGY</th>
              <th>WAIT</th>
              <th>COLL</th>
              <th>DONE</th>
            </tr>
          </thead>
          <tbody>
            {['B0', 'B1', 'B2', 'P1'].map((strat) => (
              <tr key={strat} className={strat === 'P1' ? 'highlight' : ''}>
                <td>{strat}</td>
                <td>{results[strat]?.wait?.toFixed(1) ?? '-'}</td>
                <td style={{ color: results[strat]?.collisions === 0 ? 'var(--sim-green)' : 'var(--sim-red)' }}>
                  {results[strat]?.collisions?.toFixed(1) ?? '-'}
                </td>
                <td>{results[strat]?.completed?.toFixed(1) ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   FDIR SAFETY & CRYPTO SENTINEL
   -------------------------------------------------------------------------- */
function SecurityPanel({ alerts = [] }) {
  return (
    <div className="panel-block">
      <div className="panel-title-bar">
        <span className="panel-title-text">// 06_FDIR_SAFETY_WATCHDOG</span>
        <span className="panel-title-tag">ISO_13849</span>
      </div>

      {alerts.length === 0 ? (
        <div style={{ color: 'var(--sim-green)', fontSize: '0.7rem' }}>
          [NOMINAL] Zero Byzantine faults detected. Security watchdogs active.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ color: 'var(--sim-red)', fontSize: '0.7rem' }}>
              &gt;&gt; {a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
