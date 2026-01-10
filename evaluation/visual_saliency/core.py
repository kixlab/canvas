from __future__ import annotations
import cv2
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Tuple, Optional
from evaluation.config import config
from .util import get_model_by_name

__all__ = [
    "predict_saliency_map",
    "save_saliency_outputs",
    "cc",
    "similarity",
    "kl_divergence",
]

# ------------------------------
# Model loading related settings
# ------------------------------

# Model identifier used by `get_model_by_name`
_MODEL_NAME: str = "UMSI"
_WEIGHTS_PATH: Path = Path(config.weights.saliency_model)
_MODEL_INP_SIZE: Tuple[int, int] = (256, 256)  # (H, W)
_IMAGENET_MEAN_BGR = np.array([103.939, 116.779, 123.68], dtype=np.float32)
_MODEL = None
_MODEL_LOADED = False


# ------------------------------
# Helper functions
# ------------------------------


def _normalize_map(saliency_map: np.ndarray) -> np.ndarray:
    """Normalize the saliency map to the [0, 1] range."""
    saliency_map = saliency_map.astype(np.float32)
    min_val = float(saliency_map.min())
    max_val = float(saliency_map.max())
    if max_val - min_val > 1e-8:
        return (saliency_map - min_val) / (max_val - min_val)
    return np.zeros_like(saliency_map)


def _load_model():
    """Load the model into memory (singleton pattern with improved error handling)."""
    global _MODEL, _MODEL_LOADED

    if _MODEL is not None and _MODEL_LOADED:
        return _MODEL

    # Temporarily suppress all output to prevent model loading output
    import sys
    import os
    from io import StringIO

    # Save original stdout and stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = StringIO()
    sys.stderr = StringIO()

    try:
        # Suppress TensorFlow warnings during model loading
        os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

        model_func, mode = get_model_by_name(_MODEL_NAME)
        assert mode == "simple", "Unsupported model mode: expected 'simple'"

        model = model_func(
            input_shape=_MODEL_INP_SIZE + (3,), n_outs=2
        )  # heatmap, classif
        model.load_weights(str(_WEIGHTS_PATH), by_name=True)
        _MODEL = model
        _MODEL_LOADED = True
        print(f"[Info] Saliency model '{_MODEL_NAME}' loaded successfully")
    except Exception as e:
        print(f"[Error] Failed to load saliency model: {e}")
        _MODEL = None
        _MODEL_LOADED = False
        raise
    finally:
        # Restore stdout and stderr
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    return _MODEL


def _batch_predict_saliency_maps(img_paths: list) -> list:
    """Predict saliency maps for multiple images in a single batch."""
    model = _load_model()
    if model is None:
        return [None] * len(img_paths)

    # Preprocess all images
    batch_inputs = []
    valid_indices = []

    for i, img_path in enumerate(img_paths):
        try:
            x = preprocess_image(img_path)
            batch_inputs.append(x)
            valid_indices.append(i)
        except Exception as e:
            print(f"[Warning] Failed to preprocess {img_path}: {e}")
            continue

    if not batch_inputs:
        return [None] * len(img_paths)

    # Batch prediction
    batch_inputs = np.concatenate(batch_inputs, axis=0)
    batch_outputs = model.predict(batch_inputs, verbose=0)

    # Process results
    results = [None] * len(img_paths)
    for i, idx in enumerate(valid_indices):
        try:
            heatmap = batch_outputs[0][i, :, :, 0]  # (H, W)
            heatmap = cv2.resize(heatmap, (320, 240), interpolation=cv2.INTER_LINEAR)
            results[idx] = _normalize_map(heatmap)
        except Exception as e:
            print(f"[Warning] Failed to process saliency map for {img_paths[idx]}: {e}")

    return results


# ------------------------------
# Public API
# ------------------------------


def preprocess_image(img_path: str) -> np.ndarray:
    """Convert an image file into the model input format (256 × 256, BGR, float32)."""
    img = cv2.imread(img_path)  # BGR, uint8 0-255
    if img is None:
        raise FileNotFoundError(img_path)
    img = cv2.resize(img, _MODEL_INP_SIZE, interpolation=cv2.INTER_LINEAR).astype(
        np.float32
    )
    img -= _IMAGENET_MEAN_BGR  # mean subtraction
    img = img[np.newaxis, ...]  # (1, H, W, 3)
    return img


