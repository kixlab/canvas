import os
import json
from pathlib import Path
from typing import List, Tuple, Dict, Optional

import pkgutil
import importlib

from evaluation.metrics import get_metrics


def _discover_metrics():
    """Dynamically import all submodules under evaluation.metrics to register metrics."""
    import evaluation.metrics as _met_pkg
    for info in pkgutil.iter_modules(_met_pkg.__path__):
        importlib.import_module(f"{_met_pkg.__name__}.{info.name}")

auto_metrics_discovered = False


def _collect_generation_pairs(base_dir: Path, model: str = "gpt-4o", variant: str = "image_only") -> List[Tuple[str, Path, Path, Path, Path]]:
    """Collect GT / GEN file pairs for generation task.

    Returns:
        List of (id, gt_img, gen_img, gt_json, gen_json)
    """
    gt_dir = base_dir / "benchmarks" / "generation_gt"
    results_dir = base_dir / "results" / "generation_gen" / model / variant

    if not results_dir.exists():
        raise FileNotFoundError(f"Results dir not found: {results_dir}")

    pairs: List[Tuple[str, Path, Path, Path, Path]] = []

    for item in results_dir.iterdir():
        if not item.is_dir():
            continue
        # folder name pattern: gid6-27-gpt-4o-image_only
        parts = item.name.split(f"-{model}")
        if not parts:
            continue
        gt_id = parts[0]

        gt_img = gt_dir / f"{gt_id}.png"
        gt_json = gt_dir / f"{gt_id}.json"

        # generated files inside folder
        gen_img = item / f"{item.name}.png"
        gen_json_candidates = [
            item / f"{item.name}-figma-hierarchy.json",
            item / f"{item.name}.json",
        ]
        gen_json = next((p for p in gen_json_candidates if p.exists()), None)

        if not (gt_img.exists() and gt_json.exists() and gen_img.exists() and gen_json and gen_json.exists()):
            # skip incomplete pairs
            continue

        pairs.append((gt_id, gt_img, gen_img, gt_json, gen_json))
    return pairs


def run_generation_evaluation(
    base_dir: str,
    model: str = "gpt-4o",
    variant: str = "image_only",
    out_path: Optional[str] = None,
    ids: Optional[List[str]] = None,
) -> List[Dict[str, any]]:
    """Run evaluation for generation task.

    Args:
        base_dir: Dataset base directory.
        model: Model name (folder under results/generation_gen).
        variant: Variant name (sub-folder under model).
        out_path: Optional path to save aggregated results (JSON).
        ids: Optional list of specific GT ids (e.g., ["gid6-27"]) to evaluate. If None, evaluate all.
    Returns:
        List of metric dictionaries.
    """
    base_path = Path(base_dir).expanduser()
    if not base_path.is_absolute():
        base_path = (Path.cwd() / base_path).resolve()

    if not base_path.exists():
        for parent in Path(__file__).resolve().parents:
            candidate = parent / base_dir
            if candidate.exists():
                base_path = candidate.resolve()
                break
    if not base_path.exists():
        raise FileNotFoundError(f"Base directory not found: {base_dir}")

    global auto_metrics_discovered
    if not auto_metrics_discovered:
        _discover_metrics()
        auto_metrics_discovered = True
    metric_funcs = get_metrics()

    pairs = _collect_generation_pairs(base_path, model, variant)

    if ids:
        ids_set = set(ids)
        pairs = [p for p in pairs if p[0] in ids_set]
        if not pairs:
            raise ValueError(f"No matching samples found for ids: {ids}")

    results: List[Dict[str, any]] = []

    output_vis_dir = Path(base_path) / "eval_outputs"
    output_vis_dir.mkdir(parents=True, exist_ok=True)

    for gt_id, gt_img, gen_img, gt_json, gen_json in pairs:
        metric: Dict[str, any] = {"id": gt_id}

        case_id = gt_id
        for name, func in metric_funcs.items():
            try:
                metric.update(func(
                    str(gt_img), str(gen_img), str(gt_json), str(gen_json),
                    out_dir=str(output_vis_dir), case_id=case_id,
                ))
            except TypeError:
                metric.update(func(str(gt_img), str(gen_img), str(gt_json), str(gen_json)))
            except Exception as e:
                metric[f"{name}_error"] = str(e)
        results.append(metric)

    for metric in results:
        if all(k in metric for k in ("canvas_fill_ratio", "pixel_fidelity", "semantic_match")):
            metric["visual_completeness"] = round(
                (metric["canvas_fill_ratio"] + metric["pixel_fidelity"] + metric.get("semantic_match", 0.0)) / 3,
                4,
            )

        if all(k in metric for k in ("element_count_ratio", "layout_overlap", "alignment_match", "hierarchy_type_sim")):
            metric["struct_completeness"] = round(
                (
                    metric["element_count_ratio"]
                    + metric["layout_overlap"]
                    + metric["alignment_match"]
                    + metric["hierarchy_type_sim"]
                )
                / 4,
                4,
            )

    if out_path:
        out_file = Path(out_path).expanduser()
        def _json_default(o):  # noqa: ANN001
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
            return str(o)

        with out_file.open("w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False, default=_json_default)
        print(f"Saved results → {out_file}")

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run evaluation metrics for generation samples.")
    parser.add_argument("--base_dir", type=str, default="dataset_sample", help="Base dataset directory containing 'benchmarks' and 'results'.")
    parser.add_argument("--model", type=str, default="gpt-4o", help="Model name inside results directory.")
    parser.add_argument("--variant", type=str, default="image_only", help="Variant directory inside model results.")
    parser.add_argument("--out", type=str, default="evaluation_results.json", help="Path to save aggregated results (JSON).")
    parser.add_argument("--ids", type=str, default=None, help="Comma separated list of GT ids to evaluate (e.g., gid6-27,gid34-35).")

    args = parser.parse_args()

    ids_list = [s.strip() for s in args.ids.split(",") if s.strip()] if args.ids else None

    run_generation_evaluation(
        base_dir=args.base_dir,
        model=args.model,
        variant=args.variant,
        out_path=args.out,
        ids=ids_list,
    ) 