from pathlib import Path
from typing import Dict
import numpy as np

np.random.seed(42)

from evaluation.metrics import register_metric
from .block_matcher import load_and_normalize_boxes, hungarian_bbox_matching
from .text_position_matcher import hungarian_text_position_matching
from .color_similarity import compute_color_similarity
from .position_similarity import compute_position_similarity
from .text_coverage import compute_text_coverage_metrics


@register_metric("component_similarity")
def compute_component_similarity_metrics(
    gt_json: str, gen_json: str, **kwargs
) -> Dict[str, float]:
    """
    Computes a suite of component-level similarity metrics between a GT and a generated design,
    then returns them as a flat dictionary.
    """
    if not gt_json or not gen_json:
        return {}

    gt_path = Path(gt_json)
    gen_path = Path(gen_json)

    if not gt_path.exists() or not gen_path.exists():
        return {
            "block_match_score": 0.0,
            "color_similarity_score": 0.0,
            "position_similarity_score": 0.0,
            "text_coverage_f1_score": 0.0,
            "component_similarity_score": 0.0,
        }

    gt_boxes, _ = load_and_normalize_boxes(gt_path)
    gen_boxes, _ = load_and_normalize_boxes(gen_path)
    gt_text_indices = [
        i
        for i, box in enumerate(gt_boxes)
        if box.get("type") == "TEXT" and box.get("characters", "").strip()
    ]
    gt_other_indices = [i for i, box in enumerate(gt_boxes) if i not in gt_text_indices]
    gen_text_indices = [
        i
        for i, box in enumerate(gen_boxes)
        if box.get("type") == "TEXT" and box.get("characters", "").strip()
    ]
    gen_other_indices = [
        i for i, box in enumerate(gen_boxes) if i not in gen_text_indices
    ]

    gt_text_boxes = [gt_boxes[i] for i in gt_text_indices]
    gt_other_boxes = [gt_boxes[i] for i in gt_other_indices]
    gen_text_boxes = [gen_boxes[i] for i in gen_text_indices]
    gen_other_boxes = [gen_boxes[i] for i in gen_other_indices]

    all_matches = []
    if gt_text_boxes and gen_text_boxes:
        text_matches_local, _, _ = hungarian_text_position_matching(
            gt_text_boxes, gen_text_boxes
        )
        text_matches = [
            (gt_text_indices[i], gen_text_indices[j]) for i, j in text_matches_local
        ]
        all_matches.extend(text_matches)

    if gt_other_boxes and gen_other_boxes:
        other_matches_local, _ = hungarian_bbox_matching(
            gt_other_boxes, gen_other_boxes
        )
        other_matches = [
            (gt_other_indices[i], gen_other_indices[j]) for i, j in other_matches_local
        ]
        all_matches.extend(other_matches)

    block_match_score = len(all_matches) / len(gt_boxes) if len(gt_boxes) > 0 else 0.0

    color_score, _ = compute_color_similarity(gt_boxes, gen_boxes, all_matches)
    position_score, _ = compute_position_similarity(gt_boxes, gen_boxes, all_matches)
    text_coverage = compute_text_coverage_metrics(gt_boxes, gen_boxes)
    text_f1_score = text_coverage.get("f1_score", 0.0)
    component_similarity_score = (
        block_match_score + position_score + color_score + text_f1_score
    ) / 4.0

    return {
        "block_match_score": round(block_match_score, 4),
        "color_similarity_score": round(color_score, 4),
        "position_similarity_score": round(position_score, 4),
        "text_coverage_f1_score": round(text_f1_score, 4),
        "component_similarity_score": round(component_similarity_score, 4),
    }
