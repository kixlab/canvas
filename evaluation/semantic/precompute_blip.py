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

# --- Deterministic Settings for Reproducibility ---
def set_seed(seed: int):
    """Set seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

UI_PROMPT = ""

def postprocess_caption(caption: str, prompt: str) -> str:
    """Remove the prompt from the beginning of the caption if it exists."""
    caption = caption.strip().lower()
    prompt = prompt.strip().lower()
    if caption.startswith(prompt):
        return caption[len(prompt):].strip()
    return caption

def collect_image_paths(base_dir: Path, task: str, variant: str) -> list[dict]:
    """Collect all GT and generated image paths to be captioned."""
    results_dir = base_dir / "results" / task / variant
    gt_dir = base_dir / "benchmarks" / "replication_gt"
    
    image_tasks = []
    if not results_dir.is_dir():
        raise FileNotFoundError(f"Results directory not found: {results_dir}")

    for item in tqdm(results_dir.iterdir(), desc="Collecting image paths"):
        if not item.is_dir():
            continue

        case_id = item.name
        gt_id = "-".join(case_id.split("-")[0:2])

        # GT Image
        gt_img_path = gt_dir / f"{gt_id}.png"
        if gt_img_path.exists():
            image_tasks.append({"case_id": case_id, "type": "gt", "path": str(gt_img_path)})

        # Generated Image
        gen_img_path = item / f"{case_id}-canvas.png"
        if gen_img_path.exists():
            image_tasks.append({"case_id": case_id, "type": "gen", "path": str(gen_img_path)})
            
    return image_tasks

def precompute_captions(image_tasks: list[dict], model, processor, device, batch_size: int) -> dict:
    """Generate captions for all images in batches."""
    captions = {}
    
    for i in tqdm(range(0, len(image_tasks), batch_size), desc="Generating Captions"):
        batch_tasks = image_tasks[i:i+batch_size]
        image_paths = [task['path'] for task in batch_tasks]
        
        try:
            images = [Image.open(p).convert("RGB") for p in image_paths]
            inputs = processor(images, text=[UI_PROMPT] * len(images), return_tensors="pt", padding=True).to(device)

            with torch.no_grad():
                with torch.cuda.amp.autocast(enabled=(device=='cuda')):
                    generated_ids = model.generate(**inputs, max_new_tokens=50)
            
            batch_captions_raw = processor.batch_decode(generated_ids, skip_special_tokens=True)

            for task, raw_caption in zip(batch_tasks, batch_captions_raw):
                key = (task['case_id'], task['type'])
                captions[key] = postprocess_caption(raw_caption, UI_PROMPT)

        except Exception as e:
            print(f"Error processing batch starting at index {i}: {e}")
            for task in batch_tasks:
                key = (task['case_id'], task['type'])
                captions[key] = f"Error: {e}"

    return captions

def main():
    parser = argparse.ArgumentParser(description="Precompute BLIP captions for all evaluation images.")
    parser.add_argument("--base_dir", type=str, default="dataset", help="Base dataset directory.")
    parser.add_argument("--task", type=str, required=True, help="Task to evaluate (e.g., 'replication_gen').")
    parser.add_argument("--variant", type=str, required=True, help="Task variant to evaluate (e.g., 'image_only').")
    parser.add_argument("--out_file", type=str, default="precomputed_blip_scores.json", help="Output file for precomputed scores.")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size for caption generation.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    args = parser.parse_args()

    set_seed(args.seed)

    base_dir = Path(args.base_dir)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    print("Loading models...")
    blip_processor = Blip2Processor.from_pretrained("Salesforce/blip2-opt-2.7b", use_fast=False)
    blip_model = Blip2ForConditionalGeneration.from_pretrained("Salesforce/blip2-opt-2.7b").to(device)
    blip_model.eval()
    sentence_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2').to(device)
    sentence_model.eval()
    print("Models loaded.")

    image_tasks = collect_image_paths(base_dir, args.task, args.variant)
    captions = precompute_captions(image_tasks, blip_model, blip_processor, device, args.batch_size)

    # Group captions by case_id
    cases = {}
    for (case_id, img_type), caption in captions.items():
        if case_id not in cases:
            cases[case_id] = {}
        cases[case_id][img_type] = caption
    
    results = []
    for case_id, case_captions in tqdm(cases.items(), desc="Computing Similarities"):
        gt_caption = case_captions.get("gt")
        gen_caption = case_captions.get("gen")

        if not gt_caption or not gen_caption or "Error:" in gt_caption or "Error:" in gen_caption:
            similarity = 0.0
        else:
            with torch.no_grad():
                embeddings = sentence_model.encode([gt_caption, gen_caption], convert_to_tensor=True)
                similarity = util.cos_sim(embeddings[0], embeddings[1]).item()
        
        results.append({
            "case_id": case_id,
            "blip_score": round(similarity, 4),
            "gt_caption": gt_caption,
            "gen_caption": gen_caption
        })
        
    output_path = base_dir / "eval_outputs" / args.task / args.variant / args.out_file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        
    print(f"\nPrecomputed BLIP scores saved to: {output_path}")

if __name__ == "__main__":
    main() 