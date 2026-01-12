# ruff: noqa: E501

"""
Evaluation pipeline for UI generation tasks.

This module provides a comprehensive evaluation system for comparing generated UI
designs against ground truth samples using various perceptual, component, and
semantic similarity metrics.
"""

# Set TensorFlow environment variables BEFORE any imports
import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_FORCE_GPU_ALLOW_GROWTH"] = "true"
os.environ["PYTHONHASHSEED"] = "42"
os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"

# Standard library imports
import argparse
import json
import logging
import random
import sys
import warnings
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, DefaultDict, Dict, List, Optional, Tuple

# Third-party imports
import numpy as np

try:
    import tensorflow as tf

    tf.get_logger().setLevel("ERROR")
    try:
        tf.random.set_seed(42)
    except AttributeError:
        tf.set_random_seed(42)
except ImportError:
    tf = None

try:
    import torch

    torch.manual_seed(42)
    torch.cuda.manual_seed(42)
    torch.cuda.manual_seed_all(42)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True, warn_only=True)
except ImportError:
    torch = None

try:
    import matplotlib.pyplot as plt
except ModuleNotFoundError:
    plt = None

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

# Local imports
from evaluation.config import config
from evaluation.metrics import get_metrics

# Suppress warnings and logging
warnings.simplefilter(action="ignore", category=FutureWarning)
warnings.filterwarnings("ignore")
logging.getLogger("tensorflow").setLevel(logging.ERROR)
logging.getLogger("keras").setLevel(logging.ERROR)

# Set random seeds for reproducibility
random.seed(42)
np.random.seed(42)

# Constants
PREVIOUS_RESULTS_FILE = "evaluation_results.json"


def _extract_model_from_case(case_id: str, variant: str) -> str:
    """Parse the model name from `<gid>-<screen>-<model>-<variant>` directory name.

    Returns "unknown" on parsing failure.
    """
    if not case_id.endswith(f"-{variant}"):
        return "unknown"

    prefix = case_id[: -(len(variant) + 1)]
    tokens = prefix.split("-")
    if len(tokens) < 3:
        return "unknown"
    return "-".join(tokens[2:])


@dataclass
class EvaluationCase:
    """Represents a single GT/GEN pair to be evaluated."""

    case_id: str  # e.g., "gid6-27-gpt-4o-image_only"
    gt_id: str  # e.g., "gid6-27"
    model_name: str
    gt_img_path: Optional[Path]  # Target GT image for modification_gen
    gt_json_path: Optional[Path]  # Target GT json for modification_gen
    gen_img_path: Path
    gen_json_path: Path
    snapshot_num: Optional[int] = None
    metric_results: Dict[str, Any] = field(default_factory=dict)
    # Additional fields for modification_gen
    base_gt_img_path: Optional[Path] = None
    base_gt_json_path: Optional[Path] = None
    is_modification: bool = False


