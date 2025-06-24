from evaluation.metrics import register_metric
from evaluation.structure.tree_edit import compute_tree_similarity


@register_metric("hierarchy_type_sim")
def _hierarchy_type_sim(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    res = compute_tree_similarity(gt_json, gen_json, by_type_only=True)
    return {"hierarchy_type_sim": round(res.get("jaccard", 0.0), 4)} 