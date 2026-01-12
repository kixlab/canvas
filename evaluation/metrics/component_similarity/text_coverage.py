import re
from typing import List, Dict, Set
from collections import Counter


def normalize_text(text: str) -> str:
    """Normalize text by lowercasing, removing punctuation, and standardizing whitespace."""
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_text_frequencies(boxes: List[Dict]) -> Counter:
    """Extract normalized text frequencies from node list."""
    text_counter = Counter()
    for box in boxes:
        if box.get("type") == "TEXT" and box.get("characters"):
            normalized = normalize_text(box["characters"])
            if normalized:
                text_counter[normalized] += 1
    return text_counter


def compute_text_coverage_metrics(
    gt_boxes: List[Dict], gen_boxes: List[Dict]
) -> Dict[str, float]:
    """
    Compute text coverage metrics (Precision, Recall, F1) by comparing GT and generated text sets.
    Uses frequency-based calculation for accurate assessment.
    """
    gt_text_freq = _extract_text_frequencies(gt_boxes)
    gen_text_freq = _extract_text_frequencies(gen_boxes)

    if not gt_text_freq:
        return {
            "precision": 1.0 if not gen_text_freq else 0.0,
            "recall": 1.0,
            "f1_score": 1.0 if not gen_text_freq else 0.0,
        }

    correctly_generated_count = 0
    total_gt_count = sum(gt_text_freq.values())
    total_gen_count = sum(gen_text_freq.values())

    for text, gt_count in gt_text_freq.items():
        gen_count = gen_text_freq.get(text, 0)
        correctly_generated_count += min(gt_count, gen_count)

    precision = (
        correctly_generated_count / total_gen_count if total_gen_count > 0 else 0.0
    )
    recall = correctly_generated_count / total_gt_count if total_gt_count > 0 else 0.0

    f1_score = (
        (2 * precision * recall) / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "precision": precision,
        "recall": recall,
        "f1_score": f1_score,
    }
