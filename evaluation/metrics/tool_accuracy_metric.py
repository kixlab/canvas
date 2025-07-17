from __future__ import annotations
from evaluation.metrics import register_metric
from typing import Dict, Any


@register_metric("tool_accuracy")
def _tool_accuracy_metric(gt_img: str = None,
                          gen_img: str = None,
                          gt_json: str | None = None,
                          gen_json: str | None = None) -> Dict[str, Any]:
    """Placeholder for tool accuracy metric.

    TODO: Requires ground-truth labels of expected tool calls.
    Currently returns None so that downstream aggregation can skip.
    """
    return {"tool_accuracy": None} 