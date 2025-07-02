from skimage.metrics import structural_similarity as ssim
from skimage.metrics import peak_signal_noise_ratio as psnr
from PIL import Image
import numpy as np
import os

def compute_ssim_psnr(gt_path, gen_path, resize_shape=None):
    if not os.path.exists(gt_path) or not os.path.exists(gen_path):
        raise FileNotFoundError(f"Missing file: {gt_path if not os.path.exists(gt_path) else gen_path}")

    gt_img = Image.open(gt_path).convert("RGB")
    gen_img = Image.open(gen_path).convert("RGB")

    if resize_shape:
        gt_img = gt_img.resize(resize_shape)
        gen_img = gen_img.resize(resize_shape)
    elif gt_img.size != gen_img.size:
        min_size = (min(gt_img.width, gen_img.width), min(gt_img.height, gen_img.height))
        gt_img = gt_img.resize(min_size)
        gen_img = gen_img.resize(min_size)

    gt_arr = np.asarray(gt_img).astype(np.float32) / 255.0
    gen_arr = np.asarray(gen_img).astype(np.float32) / 255.0

    ssim_score = ssim(gt_arr, gen_arr, channel_axis=-1, data_range=1.0)
    psnr_score = psnr(gt_arr, gen_arr, data_range=1.0)

    return {
        "ssim": round(ssim_score, 4),
        "psnr": round(psnr_score, 4)
    }