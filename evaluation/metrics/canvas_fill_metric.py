from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import load_boxes_from_json


@register_metric("canvas_fill_ratio")
def _canvas_fill_ratio(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    """Compute Canvas Fill Ratio of generated design relative to GT.

    Approximates the canvas as the bounding rectangle covering all GT boxes.
    Ratio = min(sum(gen_box_areas) / canvas_area, 1.0)
    """
    if gt_json is None or gen_json is None:
        return {"canvas_fill_ratio": None}

    gt_boxes, _ = load_boxes_from_json(gt_json)
    gen_boxes, _ = load_boxes_from_json(gen_json)

    if not gt_boxes:
        return {"canvas_fill_ratio": 0.0}

    # canvas area: bounding rect of GT boxes (x_min,y_min,x_max,y_max)
    x_min = min(b["x"] for b in gt_boxes)
    y_min = min(b["y"] for b in gt_boxes)
    x_max = max(b["x"] + b["width"] for b in gt_boxes)
    y_max = max(b["y"] + b["height"] for b in gt_boxes)
    canvas_area = max((x_max - x_min) * (y_max - y_min), 1.0)

    gen_area = sum(b["width"] * b["height"] for b in gen_boxes)

    ratio = min(gen_area / canvas_area, 1.0)
    return {"canvas_fill_ratio": round(ratio, 4)} 