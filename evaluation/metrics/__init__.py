# ruff: noqa: F401
import importlib
import pkgutil
from typing import Callable, Dict, List

# Global registry for metrics
_METRICS: Dict[str, Callable] = {}
_METRIC_SOURCES: Dict[str, str] = {}


def register_metric(name: str) -> Callable:
    """A decorator to register a new metric function."""
    def decorator(func: Callable) -> Callable:
        if name in _METRICS:
            raise ValueError(f"Metric '{name}' is already registered from {_METRIC_SOURCES[name]}")
        _METRICS[name] = func
        _METRIC_SOURCES[name] = func.__module__
        return func
    return decorator


def get_metrics() -> Dict[str, Callable]:
    """Return a copy of the metric registry."""
    return _METRICS.copy()


def _discover_metrics():
    """Dynamically and recursively import all submodules under evaluation.metrics."""
    import evaluation.metrics as _met_pkg
    # Use walk_packages to recursively find all modules
    for module_info in pkgutil.walk_packages(_met_pkg.__path__, f"{_met_pkg.__name__}."):
        importlib.import_module(module_info.name)

# Automatically discover metrics when this package is imported.
_discover_metrics()