def predict_saliency_map(img_path: str) -> np.ndarray:
    """Predict a saliency map for a single image and return it normalized to [0, 1]."""
    model = _load_model()
    x = preprocess_image(img_path)

    heatmap = model.predict(x, verbose=0)[0][0, :, :, 0]  # (H, W)
    heatmap = cv2.resize(heatmap, (320, 240), interpolation=cv2.INTER_LINEAR)
    return _normalize_map(heatmap)


def save_saliency_outputs(
    gt_img_path: str,
    gen_img_path: str,
    gt_sal: np.ndarray,
    gen_sal: np.ndarray,
    out_dir: str | Path,
    case_id: Optional[str] = None,
):
    """Save saliency maps, overlay images, and a comparison figure.

    Args:
        gt_img_path: Path to the ground-truth image.
        gen_img_path: Path to the generated image.
        gt_sal: Ground-truth saliency map (values in 0-1).
        gen_sal: Generated saliency map (values in 0-1).
        out_dir: Output directory where artifacts are saved.
        case_id: Identifier used in filenames; if *None*, the GT filename stem is used.
    """
    case_id = case_id or Path(gt_img_path).stem
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    figure_dir = out_dir / "figure"
    figure_dir.mkdir(parents=True, exist_ok=True)

    # Load original images (BGR)
    gt_img_cv = cv2.imread(str(gt_img_path))
    gen_img_cv = cv2.imread(str(gen_img_path))

    if gt_img_cv is None or gen_img_cv is None:
        raise FileNotFoundError("Failed to load GT/GEN images for overlay generation.")

    # Original resolution information
    gt_original_size = (gt_img_cv.shape[1], gt_img_cv.shape[0])  # (W, H)
    gen_original_size = (gen_img_cv.shape[1], gen_img_cv.shape[0])

    # Resize saliency maps back to the original resolution and save
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

    gt_sal_path = out_dir / f"{case_id}" / f"{case_id}_gt_saliency.png"
    gen_sal_path = out_dir / f"{case_id}" / f"{case_id}_gen_saliency.png"
    cv2.imwrite(str(gt_sal_path), gt_sal_resized)
    cv2.imwrite(str(gen_sal_path), gen_sal_resized)

    # Overlay images
    gt_overlay = cv2.addWeighted(
        gt_img_cv, 0.6, cv2.applyColorMap(gt_sal_resized, cv2.COLORMAP_JET), 0.4, 0
    )
    gen_overlay = cv2.addWeighted(
        gen_img_cv, 0.6, cv2.applyColorMap(gen_sal_resized, cv2.COLORMAP_JET), 0.4, 0
    )

    gt_ov_path = out_dir / f"{case_id}" / f"{case_id}_gt_overlay.png"
    gen_ov_path = out_dir / f"{case_id}" / f"{case_id}_gen_overlay.png"
    cv2.imwrite(str(gt_ov_path), gt_overlay)
    cv2.imwrite(str(gen_ov_path), gen_overlay)

    # Comparison figure (GT / GT overlay / GEN overlay)
    orig_rgb = cv2.cvtColor(gt_img_cv, cv2.COLOR_BGR2RGB)
    gt_ov_rgb = cv2.cvtColor(gt_overlay, cv2.COLOR_BGR2RGB)
    gen_ov_rgb = cv2.cvtColor(gen_overlay, cv2.COLOR_BGR2RGB)

    # Lazy import to avoid circular dependency
    from evaluation.metrics.visual_saliency_metric import cc, similarity, kl_divergence

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    axes[0].imshow(orig_rgb)
    axes[0].set_title("Original")
    axes[1].imshow(gt_ov_rgb)
    axes[1].set_title("GT overlay")
    axes[2].imshow(gen_ov_rgb)
    axes[2].set_title(
        f"Gen overlay\nCC={round(cc(gt_sal, gen_sal),4)}  SIM={round(similarity(gt_sal, gen_sal),4)}  KL={round(kl_divergence(gt_sal, gen_sal),4)}"
    )

    for ax in axes:
        ax.axis("off")

    fig.tight_layout()
    fig_path = figure_dir / f"{case_id}_visual_saliency.png"
    fig.savefig(fig_path, dpi=300)
    plt.close(fig)

    # Optional log output
    print(
        f"[visual_saliency] Saved → {gt_sal_path}, {gen_sal_path}, {gt_ov_path}, {gen_ov_path}, {fig_path}"
    )
