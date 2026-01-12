# ruff: noqa: E402
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Any

# --- Configuration Dataclasses ---


@dataclass
class PrecomputedBlipScoresConfig:
    replication_gen: str
    modification_gen: str


@dataclass
class PathsConfig:
    gt_dir: str
    results_dir: str
    output_dir: str
    saliency_vis_dir: str
    vis_results_dir: str
    precomputed_blip_scores: PrecomputedBlipScoresConfig

    def __post_init__(self):
        self.precomputed_blip_scores = PrecomputedBlipScoresConfig(
            **self.precomputed_blip_scores
        )


@dataclass
class FilenamesConfig:
    results_json: str
    results_with_snapshots_json: str
    modification_results_basetarget_json: str
    gt_image: str
    gt_json: str
    modification_base_json: str
    modification_target_json: str
    modification_base_image: str
    modification_target_image: str
    gen_image: str
    gen_json: str
    snapshots_dir: str
    snapshot_image_glob: str
    snapshot_json: str
    vis_bar_plot: str
    vis_box_plot: str


@dataclass
class WeightsConfig:
    saliency_model: str


@dataclass
class CompositeMetricConfig:
    components: List[str]
    digits: int


@dataclass
class MetricsConfig:
    required_metrics: List[str]
    optional_required_metrics: Dict[str, str]
    composite_metrics: Dict[str, CompositeMetricConfig]

    def __post_init__(self):
        self.composite_metrics = {
            k: CompositeMetricConfig(**v) for k, v in self.composite_metrics.items()
        }


@dataclass
class VisualizationConfig:
    skip_keys: List[str]
    dpi: int


@dataclass
class AppConfig:
    """Root configuration object."""

    paths: PathsConfig
    filenames: FilenamesConfig
    weights: WeightsConfig
    metrics: MetricsConfig
    visualization: VisualizationConfig

    def __post_init__(self):
        self.paths = PathsConfig(**self.paths)
        self.filenames = FilenamesConfig(**self.filenames)
        self.weights = WeightsConfig(**self.weights)
        self.metrics = MetricsConfig(**self.metrics)
        self.visualization = VisualizationConfig(**self.visualization)


# --- Loading Logic ---

_config: AppConfig = None


def load_config() -> AppConfig:
    """
    Loads the configuration from the YAML file.
    The result is cached, so the file is only read once.
    """
    global _config
    if _config is None:
        config_path = Path(__file__).parent / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(
                f"Configuration file not found at {config_path}. "
                "Please ensure 'config.yaml' is in the 'evaluation' directory."
            )
        with config_path.open("r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)
        _config = AppConfig(**config_data)
    return _config


# --- Global Accessor ---

config = load_config()
