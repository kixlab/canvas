from evaluation.metrics import register_metric
from evaluation.alignment.grid_alignment import compute_alignment_score


@register_metric("alignment")
def _alignment(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    res = compute_alignment_score(gt_json, gen_json)
    return {
        "alignment_match": round(res.get("gen_score", 0.0), 4),
        "alignment_diff": round(res.get("difference", 0.0), 4) if res.get("difference") is not None else None,
    } 