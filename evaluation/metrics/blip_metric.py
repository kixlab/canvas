from evaluation.metrics import register_metric
from evaluation.semantic.blip_score import compute_blip_score


@register_metric("semantic_match")
def _semantic_match(gt_img: str, gen_img: str, gt_json: str = None, gen_json: str = None):
    res = compute_blip_score(gt_img, gen_img)
    return {
        "semantic_match": round(res.get("blip_score", 0.0), 4),
        "gt_caption": res.get("gt_caption"),
        "gen_caption": res.get("gen_caption"),
        } 