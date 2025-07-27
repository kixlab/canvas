from typing import List, Dict, Tuple
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from matplotlib.patches import FancyBboxPatch

def visualize_matches(
    gt_img_path: str,
    gen_img_path: str,
    gt_boxes: List[Dict],
    gen_boxes: List[Dict],
    matches: List[Tuple[int, int]],
    iou_matrix: np.ndarray,
    text_scores: List[float],
    color_scores: List[float],
    position_scores: List[float],
    output_path: str,
):
    """
    Create visualization of matched bounding boxes with comprehensive legend table.
    Generates publication-ready visualization with clean design.
    """
    try:
        gt_img = plt.imread(gt_img_path)
        gen_img = plt.imread(gen_img_path)
    except FileNotFoundError as e:
        print(f"Image not found: {e}. Creating blank images instead.")
        gt_img = np.ones((1000, 1000, 3), dtype=np.uint8) * 255
        gen_img = np.ones((1000, 1000, 3), dtype=np.uint8) * 255

    # Figure setup: 3 subplots (GT, GEN, Legend)
    fig = plt.figure(figsize=(30, 12))
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 0.8])
    
    ax1 = fig.add_subplot(gs[0])  # GT
    ax2 = fig.add_subplot(gs[1])  # GEN
    ax3 = fig.add_subplot(gs[2])  # Legend

    # Display images
    ax1.imshow(gt_img)
    ax1.set_title("Ground Truth", fontsize=16, fontweight='bold')
    ax1.axis('off')
    
    ax2.imshow(gen_img)
    ax2.set_title("Generated", fontsize=16, fontweight='bold')
    ax2.axis('off')

    gt_h, gt_w, _ = gt_img.shape
    gen_h, gen_w, _ = gen_img.shape

    # Score mapping
    text_scores_map = {m: s for m, s in zip(matches, text_scores)}
    color_scores_map = {m: s for m, s in zip(matches, color_scores)}
    position_scores_map = {m: s for m, s in zip(matches, position_scores)}

    # Prepare legend table data
    legend_data = []
    
    for match_idx, (i, j) in enumerate(matches, 1):
        gt_box = gt_boxes[i]
        gen_box = gen_boxes[j]
        
        # Draw bounding boxes (use muted colors)
        gt_rect = patches.Rectangle(
            (gt_box['x'] * gt_w, gt_box['y'] * gt_h),
            gt_box['width'] * gt_w,
            gt_box['height'] * gt_h,
            linewidth=2, edgecolor='#2E86AB', facecolor='none'  # muted blue
        )
        ax1.add_patch(gt_rect)
        
        gen_rect = patches.Rectangle(
            (gen_box['x'] * gen_w, gen_box['y'] * gen_h),
            gen_box['width'] * gen_w,
            gen_box['height'] * gen_h,
            linewidth=2, edgecolor='#A23B72', facecolor='none'  # muted red
        )
        ax2.add_patch(gen_rect)

        # Display only match number (clean design)
        ax1.text(gt_box['x'] * gt_w, gt_box['y'] * gt_h - 5, f"#{match_idx}",
                 color='white', fontsize=10, fontweight='bold',
                 bbox=dict(facecolor='#2E86AB', alpha=0.8, boxstyle='round,pad=0.3'))
        
        ax2.text(gen_box['x'] * gen_w, gen_box['y'] * gen_h - 5, f"#{match_idx}",
                 color='white', fontsize=10, fontweight='bold',
                 bbox=dict(facecolor='#A23B72', alpha=0.8, boxstyle='round,pad=0.3'))

        # Collect legend data
        iou_score = iou_matrix[i, j]
        txt_score = text_scores_map.get((i, j), 0.0)
        clr_score = color_scores_map.get((i, j), 0.0)
        pos_score = position_scores_map.get((i, j), 0.0)
        
        # Handle None values as "N/A"
        txt_score_str = f"{txt_score:.3f}" if txt_score is not None else "N/A"
        
        legend_data.append([
            match_idx,
            i,
            j,
            f"{iou_score:.3f}",
            txt_score_str,
            f"{clr_score:.3f}",
            f"{pos_score:.3f}"
        ])

    # Create legend table
    ax3.axis('off')
    
    # Table headers
    headers = ['Match#', 'GT ID', 'GEN ID', 'IoU', 'TextSim', 'ColorSim', 'PosSim']
    
    # Create table
    table = ax3.table(
        cellText=legend_data,
        colLabels=headers,
        cellLoc='center',
        loc='center',
        bbox=[0, 0, 1, 1]
    )
    
    # Style table
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1, 2)
    
    # Style headers
    for i in range(len(headers)):
        table[(0, i)].set_facecolor('#4A4A4A')
        table[(0, i)].set_text_props(weight='bold', color='white')
    
    # Style data rows (striped pattern)
    for i in range(1, len(legend_data) + 1):
        for j in range(len(headers)):
            cell = table[(i, j)]
            if i % 2 == 0:
                cell.set_facecolor('#F5F5F5')
            else:
                cell.set_facecolor('white')
            cell.set_text_props(color='black')
    
    # Table title
    ax3.set_title("Matching Details", fontsize=14, fontweight='bold', pad=20)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Visualization saved to {output_path}") 