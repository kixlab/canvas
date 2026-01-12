from evaluation.metrics import register_metric
from PIL import Image
import numpy as np
import os

np.random.seed(42)


@register_metric("rmse_inverse")
def _rmse_inverse(gt_img: str, gen_img: str, **kwargs):
    """
    Computes the inverse of Root Mean Squared Error (RMSE) between two images.
    The inverse is calculated as 1/(1+RMSE) to convert RMSE into a [0,1] range where:
    - Higher values (closer to 1) indicate better similarity
    - Lower values (closer to 0) indicate worse similarity

    If image sizes differ, they are resized to the smaller common resolution.
    """
    try:
        if not os.path.exists(gt_img) or not os.path.exists(gen_img):
            return {"rmse_inverse": None}

        gt_pil = Image.open(gt_img).convert("RGB")
        gen_pil = Image.open(gen_img).convert("RGB")

        if gt_pil.size != gen_pil.size:
            min_size = (
                min(gt_pil.width, gen_pil.width),
                min(gt_pil.height, gen_pil.height),
            )
            gt_pil = gt_pil.resize(min_size)
            gen_pil = gen_pil.resize(min_size)

        gt_arr = np.asarray(gt_pil).astype(np.float32) / 255.0
        gen_arr = np.asarray(gen_pil).astype(np.float32) / 255.0

        diff = gt_arr - gen_arr
        rmse = float(np.sqrt(np.mean(np.square(diff))))

        rmse_inverse = 1.0 / (1.0 + rmse)

        return {"rmse_inverse": round(rmse_inverse, 4)}

    except Exception:
        return {"rmse_inverse": None}
