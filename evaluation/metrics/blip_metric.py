from evaluation.metrics import register_metric
from evaluation.semantic.blip_score import get_precomputed_blip_score


@register_metric("semantic_match")
def _semantic_match(case_id: str, out_dir: str, **kwargs):
    res = get_precomputed_blip_score(case_id, out_dir)
    if "not found" in res.get("gt_caption", ""):
        print(f"[Warning] Precomputed BLIP score not found for case: {case_id}")
        
    return {
        "semantic_match": round(res.get("blip_score", 0.0), 4),
        "gt_caption": res.get("gt_caption"),
        "gen_caption": res.get("gen_caption"),
    } 