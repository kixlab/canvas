from metric.visual.ssim_psnr import compute_ssim_psnr

def test_ssim_psnr():
    gt_id = "id-5-2"
    model = "gpt4o"
    base_dir = "data/figmaviews"

    gt_img = f"{base_dir}/figma_screen/{gt_id}.png"
    gen_img = f"{base_dir}/generated/{model}/{gt_id}-{model}.png"
    
    scores = compute_ssim_psnr(gt_img, gen_img)
    print("SSIM / PSNR:", scores)

if __name__ == "__main__":
    test_ssim_psnr()