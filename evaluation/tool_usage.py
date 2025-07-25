import os
import json
from glob import glob
from pathlib import Path
from typing import Dict, Any

from .metrics.tool_usage.human_tool_path_utils import get_human_tools_by_id


def get_tool_usage_stats(result_path: str, case_id: str) -> Dict[str, Any]:
    """
    Computes tool usage statistics by parsing snapshot files for a given result.
    
    Args:
        result_path: Path to the specific result directory (e.g., '.../gid6-27-gpt-4o-image_only').
        case_id: The case ID (e.g., 'gid6-27').
        
    Returns:
        A dictionary containing comprehensive tool usage metrics.
    """
    result_path = Path(result_path)
    snapshots_dir = result_path / "snapshots"

    if not snapshots_dir.is_dir():
        return {
            "step_count": None,
            "tool_call_count": None,
            "tool_efficiency": None,
            "unique_tool_count": None,
            "unique_tool_list": None,
            "tool_call_trace": None,
            "human_hit_rate": None,
        }

    snapshot_files = sorted(
        glob(os.path.join(snapshots_dir, f"{result_path.name}-snapshot-*.json"))
    )

    total_tool_calls = 0
    unique_tools = set()
    tool_call_trace = []
    step_count = 0

    for snap_path in snapshot_files:
        # defensive check to skip non-json or structure files, if any
        if not snap_path.endswith(".json") or "-structure" in snap_path:
            continue

        try:
            with open(snap_path, "r", encoding="utf-8") as f:
                snap_data = json.load(f)
        except (json.JSONDecodeError, IOError):
            continue

        step_count += 1

        tool_calls_in_step = snap_data.get("toolResults", [])
        total_tool_calls += len(tool_calls_in_step)

        current_step_tools = []
        for tool in tool_calls_in_step:
            tool_name = tool.get("name")
            if tool_name:
                current_step_tools.append(tool_name)
                unique_tools.add(tool_name)
        tool_call_trace.append(current_step_tools)

    # Calculate efficiency as total calls per step
    tool_efficiency = (
        round(total_tool_calls / step_count, 4) if step_count > 0 else None
    )

    # Calculate human hit rate for modification tasks
    human_tools = get_human_tools_by_id(case_id)
    human_hit_rate = None
    if human_tools:
        intersection = len(unique_tools.intersection(human_tools))
        union = len(unique_tools.union(human_tools))
        human_hit_rate = round(intersection / union, 4) if union > 0 else 0.0

    return {
        "step_count": step_count,
        "tool_call_count": total_tool_calls,
        "tool_efficiency": tool_efficiency,
        "unique_tool_count": len(unique_tools),
        "unique_tool_list": sorted(list(unique_tools)),
        "tool_call_trace": tool_call_trace,
        "human_hit_rate": human_hit_rate,
    } 