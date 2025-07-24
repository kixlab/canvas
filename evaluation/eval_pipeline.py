# ruff: noqa: E501

import os
import json
from pathlib import Path
from typing import List, Tuple, Dict, Optional, DefaultDict, Any

import pkgutil
import importlib

# External plotting libs are optional – code falls back gracefully if missing.
try:
    import matplotlib.pyplot as plt  # type: ignore
except ModuleNotFoundError:  # pragma: no cover – plotting optional
    plt = None  # type: ignore

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

    prefix = case_id[: -(len(variant) + 1)]  # remove '-<variant>'
    tokens = prefix.split("-")
    if len(tokens) < 3:
        return "unknown"
    # First two tokens are gid and screen index, remainder is model (could contain '-')
    return "-".join(tokens[2:])


def _generate_visualizations(results: List[Dict[str, any]], variant: str, out_file: Optional[Path] = None) -> None:
    """Create model-wise metric plots (bar & box) and save under `evaluation_results_vis/`.

    Generates one bar plot (mean per model) and one box plot (distribution) for each metric.
    """
    if plt is None:  # Matplotlib not installed
        print("[VIS] matplotlib not available – skipping visualization.")
        return

    if not results:
        print("[VIS] No results to visualize.")
        return

    # Determine output directory
    if out_file is not None:
        root = out_file.parent
    else:
        root = Path.cwd()

    vis_dir = root / "evaluation_results_vis"
    vis_dir.mkdir(parents=True, exist_ok=True)

    # Gather data: metric -> model -> list[values]
    metric_data: DefaultDict[str, DefaultDict[str, List[float]]] = defaultdict(lambda: defaultdict(list))  # type: ignore

    # Metrics to skip
    skip_keys = {
        "id",
        "model",
        "gt_caption",
        "gen_caption",
    }

    # Infer variant from first result id if possible (fallback to arg)
    for entry in results:
        model_name = entry.get("model", _extract_model_from_case(entry["id"], variant))
        for k, v in entry.items():
            if k in skip_keys or k.endswith("_error"):
                continue
            if isinstance(v, (int, float)):
                metric_data[k][model_name].append(float(v))

    # Generate plots per metric
    for metric, model_dict in metric_data.items():
        models = sorted(model_dict.keys())
        if not models:
            continue

        # Bar plot (mean)
        means = [sum(model_dict[m]) / len(model_dict[m]) for m in models]
        plt.figure(figsize=(max(6, len(models) * 1.2), 4))
        plt.bar(models, means, color="skyblue")
        plt.ylabel(metric)
        plt.title(f"Mean {metric} per model ({variant})")
        plt.xticks(rotation=45, ha="right")
        plt.tight_layout()
        plt.savefig(vis_dir / f"{metric}_bar.png", dpi=150)
        plt.close()

        # Box plot (distribution)
        data = [model_dict[m] for m in models]
        plt.figure(figsize=(max(6, len(models) * 1.2), 4))
        plt.boxplot(data, labels=models, vert=True, patch_artist=True)
        plt.ylabel(metric)
        plt.title(f"{metric} distribution per model ({variant})")
        plt.xticks(rotation=45, ha="right")
        plt.tight_layout()
        plt.savefig(vis_dir / f"{metric}_box.png", dpi=150)
        plt.close()

    print(f"[VIS] Saved visualization plots → {vis_dir}")


def _load_previous_results(out_path: str) -> List[Dict[str, any]]:
    """Load previous BLIP scores and captions from the evaluation results JSON file."""
    results_path = Path(out_path).expanduser()
    print(f"Loading previous results from: {results_path}")  # Debugging statement
    if results_path.exists():
        with results_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            # Make sure snapshot_num is present, default to None if not
            for item in data:
                item.setdefault("snapshot_num", None)
            print(f"Loaded previous results: {len(data)} entries")  # Debugging statement
            return data
    print("No previous results found.")  # Debugging statement
    return []


# region ────────────────────────────────────────────────────────────────────────
# NOTE: Directory naming pattern (see dataset/results/replication_gen/<variant>):
#   <gt_id>-<model>-<variant>/
#   e.g. gid6-27-gpt-4o-image_only/
#
# Parsing logic:
#   • gt_id  : first two hyphen-separated tokens (e.g. gid6-27)
#   • model  : tokens between gt_id and variant (may itself contain '-')
#
# If `model_filter` is provided, only folders that include that exact model
# segment will be kept. If `model_filter` is None, **all** models are included.
# endregion

