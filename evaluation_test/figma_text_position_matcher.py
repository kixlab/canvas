from typing import List, Dict, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer, util
from scipy.optimize import linear_sum_assignment


def _compute_position_similarity(box1: Dict, box2: Dict) -> float:
    """Compute position similarity based on center-point distance between two blocks."""
    center_x1 = box1["x"] + box1["width"] / 2
    center_y1 = box1["y"] + box1["height"] / 2
    center_x2 = box2["x"] + box2["width"] / 2
    center_y2 = box2["y"] + box2["height"] / 2

    # Use L-infinity distance and convert to similarity
    dist = max(abs(center_x1 - center_x2), abs(center_y1 - center_y2))
    return 1.0 - dist


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

    # 1. Compute text similarity
    model = SentenceTransformer("all-MiniLM-L6-v2")
    gt_texts = [box.get("characters", "").strip() for box in gt_text_boxes]
    gen_texts = [box.get("characters", "").strip() for box in gen_text_boxes]
    
    gt_embeddings = model.encode(gt_texts, convert_to_tensor=True)
    gen_embeddings = model.encode(gen_texts, convert_to_tensor=True)
    
    text_sim_matrix = util.cos_sim(gt_embeddings, gen_embeddings).cpu().numpy()

    # 2. Compute position similarity
    pos_sim_matrix = np.zeros((num_gt, num_gen))
    for i in range(num_gt):
        for j in range(num_gen):
            pos_sim_matrix[i, j] = _compute_position_similarity(gt_text_boxes[i], gen_text_boxes[j])

    # 3. Create combined cost matrix
    # cost = 1 - similarity
    cost_matrix = alpha * (1 - text_sim_matrix) + beta * (1 - pos_sim_matrix)

    # 4. Run Hungarian matching
    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    
    matches = list(zip(row_ind, col_ind))

    return matches, text_sim_matrix, pos_sim_matrix 