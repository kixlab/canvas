from __future__ import annotations
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt
import cv2
from tensorflow.keras.models import load_model
from util import get_model_by_name, create_losses

_EPS = 1e-8


def _normalize_sum(arr: np.ndarray) -> np.ndarray:
    """Normalize the array so that it sums to 1 (probability distribution).
    If the sum is 0, the original array is returned.
    """
    total = float(arr.sum())
    if total > 0:
        return arr / total
    return arr


def _normalize_range(arr: np.ndarray) -> np.ndarray:
    """Normalize the array into [0, 1] range using min-max scaling."""
    arr_min = float(arr.min())
    arr_max = float(arr.max())
    if arr_max - arr_min > _EPS:
        return (arr - arr_min) / (arr_max - arr_min)
    return np.zeros_like(arr)


def cc(map1: np.ndarray, map2: np.ndarray) -> float:
    """Correlation Coefficient (CC) between two saliency maps.

    Maps are first range-normalized to [0, 1], then zero-meaned/standardized,
    and finally Pearson correlation is computed.
    """
    m1 = _normalize_range(map1).astype(np.float32)
    m2 = _normalize_range(map2).astype(np.float32)

    m1 = (m1 - m1.mean()) / (m1.std() + _EPS)
    m2 = (m2 - m2.mean()) / (m2.std() + _EPS)
    return float(np.mean(m1 * m2))


def similarity(map1: np.ndarray, map2: np.ndarray) -> float:
    """Histogram Intersection similarity (SIM) between two saliency maps.

    Both maps are L1-normalized to sum to 1, then the element-wise minima are
    summed. The maximum possible value is 1 (identical maps).
    """
    p = _normalize_sum(map1.astype(np.float32))
    q = _normalize_sum(map2.astype(np.float32))
    return float(np.sum(np.minimum(p, q)))


def kl_divergence(map1: np.ndarray, map2: np.ndarray) -> float:
    """Kullback-Leibler (KL) divergence D(P || Q) between two saliency maps.

    Maps are treated as probability distributions (sum to 1). A small epsilon
    is added for numerical stability.
    """
    p = _normalize_sum(map1.astype(np.float32)) + _EPS
    q = _normalize_sum(map2.astype(np.float32)) + _EPS

    return float(np.sum(p * np.log(p / q)))


__all__ = ["cc", "similarity", "kl_divergence"]


def _normalize_map(saliency_map):
    saliency_map = saliency_map.astype(np.float32)
    min_val = saliency_map.min()
    max_val = saliency_map.max()
    if max_val - min_val > 1e-8:
        return (saliency_map - min_val) / (max_val - min_val)
    else:
        return np.zeros_like(saliency_map)


_IMAGENET_MEAN_BGR = np.array([103.939, 116.779, 123.68], dtype=np.float32)


