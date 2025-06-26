import torch
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
from sentence_transformers import SentenceTransformer, util
import os

def generate_caption(image_path, model, processor, device='cuda'):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(image, return_tensors="pt").to(device)
    with torch.no_grad():
        caption_ids = model.generate(**inputs)
    caption = processor.decode(caption_ids[0], skip_special_tokens=True)
    return caption

def compute_similarity(text1, text2):
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    embeddings = model.encode([text1, text2], convert_to_tensor=True)
    similarity = util.cos_sim(embeddings[0], embeddings[1]).item()
    return similarity

def compute_blip_score(gt_img_path: str, gen_img_path: str) -> dict:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", use_fast=False)
    model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(device)

    gt_caption = generate_caption(gt_img_path, model, processor, device)
    gen_caption = generate_caption(gen_img_path, model, processor, device)

    similarity = compute_similarity(gt_caption, gen_caption)

    return {
        "gt_caption": gt_caption,
        "gen_caption": gen_caption,
        "blip_score": round(similarity, 4)
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--gt", type=str, required=True, help="Path to GT image")
    parser.add_argument("--gen", type=str, required=True, help="Path to Gen image")
    args = parser.parse_args()

    results = compute_blip_score(args.gt, args.gen)
    for k, v in results.items():
        print(f"{k}: {v}")