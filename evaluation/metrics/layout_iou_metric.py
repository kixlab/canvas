from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import compute_layout_iou


@register_metric("layout_iou")
def _layout_iou(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    res = compute_layout_iou(gt_json, gen_json)
    return {
        "layout_overlap": round(res.get("mean_iou", 0.0), 4),
        "num_matched": res.get("num_matched"),
    } 