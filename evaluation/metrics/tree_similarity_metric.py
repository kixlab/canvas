from evaluation.metrics import register_metric
from evaluation.structure.tree_edit import compute_tree_similarity


@register_metric("tree_similarity")
def _tree_similarity(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    res = compute_tree_similarity(gt_json, gen_json)
    return {
        "hierarchy_sim": round(res.get("jaccard", 0.0), 4),
    } 