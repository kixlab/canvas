import json
import numpy as np
from typing import List, Dict, Tuple
from scipy.optimize import linear_sum_assignment

def extract_boxes_from_node(node: Dict, results: List[Dict], depth=0) -> None:
    if "absoluteBoundingBox" in node and node.get("type") != "VECTOR":
        box = node["absoluteBoundingBox"]
        results.append({
            "id": node.get("id"),
            "name": node.get("name", "unknown"),
            "x": box["x"],
            "y": box["y"],
            "width": box["width"],
            "height": box["height"],
            "depth": depth
        })
    for child in node.get("children", []):
        extract_boxes_from_node(child, results, depth+1)

def load_boxes_from_json(json_path: str) -> List[Dict]:
    with open(json_path, "r") as f:
        data = json.load(f)
    # Detect page-structured (generation) vs node-structured (gt)
    if "document" in data:
        root = data["document"]
    elif "nodes" in data:
        root = list(data["nodes"].values())[0]["document"]
    else:
        raise ValueError("Unsupported JSON structure.")
    results = []
    extract_boxes_from_node(root, results)
    return results

def compute_iou(boxA: Dict, boxB: Dict) -> float:
    xA = max(boxA["x"], boxB["x"])
    yA = max(boxA["y"], boxB["y"])
    xB = min(boxA["x"] + boxA["width"], boxB["x"] + boxB["width"])
    yB = min(boxA["y"] + boxA["height"], boxB["y"] + boxB["height"])
    
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = boxA["width"] * boxA["height"]
    boxBArea = boxB["width"] * boxB["height"]
    unionArea = boxAArea + boxBArea - interArea
    return interArea / unionArea if unionArea > 0 else 0.0

def compute_layout_iou(gt_json: str, gen_json: str) -> Dict[str, float]:
    gt_boxes = load_boxes_from_json(gt_json)
    gen_boxes = load_boxes_from_json(gen_json)

    cost_matrix = np.zeros((len(gt_boxes), len(gen_boxes)))
    for i, gt in enumerate(gt_boxes):
        for j, gen in enumerate(gen_boxes):
            cost_matrix[i, j] = 1 - compute_iou(gt, gen)  # IoU distance

    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    matched_ious = [1 - cost_matrix[i, j] for i, j in zip(row_ind, col_ind)]
    mean_iou = np.mean(matched_ious) if matched_ious else 0.0

    return {
        "num_gt": len(gt_boxes),
        "num_gen": len(gen_boxes),
        "num_matched": len(matched_ious),
        "mean_iou": round(mean_iou, 4)
    }
