from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import compute_layout_iou

@register_metric("layout_iou")
def _layout_iou(
    gt_img: str = None,
    gen_img: str = None,
    gt_json: str = None,
    gen_json: str = None,
    out_dir: str = None,
    case_id: str = None,
):
    res = compute_layout_iou(
        gt_json, gen_json,
        out_dir=out_dir, case_id=case_id,
        gt_img_path=gt_img, gen_img_path=gen_img
    )

    precision = res.get("precision", 0.0)
    recall = res.get("recall", 0.0)

    if precision + recall > 0:
        f1 = 2 * precision * recall / (precision + recall)
    else:
        f1 = 0.0

    element_count_ratio = min(1.0, res.get("num_gen", 0) / res.get("num_gt", 1))

    return {
        "layout_overlap": round(f1, 4),  # 
        "element_count_ratio": round(element_count_ratio, 4),
        "num_matched": res.get("num_matched", 0),
        "num_gt": res.get("num_gt", 0),
        "num_gen": res.get("num_gen", 0),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
    }