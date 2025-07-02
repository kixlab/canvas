from shapely.geometry import box
from shapely.ops import unary_union
from evaluation.metrics import register_metric
from evaluation.layout.hungarian_iou import load_boxes_from_json

@register_metric("canvas_fill_ratio")
def _canvas_fill_ratio(gt_img: str = None, gen_img: str = None, gt_json: str = None, gen_json: str = None):
    """
    Measures the proportion of the canvas (root frame) that is occupied by foreground elements.
    Only uses the GEN JSON. Specifically, computes the union of all visible non-root bounding boxes 
    and divides it by the canvas area. Elements that fully match the canvas size are excluded.
    """
    if gen_json is None:
        print("[canvas_fill_ratio] gen_json is None")
        return {"canvas_fill_ratio": None}

    try:
        gen_boxes, _ = load_boxes_from_json(gen_json)
    except Exception as e:
        # print(f"[canvas_fill_ratio] Failed to load boxes from {gen_json}: {e}")
        return {"canvas_fill_ratio": None}

    if not gen_boxes:
        # print(f"[canvas_fill_ratio] No boxes found in {gen_json}")
        return {"canvas_fill_ratio": 0.0}

    # Try to find root frame with depth == 1, or fallback to largest box
    root_candidates = [b for b in gen_boxes if b.get("depth") == 1]
    if root_candidates:
        root_frame = root_candidates[0]
    else:
        # fallback to largest box if depth is missing
        root_frame = max(gen_boxes, key=lambda b: b["width"] * b["height"])
        # print("[canvas_fill_ratio] No depth==1 box, using largest box as root frame")

    canvas_width = root_frame.get("width", 0)
    canvas_height = root_frame.get("height", 0)
    if canvas_width == 0 or canvas_height == 0:
        # print("[canvas_fill_ratio] Invalid canvas size")
        return {"canvas_fill_ratio": None}

    canvas_area = max(canvas_width * canvas_height, 1.0)

    # Filter: foreground elements only
    filtered_boxes = []
    for b in gen_boxes:
        if b == root_frame:
            continue
        if abs(b["width"] - canvas_width) < 1e-2 and abs(b["height"] - canvas_height) < 1e-2:
            continue
        filtered_boxes.append(b)

    if not filtered_boxes:
        return {"canvas_fill_ratio": 0.0}

    polygons = [box(b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]) for b in filtered_boxes]
    union = unary_union(polygons)
    union_area = union.area if union else 0.0

    ratio = min(union_area / canvas_area, 1.0)
    return {"canvas_fill_ratio": round(ratio, 4)}
