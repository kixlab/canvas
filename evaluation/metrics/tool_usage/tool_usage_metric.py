# ruff: noqa: E402
import os
import json
from glob import glob
from pathlib import Path
from typing import Dict, Any, List, Optional

from evaluation.metrics import register_metric
from evaluation.metrics.tool_usage.human_tool_path_utils import get_human_tools_by_id


@register_metric("tool_usage")
def get_tool_usage_metrics(result_path: str, case_id: str, snapshot_num: Optional[int] = None, **kwargs) -> Dict[str, Any]:
    """
    Computes tool usage statistics by parsing snapshot files for a given result.
    
    Args:
        result_path: Path to the result directory
        case_id: Case identifier
        snapshot_num: If provided, calculate metrics only up to this snapshot number
    """
    result_path = Path(result_path)
    snapshots_dir = result_path / "snapshots"

    # Default metrics in case of errors or no snapshots
    metrics: Dict[str, Any] = {
        "step_count": 0,
        "tool_call_count": 0,
        "tool_efficiency": None,
        "unique_tool_count": 0,
        "unique_tool_list": [],
        "tool_call_trace": [],
        "human_hit_rate": None,
        "human_tool_precision": None,
        "human_tool_recall": None,
    }

    if not snapshots_dir.is_dir():
        return metrics

    # Find all non-structure JSON files in snapshots
    snapshot_files = sorted(
        [p for p in snapshots_dir.glob("*.json") if "-structure" not in p.name]
    )

    if not snapshot_files:
        return metrics

    # If snapshot_num is provided, filter files up to that snapshot
    if snapshot_num is not None:
        # Filter files to include only those up to the specified snapshot number
        filtered_files = []
        for snap_path in snapshot_files:
            try:
                # Extract snapshot number from filename
                snap_stem = snap_path.stem
                snap_num = int(snap_stem.split("-snapshot-")[-1])
                if snap_num <= snapshot_num:
                    filtered_files.append(snap_path)
            except (ValueError, IndexError):
                # Skip files that don't follow the expected naming pattern
                continue
        snapshot_files = filtered_files

    total_tool_calls = 0
    unique_tools = set()
    tool_call_trace = []
    
    for snap_path in snapshot_files:
        try:
            with snap_path.open("r", encoding="utf-8") as f:
                snap_data = json.load(f)
        except (json.JSONDecodeError, IOError):
            continue

        tool_calls_in_step = snap_data.get("toolResults", [])
        total_tool_calls += len(tool_calls_in_step)

        current_step_tools = [tool.get("name") for tool in tool_calls_in_step if tool.get("name")]
        unique_tools.update(current_step_tools)
        tool_call_trace.append(current_step_tools)

    step_count = len(snapshot_files)
    
    # Calculate efficiency
    tool_efficiency = (
        round(total_tool_calls / step_count, 4) if step_count > 0 else 0.0
    )

    # Calculate human hit rate and related metrics
    human_tools = get_human_tools_by_id(case_id)
    human_hit_rate = None
    human_tool_precision = None
    human_tool_recall = None
    
    if human_tools:
        human_tools_set = set(human_tools)
        intersection = len(unique_tools.intersection(human_tools_set))
        union = len(unique_tools.union(human_tools_set))
        
        # Jaccard Similarity (current human_hit_rate)
        human_hit_rate = round(intersection / union, 4) if union > 0 else 0.0
        
        # Precision: How many of the tools used by the model are correct?
        human_tool_precision = round(intersection / len(unique_tools), 4) if len(unique_tools) > 0 else 0.0
        
        # Recall: How many of the human tools did the model use?
        human_tool_recall = round(intersection / len(human_tools_set), 4) if len(human_tools_set) > 0 else 0.0

    # For snapshots, set certain metrics to null to avoid confusion
    if snapshot_num is not None:
        metrics.update({
            "step_count": None,  # Use null for snapshots to avoid confusion
            "tool_call_count": total_tool_calls,
            "tool_efficiency": None,  # Use null for snapshots to avoid confusion
            "unique_tool_count": len(unique_tools),
            "unique_tool_list": sorted(list(unique_tools)),
            "tool_call_trace": tool_call_trace,
            "human_hit_rate": human_hit_rate,
            "human_tool_precision": human_tool_precision,
            "human_tool_recall": human_tool_recall,
        })
    else:
        # For final results, include all metrics
        metrics.update({
            "step_count": step_count,
            "tool_call_count": total_tool_calls,
            "tool_efficiency": tool_efficiency,
            "unique_tool_count": len(unique_tools),
            "unique_tool_list": sorted(list(unique_tools)),
            "tool_call_trace": tool_call_trace,
            "human_hit_rate": human_hit_rate,
            "human_tool_precision": human_tool_precision,
            "human_tool_recall": human_tool_recall,
        })

    return metrics 