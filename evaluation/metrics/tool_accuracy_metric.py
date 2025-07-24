from evaluation.metrics import register_metric
from typing import Dict, Any, Optional


@register_metric("tool_accuracy")
def _tool_accuracy_metric(
    gt_img: str = None,
    gen_img: str = None,
    gt_json: Optional[str] = None,
    gen_json: Optional[str] = None,
) -> Dict[str, Any]:
    """Placeholder for tool accuracy metric.

    TODO: Requires ground-truth labels of expected tool calls.
    Currently returns None so that downstream aggregation can skip.
    """
    return {"tool_accuracy": None} 