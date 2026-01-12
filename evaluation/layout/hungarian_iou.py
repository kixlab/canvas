import json
import numpy as np
import os
import cv2
from typing import List, Dict, Tuple
from scipy.optimize import linear_sum_assignment


# ---------- Helper: Visualization ----------
def draw_boxes_on_image_gt(img_path, boxes, color=(0, 255, 0), label_prefix=""):
    if not os.path.exists(img_path):
        return None
    img = cv2.imread(img_path)
    if img is None:
        return None
    h, w = img.shape[:2]
    for b in boxes:
        x1, y1 = int(b["x"] * w), int(b["y"] * h)
        x2, y2 = int((b["x"] + b["width"]) * w), int((b["y"] + b["height"]) * h)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        name = b.get("name", "")
        typ = b.get("type", "")
        cv2.putText(
            img,
            f"{label_prefix}{name}:{typ}",
            (x1, max(10, y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            color,
            1,
        )
    return img


def draw_boxes_on_image_gen(img_path, boxes, color=(0, 255, 0), label_prefix=""):
    if not os.path.exists(img_path):
        return None
    img = cv2.imread(img_path)
    if img is None:
        return None
    h, w = img.shape[:2]

    for b in boxes:
        if "render_x" in b and "render_width" in b:
            # If render_x exists, use absolute pixel values (for generated boxes)
            x1 = int(b["render_x"])
            y1 = int(b["render_y"])
            x2 = int(b["render_x"] + b["render_width"])
            y2 = int(b["render_y"] + b["render_height"])
        else:
            # Otherwise, treat x/y as normalized (for GT)
            x1 = int(b["x"] * w)
            y1 = int(b["y"] * h)
            x2 = int((b["x"] + b["width"]) * w)
            y2 = int((b["y"] + b["height"]) * h)

        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        name = b.get("name", "")
        typ = b.get("type", "")
        cv2.putText(
            img,
            f"{label_prefix}{name}:{typ}",
            (x1, max(10, y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            color,
            1,
        )

    return img


# ---------- Robust BBox Extraction ----------
def extract_boxes_from_node(node: Dict, results: List[Dict], depth=0):
    visible = node.get("visible", True)
    opacity = node.get("opacity", 1.0)
    if visible and opacity > 0.01 and "absoluteBoundingBox" in node:
        box = node["absoluteBoundingBox"]
        render_box = node.get("absoluteRenderBounds", None)
        result = {
            "id": node.get("id"),
            "name": node.get("name", "unknown"),
            "type": node.get("type", "unknown"),
            "x": box["x"],
            "y": box["y"],
            "width": box["width"],
            "height": box["height"],
            "depth": depth,
        }
        if render_box:
            result.update(
                {
                    "render_x": render_box["x"],
                    "render_y": render_box["y"],
                    "render_width": render_box["width"],
                    "render_height": render_box["height"],
                }
            )
        results.append(result)
    for child in node.get("children", []):
        extract_boxes_from_node(child, results, depth + 1)


def find_root_frame(node: Dict) -> Dict:
    if "absoluteBoundingBox" in node and node.get("type") in ["FRAME", "CANVAS"]:
        return node["absoluteBoundingBox"]
    for child in node.get("children", []):
        frame = find_root_frame(child)
        if frame:
            return frame
    return None


def load_boxes_from_json(json_path: str) -> Tuple[List[Dict], Dict]:
    with open(json_path, "r") as f:
        data = json.load(f)

    if "document" in data:
        root = data["document"]
    elif "nodes" in data:
        root = list(data["nodes"].values())[0]["document"]
    else:
        raise ValueError("Unsupported JSON structure.")

    frame = find_root_frame(root)
    if not frame:
        raise ValueError("No frame with absoluteBoundingBox found in root.")

    results = []
    extract_boxes_from_node(root, results, 0)

    for r in results:
        # Normalize bounding box (design coordinate) by root frame
        r["x"] = (r["x"] - frame["x"]) / frame["width"] if frame["width"] else 0.0
        r["y"] = (r["y"] - frame["y"]) / frame["height"] if frame["height"] else 0.0
        r["width"] = r["width"] / frame["width"] if frame["width"] else 0.0
        r["height"] = r["height"] / frame["height"] if frame["height"] else 0.0

        # DO NOT normalize render_x/y — they are absolute w.r.t. full image
        # So we skip modifying render_x, render_y, etc.

    return results, frame


# ---------- IoU Matching Only ----------
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


def compute_layout_iou(
    gt_json: str,
    gen_json: str,
    out_dir: str = None,
    case_id: str = "caseX",
    gt_img_path=None,
    gen_img_path=None,
) -> Dict[str, float]:
    if out_dir:
        os.makedirs(os.path.join(out_dir, case_id), exist_ok=True)

    gt_boxes, gt_frame = load_boxes_from_json(gt_json)
    gen_boxes, gen_frame = load_boxes_from_json(gen_json)

    n_gt, n_gen = len(gt_boxes), len(gen_boxes)
    cost_matrix = np.ones((n_gt, n_gen))
    iou_matrix = np.zeros((n_gt, n_gen))
    for i, gt in enumerate(gt_boxes):
        for j, gen in enumerate(gen_boxes):
            iou = compute_iou(gt, gen)
            iou_matrix[i, j] = iou
            cost_matrix[i, j] = 1 - iou

    # Hungarian Matching
    if n_gt > 0 and n_gen > 0:
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
    else:
        row_ind, col_ind = [], []

    # Matched IoUs
    matched_ious = []
    matched_pairs = []
    for i, j in zip(row_ind, col_ind):
        iou = iou_matrix[i, j]
        matched_ious.append(iou)
        matched_pairs.append((i, j, iou))

    mean_iou = np.mean(matched_ious) if matched_ious else 0.0

    # Unmatched GT (missed) and Gen (over-generated)
    matched_gt_idx = set(row_ind)
    matched_gen_idx = set(col_ind)
    unmatched_gt = [gt_boxes[i] for i in range(n_gt) if i not in matched_gt_idx]
    unmatched_gen = [gen_boxes[j] for j in range(n_gen) if j not in matched_gen_idx]

    # Precision, Recall
    precision = len(matched_pairs) / n_gen if n_gen else 1.0
    recall = len(matched_pairs) / n_gt if n_gt else 1.0

    # --------- Visualization (Optional) ---------
    if out_dir:
        # Draw GT + Gen with matched/unmatched
        if gt_img_path and os.path.exists(gt_img_path):
            gt_img_boxes = [gt_boxes[i] for i, _, _ in matched_pairs] + unmatched_gt
            img = draw_boxes_on_image_gt(
                gt_img_path, gt_img_boxes, (0, 255, 0), label_prefix="GT_"
            )
            if img is not None:
                cv2.imwrite(os.path.join(out_dir, case_id, f"gt_boxes.jpg"), img)
        if gen_img_path and os.path.exists(gen_img_path):
            gen_img_boxes = [gen_boxes[j] for _, j, _ in matched_pairs] + unmatched_gen
            img = draw_boxes_on_image_gen(
                gen_img_path, gen_img_boxes, (255, 0, 0), label_prefix="GEN_"
            )
            if img is not None:
                cv2.imwrite(os.path.join(out_dir, case_id, f"gen_boxes.jpg"), img)

        # Save JSON for interpretability
        def boxes_to_dicts(boxes):
            return [
                {
                    "name": b.get("name"),
                    "name": b.get("name"),
                    "type": b.get("type"),
                    "x": b["x"],
                    "y": b["y"],
                    "w": b["width"],
                    "h": b["height"],
                    "depth": b["depth"],
                }
                for b in boxes
            ]

        summary = {
            "matched_pairs": [
                {
                    "gt": boxes_to_dicts([gt_boxes[i]])[0],
                    "gen": boxes_to_dicts([gen_boxes[j]])[0],
                    "iou": round(iou, 3),
                }
                for (i, j, iou) in matched_pairs
            ],
            "unmatched_gt": boxes_to_dicts(unmatched_gt),
            "unmatched_gen": boxes_to_dicts(unmatched_gen),
            "mean_iou": round(mean_iou, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "num_gt": n_gt,
            "num_gen": n_gen,
            "num_matched": len(matched_pairs),
        }
        with open(os.path.join(out_dir, case_id, "layout_iou_report.json"), "w") as f:
            json.dump(summary, f, indent=2)

    # ------- Return Metrics -------
    return {
        "num_gt": n_gt,
        "num_gen": n_gen,
        "num_matched": len(matched_pairs),
        "mean_iou": round(mean_iou, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "num_unmatched_gt": len(unmatched_gt),
        "num_unmatched_gen": len(unmatched_gen),
    }
