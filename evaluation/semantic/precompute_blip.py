import torch
from PIL import Image
from transformers import Blip2Processor, Blip2ForConditionalGeneration
from sentence_transformers import SentenceTransformer, util
import os
import argparse
import json
from pathlib import Path
from tqdm import tqdm
import numpy as np
import random
from typing import List, Dict, Tuple
from datetime import datetime

# --- Constants ---
BLIP2_MODEL_VERSION = "Salesforce/blip2-opt-2.7b"
SENTENCE_TRANSFORMER_VERSION = "sentence-transformers/all-MiniLM-L6-v2"
BLIP2_GENERATION_CONFIG = {
    "max_new_tokens": 50,
    "num_beams": 1,
    "temperature": 0.0,
    "do_sample": False,
}


# --- Settings ---
def set_seed(seed: int):
    """Set seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
    torch.use_deterministic_algorithms(True)


UI_PROMPT = ""


def postprocess_caption(caption: str, prompt: str) -> str:
    """Remove the prompt from the beginning of the caption if it exists."""
    caption = caption.strip().lower()
    prompt = prompt.strip().lower()
    if caption.startswith(prompt):
        return caption[len(prompt) :].strip()
    return caption


def get_optimal_batch_size(device: str) -> int:
    """Determine optimal batch size based on available GPU memory."""
    if device == "cpu":
        return 4

    try:
        gpu_mem = torch.cuda.get_device_properties(0).total_memory
        optimal_batch = max(1, int((gpu_mem / (2 * 1024 * 1024 * 1024) * 0.7)))
        return min(optimal_batch, 16)
    except:
        return 8


def get_experiment_config(args) -> dict:
    return {
        "timestamp": datetime.now().isoformat(),
        "models": {
            "blip2": {
                "version": BLIP2_MODEL_VERSION,
                "generation_config": BLIP2_GENERATION_CONFIG,
            },
            "sentence_transformer": {"version": SENTENCE_TRANSFORMER_VERSION},
        },
        "args": vars(args),
        "environment": {
            "python": torch.__version__,
            "torch": torch.__version__,
            "cuda": torch.version.cuda if torch.cuda.is_available() else None,
            "cuda_available": torch.cuda.is_available(),
            "device": "cuda" if torch.cuda.is_available() else "cpu",
        },
    }


def process_single_case(
    case_id: str,
    case_dir: Path,
    gt_dir: Path,
    task: str,
    image_tasks: List[Dict],
    snapshot_num: int = None,
    snapshot_img_path: Path = None,
):
    """Process a single case (main result or snapshot) and add image tasks."""
    gt_id = "-".join(case_id.split("-")[:2])

    if task.startswith("modification"):
        # Modification task: collect both base and target GT images
        gt_base_path = gt_dir / f"{gt_id}-base.png"
        gt_target_path = gt_dir / f"{gt_id}-target.png"

        if gt_base_path.exists():
            image_tasks.append(
                {
                    "case_id": case_id,
                    "type": "gt_base",
                    "path": str(gt_base_path),
                    "snapshot_num": snapshot_num,
                }
            )
        else:
            print(f"Warning: Base GT image not found: {gt_base_path}")

        if gt_target_path.exists():
            image_tasks.append(
                {
                    "case_id": case_id,
                    "type": "gt_target",
                    "path": str(gt_target_path),
                    "snapshot_num": snapshot_num,
                }
            )
        else:
            print(f"Warning: Target GT image not found: {gt_target_path}")
    else:
        # Replication task: collect single GT image
        gt_img_path = gt_dir / f"{gt_id}.png"
        if gt_img_path.exists():
            image_tasks.append(
                {
                    "case_id": case_id,
                    "type": "gt",
                    "path": str(gt_img_path),
                    "snapshot_num": snapshot_num,
                }
            )
        else:
            print(f"Warning: GT image not found: {gt_img_path}")

    # Handle generated image
    if snapshot_num is not None and snapshot_img_path is not None:
        # This is a snapshot
        if snapshot_img_path.exists():
            image_tasks.append(
                {
                    "case_id": case_id,
                    "type": "gen",
                    "path": str(snapshot_img_path),
                    "snapshot_num": snapshot_num,
                }
            )
        else:
            print(f"Warning: Snapshot image not found: {snapshot_img_path}")
    else:
        # This is the main result
        gen_img_path = case_dir / f"{case_id}-canvas.png"
        if gen_img_path.exists():
            image_tasks.append(
                {
                    "case_id": case_id,
                    "type": "gen",
                    "path": str(gen_img_path),
                    "snapshot_num": snapshot_num,
                }
            )
        else:
            print(f"Warning: Generated image not found: {gen_img_path}")


def collect_image_paths(
    base_dir: Path, task: str, variant: str, eval_snapshots: bool = False
) -> List[Dict]:
    """Collect all GT and generated image paths to be captioned."""
    results_dir = base_dir / "results" / task / variant

    if task.startswith("modification"):
        gt_dir = base_dir / "benchmarks" / "modification_gt" / variant
    else:
        gt_dir = base_dir / "benchmarks" / "replication_gt"

    image_tasks = []
    if not results_dir.is_dir():
        raise FileNotFoundError(f"Results directory not found: {results_dir}")

    for item in tqdm(results_dir.iterdir(), desc="Collecting image paths"):
        if not item.is_dir():
            continue

        case_id = item.name

        # Process the main case first
        process_single_case(case_id, item, gt_dir, task, image_tasks)

        # If eval_snapshots is enabled, also process snapshots
        if eval_snapshots:
            snapshots_dir = item / "snapshots"
            if snapshots_dir.is_dir():
                print(f"[DEBUG] Looking for snapshots in: {snapshots_dir}")

                # Find all PNG files that contain "snapshot-" in the name
                snapshot_files = []
                for file_path in snapshots_dir.iterdir():
                    if (
                        file_path.is_file()
                        and file_path.suffix == ".png"
                        and "snapshot-" in file_path.name
                    ):
                        snapshot_files.append(file_path)

                print(f"[DEBUG] Found {len(snapshot_files)} snapshot files")

                for snapshot_img_path in sorted(snapshot_files):
                    snapshot_stem = snapshot_img_path.stem
                    print(f"[DEBUG] Processing snapshot: {snapshot_stem}")
                    try:
                        # Extract snapshot number from filename
                        snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                        print(f"[DEBUG] Extracted snapshot number: {snapshot_num}")
                        process_single_case(
                            case_id,
                            snapshots_dir,
                            gt_dir,
                            task,
                            image_tasks,
                            snapshot_num,
                            snapshot_img_path,
                        )
                    except (ValueError, IndexError) as e:
                        print(
                            f"Warning: Invalid snapshot name: {snapshot_stem}, error: {e}"
                        )
                        continue

    if not image_tasks:
        raise ValueError(f"No images found for task {task} variant {variant}")

    print(f"Found {len(image_tasks)} images to process")
    return image_tasks


def precompute_captions(
    image_tasks: List[Dict], model, processor, device, batch_size: int
) -> Dict:
    """Generate captions for all images in batches."""
    captions = {}

    for i in tqdm(range(0, len(image_tasks), batch_size), desc="Generating Captions"):
        batch_tasks = image_tasks[i : i + batch_size]
        image_paths = [task["path"] for task in batch_tasks]

        try:
            images = [Image.open(p).convert("RGB") for p in image_paths]
            inputs = processor(
                images,
                text=[UI_PROMPT] * len(images),
                return_tensors="pt",
                padding=True,
            ).to(device)

            with torch.no_grad():
                with torch.cuda.amp.autocast(enabled=(device == "cuda")):
                    generated_ids = model.generate(**inputs, **BLIP2_GENERATION_CONFIG)

            batch_captions_raw = processor.batch_decode(
                generated_ids, skip_special_tokens=True
            )

            for task, raw_caption in zip(batch_tasks, batch_captions_raw):
                key = (task["case_id"], task["type"], task.get("snapshot_num"))
                captions[key] = postprocess_caption(raw_caption, UI_PROMPT)

        except Exception as e:
            print(f"Error processing batch starting at index {i}: {e}")
            for task in batch_tasks:
                key = (task["case_id"], task["type"], task.get("snapshot_num"))
                captions[key] = f"Error: {e}"

    return captions


def save_experiment_config(experiment_config: dict, output_dir: Path):
    """Save the experiment configuration to a separate file."""
    config_path = output_dir / "experiment_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(experiment_config, f, indent=2, ensure_ascii=False)
    print(f"Experiment config saved to: {config_path}")


def save_results(results: list, output_path: Path):
    """Save the results in the original format."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def save_intermediate_results(results: list, output_dir: Path, current_idx: int):
    """Save intermediate results."""
    output_dir.mkdir(parents=True, exist_ok=True)
    intermediate_path = output_dir / f"intermediate_{current_idx}.json"
    save_results(results, intermediate_path)
    print(f"Saved intermediate results: {intermediate_path}")


