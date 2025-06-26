import json
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from typing import Dict, List, Optional
import math

DECORATIVE_KEYWORDS = ["freepik"]
MAX_DEPTH = 10
MIN_ELEMENTS_PER_GROUP = 1

def is_decorative(name: str) -> bool:
    name = name.lower()
    return any(keyword in name for keyword in DECORATIVE_KEYWORDS)

def collect_bounding_boxes(node: Dict, depth=0, parent=None) -> List[Dict]:
    results = []
    
    if depth > MAX_DEPTH or is_decorative(node.get("name", "")):
        return []

    if "absoluteBoundingBox" in node:
        box = node["absoluteBoundingBox"]
        results.append({
            "x": box["x"],
            "y": box["y"],
            "width": box["width"],
            "height": box["height"],
            "name": node.get("name", "unknown"),
            "center_x": box["x"] + box["width"] / 2,
            "center_y": box["y"] + box["height"] / 2,
            "right_x": box["x"] + box["width"],
            "bottom_y": box["y"] + box["height"],
            "depth": depth,
            "parent": parent
        })
    
    for child in node.get("children", []):
        results.extend(collect_bounding_boxes(child, depth + 1, node.get("name", None)))
    return results

def load_figma_boxes(json_path: str) -> pd.DataFrame:
    """Parse a Figma JSON file and return a DataFrame of bounding boxes.

    지원되는 두 가지 주요 포맷
    1.  API 응답형 → {"nodes": {<fileKey>: {"document": {...}}}}
    2.  Canvas 저장형 → {"document": {...}}

    두 경우 모두 "document" 루트를 찾아 children 를 재귀 순회한다.
    """

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # ① 여러 포맷 탐색하여 루트 목록 추출
    if "nodes" in data:  # API 응답형
        roots = [v.get("document", {}) for v in data["nodes"].values()]
    elif "document" in data:  # Canvas 저장형
        roots = [data["document"]]
    else:
        raise ValueError("Unsupported JSON structure: no 'nodes' or 'document' key")

    records = []
    for root in roots:
        records.extend(collect_bounding_boxes(root))

    return pd.DataFrame(records)
  
def alignment_error(group: pd.DataFrame, axis: str, alignment_type: str) -> float:
    if alignment_type == "left" or alignment_type == "top":
        base = group[f"{axis}"].min()
        error = np.abs(group[f"{axis}"] - base)
    elif alignment_type == "center":
        base = group[f"center_{axis}"].median()
        error = np.abs(group[f"center_{axis}"] - base)
    elif alignment_type == "right" or alignment_type == "bottom":
        base = group[f"{'right_x' if axis == 'x' else 'bottom_y'}"].max()
        error = np.abs(group[f"{'right_x' if axis == 'x' else 'bottom_y'}"] - base)
    else:
        return float("inf")
    return error.mean()

def compute_alignment_scores(df: pd.DataFrame, cluster_col: str, axis: str, threshold: float = 0.5) -> pd.DataFrame:
    alignment_keys = {
        "x": ["left", "center", "right"],
        "y": ["top", "center", "bottom"]
    }
    cluster_metrics = []

    for cid in sorted(df[cluster_col].unique()):
        group = df[df[cluster_col] == cid]
        if len(group) < MIN_ELEMENTS_PER_GROUP:
            continue

        errors = {key: alignment_error(group, axis, key) for key in alignment_keys[axis]}
        best_type = min(errors, key=errors.get)
        best_error = errors[best_type]
        norm_base = group["width"].median() + 1e-5 if axis == "x" else group["height"].median() + 1e-5
        if norm_base <= 1e-2 or len(group) > 200:
            continue

        norm_error = best_error / norm_base
        if not np.isfinite(norm_error) or norm_error > 1e4:
            norm_error = 1e4

        score = 1 / (1 + math.log(1 + norm_error))

        cluster_metrics.append({
            f"{cluster_col}": cid,
            "alignment_type": best_type,
            "alignment_error": round(best_error, 2),
            "normalized_error": round(norm_error, 4),
            "score": round(score, 4),
            "num_elements": len(group)
        })

    return pd.DataFrame(cluster_metrics)

