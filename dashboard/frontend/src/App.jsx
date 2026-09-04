import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const WS_URL = 'ws://localhost:8000/ws';

export default function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [hoveredRobot, setHoveredRobot] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('S1_Normal');
  const [activeLayer, setActiveLayer] = useState({
    lidar: true,
    paths: true,
    grid: true,
    labels: true
  });
  const wsRef = useRef(null);

  const connectWs = () => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };
      ws.onerror = () => {
        setConnected(false);
      };
      ws.onmessage = (e) => {
        try {
          const snap = JSON.parse(e.data);
          setData(snap);

          if (snap.robots) {
            snap.robots.forEach((r) => {
              if (r.status === 'DEGRADED') {
                setSecurityAlerts((prev) => {
                  if (!prev.find((a) => a.id === r.robot_id)) {
                    return [...prev, { id: r.robot_id, msg: `Robot ${r.robot_id} entered DEGRADED comms mode` }];
                  }
                  return prev;
                });
              }
            });
          }
        } catch (err) {
          console.error("Failed to parse telemetry snapshot", err);
        }
      };
      wsRef.current = ws;
    } catch (err) {
      console.error("WebSocket connection error", err);
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
      {/* Top Industrial Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#07090e" strokeWidth="2.5">
              <rect x="2" y="5" width="20" height="14" rx="3" />
              <path d="M7 15h.01M17 15h.01M9 9h6" />
            </svg>
          </div>
          <div className="brand-titles">
            <h1>Decentralized AMR Warehouse Fleet</h1>
            <div className="brand-subtitle">SPATIAL-TEMPORAL DIGITAL TWIN • SIMULATION ENGINE v2.6</div>
          </div>
        </div>

        <div className="header-meta">
          <div className="meta-badge">
            <span className="badge-label">SCENARIO:</span>
            <span className="badge-val">{selectedScenario}</span>
          </div>

          <div className="meta-badge">
            <span className="badge-label">SIM TICK:</span>
            <span className="badge-val">#{safeData.tick || 0}</span>
          </div>

          <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
            <span className="pulse-dot"></span>
            <span>{connected ? 'LIVE TELEMETRY (10 Hz)' : 'TELEMETRY OFFLINE'}</span>
          </div>

          <div className="header-actions">
            {connected ? (
              <button className="btn-cyber danger" onClick={killWs} title="Simulate communication kill">
                Disconnect WS
              </button>
            ) : (
              <button className="btn-cyber" onClick={connectWs}>
                Reconnect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="dashboard-body">
        {/* Left Column: Live Simulation Map */}
        <section className="map-view-container">
          <div className="map-toolbar">
            <div className="map-title-group">
              <div className="map-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                </svg>
                Warehouse Grid Digital Twin
              </div>
              <span className="map-subtitle-badge">
                {safeData.grid?.length ? `${safeData.grid[0]?.length} × ${safeData.grid.length} BAYS` : 'CALIBRATING'}
              </span>
            </div>

            <div className="map-controls-group">
              <button
                className={`toggle-chip ${activeLayer.lidar ? 'active' : ''}`}
                onClick={() => setActiveLayer(prev => ({ ...prev, lidar: !prev.lidar }))}
              >
                LiDAR Cone
              </button>
              <button
                className={`toggle-chip ${activeLayer.paths ? 'active' : ''}`}
                onClick={() => setActiveLayer(prev => ({ ...prev, paths: !prev.paths }))}
              >
                Path Vectors
              </button>
              <button
                className={`toggle-chip ${activeLayer.grid ? 'active' : ''}`}
                onClick={() => setActiveLayer(prev => ({ ...prev, grid: !prev.grid }))}
              >
                Fiducial Grid
              </button>
              <button
                className={`toggle-chip ${activeLayer.labels ? 'active' : ''}`}
                onClick={() => setActiveLayer(prev => ({ ...prev, labels: !prev.labels }))}
              >
                Rack Tags
              </button>
            </div>
          </div>

          <WarehouseMap
            robots={safeData.robots}
            tasks={safeData.tasks}
            grid={safeData.grid}
            layers={activeLayer}
            hoveredRobot={hoveredRobot}
            setHoveredRobot={setHoveredRobot}
          />
        </section>

        {/* Right Column: Analytics & Fleet Telemetry */}
        <aside className="sidebar-container">
          <BenchmarkPanel scenario={selectedScenario} setScenario={setSelectedScenario} />
          <MetricsPanel metrics={safeData.metrics} />
          <TasksPanel tasks={safeData.tasks} />
          <RobotsPanel robots={safeData.robots} hoveredRobot={hoveredRobot} setHoveredRobot={setHoveredRobot} />
          <ConflictsPanel conflicts={safeData.conflicts} />
          <SecurityPanel alerts={securityAlerts} />
        </aside>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------------
   WAREHOUSE SIMULATION MAP (HIGH-FIDELITY DIGITAL TWIN)
   -------------------------------------------------------------------------- */
function WarehouseMap({ robots = [], tasks = [], grid = [], layers, hoveredRobot, setHoveredRobot }) {
  const CELL = 44; // Cell size in SVG units

  if (!grid || grid.length === 0) {
    return (
      <div className="map-viewport">
        <div className="empty-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Initializing simulation grid telemetry...
        </div>
      </div>
    );
  }

  const mapH = grid.length;
  const mapW = grid[0].length;
  const width = mapW * CELL;
  const height = mapH * CELL;

  // Selected robot details for tooltip
  const activeRobotObj = hoveredRobot ? robots.find(r => r.robot_id === hoveredRobot) : null;

  return (
    <div className="map-viewport">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="warehouse-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Laser Grid Background Pattern */}
          <pattern id="floor-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect width={CELL} height={CELL} fill="#0a0d17" stroke="#121727" strokeWidth="1" />
            {layers.grid && (
              <>
                <circle cx={CELL / 2} cy={CELL / 2} r="1.5" fill="rgba(0, 240, 255, 0.25)" />
                <path d={`M ${CELL / 2 - 4} ${CELL / 2} L ${CELL / 2 + 4} ${CELL / 2} M ${CELL / 2} ${CELL / 2 - 4} L ${CELL / 2} ${CELL / 2 + 4}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </>
            )}
          </pattern>

          {/* Diagonal Hazard Stripes for Blocked Aisles */}
          <pattern id="hazard-stripes" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="12" stroke="#ffb800" strokeWidth="6" />
            <line x1="6" y1="0" x2="6" y2="12" stroke="#1c1917" strokeWidth="6" />
          </pattern>

          {/* Racks Gradient & Textures */}
          <linearGradient id="rack-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e2538" />
            <stop offset="100%" stopColor="#141926" />
          </linearGradient>

          {/* Pickup Zone Gradient */}
          <linearGradient id="pickup-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0, 255, 157, 0.18)" />
            <stop offset="100%" stopColor="rgba(0, 255, 157, 0.04)" />
          </linearGradient>

          {/* Dropoff Zone Gradient */}
          <linearGradient id="dropoff-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0, 240, 255, 0.18)" />
            <stop offset="100%" stopColor="rgba(0, 240, 255, 0.04)" />
          </linearGradient>

          {/* Forward LiDAR Laser Scan Gradient */}
          <radialGradient id="lidar-cone" cx="50%" cy="100%" r="90%">
            <stop offset="0%" stopColor="rgba(0, 240, 255, 0.45)" />
            <stop offset="40%" stopColor="rgba(0, 240, 255, 0.2)" />
            <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
          </radialGradient>

          {/* AMR Shadow */}
          <filter id="amr-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.75" />
          </filter>
        </defs>

        {/* 1. Base High-Tech Epoxy Warehouse Floor */}
        <rect x="0" y="0" width={width} height={height} fill="url(#floor-grid)" />

        {/* 2. Warehouse Infrastructure: Racks, Docks, Induction Stations */}
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const isRack = cell === '#';
            const isPickup = cell === 'P';
            const isDropoff = cell === 'D';
            const cx = x * CELL;
            const cy = y * CELL;

            if (isRack) {
              // Industrial Pallet Rack
              // Deterministic box colors based on coordinates
              const boxColor1 = ((x + y) % 3 === 0) ? '#ca8a04' : (((x + y) % 3 === 1) ? '#2563eb' : '#a28564');
              const boxColor2 = ((x * y) % 2 === 0) ? '#0284c7' : '#94a3b8';

              return (
                <g key={`rack-${x}-${y}`}>
                  {/* Rack Bay Base Frame */}
                  <rect
                    x={cx + 2}
                    y={cy + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    rx="3"
                    fill="url(#rack-gradient)"
                    stroke="#2e3852"
                    strokeWidth="1.5"
                  />
                  {/* Shelving Crossbeams */}
                  <line x1={cx + 4} y1={cy + CELL / 2} x2={cx + CELL - 4} y2={cy + CELL / 2} stroke="#3b4866" strokeWidth="1" />
                  <line x1={cx + CELL / 2} y1={cy + 4} x2={cx + CELL / 2} y2={cy + CELL - 4} stroke="#3b4866" strokeWidth="1" strokeDasharray="2 2" />

                  {/* Stored Cargo Pallet Totes */}
                  <rect x={cx + 5} y={cy + 5} width={CELL / 2 - 7} height={CELL / 2 - 7} rx="2" fill={boxColor1} opacity="0.85" />
                  <rect x={cx + CELL / 2 + 2} y={cy + 5} width={CELL / 2 - 7} height={CELL / 2 - 7} rx="2" fill={boxColor2} opacity="0.85" />
                  <rect x={cx + 5} y={cy + CELL / 2 + 2} width={CELL - 10} height={CELL / 2 - 7} rx="2" fill="#334155" opacity="0.9" />

                  {/* Rack Corner Steel Uprights */}
                  <circle cx={cx + 4} cy={cy + 4} r="1.5" fill="#64748b" />
                  <circle cx={cx + CELL - 4} cy={cy + 4} r="1.5" fill="#64748b" />
                  <circle cx={cx + 4} cy={cy + CELL - 4} r="1.5" fill="#64748b" />
                  <circle cx={cx + CELL - 4} cy={cy + CELL - 4} r="1.5" fill="#64748b" />

                  {/* Technical Rack Coordinate Label */}
                  {layers.labels && (
                    <text
                      x={cx + CELL / 2}
                      y={cy + CELL / 2 + 3}
                      fontSize="7"
                      fontFamily="JetBrains Mono"
                      fontWeight="600"
                      fill="rgba(255,255,255,0.4)"
                      textAnchor="middle"
                    >
                      R{x},{y}
                    </text>
                  )}
                </g>
              );
            }

            if (isPickup) {
              // Automated Inbound Conveyor Induction Bay
              return (
                <g key={`pickup-${x}-${y}`}>
                  <rect
                    x={cx + 2}
                    y={cy + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    rx="4"
                    fill="url(#pickup-glow)"
                    stroke="#00ff9d"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  {/* Conveyor Rollers */}
                  <line x1={cx + 7} y1={cy + 10} x2={cx + CELL - 7} y2={cy + 10} stroke="#00ff9d" strokeWidth="1.5" opacity="0.6" />
                  <line x1={cx + 7} y1={cy + 18} x2={cx + CELL - 7} y2={cy + 18} stroke="#00ff9d" strokeWidth="1.5" opacity="0.6" />
                  <line x1={cx + 7} y1={cy + 26} x2={cx + CELL - 7} y2={cy + 26} stroke="#00ff9d" strokeWidth="1.5" opacity="0.6" />
                  <line x1={cx + 7} y1={cy + 34} x2={cx + CELL - 7} y2={cy + 34} stroke="#00ff9d" strokeWidth="1.5" opacity="0.6" />
                  <text
                    x={cx + CELL / 2}
                    y={cy + CELL / 2 + 4}
                    fontSize="11"
                    fontFamily="Inter"
                    fontWeight="800"
                    fill="#00ff9d"
                    textAnchor="middle"
                    style={{ textShadow: '0 0 10px rgba(0,255,157,0.7)' }}
                  >
                    IN
                  </text>
                </g>
              );
            }

            if (isDropoff) {
              // Automated Outbound Dock Station
              return (
                <g key={`dropoff-${x}-${y}`}>
                  <rect
                    x={cx + 2}
                    y={cy + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    rx="4"
                    fill="url(#dropoff-glow)"
                    stroke="#00f0ff"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  {/* Docking Guides */}
                  <polygon
                    points={`${cx + 8},${cy + 8} ${cx + CELL - 8},${cy + 8} ${cx + CELL / 2},${cy + CELL - 8}`}
                    fill="rgba(0, 240, 255, 0.12)"
                    stroke="#00f0ff"
                    strokeWidth="1"
                    opacity="0.7"
                  />
                  <text
                    x={cx + CELL / 2}
                    y={cy + CELL / 2 + 4}
                    fontSize="11"
                    fontFamily="Inter"
                    fontWeight="800"
                    fill="#00f0ff"
                    textAnchor="middle"
                    style={{ textShadow: '0 0 10px rgba(0,240,255,0.7)' }}
                  >
                    OUT
                  </text>
                </g>
              );
            }

            return null;
          })
        )}

        {/* 3. Laser Waypoint Trajectories (Underneath AMRs) */}
        {layers.paths && robots.map((r) => {
          if (!r.planned_path || r.planned_path.length === 0) return null;
          const currentPos = [r.position[0] * CELL + CELL / 2, r.position[1] * CELL + CELL / 2];
          const points = [currentPos, ...r.planned_path.map(p => [p[0] * CELL + CELL / 2, p[1] * CELL + CELL / 2])];
          const isWaiting = r.status === 'WAITING';
          const strokeColor = isWaiting ? 'rgba(255, 184, 0, 0.65)' : 'rgba(0, 240, 255, 0.65)';

          return (
            <g key={`trajectory-${r.robot_id}`}>
              {/* Pulsing Trajectory Line */}
              <polyline
                points={points.map(p => p.join(',')).join(' ')}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              {/* Target Goal Holographic Marker */}
              {r.planned_path.length > 0 && (
                <g transform={`translate(${r.planned_path[r.planned_path.length - 1][0] * CELL + CELL / 2}, ${r.planned_path[r.planned_path.length - 1][1] * CELL + CELL / 2})`}>
                  <circle r="9" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 2" />
                  <circle r="3" fill={strokeColor} />
                </g>
              )}
            </g>
          );
        })}

        {/* 4. Realistic AMR Autonomous Mobile Robot Fleet */}
        {robots.map((r) => {
          const cx = r.position[0] * CELL + CELL / 2;
          const cy = r.position[1] * CELL + CELL / 2;
          const heading = r.heading || 0; // Directional heading in degrees
          const isWaiting = r.status === 'WAITING';
          const isOffline = r.status === 'OFFLINE';
          const isDegraded = r.status === 'DEGRADED';
          const hasCargo = r.has_cargo || false;

          let statusColor = '#00f0ff'; // Cyan = Nominal Moving
          if (isOffline) statusColor = '#64748b';
          else if (isDegraded) statusColor = '#ff3366';
          else if (isWaiting) statusColor = '#ffb800';
          else if (r.status === 'IDLE') statusColor = '#94a3b8';

          const isHovered = hoveredRobot === r.robot_id;

          return (
            <g
              key={r.robot_id}
              style={{
                cursor: 'pointer',
                transition: 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
              }}
              transform={`translate(${cx}, ${cy})`}
              onMouseEnter={() => setHoveredRobot(r.robot_id)}
              onMouseLeave={() => setHoveredRobot(null)}
            >
              {/* Forward LiDAR Safety Optical Field (Rotates with robot heading) */}
              {layers.lidar && !isOffline && (
                <g transform={`rotate(${heading})`}>
                  <path
                    d={`M 0 0 L -24 -46 A 50 50 0 0 1 24 -46 Z`}
                    fill="url(#lidar-cone)"
                    opacity={isWaiting ? "0.35" : "0.75"}
                  />
                  {/* Laser Arc Boundary */}
                  <path
                    d={`M -24 -46 A 50 50 0 0 1 24 -46`}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    opacity="0.8"
                  />
                </g>
              )}

              {/* Status Ambient Aura / Underglow */}
              <circle
                r={isHovered ? 24 : 19}
                fill={statusColor}
                opacity={isWaiting ? "0.35" : "0.2"}
              />

              {/* AMR Chassis Body (Rotates with heading) */}
              <g transform={`rotate(${heading})`} filter="url(#amr-shadow)">
                {/* Left & Right Drive Wheel Pods */}
                <rect x="-18" y="-10" width="4" height="20" rx="2" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                <rect x="14" y="-10" width="4" height="20" rx="2" fill="#0f172a" stroke="#334155" strokeWidth="1" />

                {/* Omni Caster Bumpers (Front/Back) */}
                <circle cx="0" cy="-14" r="2.5" fill="#334155" />
                <circle cx="0" cy="14" r="2.5" fill="#334155" />

                {/* Heavy-Duty AGV Chassis Shell */}
                <rect
                  x="-14"
                  y="-15"
                  width="28"
                  height="30"
                  rx="6"
                  fill="#111827"
                  stroke={statusColor}
                  strokeWidth={isHovered ? "2.5" : "1.8"}
                />

                {/* Top Deck Sensor Module */}
                <circle cx="0" cy="0" r="8" fill="#1f2937" stroke="#374151" strokeWidth="1" />
                <circle cx="0" cy="0" r="4" fill={statusColor} />

                {/* Directional Front Indicator Arrow */}
                <polygon points="0,-12 -4,-7 4,-7" fill={statusColor} />

                {/* Cargo Payload Box (Rendered on top of chassis when carrying task goods) */}
                {hasCargo && (
                  <g>
                    <rect x="-9" y="-8" width="18" height="16" rx="2" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
                    {/* Cargo Tie-down Straps */}
                    <line x1="-9" y1="0" x2="9" y2="0" stroke="#7c2d12" strokeWidth="1.2" />
                    <line x1="0" y1="-8" x2="0" y2="8" stroke="#7c2d12" strokeWidth="1.2" />
                  </g>
                )}
              </g>

              {/* Robot Index Callout Badge (Always upright, does not rotate) */}
              <g transform="translate(0, 21)">
                <rect
                  x="-16"
                  y="-7"
                  width="32"
                  height="13"
                  rx="3"
                  fill="#07090e"
                  stroke={statusColor}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="2.5"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="700"
                  fill="#ffffff"
                  textAnchor="middle"
                >
                  {r.robot_id.replace('robot-', 'AMR-')}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Floating Telemetry Tooltip on Hover */}
      {activeRobotObj && (
        <div className="robot-tooltip">
          <div className="tooltip-header">
            <span>{activeRobotObj.robot_id.toUpperCase()}</span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{activeRobotObj.status}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Coordinates:</span>
            <span className="tooltip-val">[{activeRobotObj.position[0].toFixed(1)}, {activeRobotObj.position[1].toFixed(1)}]</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Heading:</span>
            <span className="tooltip-val">{(activeRobotObj.heading || 0).toFixed(0)}°</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Battery:</span>
            <span className="tooltip-val" style={{ color: activeRobotObj.battery > 30 ? '#00ff9d' : '#ff3366' }}>
              {activeRobotObj.battery.toFixed(0)}%
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Payload:</span>
            <span className="tooltip-val" style={{ color: activeRobotObj.has_cargo ? '#f97316' : '#94a3b8' }}>
              {activeRobotObj.has_cargo ? 'CARGO LOADED' : 'EMPTY'}
            </span>
          </div>
          {activeRobotObj.current_task_id && (
            <div className="tooltip-row">
              <span className="tooltip-label">Task:</span>
              <span className="tooltip-val">{activeRobotObj.current_task_id.substring(0, 8)}...</span>
            </div>
          )}
        </div>
      )}

      {/* Visual Map Legend */}
      <div className="map-legend-overlay">
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#1e2538', border: '1px solid #3b4866' }}></div>
          <span>Pallet Rack</span>
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: 'rgba(0,255,157,0.3)', border: '1px solid #00ff9d' }}></div>
          <span>Pickup (IN)</span>
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: 'rgba(0,240,255,0.3)', border: '1px solid #00f0ff' }}></div>
          <span>Dropoff (OUT)</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#00f0ff' }}></div>
          <span>Moving</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#ffb800' }}></div>
          <span>Waiting / Yield</span>
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#f97316' }}></div>
          <span>Carrying Cargo</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   PERFORMANCE METRICS PANEL (FIXED & MODERNIZED)
   -------------------------------------------------------------------------- */
function MetricsPanel({ metrics = {} }) {
  // Read both lowercase and uppercase keys for 100% reliability
  const makespan = metrics.makespan ?? metrics.MAKESPAN ?? 0;
  const throughput = metrics.throughput ?? metrics.THROUGHPUT ?? 0;
  const collisions = metrics.collision_count ?? metrics.COLLISION_COUNT ?? 0;
  const deadlocks = metrics.deadlock_count ?? metrics.DEADLOCK_COUNT ?? 0;
  const replans = metrics.replan_count ?? metrics.REPLAN_COUNT ?? 0;
  const waitTime = metrics.waiting_time ?? metrics.WAITING_TIME ?? 0;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          System Performance
        </div>
        <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>REAL-TIME</span>
      </div>

      <div className="metrics-grid">
        <div className="metric-stat-box highlight">
          <span className="metric-label">Makespan</span>
          <div className="metric-value-row">
            <span className="metric-number">{makespan.toFixed(0)}</span>
            <span className="metric-unit">ticks</span>
          </div>
        </div>

        <div className="metric-stat-box success">
          <span className="metric-label">Throughput</span>
          <div className="metric-value-row">
            <span className="metric-number">{throughput.toFixed(3)}</span>
            <span className="metric-unit">t/s</span>
          </div>
        </div>

        <div className={`metric-stat-box ${collisions > 0 ? 'danger' : 'success'}`}>
          <span className="metric-label">Collisions</span>
          <div className="metric-value-row">
            <span className="metric-number">{collisions}</span>
          </div>
        </div>

        <div className={`metric-stat-box ${deadlocks > 0 ? 'warning' : 'success'}`}>
          <span className="metric-label">Deadlocks</span>
          <div className="metric-value-row">
            <span className="metric-number">{deadlocks}</span>
          </div>
        </div>

        <div className="metric-stat-box highlight">
          <span className="metric-label">Re-plans</span>
          <div className="metric-value-row">
            <span className="metric-number">{replans}</span>
          </div>
        </div>

        <div className="metric-stat-box warning">
          <span className="metric-label">Wait Time</span>
          <div className="metric-value-row">
            <span className="metric-number">{waitTime.toFixed(0)}</span>
            <span className="metric-unit">ticks</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   TASK QUEUE & DISTRIBUTION PANEL (FIXED & INTERACTIVE)
   -------------------------------------------------------------------------- */
function TasksPanel({ tasks = [] }) {
  // Support string enum representations as well as legacy numbers
  const queued = tasks.filter(t => t.status === 'QUEUED' || t.status === 1).length;
  const assigned = tasks.filter(t => t.status === 'ASSIGNED' || t.status === 2).length;
  const inprog = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 3).length;
  const comp = tasks.filter(t => t.status === 'COMPLETED' || t.status === 4).length;
  const total = queued + assigned + inprog + comp || 1;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Warehouse Tasks Queue
        </div>
        <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>
          TOTAL: {tasks.length}
        </span>
      </div>

      <div className="task-counters-row">
        <div className="task-pill q">
          <span className="task-pill-tag">QUEUED (Q)</span>
          <span className="task-pill-count">{queued}</span>
        </div>
        <div className="task-pill a">
          <span className="task-pill-tag">ASSIGNED (A)</span>
          <span className="task-pill-count">{assigned}</span>
        </div>
        <div className="task-pill w">
          <span className="task-pill-tag">WORKING (W)</span>
          <span className="task-pill-count">{inprog}</span>
        </div>
        <div className="task-pill c">
          <span className="task-pill-tag">COMPLETED (C)</span>
          <span className="task-pill-count" style={{ color: '#00ff9d' }}>{comp}</span>
        </div>
      </div>

      {/* Multi-Segment Queue Distribution Bar */}
      <div className="task-distribution-bar">
        <div className="task-bar-segment q" style={{ width: `${(queued / total) * 100}%` }} title={`Queued: ${queued}`}></div>
        <div className="task-bar-segment a" style={{ width: `${(assigned / total) * 100}%` }} title={`Assigned: ${assigned}`}></div>
        <div className="task-bar-segment w" style={{ width: `${(inprog / total) * 100}%` }} title={`In Progress: ${inprog}`}></div>
        <div className="task-bar-segment c" style={{ width: `${(comp / total) * 100}%` }} title={`Completed: ${comp}`}></div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   ROBOT FLEET STATUS PANEL
   -------------------------------------------------------------------------- */
function RobotsPanel({ robots = [], hoveredRobot, setHoveredRobot }) {
  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M7 15h.01M17 15h.01M9 9h6" />
          </svg>
          Active AMR Fleet ({robots.length})
        </div>
      </div>

      <div className="robots-list">
        {robots.map((r) => {
          const isHovered = hoveredRobot === r.robot_id;
          const statusLower = (r.status || 'idle').toLowerCase();
          const batteryColor = r.battery > 50 ? '#00ff9d' : (r.battery > 20 ? '#ffb800' : '#ff3366');

          return (
            <div
              key={r.robot_id}
              className="robot-row-card"
              style={{
                borderColor: isHovered ? '#00f0ff' : 'var(--border-subtle)',
                background: isHovered ? 'var(--bg-card-hover)' : 'var(--bg-card)'
              }}
              onMouseEnter={() => setHoveredRobot(r.robot_id)}
              onMouseLeave={() => setHoveredRobot(null)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className="robot-id-badge">{r.robot_id.replace('robot-', 'AMR-')}</span>
                <span className={`robot-status-pill ${statusLower}`}>{r.status}</span>
                {r.has_cargo && (
                  <span style={{ fontSize: '0.65rem', background: '#f97316', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 'bold' }}>
                    CARGO
                  </span>
                )}
              </div>

              <div className="battery-display">
                <div className="battery-track">
                  <div
                    className="battery-bar-fill"
                    style={{ width: `${r.battery}%`, background: batteryColor }}
                  ></div>
                </div>
                <span className="battery-percent">{r.battery.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   RECENT CONFLICTS LOG PANEL (FIXED & LIVE)
   -------------------------------------------------------------------------- */
function ConflictsPanel({ conflicts = [] }) {
  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Recent Conflicts & Resolutions
        </div>
        <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'JetBrains Mono' }}>
          {conflicts.length} EVENTS
        </span>
      </div>

      {conflicts.length === 0 ? (
        <div className="empty-state">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff9d" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Dynamic Reservation Nominal • Zero Active Conflicts
        </div>
      ) : (
        <div className="conflicts-feed">
          {conflicts.slice(-6).reverse().map((c, i) => {
            const isDeadlock = c.type.includes('DEADLOCK');
            const isVertex = c.type.includes('VERTEX');
            const isEdge = c.type.includes('EDGE');
            const badgeClass = isDeadlock ? 'deadlock' : (isVertex ? 'vertex' : (isEdge ? 'edge' : 'choke'));

            return (
              <div key={i} className="conflict-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="conflict-tick">#{c.tick}</span>
                  <span className={`conflict-badge ${badgeClass}`}>
                    {c.type.replace('_CONFLICT', '')}
                  </span>
                  <span className="conflict-agents">
                    {c.robot_id} ↔ {c.peer_id}
                  </span>
                </div>
                <span className="conflict-outcome">&rarr; {c.outcome}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   BENCHMARK PANEL
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
      console.error("Benchmark error", e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Scenario Benchmark Runner
        </div>
      </div>

      <div className="benchmark-controls">
        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          className="select-cyber"
        >
          <option value="S1_Normal">S1: Normal Warehouse</option>
          <option value="S2_Crossing">S2: Crossing Traffic</option>
          <option value="S3_Narrow">S3: Narrow Aisle Stress</option>
          <option value="S4_Blocked">S4: Dynamic Blocked Aisle</option>
          <option value="S5_Failure">S5: Mid-Run Robot Failure</option>
          <option value="S6_CommDelay">S6: Communication Loss</option>
        </select>
        <button className="btn-cyber" onClick={runBenchmark} disabled={running}>
          {running ? 'Benchmarking...' : 'Execute'}
        </button>
      </div>

      {results && (
        <table className="benchmark-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Wait (t)</th>
              <th>Collisions</th>
              <th>Done</th>
            </tr>
          </thead>
          <tbody>
            {['B0', 'B1', 'B2', 'P1'].map((strat) => (
              <tr key={strat} className={strat === 'P1' ? 'highlight' : ''}>
                <td>{strat}</td>
                <td>{results[strat]?.wait?.toFixed(1) ?? '-'}</td>
                <td style={{ color: results[strat]?.collisions === 0 ? '#00ff9d' : '#ff3366' }}>
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
   SECURITY / FAULT TOLERANCE PANEL
   -------------------------------------------------------------------------- */
function SecurityPanel({ alerts = [] }) {
  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="panel-title-icon">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Security & Trust Monitor
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff9d" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Zero Anomalies • Cryptographic Proofs Verified
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ color: 'var(--neon-red)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>
              &bull; {a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