def _collect_generation_pairs(
    base_dir: Path,
    variant: str = "image_only",
    model_filter: Optional[str] = None,
    eval_snapshots: bool = False,
) -> List[Tuple[str, str, str, Optional[int], Path, Path, Path, Path]]:
    """Collect GT / GEN file pairs for generation task.

    Returns:
        List of (case_id, gt_id, model_name, snapshot_num, gt_img, gen_img, gt_json, gen_json)
    """
    gt_dir = base_dir / "benchmarks" / "replication_gt"
    # NOTE: The directory layout has changed (see dataset/results/replication_gen/image_only/replication_gen_readme.md)
    # Now the structure is:
    #   <base_dir>/results/replication_gen/<variant>/<case_dirs>
    # There is **no** per-model sub-folder anymore – the model name is embedded in each case directory name.

    results_dir = base_dir / "results" / "replication_gen" / variant

    if not results_dir.exists():
        raise FileNotFoundError(
            (
                "Results dir not found: {path}.\n"  # noqa: E501
                "Expected layout: <base>/results/replication_gen/<variant>/<gid>-<screen>-<model>-<variant>/"
            ).format(path=results_dir)
        )

    pairs: List[Tuple[str, str, str, Optional[int], Path, Path, Path, Path]] = []  # (case_id, gt_id, model, snapshot_num, gt_img, gen_img, gt_json, gen_json)

    for item in results_dir.iterdir():
        if not item.is_dir():
            continue
        # folder name pattern: gid6-27-gpt-4o-image_only
        if not item.name.endswith(f"-{variant}"):
            continue  # wrong variant (shouldn't happen, but be safe)

        if model_filter and f"-{model_filter}-" not in f"{item.name}-":
            continue  # model filtering enabled

        prefix = item.name[: -(len(variant) + 1)]
        tokens = prefix.split("-")
        if len(tokens) < 3:
            continue

        gt_id = "-".join(tokens[0:2])
        # Extract model name: tokens between gt_id and the removed variant
        # All tokens after the first two (gid, screen) belong to the model name.
        # e.g., gid6-27-gemini-2.5-flash  -> tokens[2:] == ["gemini", "2.5", "flash"]
        model_name = "-".join(tokens[2:]) if len(tokens) >= 3 else "unknown"

        case_id = item.name  # keep full folder name for uniqueness

        gt_img = gt_dir / f"{gt_id}.png"
        gt_json = gt_dir / f"{gt_id}.json"

        if not gt_json.exists():
            continue

        # ── Generated files (main result) ──────────────────────────────────
        gen_img_candidates = [item / f"{item.name}-canvas.png"]
        gen_img = next((p for p in gen_img_candidates if p.exists()), None)

        gen_json_candidates = [item / f"{item.name}-json-structure.json"]
        gen_json = next((p for p in gen_json_candidates if p.exists()), None)

        if gen_json and gen_json.exists() and gen_img:
            pairs.append((case_id, gt_id, model_name, None, gt_img if gt_img.exists() else None, gen_img, gt_json, gen_json))

        # ── Generated files (snapshots) ────────────────────────────────────
        if eval_snapshots:
            snapshots_dir = item / "snapshots"
            if snapshots_dir.is_dir():
                for snapshot_img_path in sorted(snapshots_dir.glob(f"{item.name}-snapshot-*.png")):
                    snapshot_stem = snapshot_img_path.stem
                    try:
                        snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                    except (ValueError, IndexError):
                        continue
            
                    snapshot_json_path = snapshots_dir / f"{snapshot_stem}-structure.json"
                    if snapshot_json_path.exists():
                        pairs.append(
                            (
                                case_id,
                                gt_id,
                                model_name,
                                snapshot_num,
                                gt_img if gt_img.exists() else None,
                                snapshot_img_path,
                                gt_json,
                                snapshot_json_path,
                            )
                        )
    return pairs


