from __future__ import annotations

"""Package initialisation for evaluation.visual_saliency.

Sets environment variables so that TensorFlow runs in CPU-only mode. This
prevents runtime crashes on systems without CUDA / cuDNN libraries.
"""

import os

# Disable GPU devices entirely
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")

# Suppress most TF logs (optional)
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2") 