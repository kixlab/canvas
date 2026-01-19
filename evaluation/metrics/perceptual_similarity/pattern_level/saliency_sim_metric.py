from evaluation.metrics import register_metric
from evaluation.metrics.perceptual_similarity.pattern_level.saliency_helpers import (
    similarity,
    predict_saliency_map_pair,
)


@register_metric("saliency_sim")
def _saliency_sim(gt_img: str, gen_img: str, **kwargs):
    """Computes the Histogram-intersection Similarity (SIM) between two saliency maps."""
    try:
        gt_sal, gen_sal = predict_saliency_map_pair(gt_img, gen_img)
        if gt_sal is None or gen_sal is None:
            return {"saliency_sim": None}
        score = similarity(gt_sal, gen_sal)
        return {"saliency_sim": round(score, 4)}
    except Exception:
        return {"saliency_sim": None}
