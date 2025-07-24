from evaluation.metrics import register_metric
from evaluation.metrics.surface_fidelity.pattern_level.saliency_helpers import kl_divergence, predict_saliency_map_pair

@register_metric("saliency_kl")
def _saliency_kl(gt_img: str, gen_img: str, **kwargs):
    """Computes the Kullback-Leibler Divergence (KL) between two saliency maps."""
    try:
        gt_sal, gen_sal = predict_saliency_map_pair(gt_img, gen_img)
        if gt_sal is None or gen_sal is None:
            return {"saliency_kl": None}
        score = kl_divergence(gt_sal, gen_sal)
        return {"saliency_kl": round(score, 4)}
    except Exception:
        return {"saliency_kl": None} 