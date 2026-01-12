from typing import List, Dict, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

np.random.seed(42)


def _compute_position_similarity(box1: Dict, box2: Dict) -> float:
    """Compute position similarity based on center-point distance between two blocks."""
    center_x1 = box1["x"] + box1["width"] / 2
    center_y1 = box1["y"] + box1["height"] / 2
    center_x2 = box2["x"] + box2["width"] / 2
    center_y2 = box2["y"] + box2["height"] / 2

    dist = max(abs(center_x1 - center_x2), abs(center_y1 - center_y2))
    return 1.0 - dist


def _simple_text_similarity(text1: str, text2: str) -> float:
    """Simple text similarity using exact match and length ratio."""
    if not text1 or not text2:
        return 0.0

    if text1.lower() == text2.lower():
        return 1.0

    len_ratio = min(len(text1), len(text2)) / max(len(text1), len(text2))

    chars1 = set(text1.lower())
    chars2 = set(text2.lower())
    if not chars1 or not chars2:
        return len_ratio

    overlap = len(chars1.intersection(chars2))
    union = len(chars1.union(chars2))
    jaccard = overlap / union if union > 0 else 0.0

    return (len_ratio + jaccard) / 2


def hungarian_text_position_matching(
    gt_text_boxes: List[Dict],
    gen_text_boxes: List[Dict],
    alpha: float = 0.5,
    beta: float = 0.5,
) -> Tuple[List[Tuple[int, int]], np.ndarray, np.ndarray]:
    """
    Match text blocks by combining text and position similarity.
    """
    num_gt = len(gt_text_boxes)
    num_gen = len(gen_text_boxes)

    if num_gt == 0 or num_gen == 0:
        return [], np.array([]), np.array([])

    gt_texts = [box.get("characters", "").strip() for box in gt_text_boxes]
    gen_texts = [box.get("characters", "").strip() for box in gen_text_boxes]

    text_sim_matrix = np.zeros((num_gt, num_gen))
    for i in range(num_gt):
        for j in range(num_gen):
            text_sim_matrix[i, j] = _simple_text_similarity(gt_texts[i], gen_texts[j])

    pos_sim_matrix = np.zeros((num_gt, num_gen))
    for i in range(num_gt):
        for j in range(num_gen):
            pos_sim_matrix[i, j] = _compute_position_similarity(
                gt_text_boxes[i], gen_text_boxes[j]
            )

    cost_matrix = alpha * (1 - text_sim_matrix) + beta * (1 - pos_sim_matrix)

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    matches = list(zip(row_ind, col_ind))

    return matches, text_sim_matrix, pos_sim_matrix
