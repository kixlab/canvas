from typing import Callable, Dict

__all__ = ["register_metric", "get_metrics"]

MetricFunc = Callable[[str, str, str, str], dict]

_METRICS: Dict[str, MetricFunc] = {}


def register_metric(name: str):
    """Decorator to register a metric callable.

    The wrapped function should accept four string arguments:
      gt_img, gen_img, gt_json, gen_json (some may be None) and
    return a dictionary of metric_name -> value.
    """
    def decorator(func: MetricFunc) -> MetricFunc:
        if name in _METRICS:
            raise ValueError(f"Metric '{name}' already registered")
        _METRICS[name] = func
        return func
    return decorator


def get_metrics() -> Dict[str, MetricFunc]:
    """Return registered metric functions."""
    return _METRICS.copy() 