def compute_local_group_alignment(df: pd.DataFrame, axis: str, threshold: float = 0.5) -> pd.DataFrame:
    alignment_keys = {
        "x": ["left", "center", "right"],
        "y": ["top", "center", "bottom"]
    }
    group_metrics = []
    for (depth, parent), group in df.groupby(["depth", "parent"]):
        if len(group) < MIN_ELEMENTS_PER_GROUP:
            continue

        errors = {k: alignment_error(group, axis, k) for k in alignment_keys[axis]}
        best_type = min(errors, key=errors.get)
        best_error = errors[best_type]
        
        norm_base = group["width"].median() + 1e-5 if axis == "x" else group["height"].median() + 1e-5
        if norm_base <= 1e-2 or len(group) > 200:
            continue

        norm_error = best_error / norm_base
        if not np.isfinite(norm_error) or norm_error > 1e4:
            norm_error = 1e4  # clipping

        score = 1 / (1 + math.log(1 + norm_error))

        group_metrics.append({
            "depth": depth,
            "parent": parent,
            "alignment_type": best_type,
            "alignment_error": round(best_error, 2),
            "normalized_error": round(norm_error, 4),
            "score": round(score, 4),
            "num_elements": len(group)
        })
    return pd.DataFrame(group_metrics)

def analyze_grid_alignment(json_path: str, n_col_clusters: int = 3, n_row_clusters: int = 5) -> Dict[str, pd.DataFrame]:
    df = load_figma_boxes(json_path)
    n_samples = len(df)
    n_col_clusters = min(n_col_clusters, n_samples) if n_samples > 0 else 1
    n_row_clusters = min(n_row_clusters, n_samples) if n_samples > 0 else 1

    kmeans_x = KMeans(n_clusters=n_col_clusters, random_state=0).fit(df[["center_x"]])
    kmeans_y = KMeans(n_clusters=n_row_clusters, random_state=0).fit(df[["center_y"]])

    df["col_cluster"] = kmeans_x.predict(df[["center_x"]])
    df["row_cluster"] = kmeans_y.predict(df[["center_y"]])

    col_scores = compute_alignment_scores(df, "col_cluster", axis="x")
    row_scores = compute_alignment_scores(df, "row_cluster", axis="y")
    local_col = compute_local_group_alignment(df, axis="x")
    local_row = compute_local_group_alignment(df, axis="y")

    return {
        "df": df,
        "col_alignment": col_scores,
        "row_alignment": row_scores,
        "local_col_alignment": local_col,
        "local_row_alignment": local_row
    }

def compute_global_alignment_score(*score_dfs: pd.DataFrame) -> float:
    scores = []
    for df in score_dfs:
        if not df.empty:
            scores.append(df["score"].mean())
    return round(np.mean(scores), 4) if scores else 0.0

def compute_alignment_score(gt_json_path: str, gen_json_path: Optional[str] = None, threshold: float = 0.2) -> Dict[str, any]:
    gt_results = analyze_grid_alignment(gt_json_path)
    gt_score = compute_global_alignment_score(
        gt_results["col_alignment"],
        gt_results["row_alignment"],
        gt_results["local_col_alignment"],
        gt_results["local_row_alignment"]
    )

    results = {
        "gt_score": gt_score,
        "gt_detail": {
            "col_alignment": gt_results["col_alignment"],
            "row_alignment": gt_results["row_alignment"],
            "local_col_alignment": gt_results["local_col_alignment"],
            "local_row_alignment": gt_results["local_row_alignment"]
        }
    }

    if gen_json_path:
        gen_results = analyze_grid_alignment(gen_json_path)
        gen_score = compute_global_alignment_score(
            gen_results["col_alignment"],
            gen_results["row_alignment"],
            gen_results["local_col_alignment"],
            gen_results["local_row_alignment"]
        )
        results["gen_score"] = gen_score
        results["gen_detail"] = {
            "col_alignment": gen_results["col_alignment"],
            "row_alignment": gen_results["row_alignment"],
            "local_col_alignment": gen_results["local_col_alignment"],
            "local_row_alignment": gen_results["local_row_alignment"]
        }
        results["difference"] = round(gt_score - gen_score, 4)

    return results
