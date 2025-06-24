from metric.semantic.blip_score import compute_blip_score

def test_blip_score():
    gt_id = "id-5-2"
    model = "gpt4o"
    base_dir = "data/figmaviews"

    gt_img = f"{base_dir}/figma_screen/{gt_id}.png"
    gen_img = f"{base_dir}/generated/{model}/{gt_id}-{model}.png"
    
    result = compute_blip_score(gt_img, gen_img)
    print("BLIP Score:", result)

if __name__ == "__main__":
    test_blip_score()
