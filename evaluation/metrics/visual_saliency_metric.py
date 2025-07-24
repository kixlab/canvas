from typing import Dict, Optional, Any
from pathlib import Path

from evaluation.metrics import register_metric
from evaluation.visual_saliency.core import (
    predict_saliency_map,
    save_saliency_outputs,
)

# ---------------------------------------------------------------------------
# Saliency-map similarity helpers (moved from heatmap_metrics)
# ---------------------------------------------------------------------------
import numpy as np

__all__ = [
    "cc",
    "similarity",
    "kl_divergence",
]

_EPS: float = 1e-8


def _normalize_sum(arr: np.ndarray) -> np.ndarray:
    """Normalise *arr* so it sums to 1. Returns the original array if the sum is 0."""
    arr = arr.astype(np.float32)
    total = float(arr.sum())
    return arr / total if total > 0 else arr


def _normalize_range(arr: np.ndarray) -> np.ndarray:
    """Min-max scale *arr* to the [0, 1] range."""
    arr = arr.astype(np.float32)
    arr_min = float(arr.min())
    arr_max = float(arr.max())
    return (arr - arr_min) / (arr_max - arr_min) if arr_max - arr_min > _EPS else np.zeros_like(arr)


def cc(map1: np.ndarray, map2: np.ndarray) -> float:
    """Correlation Coefficient (CC) between two saliency maps."""
    m1 = _normalize_range(map1)
    m2 = _normalize_range(map2)
    m1 = (m1 - m1.mean()) / (m1.std() + _EPS)
    m2 = (m2 - m2.mean()) / (m2.std() + _EPS)
    return float(np.mean(m1 * m2))


def similarity(map1: np.ndarray, map2: np.ndarray) -> float:
    """Histogram-intersection similarity (SIM) between two saliency maps."""
    p = _normalize_sum(map1)
    q = _normalize_sum(map2)
    return float(np.sum(np.minimum(p, q)))


def kl_divergence(map1: np.ndarray, map2: np.ndarray) -> float:
    """Kullback-Leibler divergence D(P‖Q) between two saliency maps."""
    p = _normalize_sum(map1) + _EPS
    q = _normalize_sum(map2) + _EPS
    return float(np.sum(p * np.log(p / q)))


# ---------------------------------------------------------------------------
# Metric registration
# ---------------------------------------------------------------------------


@register_metric("visual_saliency")
def _visual_saliency_metric(
    gt_img: Optional[str] = None,
    gen_img: Optional[str] = None,
    gt_json: Optional[str] = None,
    gen_json: Optional[str] = None,
    *,
    out_dir: Optional[str] = None,
    case_id: Optional[str] = None,
    snapshot_num: Optional[int] = None,
) -> Dict[str, Optional[float]]:
    """Compute saliency similarity metrics (CC, SIM, KL) for a GT/GEN image pair.

    If out_dir is provided, the function also saves saliency maps, overlay images,
    and a comparison figure via save_saliency_outputs.
    """
    # Ensure we have valid image paths
    if gt_img is None or gen_img is None:
        return {
            "visual_saliency_cc": None,
            "visual_saliency_sim": None,
            "visual_saliency_kl": None,
        }

    try:
        gt_sal = predict_saliency_map(gt_img)
        gen_sal = predict_saliency_map(gen_img)
    except Exception as exc:
        print(f"[visual_saliency] Prediction failed: {exc}")
        return {
            "visual_saliency_cc": None,
            "visual_saliency_sim": None,
            "visual_saliency_kl": None,
        }

    metric_dict: Dict[str, float] = {
        "visual_saliency_cc": round(cc(gt_sal, gen_sal), 4),
        "visual_saliency_sim": round(similarity(gt_sal, gen_sal), 4),
        "visual_saliency_kl": round(kl_divergence(gt_sal, gen_sal), 4),
    }

    if out_dir is not None:
        effective_case_id = f"{case_id}_snapshot_{snapshot_num}" if case_id and snapshot_num is not None else case_id
        try:
            save_saliency_outputs(gt_img, gen_img, gt_sal, gen_sal, Path(out_dir), effective_case_id)
        except Exception as exc:
            print(f"[visual_saliency] Failed to save visualisation: {exc}")

    return metric_dict 