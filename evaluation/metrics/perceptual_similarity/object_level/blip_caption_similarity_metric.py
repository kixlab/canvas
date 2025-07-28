from evaluation.metrics import register_metric
from evaluation.semantic.blip_score import get_precomputed_blip_score
from typing import Optional


@register_metric("blip_caption_similarity")
def _semantic_match(case_id: str, out_dir: str, snapshot_num: Optional[int] = None, **kwargs):
    res = get_precomputed_blip_score(case_id, out_dir, snapshot_num)

    if "not found" in res.get("gt_caption", ""):
        # print(f"[Warning] Precomputed BLIP score not found for case: {case_id}")
        return {}
        
    return {
        "blip_caption_similarity": round(res.get("blip_score", 0.0), 4),
        "ground_truth_caption": res.get("gt_caption"),
        "generated_caption": res.get("gen_caption"),
    } 