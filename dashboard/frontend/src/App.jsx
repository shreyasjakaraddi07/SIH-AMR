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

  if (!data) return <div>Connecting to Telemetry...</div>;

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
          <WarehouseMap robots={data.robots} tasks={data.tasks} />
        </div>
        
        <div className="col side-col">
          <BenchmarkPanel />
          <MetricsPanel metrics={data.metrics} />
          <TasksPanel tasks={data.tasks} />
          <RobotsPanel robots={data.robots} />
          <ConflictsPanel conflicts={data.conflicts} />
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

function WarehouseMap({ robots, tasks }) {
  const mapW = 10;
  const mapH = 10; // we scale accordingly
  const CELL = 40;

  // Simple placeholder rendering. In a real app we'd fetch the static map from backend too.
  return (
    <div className="panel map-panel">
      <h2>Live Map</h2>
      <svg width={400} height={400} className="grid-svg">
        {/* Draw robots */}
        {robots.map(r => {
          const cx = r.position[0] * CELL + CELL/2;
          const cy = r.position[1] * CELL + CELL/2;
          return (
            <g key={r.robot_id}>
              {/* Path */}
              {r.planned_path && r.planned_path.length > 0 && (
                <polyline 
                  points={[[r.position[0]*CELL+CELL/2, r.position[1]*CELL+CELL/2], ...r.planned_path.map(p => [p[0]*CELL+CELL/2, p[1]*CELL+CELL/2])].map(p=>p.join(',')).join(' ')} 
                  fill="none" 
                  stroke="rgba(100, 200, 255, 0.4)" 
                  strokeWidth="2" 
                />
              )}
              {/* Robot body */}
              <circle cx={cx} cy={cy} r={12} fill={r.status === 'WAITING' ? '#ffaa00' : '#44bbff'} />
              <text x={cx} y={cy+4} fontSize="10" textAnchor="middle" fill="#fff">{r.robot_id.split('-')[1]}</text>
            </g>
          );
        })}
      </svg>
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
