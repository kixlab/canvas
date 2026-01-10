import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import numpy as np
from typing import Dict, Any
from pathlib import Path

# Constants
CLIP_MODEL_VERSION = "openai/clip-vit-base-patch32"

# Global variables for model caching
_clip_model = None
_clip_processor = None
_device = None

def _load_clip_model():
    """Load CLIP model and processor once and cache them."""
    global _clip_model, _clip_processor, _device
    
    if _clip_model is None:
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading CLIP model on {_device}...")
        _clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL_VERSION)
        _clip_model = CLIPModel.from_pretrained(CLIP_MODEL_VERSION).to(_device)
        _clip_model.eval()
        print("CLIP model loaded successfully.")
    
    return _clip_model, _clip_processor, _device

def compute_clip_score(gt_img: str, gen_img: str, gt_json: str = "", gen_json: str = "", **kwargs) -> Dict[str, Any]:
    """
    Compute CLIP score between ground truth and generated images.
    
    Args:
        gt_img: Path to ground truth image
        gen_img: Path to generated image
        gt_json: Path to ground truth JSON (not used for CLIP)
        gen_json: Path to generated JSON (not used for CLIP)
        
    Returns:
        Dictionary containing clip_caption_similarity score
    """
    try:
        # Load CLIP model and processor (cached)
        model, processor, device = _load_clip_model()
        
        # Load images
        gt_image = Image.open(gt_img).convert("RGB")
        gen_image = Image.open(gen_img).convert("RGB")
        
        # Process images
        inputs = processor(images=[gt_image, gen_image], return_tensors="pt", padding=True).to(device)
        
        # Get image features
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            
        # Normalize features
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        
        # Compute cosine similarity
        similarity = torch.cosine_similarity(image_features[0:1], image_features[1:2], dim=-1).item()
        
        return {"clip_caption_similarity": round(similarity, 4)}
        
    except Exception as e:
        print(f"Error computing CLIP score: {e}")
        return {"clip_caption_similarity": 0.0}
