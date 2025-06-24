from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import load_boxes_from_json


@register_metric("element_count_ratio")
def _element_count_ratio(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    if gt_json is None or gen_json is None:
        return {"element_count_ratio": None}

    gt_boxes = load_boxes_from_json(gt_json)
    gen_boxes = load_boxes_from_json(gen_json)

    if not gt_boxes:
        return {"element_count_ratio": 0.0}

    ratio = min(len(gen_boxes) / len(gt_boxes), 1.0) if len(gt_boxes) else 0.0
    return {"element_count_ratio": round(ratio, 4)} 