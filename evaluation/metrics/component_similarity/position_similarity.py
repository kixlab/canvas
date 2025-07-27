from typing import List, Dict, Tuple
import numpy as np

def compute_single_position_similarity(box1: Dict, box2: Dict) -> float:
    """Compute position similarity based on center-point distance between two blocks."""
    center_x1 = box1["x"] + box1["width"] / 2
    center_y1 = box1["y"] + box1["height"] / 2
    center_x2 = box2["x"] + box2["width"] / 2
    center_y2 = box2["y"] + box2["height"] / 2
    
    # Use L-infinity distance and convert to similarity
    dist = max(abs(center_x1 - center_x2), abs(center_y1 - center_y2))
    return 1.0 - dist

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