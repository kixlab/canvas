from __future__ import annotations
from evaluation.metrics import register_metric
from evaluation.metrics.tool_usage_metric import _tool_usage_metric  # reuse parsing logic
from typing import Dict, Any


@register_metric("tool_efficiency")
def _tool_efficiency_metric(gt_img: str = None,
                            gen_img: str = None,
                            gt_json: str = None,
                            gen_json: str | None = None) -> Dict[str, Any]:
    """Simple heuristic for tool efficiency.

    Currently defined as `1 / (tool_step_count + 1)`, so fewer steps ⇒ higher efficiency.
    Returns None when step count is unavailable.
    """
    usage = _tool_usage_metric(gt_img, gen_img, gt_json, gen_json)
    S = usage.get("tool_step_count")
    C = usage.get("tool_call_count")
    U = usage.get("unique_tool_count")

    if None in (S, C, U):
        return {"tool_efficiency": None}

    penalty = S + C + U  # equal contribution from each component
    efficiency = round(1.0 / (penalty + 1), 4)
    return {"tool_efficiency": efficiency} 