def preprocess_image(img_path: str) -> np.ndarray:
    img = cv2.imread(img_path)  # BGR, uint8 0-255
    if img is None:
        raise FileNotFoundError(img_path)
    img = cv2.resize(img, (256, 256), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    img -= _IMAGENET_MEAN_BGR  # mean subtraction
    img = img[np.newaxis, ...]  # (1,H,W,3)
    return img


def predict_saliency(model, img_path: str) -> np.ndarray:
    x = preprocess_image(img_path)
    heatmap = model.predict(x, verbose=0)[0][0, :, :, 0]
    heatmap = cv2.resize(heatmap, (320, 240), interpolation=cv2.INTER_LINEAR)
    return _normalize_map(heatmap)


def get_gt_gen_pairs(base_dir, model, variant):
    base_path = Path(base_dir)
    gt_dir = base_path / "benchmarks" / "generation_gt"
    gen_dir = base_path / "results" / "generation_gen" / model / variant

    pairs = []
    for item in gen_dir.iterdir():
        if not item.is_dir():
            continue
        parts = item.name.split(f"-{model}")
        if not parts:
            continue
        gt_id = parts[0]
        gt_img = gt_dir / f"{gt_id}.png"
        gen_img = item / f"{item.name}.png"
        if gt_img.exists() and gen_img.exists():
            pairs.append((gt_id, gt_img, gen_img))
    return pairs


# --- Main script ---


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Run on all GT/Gen pairs")
    parser.add_argument(
        "--base_dir",
        type=str,
        default="/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset_sample",
    )
    parser.add_argument("--model", type=str, default="gpt-4o")
    parser.add_argument("--variant", type=str, default="image_only")
    parser.add_argument("--out_dir", type=str, default="visual_saliency_eval")
    parser.add_argument("--gt_path", type=str)
    parser.add_argument("--gen_path", type=str)
    args = parser.parse_args()

    model_name = "UMSI"
    load_weights = True
    weightspath = "/home/seooyxx/kixlab/samsung-cxi-mcp-server/tools/UEyes-CHI2023/model_weights/saliency_models/UMSI++/umsi++.hdf5"
    model_inp_size = (256, 256)
    model_out_size = (512, 512)
    losses = {
        "kl": 10,
        "cc": -3,
    }

    model_params = {
        "input_shape": model_inp_size + (3,),
        "n_outs": len(losses),
    }
    model_func, mode = get_model_by_name(model_name)
    assert mode == "simple"
    model = model_func(**model_params)

    if load_weights:
        model.load_weights(weightspath, by_name=True)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    figure_dir = out_dir / "figure"
    figure_dir.mkdir(parents=True, exist_ok=True)

    results = []

    if args.all:
        pairs = get_gt_gen_pairs(args.base_dir, args.model, args.variant)
    else:
        if not args.gt_path or not args.gen_path:
            raise ValueError(
                "For single-case mode, --gt_path and --gen_path must be provided."
            )
        pairs = [("manual_case", Path(args.gt_path), Path(args.gen_path))]

    for case_id, gt_img_path, gen_img_path in pairs:
        print(f"Evaluating: {case_id}")
        gt_sal = predict_saliency(model, str(gt_img_path))
        gen_sal = predict_saliency(model, str(gen_img_path))

        # Load original images to get true sizes (can differ per image)
        gt_img_cv = cv2.imread(str(gt_img_path))
        gen_img_cv = cv2.imread(str(gen_img_path))

        gt_original_size = (gt_img_cv.shape[1], gt_img_cv.shape[0])  # (width, height)
        gen_original_size = (gen_img_cv.shape[1], gen_img_cv.shape[0])

        # Resize saliency maps back to original sizes for saving / overlay
        gt_sal_resized = cv2.resize(
            (gt_sal * 255).astype(np.uint8),
            gt_original_size,
            interpolation=cv2.INTER_LINEAR,
        )
        gen_sal_resized = cv2.resize(
            (gen_sal * 255).astype(np.uint8),
            gen_original_size,
            interpolation=cv2.INTER_LINEAR,
        )

        # Save resized saliency maps
        gt_sal_path = out_dir / f"{case_id}_gt_saliency.png"
        gen_sal_path = out_dir / f"{case_id}_gen_saliency.png"
        cv2.imwrite(str(gt_sal_path), gt_sal_resized)
        cv2.imwrite(str(gen_sal_path), gen_sal_resized)

        # Create overlays using resized saliency maps
        gt_overlay = cv2.addWeighted(
            gt_img_cv, 0.6, cv2.applyColorMap(gt_sal_resized, cv2.COLORMAP_JET), 0.4, 0
        )
        gen_overlay = cv2.addWeighted(
            gen_img_cv,
            0.6,
            cv2.applyColorMap(gen_sal_resized, cv2.COLORMAP_JET),
            0.4,
            0,
        )
        cv2.imwrite(str(out_dir / f"{case_id}_gt_overlay.png"), gt_overlay)
        cv2.imwrite(str(out_dir / f"{case_id}_gen_overlay.png"), gen_overlay)

        print(f"GT Saliency Map Saved: {gt_sal_path}")
        print(f"Generated Saliency Map Saved: {gen_sal_path}")
        print(f"GT Overlay Saved: {out_dir / f'{case_id}_gt_overlay.png'}")
        print(f"Generated Overlay Saved: {out_dir / f'{case_id}_gen_overlay.png'}")

        # Print statistics for debugging
        print(
            f"GT Saliency Map - min: {gt_sal.min()}, max: {gt_sal.max()}, mean: {gt_sal.mean()}, std: {gt_sal.std()}"
        )
        print(
            f"Generated Saliency Map - min: {gen_sal.min()}, max: {gen_sal.max()}, mean: {gen_sal.mean()}, std: {gen_sal.std()}"
        )

        # Compute metrics
        metrics = {
            "id": case_id,
            "cc": round(cc(gt_sal, gen_sal), 4),
            "sim": round(similarity(gt_sal, gen_sal), 4),
            "kl": round(kl_divergence(gt_sal, gen_sal), 4),
        }
        print(f"  CC: {metrics['cc']}  SIM: {metrics['sim']}  KL: {metrics['kl']}")
        results.append(metrics)

        # For Comparison Plot
        orig_rgb = cv2.cvtColor(gt_img_cv, cv2.COLOR_BGR2RGB)
        gt_ov_rgb = cv2.cvtColor(gt_overlay, cv2.COLOR_BGR2RGB)
        gen_ov_rgb = cv2.cvtColor(gen_overlay, cv2.COLOR_BGR2RGB)

        fig, axes = plt.subplots(1, 3, figsize=(18, 6))

        axes[0].imshow(orig_rgb)
        axes[0].set_title("Original")
        axes[1].imshow(gt_ov_rgb)
        axes[1].set_title("GT overlay")
        axes[2].imshow(gen_ov_rgb)
        axes[2].set_title(
            f"Gen overlay\nCC={metrics['cc']}  SIM={metrics['sim']}  KL={metrics['kl']}"
        )

        for ax in axes:
            ax.axis("off")

        fig.tight_layout()
        fig_path = figure_dir / f"{case_id}_visual_saliency.png"
        fig.savefig(fig_path, dpi=300)
        plt.close(fig)

        print(f"Figure saved: {fig_path}")

    # Save results
    with open(out_dir / "saliency_comparison_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
