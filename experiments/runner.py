import sys, os
import multiprocessing
import time
import json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sim.simulator import Simulator
from config import GridMap

SCENARIOS = {
    "S1_Normal": """\
##########
#R..P...R#
#........#
#D..R...D#
##########
""",
    "S2_Crossing": """\
#######
#R...R#
#.....#
#..P..#
#.....#
#..D..#
#######
""",
    "S3_Narrow": """\
###########
#R..R..R..#
#P.......D#
###########
""",
    "S4_Blocked": """\
##########
#R.....R.#
#P.....D.#
#R.......#
##########
""",
    "S5_Failure": """\
##########
#R.P...D.#
#........#
#R.P...D.#
##########
""",
    "S6_CommDelay": """\
##########
#R.P...D.#
#........#
#R.P...D.#
##########
""",
    "S7_Malformed": """\
##########
#R.P...D.#
#........#
#R.P...D.#
##########
""",
    "S8_Scale": """\
####################
#R.P..R.P..R.P..R.P#
#..................#
#D.R..D.R..D.R..D.R#
####################
"""
}

STRATEGIES = ["B0", "B1", "B2", "P1"]
TRIALS = 20
MAX_TICKS = 1000

def run_trial(args):
    scenario_name, strategy, trial_idx = args
    ascii_map = SCENARIOS[scenario_name]
    
    sim = Simulator(ascii_map=ascii_map, headless=True, strategy=strategy)
    
    # Specific scenario injections
    if scenario_name == "S4_Blocked":
        sim.run(max_ticks=100)
        sim.block_cell(5, 2)
        sim.run(max_ticks=MAX_TICKS - 100)
    elif scenario_name == "S5_Failure":
        sim.run(max_ticks=80)
        sim.kill_robot("robot-0")
        sim.run(max_ticks=MAX_TICKS - 80)
    elif scenario_name == "S6_CommDelay":
        original_send = sim.comms.send
        def patched_send(msg):
            if msg.robot_id != "robot-0":
                original_send(msg)
        sim.comms.send = patched_send
        sim.run(max_ticks=MAX_TICKS)
    else:
        sim.run(max_ticks=MAX_TICKS)
        
    metrics = sim.metric_values.copy()
    metrics["strategy"] = strategy
    metrics["scenario"] = scenario_name
    metrics["trial"] = trial_idx
    metrics["completed_tasks"] = sim.completed_tasks
    
    return metrics

def main():
    import asyncio
    from dashboard.backend.db import init_db, persist_snapshot, close_db
    
    async def save_results(results):
        await init_db()
        for res in results:
            await persist_snapshot({
                "tick": MAX_TICKS,
                "metrics": res,
                "strategy": res["strategy"],
                "scenario": res["scenario"],
                "trial": res["trial"]
            })
        await close_db()

    tasks = []
    for scenario in SCENARIOS:
        for strategy in STRATEGIES:
            for trial in range(TRIALS):
                tasks.append((scenario, strategy, trial))
                
    print(f"Starting {len(tasks)} trials ({TRIALS} per config)...")
    t0 = time.time()
    
    with multiprocessing.Pool() as pool:
        results = pool.map(run_trial, tasks)
        
    print(f"Finished in {time.time() - t0:.1f}s. Saving to DB...")
    asyncio.run(save_results(results))
    print("Done.")

if __name__ == "__main__":
    main()
