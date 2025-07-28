import lpips
import numpy as np
import torch
from PIL import Image
import os

from evaluation.metrics import register_metric


def _numpy_to_tensor(image: np.ndarray) -> torch.Tensor:
    """
    Converts a numpy array image to a torch tensor suitable for LPIPS.
    """
    tensor = torch.from_numpy(image).permute(2, 0, 1).float() / 255.0
    tensor = tensor * 2 - 1
    return tensor.unsqueeze(0)


@register_metric("lpips")
def _lpips(gt_img: str, gen_img: str, **kwargs):
    """
    Computes the LPIPS between two images.
    """
    try:
        if not os.path.exists(gt_img) or not os.path.exists(gen_img):
            return {"lpips": None}

        gt_pil = Image.open(gt_img).convert("RGB")
        gen_pil = Image.open(gen_img).convert("RGB")

        if gt_pil.size != gen_pil.size:
            min_size = (min(gt_pil.width, gen_pil.width), min(gt_pil.height, gen_pil.height))
            gt_pil = gt_pil.resize(min_size)
            gen_pil = gen_pil.resize(min_size)

        gt_arr = np.asarray(gt_pil)
        gen_arr = np.asarray(gen_pil)

        gen_img_tensor = _numpy_to_tensor(gen_arr)
        gt_img_tensor = _numpy_to_tensor(gt_arr)

        loss_fn = lpips.LPIPS(net="alex")
        with torch.no_grad():
            distance = loss_fn(gen_img_tensor, gt_img_tensor)

        return {"lpips": round(float(distance.squeeze().item()), 4)}

    except Exception:
        return {"lpips": None} 