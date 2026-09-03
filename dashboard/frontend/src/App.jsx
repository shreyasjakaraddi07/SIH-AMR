import { useState, useEffect, useRef } from 'react';
import './App.css';

const WS_URL = 'ws://localhost:8000/ws';

function App() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const wsRef = useRef(null);

  const connectWs = () => {
    if (wsRef.current) return;
    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onmessage = (e) => {
      const snap = JSON.parse(e.data);
      setData(snap);
      
      // Simulating picking up security alerts from the backend
      // Normally these would be in the snapshot, but we just check degraded
      if (snap.robots) {
        snap.robots.forEach(r => {
          if (r.status === 'DEGRADED') {
            setSecurityAlerts(prev => {
              if (!prev.find(a => a.id === r.robot_id)) {
                return [...prev, { id: r.robot_id, msg: `Robot ${r.robot_id} entered DEGRADED mode` }];
              }
              return prev;
            });
          }
        });
      }
    };
    wsRef.current = ws;
  };

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const killWs = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const safeData = data && Object.keys(data).length > 0 ? data : {
    robots: [],
    tasks: [],
    metrics: {},
    conflicts: []
  };

  return (
    <div className="dashboard">
      <header>
        <h1>AMR Coordination Dashboard</h1>
        <div className="controls">
          <span className={`status ${connected ? 'up' : 'down'}`}>
            WS: {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
          <button onClick={killWs} disabled={!connected}>Kill Connection (Test)</button>
          {!connected && <button onClick={connectWs}>Reconnect</button>}
        </div>
      </header>

      <div className="main-grid">
        <div className="col map-col">
          <WarehouseMap robots={safeData.robots} tasks={safeData.tasks} grid={safeData.grid} />
        </div>
        
        <div className="col side-col">
          <BenchmarkPanel />
          <MetricsPanel metrics={safeData.metrics} />
          <TasksPanel tasks={safeData.tasks} />
          <RobotsPanel robots={safeData.robots} />
          <ConflictsPanel conflicts={safeData.conflicts} />
          <SecurityPanel alerts={securityAlerts} />
        </div>
      </div>
    </div>
  );
}

function BenchmarkPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [scenario, setScenario] = useState('S1_Normal');
  
  const runBenchmark = async () => {
    setRunning(true);
    setResults(null);
    try {
      // POST requires method and headers
      const res = await fetch('http://localhost:8000/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await res.json();
      setResults(data.results);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };
  
  return (
    <div className="panel benchmark-panel">
      <h2>Benchmark Mode</h2>
      <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem'}}>
        <select value={scenario} onChange={e => setScenario(e.target.value)} style={{flex: 1}}>
          <option value="S1_Normal">S1: Normal</option>
          <option value="S2_Crossing">S2: Crossing</option>
          <option value="S3_Narrow">S3: Narrow Aisle</option>
          <option value="S4_Blocked">S4: Blocked Aisle</option>
          <option value="S5_Failure">S5: Robot Failure</option>
          <option value="S6_CommDelay">S6: Comm Delay</option>
        </select>
        <button onClick={runBenchmark} disabled={running}>
          {running ? 'Running...' : 'Run'}
        </button>
      </div>
      
      {results && (
        <table style={{width: '100%', fontSize: '0.9rem', textAlign: 'left'}}>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Wait</th>
              <th>Collisions</th>
            </tr>
          </thead>
          <tbody>
            {['B0', 'B1', 'B2', 'P1'].map(strat => (
              <tr key={strat}>
                <td>{strat}</td>
                <td>{results[strat]?.wait?.toFixed(1) || '-'}</td>
                <td style={{color: strat === 'P1' && results[strat]?.collisions === 0 ? '#00ff88' : 'inherit'}}>
                  {results[strat]?.collisions?.toFixed(1) || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WarehouseMap({ robots, tasks, grid }) {
  const CELL = 40;

  if (!grid || grid.length === 0) {
    return (
      <div className="panel map-panel" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
        <div style={{color: '#888'}}>Waiting for map data...</div>
      </div>
    );
  }

  const mapH = grid.length;
  const mapW = grid[0].length;
  const width = mapW * CELL;
  const height = mapH * CELL;

  return (
    <div className="panel map-panel" style={{overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
      <h2>Live Map</h2>
      <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <svg viewBox={`0 0 ${width} ${height}`} className="grid-svg" style={{maxHeight: '100%', maxWidth: '100%'}}>
          
          {/* Draw the warehouse grid cells */}
          {grid.map((row, y) => (
            row.map((cell, x) => {
              const isRack = cell === '#';
              const isPickup = cell === 'P';
              const isDropoff = cell === 'D';
              
              // Warehouse colors
              const fill = isRack ? '#2a2a35' : (isPickup ? '#0a2a1a' : (isDropoff ? '#0a1a3a' : '#141419'));
              const stroke = isRack ? '#3a3a4a' : '#1f1f26';
              
              return (
                <g key={`${x}-${y}`}>
                  <rect x={x*CELL} y={y*CELL} width={CELL} height={CELL} fill={fill} stroke={stroke} strokeWidth="1" />
                  {isRack && <rect x={x*CELL+4} y={y*CELL+4} width={CELL-8} height={CELL-8} fill="#333344" rx="2" />}
                  
                  {isPickup && (
                    <>
                      <rect x={x*CELL+4} y={y*CELL+4} width={CELL-8} height={CELL-8} fill="#0a2a1a" stroke="#00ff88" strokeWidth="2" rx="2" strokeDasharray="4 2" />
                      <text x={x*CELL+CELL/2} y={y*CELL+CELL/2+5} fontSize="16" textAnchor="middle" fill="#00ff88" fontWeight="bold">P</text>
                    </>
                  )}
                  
                  {isDropoff && (
                    <>
                      <rect x={x*CELL+4} y={y*CELL+4} width={CELL-8} height={CELL-8} fill="#0a1a3a" stroke="#00e5ff" strokeWidth="2" rx="2" strokeDasharray="4 2" />
                      <text x={x*CELL+CELL/2} y={y*CELL+CELL/2+5} fontSize="16" textAnchor="middle" fill="#00e5ff" fontWeight="bold">D</text>
                    </>
                  )}
                </g>
              );
            })
          ))}

          {/* Draw Paths (underneath robots) */}
          {robots.map(r => {
            if (!r.planned_path || r.planned_path.length === 0) return null;
            const pts = [[r.position[0]*CELL+CELL/2, r.position[1]*CELL+CELL/2], ...r.planned_path.map(p => [p[0]*CELL+CELL/2, p[1]*CELL+CELL/2])];
            return (
              <polyline 
                key={`path-${r.robot_id}`}
                points={pts.map(p => p.join(',')).join(' ')} 
                fill="none" 
                stroke="rgba(0, 229, 255, 0.3)" 
                strokeWidth="3" 
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Draw Robot Bodies with smooth transitions */}
          {robots.map(r => {
            const cx = r.position[0] * CELL + CELL/2;
            const cy = r.position[1] * CELL + CELL/2;
            const isWaiting = r.status === 'WAITING';
            const isOffline = r.status === 'OFFLINE';
            const color = isOffline ? '#555' : (isWaiting ? '#ffaa00' : '#00e5ff');
            
            return (
              <g key={r.robot_id} style={{ transition: 'transform 0.2s linear', transform: `translate(${cx}px, ${cy}px)` }}>
                {/* Outer Glow */}
                <circle r={16} fill={color} opacity="0.15" />
                {/* AMR Chassis */}
                <rect x={-12} y={-12} width={24} height={24} fill="#1a1a20" stroke={color} strokeWidth="2" rx="4" />
                {/* Center indicator */}
                <circle r={3} fill={color} />
                {/* Label */}
                <text y={4} fontSize="10" textAnchor="middle" fill="#ffffff" fontWeight="bold" style={{textShadow: '0 1px 2px #000'}}>
                  {r.robot_id.split('-')[1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MetricsPanel({ metrics }) {
  return (
    <div className="panel">
      <h2>Performance</h2>
      <ul>
        <li>Makespan: {metrics.makespan?.toFixed(1) || 0} ticks</li>
        <li>Throughput: {metrics.throughput?.toFixed(3) || 0} t/s</li>
        <li>Collisions: {metrics.collision_count || 0}</li>
        <li>Deadlocks: {metrics.deadlock_count || 0}</li>
        <li>Re-plans: {metrics.replan_count || 0}</li>
      </ul>
    </div>
  );
}

function TasksPanel({ tasks }) {
  const queued = tasks.filter(t => t.status === 1).length;
  const assigned = tasks.filter(t => t.status === 2).length;
  const inprog = tasks.filter(t => t.status === 3).length;
  const comp = tasks.filter(t => t.status === 4).length;
  
  return (
    <div className="panel">
      <h2>Tasks</h2>
      <div className="task-stats">
        <div>Q: {queued}</div>
        <div>A: {assigned}</div>
        <div>W: {inprog}</div>
        <div>C: {comp}</div>
      </div>
    </div>
  );
}

function RobotsPanel({ robots }) {
  return (
    <div className="panel robots-panel">
      <h2>Robots</h2>
      {robots.map(r => (
        <div key={r.robot_id} className="robot-card">
          <strong>{r.robot_id}</strong> - {r.status}
          <div className="battery-bar">
            <div className="fill" style={{width: `${r.battery}%`}}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConflictsPanel({ conflicts }) {
  return (
    <div className="panel conflicts-panel">
      <h2>Recent Conflicts</h2>
      <ul>
        {conflicts.slice(-5).map((c, i) => (
          <li key={i}>{c.tick}: {c.type} between {c.robot_id} and {c.peer_id} &rarr; {c.outcome}</li>
        ))}
      </ul>
    </div>
  );
}

function SecurityPanel({ alerts }) {
  return (
    <div className="panel security-panel">
      <h2>Security / Trust</h2>
      {alerts.length === 0 ? <div className="ok">All Systems Normal</div> : (
        <ul className="alerts">
          {alerts.map((a, i) => <li key={i}>{a.msg}</li>)}
        </ul>
      )}
    </div>
  );
}

export default App;
