import numpy as np
from typing import Tuple, Optional, Dict
from evaluation.visual_saliency.core import predict_saliency_map

# --- Globals for Caching ---
_saliency_cache: Dict[str, Optional[np.ndarray]] = {}

def _get_or_compute_saliency(image_path: str) -> Optional[np.ndarray]:
    """Computes saliency map for an image, with in-memory caching."""
    if image_path not in _saliency_cache:
        try:
            _saliency_cache[image_path] = predict_saliency_map(image_path)
        except Exception:
            _saliency_cache[image_path] = None
    return _saliency_cache[image_path]

def predict_saliency_map_pair(gt_img: str, gen_img: str) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    """Predicts saliency maps for a pair of images, utilizing caching."""
    gt_sal = _get_or_compute_saliency(gt_img)
    gen_sal = _get_or_compute_saliency(gen_img)
    return gt_sal, gen_sal

# --- Saliency-map similarity helpers ---
_EPS: float = 1e-8

def _normalize_sum(arr: np.ndarray) -> np.ndarray:
    """Normalise *arr* so it sums to 1."""
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
    """Correlation Coefficient (CC)."""
    m1 = _normalize_range(map1)
    m2 = _normalize_range(map2)
    m1 = (m1 - m1.mean()) / (m1.std() + _EPS)
    m2 = (m2 - m2.mean()) / (m2.std() + _EPS)
    return float(np.mean(m1 * m2))

def similarity(map1: np.ndarray, map2: np.ndarray) -> float:
    """Histogram-intersection similarity (SIM)."""
    p = _normalize_sum(map1)
    q = _normalize_sum(map2)
    return float(np.sum(np.minimum(p, q)))

def kl_divergence(map1: np.ndarray, map2: np.ndarray) -> float:
    """Kullback-Leibler divergence D(P‖Q)."""
    p = _normalize_sum(map1) + _EPS
    q = _normalize_sum(map2) + _EPS
    return float(np.sum(p * np.log(p / q))) 