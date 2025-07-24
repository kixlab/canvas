from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import compute_layout_iou

@register_metric("element_position_iou")
def _layout_iou(
    gt_json: str = None,
    gen_json: str = None,
    **kwargs,
):
    res = compute_layout_iou(gt_json, gen_json)

    mean_iou = res.get("mean_iou", 0.0)

    return {
        "element_position_iou": round(mean_iou, 4),
    }