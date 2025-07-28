import json
from pathlib import Path
from typing import Dict, List, Optional

# --- Globals for caching ---
_blip_scores_cache: Optional[Dict[str, Dict]] = None
_blip_scores_path: Optional[Path] = None

def _load_blip_scores(out_dir: Path) -> Dict[str, Dict]:
    """Load and cache the precomputed BLIP scores from the JSON file."""
    global _blip_scores_cache, _blip_scores_path
    
    # Define the expected path for the precomputed scores
    scores_path = out_dir / "precomputed_blip_scores.json"

    # If cache is invalid (file path changed or cache is empty), reload it.
    if _blip_scores_cache is None or _blip_scores_path != scores_path:
        _blip_scores_path = scores_path
        if not scores_path.exists():
            # To prevent FileNotFoundError during evaluation, return an empty dict
            # and let the metric gracefully handle missing scores.
            # A clear warning will be printed by the metric function.
            _blip_scores_cache = {}
        else:
            with open(scores_path, "r", encoding="utf-8") as f:
                scores_list: List[Dict] = json.load(f)
                # Convert list to a dict keyed by case_id for fast lookups
                _blip_scores_cache = {item["case_id"]: item for item in scores_list}
                
    return _blip_scores_cache

def get_precomputed_blip_score(case_id: str, out_dir: str) -> dict:
    """
    Retrieves a precomputed BLIP score for a given case_id.
    
    This function replaces the original `compute_blip_score` by looking up
    the result from a JSON file instead of running the model inference.
    """
    output_directory = Path(out_dir)
    all_scores = _load_blip_scores(output_directory)
    
    score_data = all_scores.get(case_id)
    
    if score_data:
        return {
            "blip_score": score_data.get("blip_score", 0.0),
            "gt_caption": score_data.get("gt_caption"),
            "gen_caption": score_data.get("gen_caption"),
        }
    else:
        # Return a default structure if the score for the case_id is not found.
        # This allows the evaluation pipeline to continue, and the metric function
        # will handle the missing value appropriately (e.g., by skipping or warning).
        return {
            "blip_score": 0.0,
            "gt_caption": "N/A (precomputed score not found)",
            "gen_caption": "N/A (precomputed score not found)",
        }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--gt", type=str, required=True, help="Path to GT image")
    parser.add_argument("--gen", type=str, required=True, help="Path to Gen image")
    args = parser.parse_args()

    results = get_precomputed_blip_score(args.gt, args.gen)
    for k, v in results.items():
        print(f"{k}: {v}")