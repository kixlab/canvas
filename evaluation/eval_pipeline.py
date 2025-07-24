# ruff: noqa: E501

import os
import json
from pathlib import Path
from typing import List, Tuple, Dict, Optional, DefaultDict, Any
from dataclasses import dataclass, field
import argparse

import pkgutil
import importlib
import matplotlib.pyplot as plt


from collections import defaultdict

from evaluation.metrics import get_metrics


PREVIOUS_RESULTS_FILE = "evaluation_results.json"

def _discover_metrics():
    """Dynamically import all submodules under evaluation.metrics to register metrics."""
    import evaluation.metrics as _met_pkg
    for info in pkgutil.iter_modules(_met_pkg.__path__):
        importlib.import_module(f"{_met_pkg.__name__}.{info.name}")

auto_metrics_discovered = False


# ──────────────────────────────────────────────────────────────────────────────
# Helper: extract model name from case directory

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
    gt_img_path: Optional[Path]
    gen_img_path: Path
    gt_json_path: Path
    gen_json_path: Path
    snapshot_num: Optional[int] = None
    metric_results: Dict[str, Any] = field(default_factory=dict)


class EvaluationPipeline:
    """Orchestrates the evaluation process for generation tasks."""

    def __init__(self, config: argparse.Namespace):
        """Initialize the pipeline with configuration."""
        self.config = config
        self._setup_paths()
        self._discover_and_load_metrics()

        self.previous_results = self._load_previous_results()
        self.prev_by_key = {
            (r.get("id"), r.get("snapshot_num")): r for r in self.previous_results
        }
        self.results: List[Dict[str, any]] = self.previous_results.copy() if config.skip_all else []
        self.new_processed_count = 0

    def _setup_paths(self):
        """Configure input and output directories based on config."""
        self.base_dir = Path(self.config.base_dir).expanduser().resolve()
        if not self.base_dir.exists():
            for parent in Path(__file__).resolve().parents:
                candidate = parent / self.config.base_dir
                if candidate.exists():
                    self.base_dir = candidate.resolve()
                    break
        if not self.base_dir.exists():
            raise FileNotFoundError(f"Base directory not found: {self.config.base_dir}")

        self.gt_dir = self.base_dir / "benchmarks" / "replication_gt"
        self.results_dir = self.base_dir / "results" / self.config.task / self.config.variant

        self.output_dir = self.base_dir / "eval_outputs" / self.config.task / self.config.variant
        self.output_dir.mkdir(parents=True, exist_ok=True)

        if self.config.eval_snapshots:
            self.output_path = self.output_dir / "evaluation_results_with_snapshots.json"
        else:
            self.output_path = self.output_dir / "evaluation_results.json"

        self.saliency_vis_dir = self.output_dir / "saliency_visualizations"
        if self.config.save_saliency_vis:
            self.saliency_vis_dir.mkdir(exist_ok=True)

    def _discover_and_load_metrics(self):
        """Discover and load all available metric functions."""
        global auto_metrics_discovered
        if not auto_metrics_discovered:
            _discover_metrics()
            auto_metrics_discovered = True
        self.metric_funcs = get_metrics()
        self.tool_metric_func = self.metric_funcs.pop("tool", None)

    def run(self):
        """Execute the full evaluation pipeline."""
        cases = self._collect_evaluation_cases()

        if self.config.ids:
            ids_set = set(self.config.ids)
            cases = [c for c in cases if c.gt_id in ids_set]
            if not cases:
                raise ValueError(f"No matching samples found for ids: {self.config.ids}")

        for case in cases:
            self._process_case(case)

        self._run_tool_metrics()
        self._calculate_aggregate_metrics()
        self._save_results(final=True)

        if self.config.vis:
            self._generate_visualizations()

        print(f"\nEvaluation complete. Results saved to:\n{self.output_path}")
        return self.results

    def _collect_evaluation_cases(self) -> List[EvaluationCase]:
        """Collect all GT/GEN pairs for evaluation."""
        if not self.results_dir.exists():
            raise FileNotFoundError(f"Results directory not found: {self.results_dir}")

        cases: List[EvaluationCase] = []
        for item in self.results_dir.iterdir():
            if not item.is_dir() or not item.name.endswith(f"-{self.config.variant}"):
                continue
            if self.config.model and f"-{self.config.model}-" not in f"{item.name}-":
                continue

            prefix = item.name[: -(len(self.config.variant) + 1)]
            tokens = prefix.split("-")
            if len(tokens) < 3:
                continue

            gt_id = "-".join(tokens[0:2])
            model_name = "-".join(tokens[2:])
            case_id = item.name

            gt_img_path = self.gt_dir / f"{gt_id}.png"
            gt_json_path = self.gt_dir / f"{gt_id}.json"

            if not gt_json_path.exists():
                continue
            
            # Main result
            gen_img_path = item / f"{case_id}-canvas.png"
            gen_json_path = item / f"{case_id}-json-structure.json"
            if gen_img_path.exists() and gen_json_path.exists():
                cases.append(EvaluationCase(
                    case_id=case_id, gt_id=gt_id, model_name=model_name, snapshot_num=None,
                    gt_img_path=gt_img_path if gt_img_path.exists() else None,
                    gen_img_path=gen_img_path,
                    gt_json_path=gt_json_path,
                    gen_json_path=gen_json_path,
                ))

            # Snapshots
            if self.config.eval_snapshots:
                snapshots_dir = item / "snapshots"
                if snapshots_dir.is_dir():
                    for snapshot_img_path in sorted(snapshots_dir.glob(f"{case_id}-snapshot-*.png")):
                        snapshot_stem = snapshot_img_path.stem
                        try:
                            snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                        except (ValueError, IndexError):
                            continue
                
                        snapshot_json_path = snapshots_dir / f"{snapshot_stem}-structure.json"
                        if snapshot_json_path.exists():
                            cases.append(EvaluationCase(
                                case_id=case_id, gt_id=gt_id, model_name=model_name, snapshot_num=snapshot_num,
                                gt_img_path=gt_img_path if gt_img_path.exists() else None,
                                gen_img_path=snapshot_img_path,
                                gt_json_path=gt_json_path,
                                gen_json_path=snapshot_json_path
                            ))
        return cases

    def _process_case(self, case: EvaluationCase):
        """Compute metrics for a single evaluation case."""
        metric = self.prev_by_key.get((case.gt_id, case.snapshot_num), {}).copy()
        metric.update({"id": case.gt_id, "model": case.model_name, "snapshot_num": case.snapshot_num})
        
        metric.setdefault("snapshot_num", None)

        if self.config.skip_all and self._is_result_complete(metric):
            return

        for name, func in self.metric_funcs.items():
            if self._should_skip_metric(name, metric, case.gt_img_path):
                continue

            try:
                kwargs = {
                    "gt_img": str(case.gt_img_path) if case.gt_img_path else "",
                    "gen_img": str(case.gen_img_path),
                    "gt_json": str(case.gt_json_path),
                    "gen_json": str(case.gen_json_path),
                }
                if name == "visual_saliency":
                    kwargs.update({
                        "out_dir": str(self.saliency_vis_dir) if self.config.save_saliency_vis else None,
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
        
        self.results.append(metric)
        self.new_processed_count += 1

        # Periodic checkpoint
        if self.new_processed_count % 10 == 0:
            self._save_results()

    def _should_skip_metric(self, name: str, metric: Dict, gt_img_path: Optional[Path]) -> bool:
        """Check if a metric computation should be skipped based on config and state."""
        if gt_img_path is None and name in {"ssim", "semantic_match", "visual_saliency"}:
            return True
        if self.config.skip_visual_saliency and name == "visual_saliency":
            if "visual_saliency_cc" not in metric:
                print(f"[Warning] visual_saliency metrics not found for {metric['id']} (snap: {metric['snapshot_num']}) - skipping.")
            return True
        if self.config.skip_blip and name == "semantic_match":
            if "semantic_match" not in metric:
                print(f"[Warning] semantic_match not found for {metric['id']} (snap: {metric['snapshot_num']}) - skipping.")
            return True
        
        is_blip_present = "semantic_match" in metric
        is_vis_sal_present = "visual_saliency_cc" in metric
        if name == "semantic_match" and is_blip_present: return True
        if name == "visual_saliency" and is_vis_sal_present: return True
        if name not in {"semantic_match", "visual_saliency"} and name in metric:
            return True
            
        return False

    def _is_result_complete(self, result: Dict[str, Any]) -> bool:
        """Check if a result dict contains all required metrics."""
        required = {"ssim", "element_count_ratio", "layout_overlap", "alignment_f1"}
        if not self.config.skip_blip: required.add("semantic_match")
        if not self.config.skip_visual_saliency: required.add("visual_saliency_cc")
        return all(key in result for key in required)

    def _run_tool_metrics(self):
        """Run tool usage metrics on all processed results."""
        if not self.tool_metric_func:
            return
        for metric in self.results:
            result_path = self.results_dir / metric["id"]
            try:
                tool_metrics = self.tool_metric_func(str(result_path))
                metric.update(tool_metrics)
            except Exception as e:
                metric["tool_error"] = str(e)

    def _calculate_aggregate_metrics(self):
        """Calculate composite scores like visual and structural completeness."""
        for metric in self.results:
            try:
                if all(k in metric for k in ("canvas_fill_ratio", "ssim", "semantic_match")) and \
                   all(metric.get(k) is not None for k in ("canvas_fill_ratio", "ssim", "semantic_match")):
                    metric["visual_completeness"] = round(
                        (float(metric["canvas_fill_ratio"]) + float(metric["ssim"]) + float(metric["semantic_match"])) / 3, 4
                    )
            except (TypeError, ValueError):
                metric.setdefault("visual_completeness", None)

            try:
                if all(k in metric for k in ("element_count_ratio", "layout_overlap", "alignment_f1")) and \
                   all(metric.get(k) is not None for k in ("element_count_ratio", "layout_overlap", "alignment_f1")):
                    metric["struct_completeness"] = round(
                        (float(metric["element_count_ratio"]) + float(metric["layout_overlap"]) + float(metric["alignment_f1"])) / 3, 3
                    )
            except (TypeError, ValueError):
                metric.setdefault("struct_completeness", None)

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

    def _generate_visualizations(self):
        """Create and save model-wise metric plots."""
        if plt is None:
            print("[VIS] matplotlib not available – skipping visualization.")
            return
        if not self.results:
            print("[VIS] No results to visualize.")
            return

        vis_dir = self.output_dir / "evaluation_results_vis"
        vis_dir.mkdir(exist_ok=True)

        metric_data: DefaultDict[str, DefaultDict[str, List[float]]] = defaultdict(lambda: defaultdict(list))
        skip_keys = {"id", "model", "gt_caption", "gen_caption", "snapshot_num"}

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
            plt.title(f"Mean {metric} per model ({self.config.variant})")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            plt.savefig(vis_dir / f"{metric}_bar.png", dpi=150)
            plt.close()

            # Box plot (distribution)
            data = [model_dict[m] for m in models]
            plt.figure(figsize=(max(6, len(models) * 1.2), 4))
            plt.boxplot(data, labels=models, vert=True, patch_artist=True)
            plt.ylabel(metric)
            plt.title(f"{metric} distribution per model ({self.config.variant})")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            plt.savefig(vis_dir / f"{metric}_box.png", dpi=150)
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
    parser.add_argument("--task", type=str, required=True, help="Task to evaluate (e.g., 'replication_gen').")
    parser.add_argument("--variant", type=str, required=True, help="Task variant to evaluate (e.g., 'image_only').")
    
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
    if args.ids:
        args.ids = [s.strip() for s in args.ids.split(",") if s.strip()]

    pipeline = EvaluationPipeline(config=args)
    pipeline.run()


if __name__ == "__main__":
    main() 