import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import os
import argparse
import json
from pathlib import Path
from tqdm import tqdm
import numpy as np
import random
from typing import List, Dict
from datetime import datetime

# --- Constants ---
CLIP_MODEL_VERSION = "openai/clip-vit-base-patch32"

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
            "clip": {
                "version": CLIP_MODEL_VERSION
            }
        },
        "args": vars(args),
        "environment": {
            "python": torch.__version__,
            "torch": torch.__version__,
            "cuda": torch.version.cuda if torch.cuda.is_available() else None,
            "cuda_available": torch.cuda.is_available(),
            "device": "cuda" if torch.cuda.is_available() else "cpu"
        }
    }

def collect_image_paths(base_dir: Path, task: str, variant: str, eval_snapshot: bool = False, target_ids: List[str] = None) -> List[Dict]:
    """Collect all GT and generated image paths to be processed."""
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
        
        # Filter by target IDs if specified
        if target_ids and case_id not in target_ids:
            continue
        
        # Process the main case first
        process_single_case(case_id, item, gt_dir, task, image_tasks)
        
        # If eval_snapshot is enabled, also process snapshots
        if eval_snapshot:
            snapshots_dir = item / "snapshots"
            if snapshots_dir.is_dir():
                print(f"[DEBUG] Looking for snapshots in: {snapshots_dir}")
                
                # Find all PNG files that contain "snapshot-" in the name
                snapshot_files = []
                for file_path in snapshots_dir.iterdir():
                    if file_path.is_file() and file_path.suffix == ".png" and "snapshot-" in file_path.name:
                        snapshot_files.append(file_path)
                
                print(f"[DEBUG] Found {len(snapshot_files)} snapshot files")
                
                for snapshot_img_path in sorted(snapshot_files):
                    snapshot_stem = snapshot_img_path.stem
                    print(f"[DEBUG] Processing snapshot: {snapshot_stem}")
                    try:
                        # Extract snapshot number from filename
                        snapshot_num = int(snapshot_stem.split("-snapshot-")[-1])
                        print(f"[DEBUG] Extracted snapshot number: {snapshot_num}")
                        process_single_case(case_id, snapshots_dir, gt_dir, task, image_tasks, snapshot_num, snapshot_img_path)
                    except (ValueError, IndexError) as e:
                        print(f"Warning: Invalid snapshot name: {snapshot_stem}, error: {e}")
                        continue
            
    if not image_tasks:
        raise ValueError(f"No images found for task {task} variant {variant}")
        
    print(f"Found {len(image_tasks)} images to process")
    return image_tasks

def process_single_case(case_id: str, case_dir: Path, gt_dir: Path, task: str, image_tasks: List[Dict], snapshot_num: int = None, snapshot_img_path: Path = None):
    """Process a single case and add its image tasks."""
    # Extract the base ID by finding the gid pattern and handling additional numbers
    parts = case_id.split("-")
    gid_indices = [i for i, part in enumerate(parts) if part.startswith("gid")]
    
    if not gid_indices:
        print(f"Warning: Could not find gid pattern in case_id: {case_id}")
        return
        
    gid_index = gid_indices[0]
    # Look for additional number after gid (e.g., gid50-6)
    if gid_index + 1 < len(parts) and parts[gid_index + 1].isdigit():
        base_id = "-".join(parts[:gid_index + 2])  # Include the additional number
    else:
        base_id = "-".join(parts[:gid_index + 1])  # Just the gid part

    if task.startswith("modification"):
        # Modification task: collect both base and target GT images
        gt_base_path = gt_dir / f"{base_id}-base.png"
        gt_target_path = gt_dir / f"{base_id}-target.png"
        
        if gt_base_path.exists():
            image_tasks.append({"case_id": case_id, "type": "gt_base", "path": str(gt_base_path), "snapshot_num": snapshot_num})
        else:
            print(f"Warning: Base GT image not found: {gt_base_path}")
            
        if gt_target_path.exists():
            image_tasks.append({"case_id": case_id, "type": "gt_target", "path": str(gt_target_path), "snapshot_num": snapshot_num})
        else:
            print(f"Warning: Target GT image not found: {gt_target_path}")
    else:
        # Replication task: collect single GT image
        gt_img_path = gt_dir / f"{base_id}.png"
        if gt_img_path.exists():
            image_tasks.append({"case_id": case_id, "type": "gt", "path": str(gt_img_path), "snapshot_num": snapshot_num})
        else:
            print(f"Warning: GT image not found: {gt_img_path}")

    # Handle generated image path
    if snapshot_img_path:
        # Use the provided snapshot image path
        gen_img_path = snapshot_img_path
    else:
        # Use the standard generated image path
        gen_img_path = case_dir / f"{case_id}-canvas.png"
    
    if gen_img_path.exists():
        image_tasks.append({"case_id": case_id, "type": "gen", "path": str(gen_img_path), "snapshot_num": snapshot_num})
    else:
        print(f"Warning: Generated image not found: {gen_img_path}")

