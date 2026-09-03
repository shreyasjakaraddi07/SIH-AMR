import numpy as np
from scipy.optimize import linear_sum_assignment
from typing import List, Dict, Any
from models import RobotState, Task, RobotStatus, TaskStatus
from interfaces import TaskAllocator, Planner

class HungarianAllocator(TaskAllocator):
    def __init__(self, planner: Planner, costmap: Any):
        self.planner = planner
        self.costmap = costmap

    def allocate(self, robots: List[RobotState], tasks: List[Task]) -> Dict[str, str]:
        """
        Allocates tasks to robots using the Hungarian Algorithm to minimize total travel time.
        """
        idle_robots = [r for r in robots if r.status in (RobotStatus.IDLE, None)]
        queued_tasks = [t for t in tasks if t.status == TaskStatus.QUEUED]

        if not idle_robots or not queued_tasks:
            return {}

        n_robots = len(idle_robots)
        n_tasks = len(queued_tasks)
        
        # Build cost matrix: C(Ri, Tj)
        cost_matrix = np.zeros((n_robots, n_tasks))
        
        for i, robot in enumerate(idle_robots):
            for j, task in enumerate(queued_tasks):
                # Estimated travel time from A* path length
                path = self.planner.plan(robot.position, task.pickup_cell, self.costmap)
                if not path:
                    cost_matrix[i, j] = 999999.0 # Unreachable penalty
                else:
                    cost_matrix[i, j] = float(len(path) - 1)
                    
        # Note: Section 8.2 explicitly warns distance-in-metres can dominate 
        # a 0-1 priority score if not normalized. 
        # Normalize costs before combining.
        max_cost = np.max(cost_matrix)
        if max_cost > 0:
            cost_matrix = cost_matrix / max_cost
            
        # In the future (Phase 3/4), add weighted terms:
        # congestion_cost = 0.0
        # battery_penalty = 0.0
        # task_priority_penalty = 0.0
        # reassignment_penalty = 0.0
        
        # Scipy handles non-square matrices automatically
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        
        assignment = {}
        for r_idx, t_idx in zip(row_ind, col_ind):
            # Ignore unreachable assignments
            if cost_matrix[r_idx, t_idx] < 1.0 or max_cost == 0:
                # wait, if max_cost > 0, the unreachable penalty (999999) gets normalized too, 
                # but it will be exactly 1.0 (or very close to it).
                # Actually, if 999999 is in the matrix, max_cost is 999999, so unreachable becomes 1.0.
                # Valid paths will be small.
                # Let's check original unnormalized cost.
                path_len = cost_matrix[r_idx, t_idx] * max_cost if max_cost > 0 else cost_matrix[r_idx, t_idx]
                if path_len < 999999.0:
                    robot_id = idle_robots[r_idx].robot_id
                    task_id = queued_tasks[t_idx].task_id
                    assignment[robot_id] = task_id
                
        return assignment
