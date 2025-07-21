from __future__ import annotations

from PIL import Image
import numpy as np
import os
from typing import Tuple, Optional, Dict


def compute_l2_norm(
    gt_path: str,
    gen_path: str,
    resize_shape: Optional[Tuple[int, int]] = None,
) -> Dict[str, float]:
    """Compute pixel-wise L2 norm (root mean squared error) between GT and generated images.

    Args:
        gt_path: File path to ground-truth image (PNG/JPG).
        gen_path: File path to generated image.
        resize_shape: Optional (width, height) tuple to resize both images before comparison.

    Returns:
        Dict with single key ``l2_norm`` containing RMSE rounded to 4 decimals.
    """
    if not os.path.exists(gt_path) or not os.path.exists(gen_path):
        missing = gt_path if not os.path.exists(gt_path) else gen_path
        raise FileNotFoundError(f"Missing file: {missing}")

    # Load images as RGB
    gt_img = Image.open(gt_path).convert("RGB")
    gen_img = Image.open(gen_path).convert("RGB")

    # Align image sizes
    if resize_shape:
        gt_img = gt_img.resize(resize_shape)
        gen_img = gen_img.resize(resize_shape)
    elif gt_img.size != gen_img.size:
        # Fallback: resize both to smaller common resolution to avoid distortion bias
        min_size = (min(gt_img.width, gen_img.width), min(gt_img.height, gen_img.height))
        gt_img = gt_img.resize(min_size)
        gen_img = gen_img.resize(min_size)

    # Convert to float32 numpy arrays in range [0, 1]
    gt_arr = np.asarray(gt_img).astype(np.float32) / 255.0
    gen_arr = np.asarray(gen_img).astype(np.float32) / 255.0

    # Compute RMSE (pixel-wise L2 norm)
    diff = gt_arr - gen_arr
    rmse = float(np.sqrt(np.mean(np.square(diff))))

    return {"l2_norm": round(rmse, 4)} 