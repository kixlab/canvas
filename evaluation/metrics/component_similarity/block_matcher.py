import json
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

np.random.seed(42)


def load_and_normalize_boxes(json_path: Path) -> Tuple[List[Dict], Dict]:
    """
    Load all nodes from Figma JSON file and normalize coordinates relative to root frame.
    Extract BBox, type, text, color fills and other necessary attributes.
    """
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as e:
        raise

    if "document" in data:
        root = data["document"]
    elif "nodes" in data:
        root = list(data["nodes"].values())[0]["document"]
    else:
        raise ValueError(f"Unsupported Figma JSON structure in {json_path}.")

    def find_root_frame(node: Dict) -> Dict:
        if node.get("type") == "CANVAS" and node.get("children"):
            # Usually the first child of canvas is the main frame
            for child in node["children"]:
                if child.get("type") == "FRAME":
                    return child
        if "absoluteBoundingBox" in node and node.get("type") == "FRAME":
            return node
        for child in node.get("children", []):
            frame = find_root_frame(child)
            if frame:
                return frame
        return None

    root_frame_node = find_root_frame(root)
    if not root_frame_node or "absoluteBoundingBox" not in root_frame_node:
        # Use canvas itself as root frame
        if "absoluteBoundingBox" in root:
             root_frame_node = root
        else:
             raise ValueError(f"Could not find a root frame with absoluteBoundingBox in {json_path}.")

    frame_bbox = root_frame_node["absoluteBoundingBox"]

    all_nodes: List[Dict] = []
    def extract_nodes_recursive(node: Dict):
        if node.get("visible", True) is False:
            return

        if "absoluteBoundingBox" in node:
            all_nodes.append(node)

        for child in node.get("children", []):
            extract_nodes_recursive(child)

    extract_nodes_recursive(root_frame_node)

    extracted_boxes = []
    for node in all_nodes:
        if "absoluteBoundingBox" not in node:
            continue
        box = node["absoluteBoundingBox"]
        if box is None or not isinstance(box, dict):
            continue
        if not all(k in box for k in ["x", "y", "width", "height"]):
            continue

        # Normalize coordinates
        norm_box = {
            "x": (box["x"] - frame_bbox["x"]) / frame_bbox["width"] if frame_bbox["width"] > 0 else 0,
            "y": (box["y"] - frame_bbox["y"]) / frame_bbox["height"] if frame_bbox["height"] > 0 else 0,
            "width": box["width"] / frame_bbox["width"] if frame_bbox["width"] > 0 else 0,
            "height": box["height"] / frame_bbox["height"] if frame_bbox["height"] > 0 else 0,
        }

        extracted_boxes.append({
            "id": node.get("id"),
            "name": node.get("name", ""),
            "type": node.get("type", ""),
            "characters": node.get("characters"),
            "fills": node.get("fills", []),
            **norm_box
        })

    return extracted_boxes, frame_bbox


def compute_iou(box1: Dict, box2: Dict) -> float:
    """Compute IoU (Intersection over Union) between two bounding boxes."""
    xA = max(box1["x"], box2["x"])
    yA = max(box1["y"], box2["y"])
    xB = min(box1["x"] + box1["width"], box2["x"] + box2["width"])
    yB = min(box1["y"] + box1["height"], box2["y"] + box2["height"])

    inter_area = max(0, xB - xA) * max(0, yB - yA)
    box1_area = box1["width"] * box1["height"]
    box2_area = box2["width"] * box2["height"]

    union_area = box1_area + box2_area - inter_area
    iou = inter_area / union_area if union_area > 0 else 0.0
    return iou


def hungarian_bbox_matching(
    gt_boxes: List[Dict], gen_boxes: List[Dict], iou_threshold: float = 0.5
) -> Tuple[List[Tuple[int, int]], np.ndarray]:
    """Match boxes using Hungarian algorithm based on IoU cost matrix."""
    num_gt = len(gt_boxes)
    num_gen = len(gen_boxes)
    
    if num_gt == 0 or num_gen == 0:
        return [], np.array([])

    cost_matrix = np.full((num_gt, num_gen), 1.0)
    iou_matrix = np.zeros((num_gt, num_gen))

    for i in range(num_gt):
        for j in range(num_gen):
            iou = compute_iou(gt_boxes[i], gen_boxes[j])
            iou_matrix[i, j] = iou
            cost_matrix[i, j] = 1 - iou

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    matches = []
    for r, c in zip(row_ind, col_ind):
        if iou_matrix[r, c] >= iou_threshold:
            matches.append((r, c))

    return matches, iou_matrix
