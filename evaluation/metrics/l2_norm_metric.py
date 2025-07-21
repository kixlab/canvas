from evaluation.metrics import register_metric
from evaluation.visual.l2_norm import compute_l2_norm
from typing import Optional


@register_metric("pixel_l2")
def _pixel_l2(
    gt_img: str,
    gen_img: str,
    gt_json: Optional[str] = None,
    gen_json: Optional[str] = None,
):
    """Return pixel-wise L2 norm (RMSE) between GT and generated images.

    The metric key returned is ``pixel_l2`` for consistency with existing naming.
    """
    res = compute_l2_norm(gt_img, gen_img)
    return {"pixel_l2": round(res["l2_norm"], 4)} 