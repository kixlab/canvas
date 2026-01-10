import argparse
from pathlib import Path
import numpy as np

from figma_block_matcher import load_and_normalize_boxes, hungarian_bbox_matching
from figma_text_position_matcher import hungarian_text_position_matching
from figma_text_similarity import compute_text_similarity
from figma_color_similarity import compute_color_similarity
from figma_text_coverage import compute_text_coverage_metrics
from figma_position_similarity import compute_position_similarity
from visualization import visualize_matches

def main():
    parser = argparse.ArgumentParser(description="Figma GT and GEN similarity evaluation")
    parser.add_argument("--gt", type=str, default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/benchmarks/replication_gt/gid1-10.json", help="GT Figma JSON file path")
    parser.add_argument("--gen", type=str, default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/results/replication_gen/image_only/gid1-10-gemini-2.5-pro-image_only/gid1-10-gemini-2.5-pro-image_only-json-structure.json", help="Generated Figma JSON file path")
    parser.add_argument("--gt-img", type=str, default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/benchmarks/replication_gt/gid1-10.png", help="GT image file path")
    parser.add_argument("--gen-img", type=str, default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/results/replication_gen/image_only/gid1-10-gemini-2.5-pro-image_only/gid1-10-gemini-2.5-pro-image_only-canvas.png", help="Generated image file path")
    parser.add_argument("--output", type=str, default="visualization.png", help="Visualization output path")
    parser.add_argument("--alpha", type=float, default=0.5, help="Text similarity weight")
    parser.add_argument("--beta", type=float, default=0.5, help="Position similarity weight")
    args = parser.parse_args()

    # 1. Block extraction and separation
    print("1. Extracting blocks and separating text/non-text nodes...")
    gt_boxes, _ = load_and_normalize_boxes(Path(args.gt))
    gen_boxes, _ = load_and_normalize_boxes(Path(args.gen))

    gt_text_indices = [i for i, box in enumerate(gt_boxes) if box.get("type") == "TEXT" and box.get("characters", "").strip()]
    gt_other_indices = [i for i, box in enumerate(gt_boxes) if i not in gt_text_indices]
    gen_text_indices = [i for i, box in enumerate(gen_boxes) if box.get("type") == "TEXT" and box.get("characters", "").strip()]
    gen_other_indices = [i for i, box in enumerate(gen_boxes) if i not in gen_text_indices]

    gt_text_boxes = [gt_boxes[i] for i in gt_text_indices]
    gt_other_boxes = [gt_boxes[i] for i in gt_other_indices]
    gen_text_boxes = [gen_boxes[i] for i in gen_text_indices]
    gen_other_boxes = [gen_boxes[i] for i in gen_other_indices]

    print(f"  - GT: {len(gt_text_boxes)} text, {len(gt_other_boxes)} other")
    print(f"  - GEN: {len(gen_text_boxes)} text, {len(gen_other_boxes)} other")

    # 2. Perform matching
    print("\n2. Performing matching...")
    text_matches_local, _, _ = hungarian_text_position_matching(
        gt_text_boxes, gen_text_boxes, args.alpha, args.beta
    )
    text_matches = [(gt_text_indices[i], gen_text_indices[j]) for i, j in text_matches_local]
    print(f"  - Text nodes: {len(text_matches)} matched (Alignment-based)")
    
    other_matches_local, iou_matrix_other = hungarian_bbox_matching(gt_other_boxes, gen_other_boxes)
    other_matches = [(gt_other_indices[i], gen_other_indices[j]) for i, j in other_matches_local]
    print(f"  - Non-text nodes: {len(other_matches)} matched (IoU-based)")

    all_matches = text_matches + other_matches
    print(f"\n  - Total {len(all_matches)} block pairs matched.")

    # 3. Evaluate similarities (matching-based)
    print("\n3. Evaluating matching-based similarities...")
    text_align_score, text_scores_per_match = compute_text_similarity(gt_boxes, gen_boxes, all_matches)
    color_score, color_scores_per_match = compute_color_similarity(gt_boxes, gen_boxes, all_matches)
    position_score, position_scores_per_match = compute_position_similarity(gt_boxes, gen_boxes, all_matches)
    print(f"  - Text Alignment Score (reference): {text_align_score:.4f}")
    print(f"  - Color Similarity: {color_score:.4f}")
    print(f"  - Position Similarity: {position_score:.4f}")

    # Detailed analysis of matched text pairs
    print("\n  === Detailed Analysis of Matched Text Pairs ===")
    for idx, (i, j) in enumerate(all_matches):
        gt_box = gt_boxes[i]
        gen_box = gen_boxes[j]
        sim_score = text_scores_per_match[idx] if idx < len(text_scores_per_match) else None
        
        # Display non-TEXT elements separately
        if gt_box.get("type") != "TEXT" or gen_box.get("type") != "TEXT":
            print(f"  Match {i}↔{j}:")
            print(f"    GT: [{gt_box.get('type', 'UNKNOWN')}] - '{gt_box.get('characters', '')}'")
            print(f"    GEN: [{gen_box.get('type', 'UNKNOWN')}] - '{gen_box.get('characters', '')}'")
            print(f"    Similarity: N/A (Non-TEXT element)")
            print()
        else:
            gt_text = gt_box.get("characters") or ""
            gen_text = gen_box.get("characters") or ""
            gt_text = gt_text.strip() if gt_text else ""
            gen_text = gen_text.strip() if gen_text else ""
            
            sim_display = f"{sim_score:.4f}" if sim_score is not None else "N/A"
            print(f"  Match {i}↔{j}:")
            print(f"    GT: '{gt_text}'")
            print(f"    GEN: '{gen_text}'")
            print(f"    Similarity: {sim_display}")
            print()

    # 4. Evaluate text coverage (matching-independent)
    print("\n4. Evaluating text coverage (matching-independent)...")
    text_coverage = compute_text_coverage_metrics(gt_boxes, gen_boxes)
    print(f"  - Text Precision: {text_coverage['precision']:.4f}")
    print(f"  - Text Recall: {text_coverage['recall']:.4f}")
    print(f"  - Text F1-Score: {text_coverage['f1_score']:.4f}")

    # 5. Prepare and execute visualization
    iou_matrix_full = np.zeros((len(gt_boxes), len(gen_boxes)))
    for i, j in other_matches:
        iou_matrix_full[i, j] = iou_matrix_other[gt_other_indices.index(i), gen_other_indices.index(j)]
    
    print("\n5. Creating visualization...")
    visualize_matches(
        args.gt_img,
        args.gen_img,
        gt_boxes,
        gen_boxes,
        all_matches,
        iou_matrix_full,
        text_scores_per_match,
        color_scores_per_match,
        position_scores_per_match,
        args.output,
    )

    print("\n--- Final Evaluation Results ---")
    print(f"  - Position Similarity: {position_score:.4f}")
    print(f"  - Color Similarity: {color_score:.4f}")
    print(f"  - Text F1 Score: {text_coverage['f1_score']:.4f}")
    print("--------------------------------")

if __name__ == "__main__":
    main()