class EvaluationPipeline:
    """Orchestrates the evaluation process for generation tasks."""

    def __init__(self, cli_config: argparse.Namespace):
        """Initialize the pipeline with configuration."""
        self.cli_config = cli_config
        self.app_config = config
        self._setup_paths()
        self._load_metrics()

        load_path = (
            self.output_path_snapshots
            if self.output_path_snapshots and self.output_path_snapshots.exists()
            else self.output_path_main
        )
        self.previous_results = self._load_previous_results(load_path)

        self.prev_by_key = {
            (r.get("id"), r.get("snapshot_num")): r for r in self.previous_results
        }
        self.results: List[Dict[str, any]] = []
        self.new_processed_count = 0
        self.cached_metrics = {}

    def _setup_paths(self):
        """Configure input and output directories based on config."""
        self.base_dir = Path(self.cli_config.base_dir).expanduser().resolve()
        if not self.base_dir.exists():
            for parent in Path(__file__).resolve().parents:
                candidate = parent / self.cli_config.base_dir
                if candidate.exists():
                    self.base_dir = candidate.resolve()
                    break
        if not self.base_dir.exists():
            raise FileNotFoundError(
                f"Base directory not found: {self.cli_config.base_dir}"
            )

        # Remove '_gen' suffix for gt directory
        task_base = self.cli_config.task.replace("_gen", "")
        path_vars = {
            "base_dir": str(self.base_dir),
            "task": self.cli_config.task,
            "task_base": task_base,
            "variant": self.cli_config.variant,
        }

        # Setup paths for precomputed BLIP scores
        if self.cli_config.task == "replication_gen":
            self.blip_scores_path = Path(
                self.app_config.paths.precomputed_blip_scores.replication_gen.format(
                    **path_vars
                )
            )
            self.blip_snapshot_scores_path = (
                self.blip_scores_path.parent / "precomputed_blip_scores_snapshot.json"
            )
        elif self.cli_config.task == "modification_gen":
            if not self.cli_config.variant:
                raise ValueError(
                    "--variant (task-1, task-2, or task-3) is required for modification_gen task"
                )
            self.blip_scores_path = Path(
                self.app_config.paths.precomputed_blip_scores.modification_gen.format(
                    **path_vars
                )
            )
            self.blip_snapshot_scores_path = (
                self.blip_scores_path.parent / "precomputed_blip_scores_snapshot.json"
            )

        # Add model name to BLIP scores paths if model is specified
        if self.cli_config.model:
            if self.cli_config.task == "replication_gen":
                model_specific_path = (
                    self.blip_scores_path.parent
                    / f"precomputed_blip_scores_{self.cli_config.model}.json"
                )
                if model_specific_path.exists():
                    self.blip_scores_path = model_specific_path
                    self.blip_snapshot_scores_path = (
                        self.blip_scores_path.parent
                        / f"precomputed_blip_scores_snapshot_{self.cli_config.model}.json"
                    )
                else:
                    # Use default file if model-specific file doesn't exist
                    tqdm.write(
                        f"[Info] Model-specific BLIP scores not found: {model_specific_path}"
                    )
                    tqdm.write(
                        f"[Info] Using default BLIP scores file: {self.blip_scores_path}"
                    )
            elif self.cli_config.task == "modification_gen":
                model_specific_path = (
                    self.blip_scores_path.parent
                    / f"precomputed_blip_scores_{self.cli_config.model}.json"
                )
                if model_specific_path.exists():
                    self.blip_scores_path = model_specific_path
                    self.blip_snapshot_scores_path = (
                        self.blip_scores_path.parent
                        / f"precomputed_blip_scores_snapshot_{self.cli_config.model}.json"
                    )
                else:
                    # Use default file if model-specific file doesn't exist
                    tqdm.write(
                        f"[Info] Model-specific BLIP scores not found: {model_specific_path}"
                    )
                    tqdm.write(
                        f"[Info] Using default BLIP scores file: {self.blip_scores_path}"
                    )

        gt_dir_template = self.app_config.paths.gt_dir
        results_dir_template = self.app_config.paths.results_dir
        output_dir_template = self.app_config.paths.output_dir

        if self.cli_config.task == "replication_gen":
            if not self.cli_config.variant:
                raise ValueError("--variant is required for replication_gen task")
            path_vars["variant"] = self.cli_config.variant
        elif self.cli_config.task == "modification_gen":
            # For modification_gen, we don't use variant in paths except for GT
            results_dir_template = results_dir_template.replace("/{variant}", "")
            output_dir_template = output_dir_template.replace("/{variant}", "")
            if self.cli_config.variant:
                path_vars["variant"] = self.cli_config.variant

        self.gt_dir = Path(gt_dir_template.format(**path_vars))
        self.results_dir = Path(results_dir_template.format(**path_vars))

        # Add model name to output directory to separate results by model
        if self.cli_config.model:
            self.output_dir = (
                Path(output_dir_template.format(**path_vars))
                / self.cli_config.variant
                / self.cli_config.model
            )
        else:
            self.output_dir = Path(output_dir_template.format(**path_vars))
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.output_path_main = self.output_dir / self.app_config.filenames.results_json

        self.output_path_snapshots = None
        if self.cli_config.eval_snapshots:
            self.output_path_snapshots = (
                self.output_dir / self.app_config.filenames.results_with_snapshots_json
            )

        self.output_path_basetarget = None
        if self.cli_config.task == "modification_gen":
            self.output_path_basetarget = (
                self.output_dir
                / self.app_config.filenames.modification_results_basetarget_json
            )

        self.output_path_delta = self.output_dir / "results_delta.json"

        self.saliency_vis_dir = (
            self.output_dir
            / self.app_config.paths.saliency_vis_dir.format(output_dir=self.output_dir)
        )
        if self.cli_config.save_saliency_vis:
            self.saliency_vis_dir.mkdir(exist_ok=True)

        # Load precomputed BLIP scores if available
        if self.blip_scores_path.exists():
            with self.blip_scores_path.open("r", encoding="utf-8") as f:
                try:
                    blip_data = json.load(f)
                    self.blip_scores = {item["case_id"]: item for item in blip_data}
                    tqdm.write(
                        f"Loaded {len(self.blip_scores)} precomputed BLIP scores from {self.blip_scores_path}"
                    )
                except json.JSONDecodeError:
                    tqdm.write(
                        f"[Warning] Failed to load precomputed BLIP scores from {self.blip_scores_path}"
                    )
                    self.blip_scores = {}
        else:
            tqdm.write(
                f"[Warning] Precomputed BLIP scores file not found: {self.blip_scores_path}"
            )
            self.blip_scores = {}

        # Load precomputed BLIP snapshot scores if available
        if self.blip_snapshot_scores_path.exists():
            with self.blip_snapshot_scores_path.open("r", encoding="utf-8") as f:
                try:
                    snapshot_scores_list = json.load(f)
                    self.blip_snapshot_scores = {
                        f"{item['case_id']}_{item['snapshot_num']}": item
                        for item in snapshot_scores_list
                    }
                    tqdm.write(
                        f"Loaded {len(self.blip_snapshot_scores)} precomputed BLIP snapshot scores from {self.blip_snapshot_scores_path}"
                    )
                except json.JSONDecodeError:
                    tqdm.write(
                        f"[Warning] Failed to load precomputed BLIP snapshot scores from {self.blip_snapshot_scores_path}"
                    )
                    self.blip_snapshot_scores = {}
        else:
            tqdm.write(
                f"[Info] Precomputed BLIP snapshot scores file not found: {self.blip_snapshot_scores_path}"
            )
            self.blip_snapshot_scores = {}

    def _load_metrics(self):
        """Load all available metric functions from the registry."""
        self.metric_funcs = get_metrics()

        try:
            import lpips

            self.lpips_model = lpips.LPIPS(net="alex", version="0.1")
            if "lpips" in self.metric_funcs:
                original_lpips_func = self.metric_funcs["lpips"]

                def lpips_with_cached_model(*args, **kwargs):
                    kwargs["model"] = self.lpips_model
                    return original_lpips_func(*args, **kwargs)

                self.metric_funcs["lpips"] = lpips_with_cached_model
        except ImportError:
            self.lpips_model = None
            tqdm.write(
                "[Warning] LPIPS module not found - skipping LPIPS metric caching"
            )

        # Preload saliency model to avoid repeated loading during evaluation
        try:
            # Import and test saliency model loading
            from evaluation.visual_saliency.core import _load_model

            # Trigger model loading once to cache it
            _ = _load_model()
            tqdm.write("[Info] Saliency model preloaded successfully")
        except Exception as e:
            tqdm.write(f"[Warning] Failed to preload saliency model: {e}")
            tqdm.write("[Info] Saliency metrics will be computed on-demand (slower)")

        # Preload visual saliency metric for better performance
        if "visual_saliency" in self.metric_funcs:
            try:
                from evaluation.metrics.visual_saliency_metric import get_cache_stats

                stats = get_cache_stats()
                tqdm.write(
                    f"[Info] Visual saliency metric loaded, cache stats: {stats}"
                )
            except Exception as e:
                tqdm.write(f"[Warning] Failed to load visual saliency metric: {e}")

        self.tool_metric_func = self.metric_funcs.pop("tool_usage", None)

    def run(self):
        """Execute the full evaluation pipeline."""
        cases = self._collect_evaluation_cases()

        if self.cli_config.ids:
            ids_set = set(self.cli_config.ids)
            original_cases = list(cases)
            cases = [c for c in cases if c.gt_id in ids_set]
            if not cases:
                error_msg = f"No matching samples found for ids: {self.cli_config.ids}"
                found_gt_ids = sorted({c.gt_id for c in original_cases})
                if found_gt_ids:
                    error_msg += f"\nAvailable gt_ids for model '{self.cli_config.model}': {json.dumps(found_gt_ids, indent=2)}"
                else:
                    error_msg += f"\nNo samples found at all for model '{self.cli_config.model}' in directory {self.results_dir}."
                raise ValueError(error_msg)

        case_iterator = cases
        if tqdm:
            desc = f"Eval: {self.cli_config.task} | {self.cli_config.variant}"
            if self.cli_config.model:
                desc += f" | {self.cli_config.model}"
            case_iterator = tqdm(
                cases,
                desc=desc,
                unit="case",
                position=0,
                leave=True,
                ncols=100,
                dynamic_ncols=True,
                file=sys.stderr,
            )

        skipped_count = 0
        processed_count = 0


        for case in case_iterator:
            # Skip already processed cases
            is_previously_processed = any(
                r.get("case_id") == case.case_id
                and r.get("snapshot_num") == case.snapshot_num
                and r.get("model") == case.model_name
                for r in self.previous_results
            )

            if self.cli_config.skip_all and is_previously_processed:
                skipped_count += 1
                continue

            processed_count += 1

            self._process_case(case)

        if self.cli_config.skip_all and tqdm:
            tqdm.write(
                f"\nSkip summary: {skipped_count} skipped, {processed_count} processed out of {len(cases)} total cases"
            )

        self.save_structured_results()

        if self.cli_config.vis:
            self._generate_visualizations()

        if tqdm:
            tqdm.write(f"\nEvaluation complete. Results saved to:")
            tqdm.write(f"  - Main results: {self.output_path_main}")
            if self.output_path_snapshots:
                tqdm.write(f"  - Snapshot results: {self.output_path_snapshots}")
            if self.output_path_basetarget:
                tqdm.write(f"  - Modification details: {self.output_path_basetarget}")
            tqdm.write(f"  - Delta results: {self.output_path_delta}")

        return self.results

    def _collect_evaluation_cases(self) -> List[EvaluationCase]:
        """Collect all GT/GEN pairs for evaluation."""
        if not self.results_dir.exists():
            raise FileNotFoundError(f"Results directory not found: {self.results_dir}")

        cases: List[EvaluationCase] = []

        items_to_process = list(self.results_dir.iterdir())

        # For modification_gen with variant, look into variant subdirectory
        if self.cli_config.task == "modification_gen" and self.cli_config.variant:
            variant_dir = self.results_dir / self.cli_config.variant
            if variant_dir.exists() and variant_dir.is_dir():
                items_to_process = list(variant_dir.iterdir())

        for item in items_to_process:
            if not item.is_dir():
                continue

            gt_id = None
            model_name = None
            gt_base_dir = self.gt_dir

            if self.cli_config.task == "replication_gen":
                if self.cli_config.variant:
                    if not item.name.endswith(f"-{self.cli_config.variant}"):
                        continue
                    if (
                        self.cli_config.model
                        and f"-{self.cli_config.model}-" not in f"{item.name}-"
                    ):
                        continue
                    prefix = item.name[: -(len(self.cli_config.variant) + 1)]
                    tokens = prefix.split("-")
                    if len(tokens) < 3:
                        continue
                    gt_id = "-".join(tokens[0:2])
                    model_name = "-".join(tokens[2:])
            elif self.cli_config.task == "modification_gen":
                if self.cli_config.model and not item.name.endswith(
                    f"-{self.cli_config.model}"
                ):
                    continue

                prefix = item.name

                # Find which model this directory belongs to
                if self.cli_config.model:
                    model_name = self.cli_config.model
                    if prefix.endswith(f"-{model_name}"):
                        gt_id = prefix[: -(len(model_name) + 1)]
                    else:
                        continue
                else:
                    tokens = prefix.split("-")
                    if len(tokens) < 2:
                        continue
                    model_name = tokens[-1]
                    gt_id = "-".join(tokens[:-1])

            if not gt_id or not model_name:
                continue

            case_id = item.name

            if self.cli_config.task == "modification_gen":
                # For modification task, we need both base and target GT files
                if self.cli_config.variant:
                    gt_base_dir = gt_base_dir / self.cli_config.variant

                gt_base_img_path = (
                    gt_base_dir
                    / self.app_config.filenames.modification_base_image.format(
                        gt_id=gt_id
                    )
                )
                gt_base_json_path = (
                    gt_base_dir
                    / self.app_config.filenames.modification_base_json.format(
                        gt_id=gt_id
                    )
                )
                gt_target_img_path = (
                    gt_base_dir
                    / self.app_config.filenames.modification_target_image.format(
                        gt_id=gt_id
                    )
                )
                gt_target_json_path = (
                    gt_base_dir
                    / self.app_config.filenames.modification_target_json.format(
                        gt_id=gt_id
                    )
                )

                if not gt_base_json_path.exists() or not gt_target_json_path.exists():
                    continue

                gt_img_path = gt_target_img_path
                gt_json_path = gt_target_json_path
            else:
                # For replication task, we only need one GT file
                gt_img_path = gt_base_dir / self.app_config.filenames.gt_image.format(
                    gt_id=gt_id
                )
                gt_json_path = gt_base_dir / self.app_config.filenames.gt_json.format(
                    gt_id=gt_id
                )

                if not gt_json_path.exists():
                    continue

            # Main result
            gen_img_path = item / self.app_config.filenames.gen_image.format(
                case_id=case_id
            )
            gen_json_path = item / self.app_config.filenames.gen_json.format(
                case_id=case_id
            )

            if gen_img_path.exists() and gen_json_path.exists():
                case = EvaluationCase(
                    case_id=case_id,
                    gt_id=gt_id,
                    model_name=model_name,
                    snapshot_num=None,
                    gt_img_path=gt_img_path if gt_img_path.exists() else None,
                    gen_img_path=gen_img_path,
                    gt_json_path=gt_json_path,
                    gen_json_path=gen_json_path,
                )

                if self.cli_config.task == "modification_gen":
                    case.is_modification = True
                    case.base_gt_img_path = (
                        gt_base_img_path if gt_base_img_path.exists() else None
                    )
                    case.base_gt_json_path = gt_base_json_path

                cases.append(case)

            # Snapshots
            if self.cli_config.eval_snapshots:
                snapshots_dir = item / self.app_config.filenames.snapshots_dir
                if snapshots_dir.is_dir():
                    glob_pattern = self.app_config.filenames.snapshot_image_glob.format(
                        case_id=case_id
                    )
                    snapshot_paths = sorted(snapshots_dir.glob(glob_pattern))
                    if not snapshot_paths:
                        tqdm.write(
                            f"No snapshots found in {snapshots_dir} with pattern {glob_pattern}"
                        )
                    for snapshot_img_path in snapshot_paths:
                        snapshot_stem = snapshot_img_path.stem
                        try:
                            snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                        except (ValueError, IndexError):
                            tqdm.write(f"Invalid snapshot name: {snapshot_stem}")
                            continue

                        snapshot_json_path = (
                            snapshots_dir / f"{snapshot_stem}-structure.json"
                        )

                        if snapshot_json_path.exists():
                            snapshot_case = EvaluationCase(
                                case_id=case_id,
                                gt_id=gt_id,
                                model_name=model_name,
                                snapshot_num=snapshot_num,
                                gt_img_path=gt_img_path
                                if gt_img_path.exists()
                                else None,
                                gen_img_path=snapshot_img_path,
                                gt_json_path=gt_json_path,
                                gen_json_path=snapshot_json_path,
                            )

                            if self.cli_config.task == "modification_gen":
                                snapshot_case.is_modification = True
                                snapshot_case.base_gt_img_path = (
                                    gt_base_img_path
                                    if gt_base_img_path.exists()
                                    else None
                                )
                                snapshot_case.base_gt_json_path = gt_base_json_path

                            cases.append(snapshot_case)
                        else:
                            tqdm.write(f"Snapshot JSON not found: {snapshot_json_path}")

        return cases

    def _process_case(self, case: EvaluationCase):
        """Compute metrics for a single evaluation case."""
        flat_result = {}
        if case.is_modification:
            # Compute base-target metrics only once per case_id if not already computed
            base_target_key = (case.case_id, "base_target")
            if base_target_key not in self.cached_metrics:
                self.cached_metrics[base_target_key] = (
                    self._compute_base_target_metrics(case)
                )
            base_target_metrics = self.cached_metrics[base_target_key]

            # Compute gen-target metrics
            gen_target_metrics = self._compute_gen_target_metrics(case)

            # Add precomputed BLIP scores if available, but only for final results (not snapshots)
            blip_key = case.case_id
            if case.snapshot_num is None and blip_key in self.blip_scores:
                blip_data = self.blip_scores[blip_key]
                # For base-vs-target, "generated" is the base image
                base_target_metrics.update(
                    {
                        "blip_caption_similarity": blip_data.get(
                            "blip_score_base_target"
                        ),
                        "generated_caption": blip_data.get("gt_caption_base"),
                        "ground_truth_caption": blip_data.get("gt_caption_target"),
                    }
                )
                gen_target_metrics.update(
                    {
                        "blip_caption_similarity": blip_data.get(
                            "blip_score_gen_target"
                        ),
                        "generated_caption": blip_data.get("gen_caption"),
                        "ground_truth_caption": blip_data.get("gt_caption_target"),
                    }
                )
            elif case.snapshot_num is not None:
                # For snapshots, check if we have snapshot-specific BLIP scores
                snapshot_key = f"{blip_key}_{case.snapshot_num}"
                if snapshot_key in self.blip_snapshot_scores:
                    snapshot_blip_data = self.blip_snapshot_scores[snapshot_key]
                    # For snapshots, the comparison is always snapshot-vs-target
                    common_metrics = {
                        "blip_caption_similarity": snapshot_blip_data.get("blip_score"),
                        "generated_caption": snapshot_blip_data.get("gen_caption"),
                        "ground_truth_caption": snapshot_blip_data.get(
                            "gt_caption_target"
                        ),
                    }
                    base_target_metrics.update(common_metrics)
                    gen_target_metrics.update(common_metrics)
                else:
                    # If no snapshot-specific scores, just fill in the target caption for context
                    if blip_key in self.blip_scores:
                        base_target_metrics["ground_truth_caption"] = self.blip_scores[
                            blip_key
                        ].get("gt_caption_target")
                        gen_target_metrics["ground_truth_caption"] = self.blip_scores[
                            blip_key
                        ].get("gt_caption_target")

            # Calculate delta metrics (gen_target - base_target)
            delta_metrics = {}
            for key in base_target_metrics:
                if isinstance(base_target_metrics[key], (int, float)) and isinstance(
                    gen_target_metrics[key], (int, float)
                ):
                    delta_metrics[f"{key}_delta"] = (
                        gen_target_metrics[key] - base_target_metrics[key]
                    )

            # Add BLIP improvement directly from precomputed scores
            if blip_key in self.blip_scores:
                delta_metrics["blip_caption_similarity_delta"] = self.blip_scores[
                    blip_key
                ].get("blip_score_improvement")

            # Prepare final metrics structure for modification task
            flat_result = {
                "id": case.gt_id,
                "case_id": case.case_id,
                "model": case.model_name,
                "snapshot_num": case.snapshot_num,
                "base_target_metrics": base_target_metrics,
                "gen_target_metrics": gen_target_metrics,
                **delta_metrics,  # Include delta metrics at top level
            }

        else:
            # For replication task, compute metrics normally
            flat_result = self._compute_metrics(case)
            flat_result.update(
                {
                    "id": case.gt_id,
                    "case_id": case.case_id,
                    "model": case.model_name,
                    "snapshot_num": case.snapshot_num,
                }
            )

            # Add precomputed BLIP scores for replication task
            blip_key = case.case_id
            if case.snapshot_num is None and blip_key in self.blip_scores:
                blip_data = self.blip_scores[blip_key]
                flat_result.update(
                    {
                        "blip_caption_similarity": blip_data.get("blip_score"),
                        "generated_caption": blip_data.get("gen_caption"),
                        "ground_truth_caption": blip_data.get("gt_caption"),
                    }
                )
            elif case.snapshot_num is not None:
                # For snapshots, check if we have snapshot-specific BLIP scores
                snapshot_key = f"{blip_key}_{case.snapshot_num}"
                if snapshot_key in self.blip_snapshot_scores:
                    snapshot_blip_data = self.blip_snapshot_scores[snapshot_key]
                    flat_result.update(
                        {
                            "blip_caption_similarity": snapshot_blip_data.get(
                                "blip_score"
                            ),
                            "generated_caption": snapshot_blip_data.get("gen_caption"),
                            "ground_truth_caption": snapshot_blip_data.get(
                                "gt_caption"
                            ),
                        }
                    )
                else:
                    # If no snapshot-specific scores, just fill in the GT caption for context
                    if blip_key in self.blip_scores:
                        flat_result["ground_truth_caption"] = self.blip_scores[
                            blip_key
                        ].get("gt_caption")

        # Process tool usage for both replication and modification tasks
        if self.tool_metric_func:
            # For modification_gen with variant, we need to include variant in the path
            if self.cli_config.task == "modification_gen" and self.cli_config.variant:
                result_path = self.results_dir / self.cli_config.variant / case.case_id
            else:
                result_path = self.results_dir / case.case_id
            tool_metrics = self.tool_metric_func(
                result_path=str(result_path),
                case_id=case.case_id,
                snapshot_num=case.snapshot_num,
            )
            flat_result.update(tool_metrics)

        self.results.append(flat_result)
        self.new_processed_count += 1

        # Periodic checkpoint
        if self.new_processed_count % 10 == 0:
            self._save_results()

    def _compute_base_target_metrics(self, case: EvaluationCase) -> Dict[str, Any]:
        """Compute metrics between base GT and target GT."""
        temp_case = EvaluationCase(
            case_id=case.case_id,
            gt_id=case.gt_id,
            model_name=case.model_name,
            gt_img_path=case.gt_img_path,
            gt_json_path=case.gt_json_path,
            gen_img_path=case.base_gt_img_path,
            gen_json_path=case.base_gt_json_path,
            is_modification=True,
        )
        return self._compute_metrics(temp_case)

    def _compute_gen_target_metrics(self, case: EvaluationCase) -> Dict[str, Any]:
        """Compute metrics between generated image and target GT."""
        return self._compute_metrics(case, is_base=False)

    def _compute_metrics(
        self, case: EvaluationCase, is_base: bool = False
    ) -> Dict[str, Any]:
        """Compute metrics for a case, optionally using base GT for modification task."""
        metric = {}

        for name, func in self.metric_funcs.items():
            if self._should_skip_metric(
                name, metric, case.gt_img_path, case.case_id, case.snapshot_num
            ):
                continue

            try:
                if case.is_modification and is_base:
                    kwargs = {
                        "gt_img": str(case.base_gt_img_path)
                        if case.base_gt_img_path
                        else "",
                        "gen_img": str(case.gen_img_path),
                        "gt_json": str(case.base_gt_json_path),
                        "gen_json": str(case.gen_json_path),
                    }
                else:
                    kwargs = {
                        "gt_img": str(case.gt_img_path) if case.gt_img_path else "",
                        "gen_img": str(case.gen_img_path),
                        "gt_json": str(case.gt_json_path),
                        "gen_json": str(case.gen_json_path),
                    }

                if name == "visual_saliency":
                    kwargs.update(
                        {
                            "out_dir": str(self.saliency_vis_dir)
                            if self.cli_config.save_saliency_vis
                            else None,
                            "case_id": case.case_id,
                            "snapshot_num": case.snapshot_num,
                        }
                    )
                elif name == "blip_caption_similarity":
                    kwargs.update(
                        {
                            "out_dir": str(self.output_dir),
                            "case_id": case.case_id,
                            "snapshot_num": case.snapshot_num,
                        }
                    )
                else:
                    kwargs.update(
                        {"out_dir": str(self.output_dir), "case_id": case.case_id}
                    )

                try:
                    result = func(**kwargs)
                except TypeError:
                    del kwargs["out_dir"], kwargs["case_id"]
                    if "snapshot_num" in kwargs:
                        del kwargs["snapshot_num"]
                    result = func(**kwargs)

                metric.update(result)

            except Exception as e:
                metric[f"{name}_error"] = str(e)

        return metric

    def _should_skip_metric(
        self,
        name: str,
        metric: Dict,
        gt_img_path: Optional[Path],
        case_id: str,
        snapshot_num: Optional[int],
    ) -> bool:
        """Check if a metric computation should be skipped based on config and state."""
        # For snapshots, we always skip semantic_match as we don't have precomputed scores
        if name == "semantic_match" and snapshot_num is not None:
            return True
        if gt_img_path is None and name in {
            "ssim",
            "semantic_match",
            "visual_saliency",
        }:
            return True
        if self.cli_config.skip_visual_saliency and name == "visual_saliency":
            if (
                self.app_config.metrics.optional_required_metrics["visual_saliency"]
                not in metric
            ):
                if tqdm:
                    tqdm.write(
                        f"[Warning] visual_saliency metrics not found for {metric.get('id', 'unknown')} (snap: {metric.get('snapshot_num', 'unknown')}) - skipping."
                    )
                else:
                    tqdm.write(
                        f"[Warning] visual_saliency metrics not found for {metric.get('id', 'unknown')} (snap: {metric.get('snapshot_num', 'unknown')}) - skipping."
                    )
            return True
        if self.cli_config.skip_blip and name == "semantic_match":
            if (
                self.app_config.metrics.optional_required_metrics["semantic_match"]
                not in metric
            ):
                if tqdm:
                    tqdm.write(
                        f"[Warning] semantic_match not found for {metric.get('id', 'unknown')} (snap: {metric.get('snapshot_num', 'unknown')}) - skipping."
                    )
                else:
                    tqdm.write(
                        f"[Warning] semantic_match not found for {metric.get('id', 'unknown')} (snap: {metric.get('snapshot_num', 'unknown')}) - skipping."
                    )
            return True

        # Check if already computed
        is_blip_present = (
            self.app_config.metrics.optional_required_metrics["semantic_match"]
            in metric
        )
        is_vis_sal_present = (
            self.app_config.metrics.optional_required_metrics["visual_saliency"]
            in metric
        )
        if name == "semantic_match" and is_blip_present:
            return True
        if name == "visual_saliency" and is_vis_sal_present:
            return True
        if name not in {"semantic_match", "visual_saliency"} and name in metric:
            return True

        return False

    def _is_result_complete(self, result: Dict[str, Any]) -> bool:
        """Check if a result dict contains all required metrics."""
        required = set(self.app_config.metrics.required_metrics)
        if not self.cli_config.skip_blip:
            required.add(
                self.app_config.metrics.optional_required_metrics["semantic_match"]
            )
        if not self.cli_config.skip_visual_saliency:
            required.add(
                self.app_config.metrics.optional_required_metrics["visual_saliency"]
            )
        return all(key in result for key in required)

    def _run_tool_metrics_on_final_results(self):
        """Run tool usage metrics on final (non-snapshot) results."""
        if not self.tool_metric_func:
            return

        for result in self.results:
            result_path = self._get_result_path_from_case_id(result["case_id"])
            if not result_path:
                continue

            # Skip if already computed
            if "tool_call_count" in result and result["tool_call_count"] is not None:
                continue

            tool_metrics = self.tool_metric_func(
                result_path=str(result_path), case_id=result["case_id"]
            )
            result.update(tool_metrics)

    def _get_result_path_from_case_id(self, case_id: str) -> Optional[Path]:
        """Helper to find the full result path for a given case_id."""
        result_path = self.results_dir / case_id
        if result_path.exists():
            return result_path
        return None

    def _restructure_result(self, flat_result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a flat metric dictionary to the new hierarchical schema."""

        def get(key, default=None):
            return flat_result.get(key, default)

        def build_structured_metrics(metrics_dict: Dict) -> Dict:
            """Helper to build the final structured dictionary for a set of metrics."""
            if not metrics_dict:
                return {}
            return {
                "perceptual_similarity": {
                    "feature_level": {
                        "ssim": metrics_dict.get("ssim"),
                        "rmse_inverse": metrics_dict.get("rmse_inverse"),
                        "psnr": metrics_dict.get("psnr"),
                    },
                    "pattern_level": {
                        "saliency_sim": metrics_dict.get("saliency_sim"),
                        "saliency_cc": metrics_dict.get("saliency_cc"),
                        "saliency_kl": metrics_dict.get("saliency_kl"),
                        "lpips": metrics_dict.get("lpips"),
                    },
                    "object_level": {
                        "blip_caption_similarity": metrics_dict.get(
                            "blip_caption_similarity"
                        ),
                        "clip_caption_similarity": metrics_dict.get(
                            "clip_caption_similarity"
                        ),
                        "generated_caption": metrics_dict.get("generated_caption"),
                        "ground_truth_caption": metrics_dict.get(
                            "ground_truth_caption"
                        ),
                    },
                },
                "component_similarity": {
                    "block_match_score": metrics_dict.get("block_match_score"),
                    "color_similarity_score": metrics_dict.get(
                        "color_similarity_score"
                    ),
                    "position_similarity_score": metrics_dict.get(
                        "position_similarity_score"
                    ),
                    "text_coverage_f1_score": metrics_dict.get(
                        "text_coverage_f1_score"
                    ),
                },
            }

        # Collect tool usage metrics first from the top level
        tool_usage_metrics = {
            "step_count": get("step_count"),
            "tool_call_count": get("tool_call_count"),
            "tool_step_count": get("step_count"),  # Note: same as step_count
            "tool_efficiency": get("tool_efficiency"),
            "unique_tool_count": get("unique_tool_count"),
            "unique_tool_list": get("unique_tool_list"),
            "tool_call_trace": get("tool_call_trace"),
            "human_hit_rate": get("human_hit_rate"),
            "human_tool_precision": get("human_tool_precision"),
            "human_tool_recall": get("human_tool_recall"),
        }

        # Modification Task has 'base_target_metrics', Replication does not.
        if "base_target_metrics" in flat_result:
            # Modification task structure
            base_metrics = build_structured_metrics(get("base_target_metrics", {}))
            if base_metrics:
                # Rename generated_caption to base_caption for clarity
                obj_level = base_metrics.get("perceptual_similarity", {}).get(
                    "object_level", {}
                )
                if "generated_caption" in obj_level:
                    obj_level["base_caption"] = obj_level.pop("generated_caption")
                base_metrics["tool_usage_metrics"] = tool_usage_metrics

            gen_metrics = build_structured_metrics(get("gen_target_metrics", {}))
            if gen_metrics:
                gen_metrics["tool_usage_metrics"] = tool_usage_metrics

            # Build delta metrics structure
            delta_metrics_flat = {
                k[:-6]: v for k, v in flat_result.items() if k.endswith("_delta")
            }
            delta_metrics = build_structured_metrics(delta_metrics_flat)
            if delta_metrics:
                # Add captions to delta object level for comparison
                delta_obj_level = delta_metrics.get("perceptual_similarity", {}).get(
                    "object_level", {}
                )
                if base_metrics:
                    delta_obj_level["base_caption"] = (
                        base_metrics.get("perceptual_similarity", {})
                        .get("object_level", {})
                        .get("base_caption")
                    )
                if gen_metrics:
                    delta_obj_level["gen_caption"] = (
                        gen_metrics.get("perceptual_similarity", {})
                        .get("object_level", {})
                        .get("generated_caption")
                    )
                    delta_obj_level["ground_truth_caption"] = (
                        gen_metrics.get("perceptual_similarity", {})
                        .get("object_level", {})
                        .get("ground_truth_caption")
                    )
                delta_metrics["tool_usage_metrics"] = tool_usage_metrics

            return {
                "id": get("id"),
                "case_id": get("case_id"),
                "model": get("model"),
                "snapshot_num": get("snapshot_num"),
                "base_target_metrics": base_metrics,
                "gen_target_metrics": gen_metrics,
                "delta_metrics": delta_metrics,
            }
        else:
            # Replication task structure
            metrics = build_structured_metrics(flat_result)
            metrics["tool_usage_metrics"] = tool_usage_metrics

            return {
                "id": get("id"),
                "case_id": get("case_id"),
                "model": get("model"),
                "snapshot_num": get("snapshot_num"),
                "metrics": metrics,
            }

    def save_structured_results(self):
        """Restructure `self.results` and save them to designated JSON files."""

        # Step 1: Restructure
        self.results = [self._restructure_result(r) for r in self.results]

        # Main results (final only)
        if self.output_path_main:
            final_results = [r for r in self.results if r.get("snapshot_num") is None]
            self._write_json(final_results, self.output_path_main)

        # Snapshot results (all, including final)
        if self.output_path_snapshots:
            self._write_json(self.results, self.output_path_snapshots)

        # Base-target metrics (modification only)
        if self.output_path_basetarget:
            basetarget_data = [
                {
                    "id": r.get("id"),
                    "case_id": r.get("case_id"),
                    "model": r.get("model"),
                    "snapshot_num": r.get("snapshot_num"),
                    "base_target_metrics": r.get("base_target_metrics"),
                    "gen_target_metrics": r.get("gen_target_metrics"),
                }
                for r in self.results
                if r.get("base_target_metrics") is not None
                and r.get("gen_target_metrics") is not None
            ]
            self._write_json(basetarget_data, self.output_path_basetarget)

        # Delta-only results
        if self.output_path_delta:
            delta_data = [
                {
                    "id": r.get("id"),
                    "case_id": r.get("case_id"),
                    "model": r.get("model"),
                    "snapshot_num": r.get("snapshot_num"),
                    "delta_metrics": r.get("delta_metrics"),
                }
                for r in self.results
                if r.get("delta_metrics")
            ]
            self._write_json(delta_data, self.output_path_delta)

    def _load_previous_results(self, load_path: Path) -> List[Dict[str, any]]:
        """Load previous results from a specific JSON file."""
        if load_path.exists():
            if tqdm:
                tqdm.write(f"Loading previous results from: {load_path}")
            with load_path.open("r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    for item in data:
                        item.setdefault("snapshot_num", None)
                    if tqdm:
                        tqdm.write(f"Loaded {len(data)} previous results.")
                    return data
                except json.JSONDecodeError:
                    if tqdm:
                        tqdm.write(
                            "[Warning] Could not decode existing results file. Starting fresh."
                        )
        return []

    def _save_results(self, final: bool = False):
        """Save checkpoints during a long run."""
        if final:
            return

        checkpoint_path = self.output_dir / "eval_checkpoint.json"
        self._write_json(self.results, checkpoint_path)

    def _write_json(self, data: List[Dict[str, Any]], path: Path):
        """Helper function to write data to a JSON file with NumPy compatibility."""

        def _json_default(o):
            try:
                import numpy as np

                if isinstance(o, (np.integer,)):
                    return int(o)
                if isinstance(o, (np.floating,)):
                    return float(o)
                if isinstance(o, np.ndarray):
                    return o.tolist()
            except ModuleNotFoundError:
                pass
            raise TypeError(
                f"Object of type {type(o).__name__} is not JSON serializable"
            )

        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=_json_default)

    def _save_basetarget_results(self, metric: Dict[str, Any]):
        """Save base and target metrics for modification task."""
        if not hasattr(self, "basetarget_results"):
            self.basetarget_results = []
            if self.output_path_basetarget and self.output_path_basetarget.exists():
                with self.output_path_basetarget.open("r", encoding="utf-8") as f:
                    try:
                        self.basetarget_results = json.load(f)
                    except json.JSONDecodeError:
                        pass

        self.basetarget_results.append(metric)
        with self.output_path_basetarget.open("w", encoding="utf-8") as f:
            json.dump(self.basetarget_results, f, indent=2, ensure_ascii=False)

    def _generate_visualizations(self):
        """Create and save model-wise metric plots."""
        if plt is None:
            tqdm.write("[VIS] matplotlib not available – skipping visualization.")
            return
        if not self.results:
            tqdm.write("[VIS] No results to visualize.")
            return

        vis_dir = self.output_dir / self.app_config.paths.vis_results_dir.format(
            output_dir=self.output_dir
        )
        vis_dir.mkdir(exist_ok=True)

        metric_data: DefaultDict[str, DefaultDict[str, List[float]]] = defaultdict(
            lambda: defaultdict(list)
        )
        skip_keys = set(self.app_config.visualization.skip_keys)

        # Extract metrics from the new nested structure
        for entry in self.results:
            model_name = entry.get("model", "unknown")

            # Handle both old flat structure and new nested structure
            if "metrics" in entry:
                # New nested structure (replication_gen)
                metrics = entry["metrics"]
                if "perceptual_similarity" in metrics:
                    ps = metrics["perceptual_similarity"]
                    # Feature level metrics
                    if "feature_level" in ps:
                        fl = ps["feature_level"]
                        for metric_name, value in fl.items():
                            if isinstance(value, (int, float)) and value is not None:
                                metric_data[f"feature_{metric_name}"][
                                    model_name
                                ].append(float(value))

                    # Pattern level metrics
                    if "pattern_level" in ps:
                        pl = ps["pattern_level"]
                        for metric_name, value in pl.items():
                            if isinstance(value, (int, float)) and value is not None:
                                metric_data[f"pattern_{metric_name}"][
                                    model_name
                                ].append(float(value))

                    # Object level metrics
                    if "object_level" in ps:
                        ol = ps["object_level"]
                        for metric_name, value in ol.items():
                            if isinstance(value, (int, float)) and value is not None:
                                metric_data[f"object_{metric_name}"][model_name].append(
                                    float(value)
                                )

                # Component similarity metrics
                if "component_similarity" in metrics:
                    cs = metrics["component_similarity"]
                    for metric_name, value in cs.items():
                        if isinstance(value, (int, float)) and value is not None:
                            metric_data[f"component_{metric_name}"][model_name].append(
                                float(value)
                            )

                # Tool usage metrics
                if "tool_usage_metrics" in metrics:
                    tu = metrics["tool_usage_metrics"]
                    for metric_name, value in tu.items():
                        if isinstance(value, (int, float)) and value is not None:
                            metric_data[f"tool_{metric_name}"][model_name].append(
                                float(value)
                            )

            elif "base_target_metrics" in entry and "gen_target_metrics" in entry:
                # Modification task structure
                # Process base_target_metrics
                base_metrics = entry["base_target_metrics"]
                if "perceptual_similarity" in base_metrics:
                    ps = base_metrics["perceptual_similarity"]
                    if "feature_level" in ps:
                        fl = ps["feature_level"]
                        for metric_name, value in fl.items():
                            if isinstance(value, (int, float)) and value is not None:
                                metric_data[f"base_feature_{metric_name}"][
                                    model_name
                                ].append(float(value))

                # Process gen_target_metrics
                gen_metrics = entry["gen_target_metrics"]
                if "perceptual_similarity" in gen_metrics:
                    ps = gen_metrics["perceptual_similarity"]
                    if "feature_level" in ps:
                        fl = ps["feature_level"]
                        for metric_name, value in fl.items():
                            if isinstance(value, (int, float)) and value is not None:
                                metric_data[f"gen_feature_{metric_name}"][
                                    model_name
                                ].append(float(value))

            else:
                # Fallback to old flat structure
                for k, v in entry.items():
                    if k in skip_keys or k.endswith("_error"):
                        continue
                    if isinstance(v, (int, float)):
                        metric_data[k][model_name].append(float(v))

        # Generate plots for each metric
        for metric, model_dict in metric_data.items():
            models = sorted(model_dict.keys())
            if not models or len(models) == 0:
                continue

            # Skip if no data
            if all(len(model_dict[m]) == 0 for m in models):
                continue

            # Bar plot (mean)
            means = []
            valid_models = []
            for m in models:
                if len(model_dict[m]) > 0:
                    means.append(sum(model_dict[m]) / len(model_dict[m]))
                    valid_models.append(m)

            if not valid_models:
                continue

            plt.figure(figsize=(max(6, len(valid_models) * 1.2), 4))
            plt.bar(valid_models, means, color="skyblue")
            plt.ylabel(metric)
            plt.title(f"Mean {metric} per model ({self.cli_config.variant})")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            plt.savefig(
                vis_dir / self.app_config.filenames.vis_bar_plot.format(metric=metric),
                dpi=self.app_config.visualization.dpi,
            )
            plt.close()

            # Box plot (distribution)
            data = [model_dict[m] for m in valid_models if len(model_dict[m]) > 0]
            if data:
                plt.figure(figsize=(max(6, len(valid_models) * 1.2), 4))
                plt.boxplot(data, labels=valid_models, vert=True, patch_artist=True)
                plt.ylabel(metric)
                plt.title(
                    f"{metric} distribution per model ({self.cli_config.variant})"
                )
                plt.xticks(rotation=45, ha="right")
                plt.tight_layout()
                plt.savefig(
                    vis_dir
                    / self.app_config.filenames.vis_box_plot.format(metric=metric),
                    dpi=self.app_config.visualization.dpi,
                )
                plt.close()

        tqdm.write(f"[VIS] Saved visualization plots → {vis_dir}")


def main():
    """Main entry point for the evaluation script."""
    parser = argparse.ArgumentParser(
        description="Run evaluation metrics for generation samples.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    # --- Core Arguments ---
    parser.add_argument(
        "--base_dir",
        type=str,
        default="dataset",
        help="Base dataset directory containing 'benchmarks' and 'results'.",
    )
    parser.add_argument(
        "--task",
        type=str,
        required=True,
        choices=["replication_gen", "modification_gen"],
        help="Task to evaluate (replication_gen or modification_gen).",
    )
    parser.add_argument(
        "--variant",
        type=str,
        default=None,
        help="Task variant to evaluate (required for replication_gen, optional for modification_gen).",
    )

    # --- Filtering Arguments ---
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model name to filter (e.g., gpt-4o). If omitted, evaluate all models.",
    )
    parser.add_argument(
        "--ids",
        type=str,
        default=None,
        help="Comma-separated list of GT ids to evaluate (e.g., gid6-27,gid34-35).",
    )

    # --- Feature Flags ---
    parser.add_argument(
        "--vis",
        action="store_true",
        help="Generate visualization plots (bar / box) grouped by model.",
    )
    parser.add_argument(
        "--eval_snapshots",
        action="store_true",
        help="Evaluate snapshots in addition to the final result.",
    )
    parser.add_argument(
        "--save_saliency_vis",
        action="store_true",
        help="Save visual saliency visualizations.",
    )

    # --- Caching Arguments ---
    parser.add_argument(
        "--skip_blip",
        action="store_true",
        help="Skip BLIP semantic similarity metric to speed up evaluation.",
    )
    parser.add_argument(
        "--skip_visual_saliency",
        action="store_true",
        help="Skip Visual Saliency metric to speed up evaluation.",
    )
    parser.add_argument(
        "--skip_all",
        action="store_true",
        help="Skip evaluation for samples where all metrics are already present in results file.",
    )

    args = parser.parse_args()

    if args.task == "replication_gen" and not args.variant:
        parser.error("--variant is required for replication_gen task")

    if args.ids:
        args.ids = [s.strip() for s in args.ids.split(",") if s.strip()]

    pipeline = EvaluationPipeline(cli_config=args)
    pipeline.run()


if __name__ == "__main__":
    main()
