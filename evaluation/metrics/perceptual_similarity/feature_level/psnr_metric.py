from evaluation.metrics import register_metric
from PIL import Image
import numpy as np
import os
from skimage.metrics import peak_signal_noise_ratio

np.random.seed(42)


@register_metric("psnr")
def _psnr(gt_img: str, gen_img: str, **kwargs):
    """
    Computes the Peak Signal-to-Noise Ratio (PSNR) between two images.
    If image sizes differ, they are resized to the smaller common resolution.
    """
    try:
        if not os.path.exists(gt_img) or not os.path.exists(gen_img):
            return {"psnr": None}

        gt_pil = Image.open(gt_img).convert("RGB")
        gen_pil = Image.open(gen_img).convert("RGB")

        if gt_pil.size != gen_pil.size:
            min_size = (
                min(gt_pil.width, gen_pil.width),
                min(gt_pil.height, gen_pil.height),
            )
            gt_pil = gt_pil.resize(min_size)
            gen_pil = gen_pil.resize(min_size)

        gt_arr = np.asarray(gt_pil)
        gen_arr = np.asarray(gen_pil)

        psnr_score = peak_signal_noise_ratio(gt_arr, gen_arr, data_range=255)

        return {"psnr": round(float(psnr_score), 4)}

    except Exception:
        return {"psnr": None}