def compute_clip_scores(image_tasks: List[Dict], model, processor, device, batch_size: int) -> Dict:
    """Compute CLIP scores for all images in batches."""
    scores = {}
    
    # Group all image pairs for batch processing
    image_pairs = []
    pair_to_case = {}  # Map (gt_path, gen_path) to (case_id, snapshot_num, comparison_type)
    
    for task in image_tasks:
        case_id = task['case_id']
        snapshot_num = task.get('snapshot_num')
        img_type = task['type']
        img_path = task['path']
        
        # Find the corresponding generated image for this GT
        gen_task = None
        for other_task in image_tasks:
            if (other_task['case_id'] == case_id and 
                other_task.get('snapshot_num') == snapshot_num and 
                other_task['type'] == 'gen'):
                gen_task = other_task
                break
        
        if gen_task:
            gt_path = img_path
            gen_path = gen_task['path']
            pair_key = (gt_path, gen_path)
            
            if pair_key not in pair_to_case:
                image_pairs.append((gt_path, gen_path))
                pair_to_case[pair_key] = (case_id, snapshot_num, img_type)
    
    # Process image pairs in batches
    for i in tqdm(range(0, len(image_pairs), batch_size), desc="Computing CLIP Scores"):
        batch_pairs = image_pairs[i:i+batch_size]
        
        # Load all images in batch
        images = []
        for gt_path, gen_path in batch_pairs:
            try:
                gt_image = Image.open(gt_path).convert("RGB")
                gen_image = Image.open(gen_path).convert("RGB")
                images.extend([gt_image, gen_image])
            except Exception as e:
                print(f"Error loading images for {gt_path}, {gen_path}: {e}")
                images.extend([Image.new('RGB', (224, 224)), Image.new('RGB', (224, 224))])
        
        # Process images in batch
        try:
            inputs = processor(images=images, return_tensors="pt", padding=True).to(device)
            
            with torch.no_grad():
                image_features = model.get_image_features(**inputs)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            
            # Compute similarities for each pair
            for j, (gt_path, gen_path) in enumerate(batch_pairs):
                case_id, snapshot_num, img_type = pair_to_case[(gt_path, gen_path)]
                
                # Get features for this pair (2 images per pair)
                gt_feat = image_features[j*2:j*2+1]
                gen_feat = image_features[j*2+1:j*2+2]
                
                similarity = torch.cosine_similarity(gt_feat, gen_feat, dim=-1).item()
                
                # Store result
                key = (case_id, snapshot_num)
                if key not in scores:
                    scores[key] = {}
                
                if img_type == "gt_base":
                    scores[key]["clip_score_base"] = round(similarity, 4)
                elif img_type == "gt_target":
                    scores[key]["clip_score_target"] = round(similarity, 4)
                elif img_type == "gt":
                    scores[key]["clip_score"] = round(similarity, 4)
                    
        except Exception as e:
            print(f"Error processing batch: {e}")
            # Fallback to individual processing
            for gt_path, gen_path in batch_pairs:
                case_id, snapshot_num, img_type = pair_to_case[(gt_path, gen_path)]
                score = compute_single_clip_score(gt_path, gen_path, model, processor, device)
                
                key = (case_id, snapshot_num)
                if key not in scores:
                    scores[key] = {}
                
                if img_type == "gt_base":
                    scores[key]["clip_score_base"] = score
                elif img_type == "gt_target":
                    scores[key]["clip_score_target"] = score
                elif img_type == "gt":
                    scores[key]["clip_score"] = score
    
    # Calculate improvements for modification tasks
    for key, score_dict in scores.items():
        if "clip_score_base" in score_dict and "clip_score_target" in score_dict:
            score_dict["clip_score_improvement"] = score_dict["clip_score_target"] - score_dict["clip_score_base"]
    
    return scores

