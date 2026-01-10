import json
from pathlib import Path
from typing import Dict, List, Optional

# --- Globals for caching ---
_blip_scores_cache: Optional[Dict[str, Dict]] = None
_blip_scores_path: Optional[Path] = None
_blip_snapshot_scores_cache: Optional[Dict[str, Dict]] = None
_blip_snapshot_scores_path: Optional[Path] = None

def _load_blip_scores(out_dir: Path) -> Dict[str, Dict]:
    """Load and cache the precomputed BLIP scores from the JSON file."""
    global _blip_scores_cache, _blip_scores_path
    
    scores_path = out_dir / "precomputed_blip_scores.json"

    if _blip_scores_cache is None or _blip_scores_path != scores_path:
        _blip_scores_path = scores_path
        if not scores_path.exists():
            _blip_scores_cache = {}
        else:
            with open(scores_path, "r", encoding="utf-8") as f:
                scores_list: List[Dict] = json.load(f)
                _blip_scores_cache = {item["case_id"]: item for item in scores_list}
                
    return _blip_scores_cache

def _load_blip_snapshot_scores(out_dir: Path) -> Dict[str, Dict]:
    """Load and cache the precomputed BLIP snapshot scores from the JSON file."""
    global _blip_snapshot_scores_cache, _blip_snapshot_scores_path
    
    scores_path = out_dir / "precomputed_blip_scores_snapshot.json"

    if _blip_snapshot_scores_cache is None or _blip_snapshot_scores_path != scores_path:
        _blip_snapshot_scores_path = scores_path
        if not scores_path.exists():
            _blip_snapshot_scores_cache = {}
        else:
            with open(scores_path, "r", encoding="utf-8") as f:
                scores_list: List[Dict] = json.load(f)
                _blip_snapshot_scores_cache = {
                    f"{item['case_id']}_{item['snapshot_num']}": item 
                    for item in scores_list
                }
                
    return _blip_snapshot_scores_cache

def get_precomputed_blip_score(case_id: str, out_dir: str, snapshot_num: Optional[int] = None) -> dict:
    """
    Retrieves a precomputed BLIP score for a given case_id and optional snapshot_num.
    
    This function replaces the original `compute_blip_score` by looking up
    the result from a JSON file instead of running the model inference.
    
    Args:
        case_id: The case identifier
        out_dir: Output directory path
        snapshot_num: If provided, look for snapshot-specific scores
    """
    output_directory = Path(out_dir)
    
    if snapshot_num is not None:
        all_snapshot_scores = _load_blip_snapshot_scores(output_directory)
        snapshot_key = f"{case_id}_{snapshot_num}"
        score_data = all_snapshot_scores.get(snapshot_key)
        
        if score_data:
            return {
                "blip_score": score_data.get("blip_score", 0.0),
                "gt_caption": score_data.get("gt_caption"),
                "gen_caption": score_data.get("gen_caption"),
            }
        else:
            return {
                "blip_score": 0.0,
                "gt_caption": "N/A (snapshot score not found)",
                "gen_caption": None,  # null for snapshots when not available
            }
    else:
        all_scores = _load_blip_scores(output_directory)
        score_data = all_scores.get(case_id)
        
        if score_data:
            return {
                "blip_score": score_data.get("blip_score", 0.0),
                "gt_caption": score_data.get("gt_caption"),
                "gen_caption": score_data.get("gen_caption"),
            }
        else:
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