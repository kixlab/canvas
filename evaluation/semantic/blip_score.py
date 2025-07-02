import torch
from PIL import Image
from transformers import Blip2Processor, Blip2ForConditionalGeneration
from sentence_transformers import SentenceTransformer, util
import os

UI_PROMPT = ""

def generate_caption(image_path, model, processor, device='cuda', prompt=UI_PROMPT):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(image, text=prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        caption_ids = model.generate(**inputs, max_new_tokens=50)
    caption = processor.decode(caption_ids[0], skip_special_tokens=True).strip()
    return caption

def postprocess_caption(caption: str, prompt: str) -> str:
    caption = caption.strip().lower()
    prompt = prompt.strip().lower()
    if caption.startswith(prompt):
        return caption[len(prompt):].strip()
    return caption

def compute_similarity(text1, text2):
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    embeddings = model.encode([text1, text2], convert_to_tensor=True)
    similarity = util.cos_sim(embeddings[0], embeddings[1]).item()
    return similarity

def compute_blip_score(gt_img_path: str, gen_img_path: str) -> dict:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = Blip2Processor.from_pretrained("Salesforce/blip2-opt-2.7b", use_fast=False)
    model = Blip2ForConditionalGeneration.from_pretrained("Salesforce/blip2-opt-2.7b").to(device)  

    gt_caption_raw = generate_caption(gt_img_path, model, processor, device)
    gen_caption_raw = generate_caption(gen_img_path, model, processor, device)

    gt_caption = postprocess_caption(gt_caption_raw, UI_PROMPT)
    gen_caption = postprocess_caption(gen_caption_raw, UI_PROMPT)

    if not gt_caption or not gen_caption:
        similarity = 0.0
    else:
        similarity = compute_similarity(gt_caption, gen_caption)

    return {
        "gt_caption": gt_caption_raw,
        "gen_caption": gen_caption_raw,
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