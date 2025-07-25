# ruff: noqa: E501

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)

import json
from pathlib import Path
from typing import List, Tuple, Dict, Optional, DefaultDict, Any
from dataclasses import dataclass, field
import argparse


import pkgutil
import importlib

try:
    import matplotlib.pyplot as plt
except ModuleNotFoundError:
    plt = None

from collections import defaultdict

from evaluation.metrics import get_metrics
from evaluation.config import config


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
    is_modification: bool = False  # Flag to indicate if this is a modification task


class EvaluationPipeline:
    """Orchestrates the evaluation process for generation tasks."""

    def __init__(self, cli_config: argparse.Namespace):
        """Initialize the pipeline with configuration."""
        self.cli_config = cli_config
        self.app_config = config
        self._setup_paths()
        self._load_metrics()

        self.previous_results = self._load_previous_results()
        self.prev_by_key = {
            (r.get("id"), r.get("snapshot_num")): r for r in self.previous_results
        }
        self.results: List[Dict[str, any]] = self.previous_results.copy() if cli_config.skip_all else []
        self.new_processed_count = 0

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
            raise FileNotFoundError(f"Base directory not found: {self.cli_config.base_dir}")

        # Remove '_gen' suffix for gt directory
        task_base = self.cli_config.task.replace("_gen", "")
        path_vars = {
            "base_dir": str(self.base_dir),
            "task": self.cli_config.task,
            "task_base": task_base
        }

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
        self.output_dir = Path(output_dir_template.format(**path_vars))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        print(self.cli_config.task)
        print(self.gt_dir)
        print(self.results_dir)
        
        if self.cli_config.eval_snapshots:
            self.output_path = self.output_dir / self.app_config.filenames.results_with_snapshots_json
        else:
            self.output_path = self.output_dir / self.app_config.filenames.results_json
            
        # Additional output path for modification task
        if self.cli_config.task == "modification_gen":
            self.modification_basetarget_path = self.output_dir / self.app_config.filenames.modification_results_basetarget_json

        self.saliency_vis_dir = self.output_dir / self.app_config.paths.saliency_vis_dir.format(output_dir=self.output_dir)
        if self.cli_config.save_saliency_vis:
            self.saliency_vis_dir.mkdir(exist_ok=True)

    def _load_metrics(self):
        """Load all available metric functions from the registry."""
        # Metric discovery now happens automatically when evaluation.metrics is imported.
        self.metric_funcs = get_metrics()
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

        for case in cases:
            self._process_case(case)

        self._run_tool_metrics_on_final_results()

        self.results = [self._restructure_result(r) for r in self.results]
        self._save_results(final=True)
        if self.cli_config.vis:
            self._generate_visualizations()

        print(f"\nEvaluation complete. Results saved to:\n{self.output_path}")
        return self.results

    def _collect_evaluation_cases(self) -> List[EvaluationCase]:
        """Collect all GT/GEN pairs for evaluation."""
        if not self.results_dir.exists():
            raise FileNotFoundError(f"Results directory not found: {self.results_dir}")

        cases: List[EvaluationCase] = []
        
        items_to_process = list(self.results_dir.iterdir())
        print("\n[DEBUG] Items in results dir:")
        for item in items_to_process:
            print(f"- {item}")

        # For modification_gen with variant, we need to look into variant subdirectory
        if self.cli_config.task == "modification_gen" and self.cli_config.variant:
            variant_dir = self.results_dir / self.cli_config.variant
            if variant_dir.exists() and variant_dir.is_dir():
                print(f"\n[DEBUG] Found variant directory: {variant_dir}")
                items_to_process = list(variant_dir.iterdir())
                print("[DEBUG] Items in variant dir:")
                for item in items_to_process:
                    print(f"- {item}")
            else:
                print(f"\n[DEBUG] Variant directory not found: {variant_dir}")

        for item in items_to_process:
            if not item.is_dir():
                continue
            
            print(f"\n[DEBUG] Processing item: {item.name}")
            gt_id = None
            model_name = None
            gt_base_dir = self.gt_dir

            if self.cli_config.task == "replication_gen":
                if self.cli_config.variant:
                    if not item.name.endswith(f"-{self.cli_config.variant}"):
                        print(f"[DEBUG] Skipping - doesn't end with variant: {self.cli_config.variant}")
                        continue
                    if self.cli_config.model and f"-{self.cli_config.model}-" not in f"{item.name}-":
                        print(f"[DEBUG] Skipping - model not found: {self.cli_config.model}")
                        continue
                    prefix = item.name[: -(len(self.cli_config.variant) + 1)]
                    tokens = prefix.split("-")
                    if len(tokens) < 3:
                        print("[DEBUG] Skipping - not enough tokens")
                        continue
                    gt_id = "-".join(tokens[0:2])
                    model_name = "-".join(tokens[2:])
            elif self.cli_config.task == "modification_gen":
                if self.cli_config.model and not item.name.endswith(f"-{self.cli_config.model}"):
                    print(f"[DEBUG] Skipping - doesn't end with model: {self.cli_config.model}")
                    continue

                prefix = item.name
                print(f"[DEBUG] Prefix: {prefix}")
                
                # Find which model this directory belongs to
                if self.cli_config.model:
                    model_name = self.cli_config.model
                    if prefix.endswith(f"-{model_name}"):
                        gt_id = prefix[:-(len(model_name) + 1)]
                        print(f"[DEBUG] Found gt_id: {gt_id}, model: {model_name}")
                    else:
                        print(f"[DEBUG] Skipping - prefix doesn't end with model")
                        continue
                else:
                    tokens = prefix.split("-")
                    if len(tokens) < 2:
                        print("[DEBUG] Skipping - not enough tokens")
                        continue
                    model_name = tokens[-1]
                    gt_id = "-".join(tokens[:-1])
                    print(f"[DEBUG] Found gt_id: {gt_id}, model: {model_name}")

            if not gt_id or not model_name:
                print("[DEBUG] Skipping - missing gt_id or model_name")
                continue

            case_id = item.name
            print(f"[DEBUG] Case ID: {case_id}")

            if self.cli_config.task == "modification_gen":
                # For modification task, we need both base and target GT files
                if self.cli_config.variant:
                    gt_base_dir = gt_base_dir / self.cli_config.variant
                
                gt_base_img_path = gt_base_dir / self.app_config.filenames.modification_base_image.format(gt_id=gt_id)
                gt_base_json_path = gt_base_dir / self.app_config.filenames.modification_base_json.format(gt_id=gt_id)
                gt_target_img_path = gt_base_dir / self.app_config.filenames.modification_target_image.format(gt_id=gt_id)
                gt_target_json_path = gt_base_dir / self.app_config.filenames.modification_target_json.format(gt_id=gt_id)
                
                print(f"[DEBUG] GT paths (modification):")
                print(f"- base img: {gt_base_img_path}")
                print(f"- base json: {gt_base_json_path}")
                print(f"- target img: {gt_target_img_path}")
                print(f"- target json: {gt_target_json_path}")

                if not gt_base_json_path.exists() or not gt_target_json_path.exists():
                    print("[DEBUG] Skipping - GT json not found (base or target)")
                    continue
                
                gt_img_path = gt_target_img_path
                gt_json_path = gt_target_json_path
            else:
                # For replication task, we only need one GT file
                gt_img_path = gt_base_dir / self.app_config.filenames.gt_image.format(gt_id=gt_id)
                gt_json_path = gt_base_dir / self.app_config.filenames.gt_json.format(gt_id=gt_id)
                print(f"[DEBUG] GT paths:")
                print(f"- img: {gt_img_path}")
                print(f"- json: {gt_json_path}")

                if not gt_json_path.exists():
                    print("[DEBUG] Skipping - GT json not found")
                    continue
            
            # Main result
            gen_img_path = item / self.app_config.filenames.gen_image.format(case_id=case_id)
            gen_json_path = item / self.app_config.filenames.gen_json.format(case_id=case_id)
            print(f"[DEBUG] Generated paths:")
            print(f"- img: {gen_img_path}")
            print(f"- json: {gen_json_path}")

            if gen_img_path.exists() and gen_json_path.exists():
                print("[DEBUG] Adding case to list")
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
                    case.base_gt_img_path = gt_base_img_path if gt_base_img_path.exists() else None
                    case.base_gt_json_path = gt_base_json_path
                
                cases.append(case)

            # Snapshots
            if self.cli_config.eval_snapshots:
                snapshots_dir = item / self.app_config.filenames.snapshots_dir
                if snapshots_dir.is_dir():
                    print(f"[DEBUG] Processing snapshots in: {snapshots_dir}")
                    glob_pattern = self.app_config.filenames.snapshot_image_glob.format(case_id=case_id)
                    for snapshot_img_path in sorted(snapshots_dir.glob(glob_pattern)):
                        snapshot_stem = snapshot_img_path.stem
                        try:
                            snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                            print(f"[DEBUG] Found snapshot {snapshot_num}")
                        except (ValueError, IndexError):
                            print(f"[DEBUG] Invalid snapshot name: {snapshot_stem}")
                            continue
                
                        snapshot_json_path = snapshots_dir / self.app_config.filenames.snapshot_json.format(snapshot_stem=snapshot_stem)
                        if snapshot_json_path.exists():
                            print(f"[DEBUG] Adding snapshot {snapshot_num} to list")
                            cases.append(EvaluationCase(
                                case_id=case_id, gt_id=gt_id, model_name=model_name, snapshot_num=snapshot_num,
                                gt_img_path=gt_img_path if gt_img_path.exists() else None,
                                gen_img_path=snapshot_img_path,
                                gt_json_path=gt_json_path,
                                gen_json_path=snapshot_json_path
                            ))

        print(f"\n[DEBUG] Total cases collected: {len(cases)}")
        return cases

    def _process_case(self, case: EvaluationCase):
        """Compute metrics for a single evaluation case."""
        if case.is_modification:
            # For modification task, compute both base and target metrics
            base_metric = self._compute_metrics(case, is_base=True)
            target_metric = self._compute_metrics(case, is_base=False)
            
            # Store both metrics in basetarget results
            basetarget_metrics = {
                "id": case.gt_id,
                "case_id": case.case_id,
                "model": case.model_name,
                "snapshot_num": case.snapshot_num,
                "base_metrics": base_metric,
                "target_metrics": target_metric
            }
            
            # Compute delta metrics for main results
            metric = {}
            for key in base_metric:
                if isinstance(base_metric[key], (int, float)) and isinstance(target_metric[key], (int, float)):
                    metric[key] = target_metric[key] - base_metric[key]
                else:
                    metric[key] = target_metric[key]  # For non-numeric metrics, use target value
            
            metric.update({
                "id": case.gt_id,
                "case_id": case.case_id,
                "model": case.model_name,
                "snapshot_num": case.snapshot_num
            })
            
            # Save basetarget metrics
            self._save_basetarget_results(basetarget_metrics)
        else:
            # For replication task, compute metrics normally
            metric = self._compute_metrics(case)
            metric.update({
                "id": case.gt_id,
                "case_id": case.case_id,
                "model": case.model_name,
                "snapshot_num": case.snapshot_num
            })
        
        self.results.append(metric)
        self.new_processed_count += 1

        # Periodic checkpoint
        if self.new_processed_count % 10 == 0:
            self._save_results()

    def _compute_metrics(self, case: EvaluationCase, is_base: bool = False) -> Dict[str, Any]:
        """Compute metrics for a case, optionally using base GT for modification task."""
        metric = {}
        
        for name, func in self.metric_funcs.items():
            if self._should_skip_metric(name, metric, case.gt_img_path):
                continue

            try:
                if case.is_modification and is_base:
                    kwargs = {
                        "gt_img": str(case.base_gt_img_path) if case.base_gt_img_path else "",
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
                    kwargs.update({
                        "out_dir": str(self.saliency_vis_dir) if self.cli_config.save_saliency_vis else None,
                        "case_id": case.case_id,
                        "snapshot_num": case.snapshot_num,
                    })
                else:
                    kwargs.update({"out_dir": str(self.output_dir), "case_id": case.case_id})
                
                try:
                    result = func(**kwargs)
                except TypeError:
                    del kwargs["out_dir"], kwargs["case_id"]
                    if "snapshot_num" in kwargs: del kwargs["snapshot_num"]
                    result = func(**kwargs)
                
                metric.update(result)

            except Exception as e:
                metric[f"{name}_error"] = str(e)
        
        return metric

    def _should_skip_metric(self, name: str, metric: Dict, gt_img_path: Optional[Path]) -> bool:
        """Check if a metric computation should be skipped based on config and state."""
        if gt_img_path is None and name in {"ssim", "semantic_match", "visual_saliency"}:
            return True
        if self.cli_config.skip_visual_saliency and name == "visual_saliency":
            if self.app_config.metrics.optional_required_metrics['visual_saliency'] not in metric:
                print(f"[Warning] visual_saliency metrics not found for {metric['id']} (snap: {metric['snapshot_num']}) - skipping.")
            return True
        if self.cli_config.skip_blip and name == "semantic_match":
            if self.app_config.metrics.optional_required_metrics['semantic_match'] not in metric:
                print(f"[Warning] semantic_match not found for {metric['id']} (snap: {metric['snapshot_num']}) - skipping.")
            return True
        
        # Check if already computed
        is_blip_present = self.app_config.metrics.optional_required_metrics['semantic_match'] in metric
        is_vis_sal_present = self.app_config.metrics.optional_required_metrics['visual_saliency'] in metric
        if name == "semantic_match" and is_blip_present: return True
        if name == "visual_saliency" and is_vis_sal_present: return True
        if name not in {"semantic_match", "visual_saliency"} and name in metric:
            return True
            
        return False

    def _is_result_complete(self, result: Dict[str, Any]) -> bool:
        """Check if a result dict contains all required metrics."""
        required = set(self.app_config.metrics.required_metrics)
        if not self.cli_config.skip_blip:
            required.add(self.app_config.metrics.optional_required_metrics['semantic_match'])
        if not self.cli_config.skip_visual_saliency:
            required.add(self.app_config.metrics.optional_required_metrics['visual_saliency'])
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
                result_path=str(result_path),
                case_id=result["case_id"]
            )
            result.update(tool_metrics)
    
    def _get_result_path_from_case_id(self, case_id: str) -> Optional[Path]:
        """Helper to find the full result path for a given case_id."""
        result_path = self.results_dir / case_id
        if result_path.exists():
            return result_path
        return None

    def _calculate_aggregate_metrics(self):
        """(DEPRECATED) This method is now replaced by _restructure_result."""
        pass

    def _restructure_result(self, flat_result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a flat metric dictionary to the new hierarchical schema."""
        
        # Helper to safely get a value
        def get(key, default=None):
            return flat_result.get(key, default)

        return {
            "id": get("id"),
            "model": get("model"),
            "snapshot_num": get("snapshot_num") if get("snapshot_num") is not None else None,

            "perceptual_similarity": {
                "feature_level": {
                    "ssim": get("ssim"),
                    "rmse": get("rmse"),
                    "psnr": get("psnr")
                },
                "pattern_level": {
                    "saliency_sim": get("saliency_sim"),
                    "saliency_cc": get("saliency_cc"),
                    "saliency_kl": get("saliency_kl"),
                    "lpips": get("lpips"),
                },
                "object_level": {
                    "blip_caption_similarity": get("blip_caption_similarity"),
                    "clip_caption_similarity": get("clip_caption_similarity"),  # TBD
                    "generated_caption": get("generated_caption"),
                    "ground_truth_caption": get("ground_truth_caption")
                }
            },

            "component_similarity": {
                "color_match_score": get("color_match_score"),      # TBD
                "text_match_score": get("text_match_score"),        # TBD
                "element_position_iou": get("element_position_iou"),
                "block_composition_f1": get("block_composition_f1") # TBD
            },

            "tool_usage_metrics": {
                "step_count": get("step_count"),
                "tool_call_count": get("tool_call_count"),
                "tool_step_count": get("step_count"),  # Re-alias for clarity
                "tool_efficiency": get("tool_efficiency"),
                "unique_tool_count": get("unique_tool_count"),
                "unique_tool_list": get("unique_tool_list"),
                "tool_call_trace": get("tool_call_trace"),
                "human_hit_rate": get("human_hit_rate")
            }
        }

    def _load_previous_results(self) -> List[Dict[str, any]]:
        """Load previous results from the output JSON file if it exists."""
        if self.output_path.exists():
            print(f"Loading previous results from: {self.output_path}")
            with self.output_path.open("r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    for item in data:
                        item.setdefault("snapshot_num", None)
                    print(f"Loaded {len(data)} previous results.")
                    return data
                except json.JSONDecodeError:
                    print("[Warning] Could not decode existing results file. Starting fresh.")
        return []
        
    def _save_results(self, final: bool = False):
        """Save the current results list to the output file."""
        if final:
            final_results = []
            processed_keys = {(r["id"], r.get("snapshot_num")) for r in self.results}
            final_results.extend(self.results)
            for prev_res in self.previous_results:
                if (prev_res["id"], prev_res.get("snapshot_num")) not in processed_keys:
                    final_results.append(prev_res)
            self.results = final_results

        def _json_default(o):
            try:
                import numpy as np
                if isinstance(o, (np.integer,)): return int(o)
                if isinstance(o, (np.floating,)): return float(o)
                if isinstance(o, np.ndarray): return o.tolist()
            except ModuleNotFoundError:
                pass
            raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")

        with self.output_path.open("w", encoding="utf-8") as f:
            json.dump(self.results, f, indent=2, ensure_ascii=False, default=_json_default)
        
        if not final:
            print(f"... Checkpoint saved to {self.output_path}")

    def _save_basetarget_results(self, metric: Dict[str, Any]):
        """Save base and target metrics for modification task."""
        if not hasattr(self, 'basetarget_results'):
            self.basetarget_results = []
            if self.modification_basetarget_path.exists():
                with self.modification_basetarget_path.open("r", encoding="utf-8") as f:
                    try:
                        self.basetarget_results = json.load(f)
                    except json.JSONDecodeError:
                        pass

        self.basetarget_results.append(metric)
        with self.modification_basetarget_path.open("w", encoding="utf-8") as f:
            json.dump(self.basetarget_results, f, indent=2, ensure_ascii=False)

    def _generate_visualizations(self):
        """Create and save model-wise metric plots."""
        if plt is None:
            print("[VIS] matplotlib not available – skipping visualization.")
            return
        if not self.results:
            print("[VIS] No results to visualize.")
            return

        vis_dir = self.output_dir / self.app_config.paths.vis_results_dir.format(output_dir=self.output_dir)
        vis_dir.mkdir(exist_ok=True)

        metric_data: DefaultDict[str, DefaultDict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
        skip_keys = set(self.app_config.visualization.skip_keys)

        for entry in self.results:
            model_name = entry.get("model", "unknown")
            for k, v in entry.items():
                if k in skip_keys or k.endswith("_error"):
                    continue
                if isinstance(v, (int, float)):
                    metric_data[k][model_name].append(float(v))
        
        for metric, model_dict in metric_data.items():
            models = sorted(model_dict.keys())
            if not models: continue

            # Bar plot (mean)
            means = [sum(model_dict[m]) / len(model_dict[m]) for m in models]
            plt.figure(figsize=(max(6, len(models) * 1.2), 4))
            plt.bar(models, means, color="skyblue")
            plt.ylabel(metric)
            plt.title(f"Mean {metric} per model ({self.cli_config.variant})")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            plt.savefig(vis_dir / self.app_config.filenames.vis_bar_plot.format(metric=metric), dpi=self.app_config.visualization.dpi)
            plt.close()

            # Box plot (distribution)
            data = [model_dict[m] for m in models]
            plt.figure(figsize=(max(6, len(models) * 1.2), 4))
            plt.boxplot(data, labels=models, vert=True, patch_artist=True)
            plt.ylabel(metric)
            plt.title(f"{metric} distribution per model ({self.cli_config.variant})")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            plt.savefig(vis_dir / self.app_config.filenames.vis_box_plot.format(metric=metric), dpi=self.app_config.visualization.dpi)
            plt.close()
        
        print(f"[VIS] Saved visualization plots → {vis_dir}")


def main():
    """Main entry point for the evaluation script."""
    parser = argparse.ArgumentParser(
        description="Run evaluation metrics for generation samples.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    # --- Core Arguments ---
    parser.add_argument("--base_dir", type=str, default="dataset", help="Base dataset directory containing 'benchmarks' and 'results'.")
    parser.add_argument("--task", type=str, required=True, choices=["replication_gen", "modification_gen"], help="Task to evaluate (replication_gen or modification_gen).")
    parser.add_argument("--variant", type=str, default=None, help="Task variant to evaluate (required for replication_gen, optional for modification_gen).")
    
    # --- Filtering Arguments ---
    parser.add_argument("--model", type=str, default=None, help="Model name to filter (e.g., gpt-4o). If omitted, evaluate all models.")
    parser.add_argument("--ids", type=str, default=None, help="Comma-separated list of GT ids to evaluate (e.g., gid6-27,gid34-35).")

    # --- Feature Flags ---
    parser.add_argument("--vis", action="store_true", help="Generate visualization plots (bar / box) grouped by model.")
    parser.add_argument("--eval_snapshots", action="store_true", help="Evaluate snapshots in addition to the final result.")
    parser.add_argument("--save_saliency_vis", action="store_true", help="Save visual saliency visualizations.")

    # --- Caching/Speed Arguments ---
    parser.add_argument("--skip_blip", action="store_true", help="Skip BLIP semantic similarity metric to speed up evaluation.")
    parser.add_argument("--skip_visual_saliency", action="store_true", help="Skip Visual Saliency metric to speed up evaluation.")
    parser.add_argument("--skip_all", action="store_true", help="Skip evaluation for samples where all metrics are already present in results file.")
    
    args = parser.parse_args()
    
    if args.task == "replication_gen" and not args.variant:
        parser.error("--variant is required for replication_gen task")

    if args.ids:
        args.ids = [s.strip() for s in args.ids.split(",") if s.strip()]

    pipeline = EvaluationPipeline(cli_config=args)
    pipeline.run()


if __name__ == "__main__":
    main() 