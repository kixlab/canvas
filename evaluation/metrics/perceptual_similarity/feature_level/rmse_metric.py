from evaluation.metrics import register_metric
from PIL import Image
import numpy as np
import os

@register_metric("rmse")
def _rmse(gt_img: str, gen_img: str, **kwargs):
    """
    Computes the Root Mean Squared Error (RMSE) between two images.
    This is equivalent to the L2-norm of the pixel differences.
    If image sizes differ, they are resized to the smaller common resolution.
    """
    try:
        if not os.path.exists(gt_img) or not os.path.exists(gen_img):
            return {"rmse": None}

        # Load images as RGB
        gt_pil = Image.open(gt_img).convert("RGB")
        gen_pil = Image.open(gen_img).convert("RGB")

        # Align image sizes if they differ
        if gt_pil.size != gen_pil.size:
            min_size = (min(gt_pil.width, gen_pil.width), min(gt_pil.height, gen_pil.height))
            gt_pil = gt_pil.resize(min_size)
            gen_pil = gen_pil.resize(min_size)

        # Convert to float32 numpy arrays in range [0, 1]
        gt_arr = np.asarray(gt_pil).astype(np.float32) / 255.0
        gen_arr = np.asarray(gen_pil).astype(np.float32) / 255.0

        # Compute RMSE (L2-norm)
        diff = gt_arr - gen_arr
        rmse = float(np.sqrt(np.mean(np.square(diff))))

        return {"rmse": round(rmse, 4)}

    except Exception:
        return {"rmse": None} 