def run_generation_evaluation(
    base_dir: str,
    model: Optional[str] = None,
    variant: str = "image_only",
    out_path: Optional[str] = None,
    ids: Optional[List[str]] = None,
    skip_blip: bool = False,
    skip_visual_saliency: bool = False,
    skip_all: bool = False,
    eval_snapshots: bool = False,
    save_saliency_vis: bool = False,
    vis: bool = False,
) -> List[Dict[str, any]]:
    """Run evaluation for generation task.

    Args:
        base_dir: Dataset base directory.
        model: Model name (folder under results/generation_gen).
        variant: Variant name (sub-folder under model).
        out_path: Optional path to save aggregated results (JSON).
        ids: Optional list of specific GT ids (e.g., ["gid6-27"]) to evaluate. If None, evaluate all.
        skip_blip: Whether to skip the BLIP semantic similarity metric.
        skip_visual_saliency: Whether to skip the Visual Saliency metric.
        eval_snapshots: Whether to evaluate snapshots in addition to the final result.
        save_saliency_vis: Whether to save visual saliency visualizations.
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

    tool_metric_func = metric_funcs.pop("tool", None)

    if out_path:
        previous_results = _load_previous_results(out_path)
    else:
        previous_results = []

    prev_by_id = {(r.get("id"), r.get("snapshot_num")): r for r in previous_results}

    # Helper to check if a result is "complete" for skip_all
    def _is_result_complete(result: Dict[str, Any]) -> bool:
        # Define which metrics are considered essential for a result to be "complete"
        # This is mainly for the --skip_all flag.
        required_metrics = {"ssim", "element_count_ratio", "layout_overlap", "alignment_f1"}
        if not skip_blip:
            required_metrics.add("semantic_match")
        if not skip_visual_saliency:
            # visual_saliency produces multiple keys, check one
            required_metrics.add("visual_saliency_cc")
        return all(key in result for key in required_metrics)

    # ── Helper: periodic write ───────────────────────────────────────────
    def _save_partial() -> None:  # noqa: ANN001
        """Write current *results* to out_path (overwrite)."""
        if not out_path:
            return
        out_file = Path(out_path).expanduser()
        # Reuse same numpy-safe serializer
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

    pairs = _collect_generation_pairs(base_path, variant=variant, model_filter=model, eval_snapshots=eval_snapshots)

    if ids:
        ids_set = set(ids)
        pairs = [p for p in pairs if p[1] in ids_set]  # match against gt_id
        if not pairs:
            print(ids)
            raise ValueError(f"No matching samples found for ids: {ids}")

    # If skip_all, start with previous results pre-populated
    results: List[Dict[str, any]] = previous_results.copy() if skip_all else []

    new_processed = 0  # count of newly computed samples (for checkpoint frequency)

    output_vis_dir = Path(base_path) / "eval_outputs"
    output_vis_dir.mkdir(parents=True, exist_ok=True)

    # Print the number of entries and their IDs for debugging
    print(f"Previous results count: {len(previous_results)}")  # Debugging statement
    print(f"Previous results IDs: {[entry['id'] for entry in previous_results]}")  # Debugging statement

    for case_id, gt_id, model_name, snapshot_num, gt_img, gen_img, gt_json, gen_json in pairs:
        # Start with previous results if they exist, otherwise start fresh.
        metric = prev_by_id.get((gt_id, snapshot_num), {}).copy()
        metric.update({"id": gt_id, "model": model_name})
        if snapshot_num is not None:
            metric["snapshot_num"] = snapshot_num
        else:
            # Ensure snapshot_num is at least None in the dict for consistency
            metric.setdefault("snapshot_num", None)

        # If skip_all is enabled and the result is already complete, skip the entire sample.
        if skip_all and _is_result_complete(metric):
            continue

        for name, func in metric_funcs.items():
            # Skip metrics that require images if GT image is missing
            if gt_img is None and name in {"ssim", "semantic_match", "visual_saliency"}:
                continue
            try:
                # Optionally skip heavy visual_saliency metric – try reuse from previous_results
                if skip_visual_saliency and name == "visual_saliency":
                    if "visual_saliency_cc" not in metric:
                        print(f"[Warning] visual_saliency metrics not found for {gt_id} (snapshot: {snapshot_num}) in previous results – skipping.")
                    continue
                # Use cached BLIP results if requested
                if skip_blip and name == "semantic_match":
                    if "semantic_match" not in metric:
                        print(f"[Warning] semantic_match not found for {gt_id} (snapshot: {snapshot_num}) in previous results – skipping.")
                    continue

                # ── Check if metric already exists before computing ─────
                # This is the core logic for "filling in" missing metrics.
                is_blip_present = "semantic_match" in metric
                is_vis_sal_present = "visual_saliency_cc" in metric  # Check one key

                if name == "semantic_match" and is_blip_present:
                    continue
                if name == "visual_saliency" and is_vis_sal_present:
                    continue
                if name not in {"semantic_match", "visual_saliency"} and name in metric:
                    continue

                # ── 1차 시도: 최신 시그니처(out_dir, case_id) ──
                try:
                    # visual_saliency는 특별 취급
                    if name == "visual_saliency":
                        result = func(
                            str(gt_img) if gt_img else "",
                            str(gen_img),
                            str(gt_json),
                            str(gen_json),
                            out_dir=str(output_vis_dir) if save_saliency_vis else None,
                            case_id=case_id,
                            snapshot_num=snapshot_num,
                        )
                    else:
                        result = func(
                            str(gt_img) if gt_img else "",
                            str(gen_img),
                            str(gt_json),
                            str(gen_json),
                            out_dir=str(output_vis_dir),
                            case_id=case_id,
                        )
                except TypeError:
                    # 시그니처 불일치 → 기본 4-인자 버전으로 재시도
                    result = func(
                        str(gt_img) if gt_img else "",
                        str(gen_img),
                        str(gt_json),
                        str(gen_json),
                    )

                metric.update(result)

            except Exception as e:
                # 어떤 예외든 기록만 하고 계속 진행
                metric[f"{name}_error"] = str(e)
                continue
        results.append(metric)
        new_processed += 1

        # ── Periodic checkpoint every 10 NEW samples ────────────────────
        if new_processed % 10 == 0:
            _save_partial()

    if tool_metric_func:
        for metric in results:
            case_id = metric["id"]
            # NOTE: this is a bit of a hack, as we reconstruct the result path
            result_path = str(base_path / "results" / "replication_gen" / variant / case_id)
            try:
                tool_metrics = tool_metric_func(result_path)
                metric.update(tool_metrics)
            except Exception as e:
                metric["tool_error"] = str(e)


    for metric in results:
        if all(k in metric for k in ("canvas_fill_ratio", "ssim", "semantic_match")) and \
           None not in (metric["canvas_fill_ratio"], metric["ssim"], metric.get("semantic_match")):
            metric["visual_completeness"] = round(
                (float(metric["canvas_fill_ratio"]) + float(metric["ssim"]) + float(metric.get("semantic_match", 0.0))) / 3,
                4,
            )

        if all(k in metric for k in ("element_count_ratio", "layout_overlap", "alignment_f1")) and \
           None not in (metric["element_count_ratio"], metric["layout_overlap"], metric["alignment_f1"]):
            metric["struct_completeness"] = round(
                (
                    float(metric["element_count_ratio"]) +
                    float(metric["layout_overlap"]) +
                    float(metric["alignment_f1"])
                ) / 3,
                3,
            )

    if out_path:
        # Overwrite final results list with the consolidated one
        final_results = []
        processed_ids = {(r["id"], r.get("snapshot_num")) for r in results}
        # Add updated/new results
        final_results.extend(results)
        # Add previous results that were not re-processed
        for prev_res in previous_results:
            if (prev_res["id"], prev_res.get("snapshot_num")) not in processed_ids:
                final_results.append(prev_res)

        results = final_results
        _save_partial()
        print(f"Saved results → {Path(out_path).expanduser()}")

    if vis:
        _generate_visualizations(results, variant, out_file=Path(out_path).expanduser() if out_path else None)

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run evaluation metrics for generation samples.")
    # Updated default: 'dataset' (new folder layout)
    parser.add_argument("--base_dir", type=str, default="dataset", help="Base dataset directory containing 'benchmarks' and 'results'.")
    parser.add_argument("--model", type=str, default=None, help="Model name to filter (e.g., gpt-4o). If omitted, evaluate all models.")
    parser.add_argument("--variant", type=str, default="image_only", help="Variant directory inside model results.")
    parser.add_argument("--out", type=str, default="evaluation_results.json", help="Path to save aggregated results (JSON).")
    parser.add_argument("--ids", type=str, default=None, help="Comma separated list of GT ids to evaluate (e.g., gid6-27,gid34-35).")
    parser.add_argument("--skip_blip", action="store_true", help="Skip BLIP semantic similarity metric to speed up evaluation.")
    parser.add_argument("--skip_visual_saliency", action="store_true", help="Skip Visual Saliency metric to speed up evaluation.")
    parser.add_argument("--skip_all", action="store_true", help="Skip evaluation for samples where all metrics are already present in previous results (JSON).")
    parser.add_argument("--eval_snapshots", action="store_true", help="Evaluate snapshots in addition to the final result.")
    parser.add_argument("--save_saliency_vis", action="store_true", help="Save visual saliency visualizations.")
    parser.add_argument("--vis", action="store_true", help="Generate visualization plots (bar / box) grouped by model.")

    args = parser.parse_args()

    ids_list = [s.strip() for s in args.ids.split(",") if s.strip()] if args.ids else None

    run_generation_evaluation(
        base_dir=args.base_dir,
        model=args.model,
        variant=args.variant,
        out_path=args.out,
        ids=ids_list,
        skip_blip=args.skip_blip,
        skip_visual_saliency=args.skip_visual_saliency,
        skip_all=args.skip_all,
        eval_snapshots=args.eval_snapshots,
        save_saliency_vis=args.save_saliency_vis,
        vis=args.vis,
    ) 