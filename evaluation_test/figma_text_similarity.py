import json
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer, util


def extract_text_nodes(node: Dict, results: List[Dict], depth: int = 0):
    """Recursive TEXT node extraction"""
    node_type = node.get("type")
    name = node.get("name", "")
    characters = node.get("characters") or node.get("textData", {}).get("characters", "")
    
    if node_type == "TEXT" and characters:
        results.append({
            "type": node_type,
            "name": name,
            "characters": characters.strip(),
            "depth": depth
        })
    
    for child in node.get("children", []):
        extract_text_nodes(child, results, depth + 1)


def load_figma_text_nodes(json_path: Path) -> List[Dict]:
    data = json.loads(json_path.read_text())
    if "document" in data:
        root = data["document"]
    elif "nodes" in data:
        root = list(data["nodes"].values())[0]["document"]
    else:
        raise ValueError("Invalid Figma JSON format.")
    
    results = []
    extract_text_nodes(root, results)
    return results


def compute_text_similarity(
    gt_boxes: List[Dict],
    gen_boxes: List[Dict],
    matches: List[Tuple[int, int]],
) -> Tuple[float, List[float]]:
    """
    Compute text similarity for matched block pairs.
    Only evaluate TEXT type elements, return None for others.
    """
    model = SentenceTransformer("all-MiniLM-L6-v2")
    scores = []
    text_scores = []  # Store scores for TEXT elements only

    for i, j in matches:
        gt_box = gt_boxes[i]
        gen_box = gen_boxes[j]
        
        # Return None for non-TEXT elements
        if gt_box.get("type") != "TEXT" or gen_box.get("type") != "TEXT":
            scores.append(None)
            continue
            
        gt_text = gt_box.get("characters")
        gen_text = gen_box.get("characters")

        # Both blocks must have text for similarity calculation
        if gt_text and gen_text:
            gt_text = gt_text.strip()
            gen_text = gen_text.strip()

            if gt_text and gen_text:
                embeddings = model.encode([gt_text, gen_text], convert_to_tensor=True)
                cosine_sim = util.cos_sim(embeddings[0], embeddings[1]).item()
                scores.append(cosine_sim)
                text_scores.append(cosine_sim)  # Store TEXT element score
            else:
                scores.append(None)  # Empty text case
        else:
            scores.append(None)  # No text case
    
    # Calculate average for TEXT elements only
    overall_score = float(np.mean(text_scores)) if text_scores else 0.0
    return overall_score, scores



def visualize_similarity_matrix(sim_matrix: np.ndarray, gt_nodes: List[Dict], gen_nodes: List[Dict]):
    plt.figure(figsize=(10, 8))
    plt.imshow(sim_matrix, cmap='viridis', aspect='auto')
    plt.colorbar(label='Cosine Similarity')
    plt.xlabel("Generated Nodes")
    plt.ylabel("GT Nodes")
    plt.title("Text Embedding Cosine Similarity")
    plt.xticks(ticks=np.arange(len(gen_nodes)), labels=[f"{n['name']} ({n['characters']})" for n in gen_nodes], rotation=90)
    plt.yticks(ticks=np.arange(len(gt_nodes)), labels=[f"{n['name']} ({n['characters']})" for n in gt_nodes])
    plt.tight_layout()
    plt.show()


def main(gt_path: str, gen_path: str):
    gt_nodes = load_figma_text_nodes(Path(gt_path))
    gen_nodes = load_figma_text_nodes(Path(gen_path))

    print(f"[INFO] Extracted {len(gt_nodes)} GT text nodes, {len(gen_nodes)} Gen text nodes")

    sim_matrix, matched = compute_text_similarity(gt_nodes, gen_nodes)

    print("\n=== Matched Node Pairs (Top by Similarity) ===")
    for i, j, score in sorted(matched, key=lambda x: -x[2]):
        print(f"GT[{i}] ({gt_nodes[i]['name']}) ↔ Gen[{j}] ({gen_nodes[j]['name']}) | Similarity: {score:.4f}")
        print(f"  GT text: {gt_nodes[i]['characters']}")
        print(f"  Gen text: {gen_nodes[j]['characters']}\n")

    visualize_similarity_matrix(sim_matrix, gt_nodes, gen_nodes)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--gt", 
        type=str, 
        default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/benchmarks/replication_gt/gid1-10.json",
        help="Path to GT JSON (e.g., gid1-10.json)"
    )
    parser.add_argument(
        "--gen", 
        type=str, 
        default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/results/replication_gen/image_only/gid1-10-gemini-2.5-pro-image_only/gid1-10-gemini-2.5-pro-image_only-json-structure.json",
        help="Path to generated JSON (e.g., gpt-4.1*.json)"
    )
    args = parser.parse_args()

    main(args.gt, args.gen)