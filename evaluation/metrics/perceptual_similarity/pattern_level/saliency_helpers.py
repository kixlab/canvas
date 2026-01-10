import numpy as np
from typing import Tuple, Optional, Dict, List
import cv2
from pathlib import Path

# --- Globals for Caching ---
_saliency_cache: Dict[str, Optional[np.ndarray]] = {}
_saliency_model = None
_model_loaded = False

def _get_or_compute_saliency(image_path: str) -> Optional[np.ndarray]:
    """Computes saliency map for an image, with in-memory caching."""
    global _saliency_model, _model_loaded
    
    if image_path not in _saliency_cache:
        try:
            # Import and load model only once
            if not _model_loaded:
                from evaluation.visual_saliency.core import _load_model
                _saliency_model = _load_model()
                _model_loaded = True
            
            # Use the cached model for prediction
            from evaluation.visual_saliency.core import preprocess_image, _normalize_map
            
            x = preprocess_image(image_path)
            heatmap = _saliency_model.predict(x, verbose=0)[0][0, :, :, 0]  # (H, W)
            heatmap = cv2.resize(heatmap, (320, 240), interpolation=cv2.INTER_LINEAR)
            _saliency_cache[image_path] = _normalize_map(heatmap)
        except Exception as e:
            print(f"[Warning] Failed to compute saliency for {image_path}: {e}")
            _saliency_cache[image_path] = None
    return _saliency_cache[image_path]

def _batch_compute_saliency_maps(image_paths: List[str]) -> List[Optional[np.ndarray]]:
    """Compute saliency maps for multiple images efficiently using batch processing."""
    global _saliency_model, _model_loaded
    
    # Check which images need computation
    uncached_paths = []
    uncached_indices = []
    results = []
    
    for i, img_path in enumerate(image_paths):
        if img_path in _saliency_cache:
            results.append(_saliency_cache[img_path])
        else:
            uncached_paths.append(img_path)
            uncached_indices.append(i)
            results.append(None)  # Placeholder
    
    if not uncached_paths:
        return results
    
    try:
        # Load model if needed
        if not _model_loaded:
            from evaluation.visual_saliency.core import _load_model
            _saliency_model = _load_model()
            _model_loaded = True
        
        # Use batch prediction if available
        try:
            from evaluation.visual_saliency.core import _batch_predict_saliency_maps
            batch_results = _batch_predict_saliency_maps(uncached_paths)
            
            # Update cache and results
            for i, (img_path, saliency_map) in enumerate(zip(uncached_paths, batch_results)):
                _saliency_cache[img_path] = saliency_map
                results[uncached_indices[i]] = saliency_map
                
        except ImportError:
            # Fallback to individual prediction
            for i, img_path in enumerate(uncached_paths):
                saliency_map = _get_or_compute_saliency(img_path)
                results[uncached_indices[i]] = saliency_map
                
    except Exception as e:
        print(f"[Warning] Failed to batch compute saliency maps: {e}")
        # Fallback to individual computation
        for i, img_path in enumerate(uncached_paths):
            try:
                saliency_map = _get_or_compute_saliency(img_path)
                results[uncached_indices[i]] = saliency_map
            except Exception as e2:
                print(f"[Warning] Failed to compute saliency for {img_path}: {e2}")
                results[uncached_indices[i]] = None
    
    return results

def predict_saliency_map_pair(gt_img: str, gen_img: str) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    """Predicts saliency maps for a pair of images, utilizing caching."""
    # Use batch processing for efficiency
    results = _batch_compute_saliency_maps([gt_img, gen_img])
    return results[0], results[1]

def predict_saliency_maps_batch(image_paths: List[str]) -> List[Optional[np.ndarray]]:
    """Predicts saliency maps for multiple images efficiently."""
    return _batch_compute_saliency_maps(image_paths)

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

# --- Cache Management ---
def clear_saliency_cache():
    """Clear the saliency map cache to free memory."""
    global _saliency_cache
    _saliency_cache.clear()
    print("[Info] Saliency cache cleared")

def get_cache_stats():
    """Get statistics about the saliency cache."""
    return {
        "cache_size": len(_saliency_cache),
        "model_loaded": _model_loaded
    } 