def load_previous_results(output_dir: Path, out_file: str) -> Tuple[List, set, dict]:
    """Load previous results if the file exists."""
    results = []
    processed_cases = set()
    experiment_config = None

    config_path = output_dir / "experiment_config.json"
    if config_path.exists():
        with open(config_path) as f:
            experiment_config = json.load(f)

    final_path = output_dir / out_file
    if final_path.exists():
        print(f"Found completed results file: {final_path}")
        with open(final_path) as f:
            results = json.load(f)
            processed_cases = {r["case_id"] for r in results}
        return results, processed_cases, experiment_config

    # intermediate_files = sorted(output_dir.glob("intermediate_*.json"))
    # if intermediate_files:
    #     latest_file = intermediate_files[-1]
    #     print(f"Found intermediate results: {latest_file}")
    #     with open(latest_file) as f:
    #         results = json.load(f)
    #         processed_cases = {r["case_id"] for r in results}

    return results, processed_cases, experiment_config


def main():
    parser = argparse.ArgumentParser(
        description="Precompute BLIP captions for all evaluation images."
    )
    parser.add_argument(
        "--base_dir", type=str, default="dataset", help="Base dataset directory."
    )
    parser.add_argument(
        "--task",
        type=str,
        required=True,
        help="Task to evaluate (e.g., 'replication_gen', 'modification_gen').",
    )
    parser.add_argument(
        "--variant",
        type=str,
        required=True,
        help="Task variant to evaluate (e.g., 'image_only').",
    )
    parser.add_argument(
        "--out_file",
        type=str,
        default="precomputed_blip_scores.json",
        help="Output file for precomputed scores.",
    )
    parser.add_argument(
        "--batch_size", type=int, help="Override automatic batch size determination."
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Random seed for reproducibility."
    )
    parser.add_argument(
        "--eval_snapshots",
        action="store_true",
        help="Also process snapshots in addition to final results.",
    )
    args = parser.parse_args()

    set_seed(args.seed)

    base_dir = Path(args.base_dir)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    batch_size = args.batch_size if args.batch_size else get_optimal_batch_size(device)
    print(f"Using batch size: {batch_size}")

    output_dir = base_dir / "eval_outputs" / args.task / args.variant
    output_dir.mkdir(parents=True, exist_ok=True)

    experiment_config = get_experiment_config(args)
    save_experiment_config(experiment_config, output_dir)

    results, processed_cases, prev_config = load_previous_results(
        output_dir, args.out_file
    )
    if results:
        cases_to_reprocess = set()
        valid_results = []
        for r in results:
            # For modification task, check for both base and target captions
            if args.task.startswith("modification"):
                if (
                    r.get("gt_caption_base") is None
                    or r.get("gt_caption_target") is None
                ):
                    cases_to_reprocess.add(r["case_id"])
                else:
                    valid_results.append(r)
            # For replication task, check for the single gt caption
            else:
                if r.get("gt_caption") is None:
                    cases_to_reprocess.add(r["case_id"])
                else:
                    valid_results.append(r)

        if cases_to_reprocess:
            print(
                f"Found {len(cases_to_reprocess)} cases with missing GT captions. They will be re-processed."
            )
            results = valid_results
            processed_cases = {res["case_id"] for res in results}

        print(f"Resuming from {len(results)} previously processed valid cases")
        if prev_config:
            if prev_config["models"] != experiment_config["models"]:
                raise ValueError(
                    "Model configurations differ from previous run. Cannot continue with different settings."
                )

    # Load models
    print("Loading models...")
    blip_processor = Blip2Processor.from_pretrained(BLIP2_MODEL_VERSION, use_fast=False)
    blip_model = Blip2ForConditionalGeneration.from_pretrained(BLIP2_MODEL_VERSION).to(
        device
    )
    blip_model.eval()
    sentence_model = SentenceTransformer(SENTENCE_TRANSFORMER_VERSION).to(device)
    sentence_model.eval()
    print("Models loaded successfully.")

    image_tasks = collect_image_paths(
        base_dir, args.task, args.variant, args.eval_snapshots
    )
    captions = precompute_captions(
        image_tasks, blip_model, blip_processor, device, batch_size
    )

    # Group captions by case_id and snapshot_num
    cases = {}
    snapshot_cases = {}
    for (case_id, img_type, snapshot_num), caption in captions.items():
        if snapshot_num is not None:
            # This is a snapshot
            key = f"{case_id}_{snapshot_num}"
            if key not in snapshot_cases:
                snapshot_cases[key] = {"case_id": case_id, "snapshot_num": snapshot_num}
            snapshot_cases[key][img_type] = caption
        else:
            # This is the main result
            if case_id not in cases:
                cases[case_id] = {}
            cases[case_id][img_type] = caption

    # Process only unprocessed cases
    unprocessed_cases = {k: v for k, v in cases.items() if k not in processed_cases}
    print(f"Found {len(unprocessed_cases)} new cases to process")

    for idx, (case_id, case_captions) in enumerate(
        tqdm(unprocessed_cases.items(), desc="Computing Similarities")
    ):
        if args.task.startswith("modification"):
            # Modification task: Compare similarity improvement
            gt_base_caption = case_captions.get("gt_base")
            gt_target_caption = case_captions.get("gt_target")
            gen_caption = case_captions.get("gen")

            if not all([gt_base_caption, gt_target_caption, gen_caption]) or any(
                "Error:" in str(c)
                for c in [gt_base_caption, gt_target_caption, gen_caption]
            ):
                base_target_similarity = 0.0
                gen_target_similarity = 0.0
            else:
                with torch.no_grad():
                    embeddings = sentence_model.encode(
                        [gt_base_caption, gt_target_caption, gen_caption],
                        convert_to_tensor=True,
                    )
                    # Similarity between base GT and target GT (The baseline)
                    base_target_similarity = util.cos_sim(
                        embeddings[0], embeddings[1]
                    ).item()
                    # Similarity between generated image and target GT (The result)
                    gen_target_similarity = util.cos_sim(
                        embeddings[2], embeddings[1]
                    ).item()

            # How much closer did the generated image get to the target, compared to the base?
            improvement_score = gen_target_similarity - base_target_similarity

            results.append(
                {
                    "case_id": case_id,
                    "blip_score_base_target": round(base_target_similarity, 4),
                    "blip_score_gen_target": round(gen_target_similarity, 4),
                    "blip_score_improvement": round(improvement_score, 4),
                    "gt_caption_base": gt_base_caption,
                    "gt_caption_target": gt_target_caption,
                    "gen_caption": gen_caption,
                }
            )
        else:
            # Replication task: original logic
            gt_caption = case_captions.get("gt")
            gen_caption = case_captions.get("gen")

            if (
                not gt_caption
                or not gen_caption
                or "Error:" in gt_caption
                or "Error:" in gen_caption
            ):
                similarity = 0.0
            else:
                with torch.no_grad():
                    embeddings = sentence_model.encode(
                        [gt_caption, gen_caption], convert_to_tensor=True
                    )
                    similarity = util.cos_sim(embeddings[0], embeddings[1]).item()

            results.append(
                {
                    "case_id": case_id,
                    "blip_score": round(similarity, 4),
                    "gt_caption": gt_caption,
                    "gen_caption": gen_caption,
                }
            )

        # if (idx + 1) % 5 == 0:
        #     save_intermediate_results(results, output_dir, idx + 1)

    # Process snapshot results if any
    snapshot_results = []
    if args.eval_snapshots and snapshot_cases:
        print(f"Processing {len(snapshot_cases)} snapshot cases...")
        for snapshot_key, snapshot_captions in tqdm(
            snapshot_cases.items(), desc="Processing Snapshots"
        ):
            case_id = snapshot_captions["case_id"]
            snapshot_num = snapshot_captions["snapshot_num"]

            if args.task.startswith("modification"):
                # For modification task, we need both base and target GT captions
                gt_base_caption = snapshot_captions.get("gt_base")
                gt_target_caption = snapshot_captions.get("gt_target")
                gen_caption = snapshot_captions.get("gen")

                if not all([gt_base_caption, gt_target_caption, gen_caption]) or any(
                    "Error:" in str(c)
                    for c in [gt_base_caption, gt_target_caption, gen_caption]
                ):
                    similarity = 0.0
                else:
                    with torch.no_grad():
                        embeddings = sentence_model.encode(
                            [gt_target_caption, gen_caption], convert_to_tensor=True
                        )
                        similarity = util.cos_sim(embeddings[0], embeddings[1]).item()

                snapshot_results.append(
                    {
                        "case_id": case_id,
                        "snapshot_num": snapshot_num,
                        "blip_score": round(similarity, 4),
                        "gt_caption_target": gt_target_caption,
                        "gen_caption": gen_caption,
                    }
                )
            else:
                # Replication task
                gt_caption = snapshot_captions.get("gt")
                gen_caption = snapshot_captions.get("gen")

                if (
                    not gt_caption
                    or not gen_caption
                    or "Error:" in gt_caption
                    or "Error:" in gen_caption
                ):
                    similarity = 0.0
                else:
                    with torch.no_grad():
                        embeddings = sentence_model.encode(
                            [gt_caption, gen_caption], convert_to_tensor=True
                        )
                        similarity = util.cos_sim(embeddings[0], embeddings[1]).item()

                snapshot_results.append(
                    {
                        "case_id": case_id,
                        "snapshot_num": snapshot_num,
                        "blip_score": round(similarity, 4),
                        "gt_caption": gt_caption,
                        "gen_caption": gen_caption,
                    }
                )

    # Save main results
    output_path = output_dir / args.out_file
    save_results(results, output_path)
    print(f"\nPrecomputed BLIP scores saved to: {output_path}")

    # Save snapshot results if any
    if snapshot_results:
        snapshot_output_path = output_dir / "precomputed_blip_scores_snapshot.json"
        save_results(snapshot_results, snapshot_output_path)
        print(f"Precomputed BLIP snapshot scores saved to: {snapshot_output_path}")


if __name__ == "__main__":
    main()
