from evaluation.metrics import register_metric
from evaluation.alignment.group_alignment import compute_alignment_score


@register_metric("alignment")
def _alignment(
    gt_img: str = None,
    gen_img: str = None,
    gt_json: str = None,
    gen_json: str = None,
    out_dir: str = None,
    case_id: str = None,
):
    res = compute_alignment_score(
        gt_json, gen_json,
        out_dir=out_dir, case_id=case_id,
        gt_img_path=gt_img, gen_img_path=gen_img
    )
    return {
        "alignment_f1": round(res.get("f1", 0.0), 4),
        "precision": round(res.get("precision", 0.0), 4),
        "recall": round(res.get("recall", 0.0), 4),
    } 