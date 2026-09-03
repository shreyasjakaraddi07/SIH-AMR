import heapq
from typing import List, Tuple, Any
from interfaces import Planner

class AStarPlanner(Planner):
    def plan(self, start: Tuple[int, int], goal: Tuple[int, int], costmap: Any) -> List[Tuple[int, int]]:
        """
        A* path planning on a 2D grid using Manhattan distance heuristic.
        Treats '#' as impassable.
        """
        start_int = (int(start[0]), int(start[1]))
        goal_int = (int(goal[0]), int(goal[1]))
        
        if start_int == goal_int:
            return [start_int]
            
        def heuristic(a: Tuple[int, int], b: Tuple[int, int]) -> float:
            return abs(a[0] - b[0]) + abs(a[1] - b[1])
            
        frontier = []
        heapq.heappush(frontier, (0, start_int))
        came_from = {start_int: None}
        cost_so_far = {start_int: 0.0}
        
        while frontier:
            _, current = heapq.heappop(frontier)
            
            if current == goal_int:
                break
                
            x, y = current
            # 4-directional movement
            for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
                nxt = (x + dx, y + dy)
                
                char = costmap.get_cell(nxt[0], nxt[1])
                if char == '#':
                    continue
                    
                new_cost = cost_so_far[current] + 1.0
                
                if nxt not in cost_so_far or new_cost < cost_so_far[nxt]:
                    cost_so_far[nxt] = new_cost
                    priority = new_cost + heuristic(nxt, goal_int)
                    heapq.heappush(frontier, (priority, nxt))
                    came_from[nxt] = current
                    
        if goal_int not in came_from:
            return []
            
        path = []
        curr = goal_int
        while curr is not None:
            path.append(curr)
            curr = came_from[curr]
            
        path.reverse()
        return path
