from evaluation.metrics import register_metric
from evaluation.metrics.perceptual_similarity.pattern_level.saliency_helpers import cc, predict_saliency_map_pair

@register_metric("saliency_cc")
def _saliency_cc(gt_img: str, gen_img: str, **kwargs):
    """Computes the Correlation Coefficient (CC) between two saliency maps."""
    try:
        gt_sal, gen_sal = predict_saliency_map_pair(gt_img, gen_img)
        if gt_sal is None or gen_sal is None:
            return {"saliency_cc": None}
        score = cc(gt_sal, gen_sal)
        return {"saliency_cc": round(score, 4)}
    except Exception:
        return {"saliency_cc": None}