from evaluation.metrics import register_metric
from evaluation.alignment.group_alignment import compute_alignment_score

@register_metric("block_composition_f1")
def _alignment_f1(gt_json: str, gen_json: str, **kwargs):
    """
    Computes the F1 score for block-level composition alignment.
    This metric evaluates how well groups of elements are aligned (e.g., left, center).
    """
    res = compute_alignment_score(gt_json, gen_json)
    
    return {"block_composition_f1": res.get("f1")} 