def compute_single_clip_score(gt_path: str, gen_path: str, model, processor, device) -> float:
    """Compute CLIP score between two images."""
    try:
        # Load images
        gt_image = Image.open(gt_path).convert("RGB")
        gen_image = Image.open(gen_path).convert("RGB")
        
        # Process images
        inputs = processor(images=[gt_image, gen_image], return_tensors="pt", padding=True).to(device)
        
        # Get image features
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            
        # Normalize features
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        
        # Compute cosine similarity
        similarity = torch.cosine_similarity(image_features[0:1], image_features[1:2], dim=-1).item()
        
        return round(similarity, 4)
        
    except Exception as e:
        print(f"Error computing CLIP score: {e}")
        return 0.0

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

def load_previous_results(output_dir: Path, out_file: str) -> tuple[list, set, dict]:
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
            # Create processed_cases set with (case_id, snapshot_num) tuples
            for r in results:
                case_id = r["case_id"]
                snapshot_num = r.get("snapshot_num")
                processed_cases.add((case_id, snapshot_num))
        return results, processed_cases, experiment_config
    
    return results, processed_cases, experiment_config

def extract_snapshot_info(case_id: str) -> tuple[str, str, int]:
    """Extract base_id, snapshot, and snapshot number from case_id for modification tasks."""
    parts = case_id.split("-")
    gid_indices = [i for i, part in enumerate(parts) if part.startswith("gid")]
    
    if not gid_indices:
        return case_id, "unknown", 0
    
    gid_index = gid_indices[0]
    # Look for additional number after gid (e.g., gid50-6)
    if gid_index + 1 < len(parts) and parts[gid_index + 1].isdigit():
        base_id = "-".join(parts[:gid_index + 2])  # Include the additional number
    else:
        base_id = "-".join(parts[:gid_index + 1])  # Just the gid part
    
    # Extract snapshot (everything after the base_id)
    snapshot = case_id[len(base_id):].lstrip("-")
    
    # Handle empty snapshot (when case_id is just the base_id)
    if not snapshot:
        snapshot = "base"
    
    # Extract snapshot number (last number in the case_id)
    snapshot_num = 0
    for part in reversed(parts):
        if part.isdigit():
            snapshot_num = int(part)
            break
    
    return base_id, snapshot, snapshot_num

def save_results_by_snapshot(results: list, output_dir: Path, task: str):
    """Save all snapshot results in a single file."""
    if not task.startswith("modification"):
        return
    
    # Add snapshot info to all results
    for result in results:
        case_id = result["case_id"]
        snapshot_num = result.get("snapshot_num")
        
        # Extract snapshot name from case_id
        base_id, snapshot, _ = extract_snapshot_info(case_id)
        
        # Add snapshot info to the result
        result["base_id"] = base_id
        result["snapshot"] = snapshot
    
    # Save all snapshot results in a single file
    snapshot_file = output_dir / "precomputed_clip_scores_snapshot.json"
    save_results(results, snapshot_file)
    print(f"Saved {len(results)} snapshot results to: {snapshot_file}")
    
    # Print summary by snapshot
    snapshot_counts = {}
    for result in results:
        snapshot_num = result.get("snapshot_num")
        if snapshot_num is None:
            snapshot_name = "final"
        else:
            snapshot_name = f"snapshot_{snapshot_num}"
        snapshot_counts[snapshot_name] = snapshot_counts.get(snapshot_name, 0) + 1
    
    print(f"\nTotal snapshots processed: {len(snapshot_counts)}")
    for snapshot_name, count in sorted(snapshot_counts.items()):
        print(f"  - {snapshot_name}: {count} cases")

