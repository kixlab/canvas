import json
from typing import Dict, Set


def _extract_paths(node: Dict, prefix: str = "", by_type_only: bool = False) -> Set[str]:
    """Recursively collect unique node paths.

    If by_type_only=True, only the node type is kept (e.g., /FRAME/TEXT) to assess
    structural similarity independent of naming. Otherwise, path includes name:type.
    """
    name = node.get("name", "unknown").strip().lower()
    ntype = node.get("type", "unknown")

    if by_type_only:
        segment = ntype
    else:
        segment = f"{name}:{ntype}"

    current = f"{prefix}/{segment}" if prefix else f"/{segment}"
    paths: Set[str] = {current}
    for child in node.get("children", []):
        paths.update(_extract_paths(child, current, by_type_only))
    return paths


def _load_root(json_path: str) -> Dict:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # support figma node json formats
    if "document" in data:
        return data["document"]
    if "nodes" in data:
        return list(data["nodes"].values())[0]["document"]
    raise ValueError("Unsupported JSON structure for tree edit metric.")


def compute_tree_similarity(gt_json: str, gen_json: str, *, by_type_only: bool = False) -> Dict[str, float]:
    """Compute a simple Jaccard-based tree structural similarity between two figma JSON files.

    The similarity is defined as |intersection(nodes)| / |union(nodes)| where each node is represented
    by its full path of 'name:type'. This is a lightweight proxy for true tree-edit distance but
    requires no external native libraries and runs fast.
    """
    gt_root = _load_root(gt_json)
    gen_root = _load_root(gen_json)

    gt_paths = _extract_paths(gt_root, by_type_only=by_type_only)
    gen_paths = _extract_paths(gen_root, by_type_only=by_type_only)

    intersection = gt_paths & gen_paths
    union = gt_paths | gen_paths

    jaccard = len(intersection) / len(union) if union else 1.0
    distance = 1 - jaccard

    return {
        "gt_nodes": len(gt_paths),
        "gen_nodes": len(gen_paths),
        "intersection": len(intersection),
        "union": len(union),
        "jaccard": round(jaccard, 4),
        "distance": round(distance, 4),
    }
