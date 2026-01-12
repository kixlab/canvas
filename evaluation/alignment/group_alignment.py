from typing import Dict, List, Tuple, Any, DefaultDict, Sequence, Optional
from collections import defaultdict
import json
import os
import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment
from evaluation.layout.hungarian_iou import (
    load_boxes_from_json,
    compute_iou,
    draw_boxes_on_image_gt,
    draw_boxes_on_image_gen,
)

TOLERANCE: float = 0.02
MIN_ELEMENTS_PER_GROUP = 2

AlignmentGroup = Dict[str, Any]


# --------------------------- Alignment group detection --------------------------- #


def _round_coord(coord: float, tol: float) -> int:
    """Convert a coordinate to an integer bucket index based on tolerance."""
    return int(round(coord / tol))


def _union_bbox(boxes: Sequence[Dict]) -> Tuple[float, float, float, float]:
    """Return the union bounding box (x, y, w, h) of multiple boxes (normalized)."""
    min_x = min(b["x"] for b in boxes)
    min_y = min(b["y"] for b in boxes)
    max_x = max(b["x"] + b["width"] for b in boxes)
    max_y = max(b["y"] + b["height"] for b in boxes)
    return min_x, min_y, max_x - min_x, max_y - min_y


def build_alignment_groups(
    json_path: str, tol: float = TOLERANCE
) -> List[AlignmentGroup]:
    """Extract alignment groups from a Figma JSON file."""
    boxes, _frame = load_boxes_from_json(json_path)  # 정규화 좌표 (0-1)

    buckets: DefaultDict[Tuple[str, int], List[Dict]] = defaultdict(list)

    for b in boxes:
        left = b["x"]
        center_x = b["x"] + b["width"] / 2
        right = b["x"] + b["width"]
        top = b["y"]
        center_y = b["y"] + b["height"] / 2
        bottom = b["y"] + b["height"]

        # X-축
        buckets[("x_left", _round_coord(left, tol))].append(b)
        buckets[("x_center", _round_coord(center_x, tol))].append(b)
        buckets[("x_right", _round_coord(right, tol))].append(b)
        # Y-축
        buckets[("y_top", _round_coord(top, tol))].append(b)
        buckets[("y_center", _round_coord(center_y, tol))].append(b)
        buckets[("y_bottom", _round_coord(bottom, tol))].append(b)

    groups: List[AlignmentGroup] = []
    for (atype, _), members in buckets.items():
        if len(members) < MIN_ELEMENTS_PER_GROUP:
            continue  # skip tiny groups
        x, y, w, h = _union_bbox(members)
        groups.append(
            {
                "alignment_type": atype,  # e.g., "x_left", "y_center"
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "members": members,
            }
        )

    return groups


# ------------------------- Hungarian matching & evaluation -------------------------- #


def _bbox_iou(a: AlignmentGroup, b: AlignmentGroup) -> float:
    return compute_iou(a, b)  # type: ignore[arg-type]


def match_alignment_groups(
    gt_groups: List[AlignmentGroup], gen_groups: List[AlignmentGroup]
):
    n_gt, n_gen = len(gt_groups), len(gen_groups)
    if n_gt == 0 or n_gen == 0:
        return [], []

    cost = np.ones((n_gt, n_gen))  # default 1 → iou 0
    iou_mat = np.zeros((n_gt, n_gen))
    for i, g in enumerate(gt_groups):
        for j, g2 in enumerate(gen_groups):
            iou = _bbox_iou(g, g2)
            iou_mat[i, j] = iou
            cost[i, j] = 1 - iou

    row_ind, col_ind = linear_sum_assignment(cost)
    matched_pairs = [
        (i, j, iou_mat[i, j]) for i, j in zip(row_ind, col_ind) if iou_mat[i, j] > 0.0
    ]
    return matched_pairs, iou_mat


# --------------------------- 메인 Metric 함수 --------------------------- #


def compute_alignment_score(
    gt_json_path: str,
    gen_json_path: Optional[str] = None,
    tol: float = TOLERANCE,
    out_dir: Optional[str] = None,
    case_id: str = "caseX",
    gt_img_path: Optional[str] = None,
    gen_img_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute Precision, Recall, F1 for alignment between GT and generated layouts."""

    gt_groups = build_alignment_groups(gt_json_path, tol)
    gen_groups = build_alignment_groups(gen_json_path, tol) if gen_json_path else []

    # Hungarian 매칭
    matched_pairs, _iou_mat = match_alignment_groups(gt_groups, gen_groups)

    # 정렬 타입 일치 여부 확인
    correct = 0
    for i, j, _iou in matched_pairs:
        if gt_groups[i]["alignment_type"] == gen_groups[j]["alignment_type"]:
            correct += 1

    precision = correct / len(gen_groups) if gen_groups else 1.0
    recall = correct / len(gt_groups) if gt_groups else 1.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    # -------------------- Visualization (optional) -------------------- #
    if out_dir:
        os.makedirs(os.path.join(out_dir, case_id), exist_ok=True)

        def _group_to_box(g: AlignmentGroup):
            return {
                "x": g["x"],
                "y": g["y"],
                "width": g["width"],
                "height": g["height"],
                "name": g["alignment_type"],
                "type": "ALIGN",
            }

        # GT visualization
        if gt_img_path and os.path.exists(gt_img_path):
            img = draw_boxes_on_image_gt(
                gt_img_path,
                [_group_to_box(g) for g in gt_groups],
                (0, 255, 0),
                label_prefix="GT_",
            )
            if img is not None:
                cv2.imwrite(
                    os.path.join(out_dir, case_id, "gt_alignment_groups.jpg"), img
                )
        # Gen visualization
        if gen_img_path and os.path.exists(gen_img_path):
            img = draw_boxes_on_image_gen(
                gen_img_path,
                [_group_to_box(g) for g in gen_groups],
                (255, 0, 0),
                label_prefix="GEN_",
            )
            if img is not None:
                cv2.imwrite(
                    os.path.join(out_dir, case_id, "gen_alignment_groups.jpg"), img
                )

        # Save matching report
        summary = {
            "gt_num_groups": len(gt_groups),
            "gen_num_groups": len(gen_groups),
            "num_matched": len(matched_pairs),
            "correct": correct,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "matched_pairs": [
                {
                    "gt": gt_groups[i]["alignment_type"],
                    "gen": gen_groups[j]["alignment_type"],
                    "iou": round(_iou, 3),
                    "is_correct": gt_groups[i]["alignment_type"]
                    == gen_groups[j]["alignment_type"],
                }
                for i, j, _iou in matched_pairs
            ],
        }
        with open(
            os.path.join(out_dir, case_id, "alignment_report.json"),
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(summary, f, indent=2)

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "num_gt_groups": len(gt_groups),
        "num_gen_groups": len(gen_groups),
        "num_correct_aligned": correct,
    }
