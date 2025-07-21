from evaluation.metrics import register_metric
from evaluation.visual.ssim_psnr import compute_ssim_psnr


@register_metric("ssim")
def _ssim(gt_img: str, gen_img: str, gt_json: str = None, gen_json: str = None):
    """Return Pixel Fidelity (SSIM) and PSNR, rounded to 4 decimals."""
    res = compute_ssim_psnr(gt_img, gen_img)
    return {
        "ssim": round(res["ssim"], 4),
        "psnr": round(res["psnr"], 4),
    } 