def main():
    parser = argparse.ArgumentParser(description="Precompute CLIP scores for all evaluation images.")
    parser.add_argument("--base_dir", type=str, default="dataset", help="Base dataset directory.")
    parser.add_argument("--task", type=str, required=True, help="Task to evaluate (e.g., 'replication_gen', 'modification_gen').")
    parser.add_argument("--variant", type=str, required=True, help="Task variant to evaluate (e.g., 'image_only').")
    parser.add_argument("--out_file", type=str, default="precomputed_clip_scores.json", help="Output file for precomputed scores.")
    parser.add_argument("--batch_size", type=int, help="Override automatic batch size determination.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    parser.add_argument("--eval_snapshot", action="store_true", help="Enable snapshot-based evaluation and saving.")
    parser.add_argument("--ids", type=str, help="Comma-separated list of case IDs to process (e.g., 'color_adjustment-gid1-claude-3-5-sonnet').")
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
    
    results, processed_cases, prev_config = load_previous_results(output_dir, args.out_file)
    if results:
        print(f"Resuming from {len(results)} previously processed cases")
        if prev_config:
            if prev_config["models"] != experiment_config["models"]:
                raise ValueError("Model configurations differ from previous run. Cannot continue with different settings.")
    
    # Load models (will be cached globally)
    print("Loading CLIP model...")
    from evaluation.semantic.clip_score import _load_clip_model
    clip_model, clip_processor, device = _load_clip_model()
    print("CLIP model loaded successfully.")

    # Parse target IDs if specified
    target_ids = None
    if args.ids:
        target_ids = [id.strip() for id in args.ids.split(",")]
        print(f"Processing only the following case IDs: {target_ids}")
    
    image_tasks = collect_image_paths(base_dir, args.task, args.variant, args.eval_snapshot, target_ids)
    scores = compute_clip_scores(image_tasks, clip_model, clip_processor, device, batch_size)

    # Group scores by case_id and snapshot_num
    cases = {}
    for key, score_dict in scores.items():
        if len(key) == 2:  # (case_id, snapshot_num)
            case_id, snapshot_num = key
        else:  # (case_id,) - no snapshot
            case_id = key
            snapshot_num = None
        
        if case_id not in cases:
            cases[case_id] = {}
        if snapshot_num not in cases[case_id]:
            cases[case_id][snapshot_num] = {}
        cases[case_id][snapshot_num].update(score_dict)
    
    # Process only unprocessed cases
    unprocessed_cases = {}
    for case_id, case_snapshots in cases.items():
        for snapshot_num, case_scores in case_snapshots.items():
            # Check if this case+snapshot combination was already processed
            case_key = (case_id, snapshot_num)
            if case_key not in processed_cases:
                if case_id not in unprocessed_cases:
                    unprocessed_cases[case_id] = {}
                unprocessed_cases[case_id][snapshot_num] = case_scores
    
    print(f"Found {len(unprocessed_cases)} new cases to process")
    
    for idx, (case_id, case_snapshots) in enumerate(tqdm(unprocessed_cases.items(), desc="Computing CLIP Scores")):
        for snapshot_num, case_scores in case_snapshots.items():
            if args.task.startswith("modification"):
                # Modification task: Compare similarity improvement
                results.append({
                    "case_id": case_id,
                    "snapshot_num": snapshot_num,
                    "clip_score_base_target": case_scores.get("clip_score_base", 0.0),
                    "clip_score_gen_target": case_scores.get("clip_score_target", 0.0),
                    "clip_score_improvement": case_scores.get("clip_score_improvement", 0.0)
                })
            else:
                # Replication task: original logic
                results.append({
                    "case_id": case_id,
                    "snapshot_num": snapshot_num,
                    "clip_score": case_scores.get("clip_score", 0.0)
                })
        
    # Save results
    if args.eval_snapshot:
        # Snapshot-based evaluation: save by snapshot and combined
        if args.task.startswith("modification"):
            save_results_by_snapshot(results, output_dir, args.task)
        
        # Also save combined results
        output_path = output_dir / args.out_file
        save_results(results, output_path)
        print(f"\nPrecomputed CLIP scores saved to: {output_path}")
        if args.task.startswith("modification"):
            print("Individual snapshot files also saved.")
    else:
        # Standard evaluation: save as single file (original behavior)
        output_path = output_dir / args.out_file
        save_results(results, output_path)
        print(f"\nPrecomputed CLIP scores saved to: {output_path}")

if __name__ == "__main__":
    main()
