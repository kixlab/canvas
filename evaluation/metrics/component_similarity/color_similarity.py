from typing import List, Dict, Tuple, Optional
import numpy as np

np.random.seed(42)


def extract_rgb_from_fills(fills: List[Dict]) -> Optional[Tuple[int, int, int]]:
    """Extract RGB values from the first SOLID color in Figma node's fills property."""
    if not fills:
        return None

    for fill in fills:
        if fill.get("type") == "SOLID" and fill.get("visible", True):
            color = fill.get("color")
            if color and all(k in color for k in ["r", "g", "b"]):
                return (
                    int(color["r"] * 255),
                    int(color["g"] * 255),
                    int(color["b"] * 255),
                )
    return None


def color_distance_to_similarity(
    rgb1: Tuple[int, int, int], rgb2: Tuple[int, int, int]
) -> float:
    """Convert Euclidean distance between two RGB colors to similarity score (0-1 range)."""
    dist = np.linalg.norm(np.array(rgb1) - np.array(rgb2))
    max_dist = np.sqrt(3 * (255**2))
    similarity = 1 - (dist / max_dist)
    return similarity


def compute_color_similarity(
    gt_boxes: List[Dict],
    gen_boxes: List[Dict],
    matches: List[Tuple[int, int]],
) -> Tuple[float, List[float]]:
    """Compute average color similarity for matched block pairs."""
    scores = []

    for i, j in matches:
        gt_color = extract_rgb_from_fills(gt_boxes[i].get("fills", []))
        gen_color = extract_rgb_from_fills(gen_boxes[j].get("fills", []))

        if gt_color and gen_color:
            similarity = color_distance_to_similarity(gt_color, gen_color)
            scores.append(similarity)

    overall_score = float(np.mean(scores)) if scores else 0.0
    return overall_score, scores
