from typing import Optional, Any, List
from models import RobotState, RobotStatus, Intent, IntentMessage, Task, TaskStatus
from interfaces import Planner, CommsChannel
from robot.coordination import ReservationTable, PriorityCalculator, check_vertex_conflict, check_edge_swap

class LocalTaskManager:
    def __init__(self, robot_state: RobotState, planner: Planner, comms: CommsChannel, costmap: Any, strategy: str = "P1"):
        self.state = robot_state
        self.planner = planner
        self.comms = comms
        self.costmap = costmap
        self.strategy = strategy
        self.current_task: Optional[Task] = None
        self.seq = 0
        self.target_cell: Optional[tuple[int, int]] = None
        
        # Decentralized coordination
        self.reservation_table = ReservationTable()
        self.priority_calc = PriorityCalculator()
        self.wait_time = 0.0
        self.waiting_on: Optional[str] = None
        self.peer_states: dict[str, IntentMessage] = {}
        self.last_seen: dict[str, float] = {}

    def assign_task(self, task: Task):
        self.current_task = task
        self.state.current_task_id = task.task_id
        self.state.status = RobotStatus.MOVING
        task.status = TaskStatus.ASSIGNED
        task.assigned_robot_id = self.state.robot_id
        self.target_cell = task.pickup_cell
        self.wait_time = 0.0
        self.waiting_on = None
        self._replan()

    def _replan(self):
        if self.target_cell:
            path = self.planner.plan(self.state.position, self.target_cell, self.costmap)
            current_int = (int(self.state.position[0]), int(self.state.position[1]))
            if path and path[0] == current_int:
                path.pop(0)
            self.state.planned_path = path
            
            # Commit the new path to our own reservation table
            if path:
                self.reservation_table.commit(self.state.robot_id, path, self.state.timestamp + 1)
        else:
            self.state.planned_path = []
            self.reservation_table.expire(self.state.robot_id)

    def _update_peer_reservations(self, current_time: float):
        """Update local reservation table based on received intents."""
        messages = self.comms.receive()
        for msg in messages:
            if msg.robot_id == self.state.robot_id:
                continue
                
            self.last_seen[msg.robot_id] = msg.timestamp
            self.peer_states[msg.robot_id] = msg
            
            # Update reservation table
            if msg.planned_path:
                # Assuming intent messages broadcast the full planned path starting from timestamp + 1
                self.reservation_table.commit(msg.robot_id, msg.planned_path, msg.timestamp + 1)
            else:
                self.reservation_table.expire(msg.robot_id)

        # Check for degraded comms (Phase 4)
        degraded = False
        for peer_id, last_t in self.last_seen.items():
            if current_time - last_t > 3.0: # 3 ticks threshold
                degraded = True
                break
                
        if degraded and self.state.status == RobotStatus.MOVING:
            self.state.status = RobotStatus.DEGRADED

        if not degraded and self.state.status == RobotStatus.DEGRADED:
            self.state.status = RobotStatus.MOVING

    def get_priority(self) -> tuple[float, str]:
        urgency = float(self.state.task_priority)
        dist = float(len(self.state.planned_path))
        return self.priority_calc.calculate(urgency, self.wait_time, self.state.battery, dist, self.state.robot_id)

    def _check_conflicts(self, current_time: float) -> bool:
        """Returns True if it's safe to move to the next cell."""
        if not self.state.planned_path:
            return False
            
        next_cell = self.state.planned_path[0]
        current_cell = (int(self.state.position[0]), int(self.state.position[1]))
        
        # Check static obstacles (Phase 4 Blocked Aisles)
        if self.costmap.get_cell(next_cell[0], next_cell[1]) == '#':
            self._replan()
            return False

        if self.strategy == "B1":
            # Independent A* (No coordination)
            if self.state.status == RobotStatus.WAITING:
                self.state.status = RobotStatus.MOVING
            return True
            
        if self.strategy == "B2":
            # Stop-and-wait
            for peer_id, msg in self.peer_states.items():
                if current_time - self.last_seen.get(peer_id, 0) < 3.0:
                    px, py = msg.position
                    if int(px) == next_cell[0] and int(py) == next_cell[1]:
                        self.state.status = RobotStatus.WAITING
                        self.wait_time += 1.0
                        return False
            if self.state.status == RobotStatus.WAITING:
                self.state.status = RobotStatus.MOVING
            return True

        # Phase 3 Conflict Detection (P1 Strategy)
        conflicting_robot = check_vertex_conflict(self.reservation_table, self.state.robot_id, next_cell, current_time + 1)
        if not conflicting_robot:
            conflicting_robot = check_edge_swap(self.reservation_table, self.state.robot_id, current_cell, next_cell, current_time)
            
        if conflicting_robot:
            self.waiting_on = conflicting_robot
            
            # Conflict Resolution: Compare priorities
            my_pri = self.get_priority()
            if conflicting_robot in self.peer_states:
                peer_msg = self.peer_states[conflicting_robot]
                peer_pri = self.priority_calc.calculate(float(peer_msg.priority), 0.0, peer_msg.battery, float(len(peer_msg.planned_path)), conflicting_robot)
                
                if my_pri < peer_pri:
                    # I yield
                    self.state.status = RobotStatus.WAITING
                    self.wait_time += 1.0
                    return False
                else:
                    # I have higher priority, proceed (other should yield)
                    pass
            else:
                # Peer unknown, play safe
                self.state.status = RobotStatus.WAITING
                self.wait_time += 1.0
                return False
                
        self.waiting_on = None
        self.wait_time = 0.0
        if self.state.status == RobotStatus.WAITING:
            self.state.status = RobotStatus.MOVING
        return True

    def force_reroute(self):
        """Called when a deadlock is broken."""
        self._replan()
        self.wait_time = 0.0
        self.waiting_on = None

    def tick(self, current_time: float):
        self.state.timestamp = current_time
        self._update_peer_reservations(current_time)
        
        if self.state.status == RobotStatus.OFFLINE:
            return

        if self.state.status not in (RobotStatus.DEGRADED, RobotStatus.OFFLINE):
            if self._check_conflicts(current_time):
                # Move
                next_cell = self.state.planned_path.pop(0)
                self.state.position = (float(next_cell[0]), float(next_cell[1]))
            elif not self.state.planned_path and self.target_cell:
                # Reached target
                self._handle_arrival()
                
        # Broadcast intent
        self.seq += 1
        msg = IntentMessage(
            robot_id=self.state.robot_id,
            seq=self.seq,
            timestamp=current_time,
            position=self.state.position,
            velocity=1.0 if self.state.status == RobotStatus.MOVING else 0.0,
            intent=Intent.MOVE if self.state.status == RobotStatus.MOVING else Intent.WAIT,
            next_intersection=None,
            task_id=self.state.current_task_id,
            priority=self.state.task_priority,
            planned_path=self.state.planned_path.copy(),
            waiting_on=self.waiting_on,
            heartbeat=current_time
        )
        self.comms.send(msg)

    def _handle_arrival(self):
        if not self.current_task:
            return
            
        current_int = (int(self.state.position[0]), int(self.state.position[1]))
        if current_int == self.current_task.pickup_cell and self.current_task.status == TaskStatus.ASSIGNED:
            self.current_task.status = TaskStatus.IN_PROGRESS
            self.target_cell = self.current_task.dropoff_cell
            self._replan()
        elif current_int == self.current_task.dropoff_cell and self.current_task.status == TaskStatus.IN_PROGRESS:
            self.current_task.status = TaskStatus.COMPLETED
            self.state.status = RobotStatus.IDLE
            self.state.current_task_id = None
            self.current_task = None
            self.target_cell = None
