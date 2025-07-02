from evaluation.metrics import register_metric
import json
from pathlib import Path
from typing import Dict


@register_metric("tool_usage")
def _tool_usage_metric(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None) -> Dict[str, float | int | None]:
    """Compute simple tool usage statistics from *-json-response.json in the generated folder.

    Returns step_count (int) and unique_tool_count (int). If response file not found, values are None.
    """
    if gen_json is None:
        return {"step_count": None, "unique_tool_count": None}

    folder = Path(gen_json).parent
    # find a file ending with json-response.json
    response_files = list(folder.glob("*-json-response.json"))
    if not response_files:
        return {"step_count": None, "unique_tool_count": None}

    try:
        with response_files[0].open("r", encoding="utf-8") as f:
            outer = json.load(f)
    except Exception:
        return {
            "tool_step_count": None,
            "tool_call_count": None,
            "unique_tool_count": None,
            "unique_tool_list": None,
        }

    data = outer.get("json_response", outer)
    messages = data.get("messages", [])

    tool_call_count = 0
    unique_tool_names: set[str] = set()

    for msg in messages:
        # Case 1: direct tool message ("role": "tool") or legacy format with top-level type
        if msg.get("role") == "tool" or msg.get("type") == "tool":
            # try several possible locations for tool name
            name = (
                msg.get("name")
                or msg.get("tool")
                or (msg.get("content", {}) or {}).get("name")
                or (msg.get("content", {}).get("data", {}) if isinstance(msg.get("content"), dict) else {}).get("name")
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
        "tool_call_count": tool_call_count,
        "unique_tool_count": unique_tool_count,
        "unique_tool_list": unique_tool_list,
    } 