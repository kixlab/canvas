import os
import json
from glob import glob


def extract_tool_metrics(result_path: str) -> dict:
    snapshot_dir = os.path.join(result_path, "snapshots")
    if not os.path.exists(snapshot_dir):
        return {}

    result_name = os.path.basename(result_path)
    snapshot_files = sorted(
        glob(os.path.join(snapshot_dir, f"{result_name}-snapshot-*.json"))
    )

    total_tool_calls = 0
    unique_tools = set()
    tool_call_list = []
    step_count = 0

    for snap_path in snapshot_files:
        if not snap_path.endswith(".json") or "-structure" in snap_path:
            continue

        with open(snap_path, "r") as f:
            snap_data = json.load(f)

        step_count += 1
        tool_calls = snap_data.get("toolResults", [])
        total_tool_calls += len(tool_calls)

        step_tools = []
        for tool in tool_calls:
            tool_name = tool.get("name")
            if tool_name:
                step_tools.append(tool_name)
                unique_tools.add(tool_name)
        tool_call_list.append(step_tools)

    tool_efficiency = (
        round(total_tool_calls / step_count, 3) if step_count > 0 else None
    )

    return {
        "step_count": step_count,
        "unique_tool_count": len(unique_tools),
        "tool_efficiency": tool_efficiency,
        "tool_call_list": tool_call_list,
    } 