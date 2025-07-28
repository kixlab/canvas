from evaluation.metrics import register_metric
from evaluation.tool_usage import get_tool_usage_stats

@register_metric("tool_usage")
def _tool_usage(result_path: str, case_id: str, **kwargs):
    """
    Wrapper metric that computes all tool usage statistics for a given result path.
    It calls the core logic from `evaluation.tool_usage`.
    """
    res = get_tool_usage_stats(result_path, case_id)
    
    return {
        "step_count": res.get("step_count"),
        "tool_call_count": res.get("tool_call_count"),
        "tool_efficiency": res.get("tool_efficiency"),
        "unique_tool_count": res.get("unique_tool_count"),
        "unique_tool_list": res.get("unique_tool_list"),
        "tool_call_trace": res.get("tool_call_trace"),
        "human_hit_rate": res.get("human_hit_rate"),
    } 