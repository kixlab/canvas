from evaluation.metrics import register_metric
import json
from pathlib import Path
from typing import Dict, Any, Optional, Set, List


@register_metric("tool_usage")
def _tool_usage_metric(
    gt_img: str = None,
    gen_img: str = None,
    gt_json: str = None,
    gen_json: str = None,
    **kwargs,
) -> Dict[str, Any]:
    """Compute tool usage statistics.

    Priority:
    1. If a ``snapshots/`` directory exists next to *gen_json*, parse \*-snapshot-*.json files
       (newer CXI format).
    2. Fallback to legacy *-json-response.json parsing.

    Returns a dictionary with keys:
        tool_step_count   – number of steps (snapshots or messages)
        tool_call_count   – total number of tool invocations
        unique_tool_count – number of unique tool names
        unique_tool_list  – sorted list of unique tool names
        tool_call_list    – list[list[str]] of tools called per step (only for snapshot parsing)
    """

    if gen_json is None:
        return {
            "tool_step_count": None,
            "step_count": None,
            "tool_call_count": None,
            "unique_tool_count": None,
            "unique_tool_list": None,
            "tool_call_list": None,
        }

    folder = Path(gen_json).parent

    # ────────────────────────────────────────────────
    # 1) Try modern *snapshots* directory parsing
    # ────────────────────────────────────────────────
    snapshots_dir = folder / "snapshots"
    if snapshots_dir.exists() and snapshots_dir.is_dir():
        snapshot_files = sorted(snapshots_dir.glob("*-snapshot-*.json"))

        step_count: int = 0
        tool_call_count: int = 0
        unique_tool_names: Set[str] = set()
        tool_call_list: List[List[str]] = []

        for snap_path in snapshot_files:
            # skip structure or other aux files
            if "-structure" in snap_path.stem:
                continue

            try:
                with snap_path.open("r", encoding="utf-8") as f:
                    snap_data = json.load(f)
            except Exception:
                # malformed snapshot – skip
                continue

            step_count += 1
            step_tools: List[str] = []

            for tool_result in snap_data.get("toolResults", []):
                name = tool_result.get("name") or tool_result.get("tool") or tool_result.get("toolName")
                if name:
                    step_tools.append(name)
                    unique_tool_names.add(name)
            tool_call_count += len(step_tools)
            tool_call_list.append(step_tools)

        if step_count > 0:
            return {
                "tool_step_count": step_count,
                "step_count": step_count,  # alias for compatibility
                "tool_call_count": tool_call_count,
                "unique_tool_count": len(unique_tool_names),
                "unique_tool_list": sorted(unique_tool_names),
                "tool_call_list": tool_call_list,
            }

    # ────────────────────────────────────────────────
    # 2) Legacy *-json-response.json* parsing fallback
    # ────────────────────────────────────────────────
    response_files = list(folder.glob("*-json-response.json"))
    if not response_files:
        return {
            "tool_step_count": None,
            "step_count": None,
            "tool_call_count": None,
            "unique_tool_count": None,
            "unique_tool_list": None,
            "tool_call_list": None,
        }

    try:
        with response_files[0].open("r", encoding="utf-8") as f:
            outer = json.load(f)
    except Exception:
        return {
            "tool_step_count": None,
            "step_count": None,
            "tool_call_count": None,
            "unique_tool_count": None,
            "unique_tool_list": None,
            "tool_call_list": None,
        }

    data = outer.get("json_response", outer)
    messages = data.get("messages", [])

    tool_call_count = 0
    unique_tool_names: Set[str] = set()

    for msg in messages:
        # Case 1: direct tool message ("role": "tool") or legacy format with top-level type
        if msg.get("role") == "tool" or msg.get("type") == "tool":
            name = (
                msg.get("name")
                or msg.get("tool")
                or (msg.get("content", {}) or {}).get("name")
                or (
                    msg.get("content", {}).get("data", {})
                    if isinstance(msg.get("content"), dict)
                    else {}
                ).get("name")
            )
            if name:
                unique_tool_names.add(name)
            tool_call_count += 1

        # Case 2: assistant message that contains tool_calls list
        if msg.get("role") == "assistant":
            content = msg.get("content", {})
            if isinstance(content, dict):
                data_field = content.get("data", {})
                tool_calls = data_field.get("tool_calls", [])
                for call in tool_calls:
                    name = call.get("name")
                    if name:
                        unique_tool_names.add(name)
                    tool_call_count += 1

    unique_tool_list = sorted(unique_tool_names)
    unique_tool_count = len(unique_tool_list)

    step_count_val = data.get("step_count") or outer.get("step_count") or None

    return {
        "tool_step_count": step_count_val,
        "step_count": step_count_val,  # alias
        "tool_call_count": tool_call_count,
        "unique_tool_count": unique_tool_count,
        "unique_tool_list": unique_tool_list,
        "tool_call_list": None,
    } 