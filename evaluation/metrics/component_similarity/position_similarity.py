from typing import List, Dict, Tuple
import numpy as np

np.random.seed(42)


def compute_single_position_similarity(box1: Dict, box2: Dict) -> float:
    """
    Compute position similarity based on Euclidean distance between two block centers,
    normalized by the maximum diagonal length of the two boxes.
    
    Formula: SIM_pos = 1 - (||c_i - c_j||_2 / max(diag_i, diag_j))
    where c_i, c_j are center points and diag_i, diag_j are diagonal lengths.
    """
    center_x1 = box1["x"] + box1["width"] / 2
    center_y1 = box1["y"] + box1["height"] / 2
    center_x2 = box2["x"] + box2["width"] / 2
    center_y2 = box2["y"] + box2["height"] / 2

    euclidean_dist = np.sqrt((center_x1 - center_x2) ** 2 + (center_y1 - center_y2) ** 2)
    
    diag1 = np.sqrt(box1["width"] ** 2 + box1["height"] ** 2)
    diag2 = np.sqrt(box2["width"] ** 2 + box2["height"] ** 2)
    max_diag = max(diag1, diag2)
    
    if max_diag > 0:
        normalized_dist = euclidean_dist / max_diag
        return 1.0 - normalized_dist
    else:
        return 1.0


def compute_position_similarity(
    gt_boxes: List[Dict],
    gen_boxes: List[Dict],
    matches: List[Tuple[int, int]],
) -> Tuple[float, List[float]]:
    """Compute average position similarity for matched block pairs."""
    if not matches:
        return 0.0, []

    scores = []
    for i, j in matches:
        score = compute_single_position_similarity(gt_boxes[i], gen_boxes[j])
        scores.append(score)

    overall_score = float(np.mean(scores)) if scores else 0.0
    return overall_score, scores
