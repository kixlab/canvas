from metric.alignment.grid_alignment import compute_alignment_score
import os
from pprint import pprint

def test_grid_alignment():
    gt_id = "id-5-2"
    model = "gpt4o"
    base_dir = "data/figmaviews"

    gt_json = f"{base_dir}/ground_truth/{gt_id}.json"
    gen_json = f"{base_dir}/generated/{model}/{gt_id}-{model}.json"

    scores = compute_alignment_score(gt_json, gen_json)
    print(f"[{gt_id}] Alignment Score → GT: {scores['gt_score']} / GEN: {scores['gen_score']} / Diff: {scores['difference']}")

def test_single_gt_alignment():
    gt_path = "data/figmaviews/ground_truth/id-19-7.json"
    score = compute_alignment_score(gt_path)
    assert isinstance(score, dict), "Score should be returned as a dictionary"
    assert "gt_score" in score, "gt_score key should exist in the result"
    assert 0.0 <= score["gt_score"] <= 1.0, "Score should be between 0 and 1"


def test_gt_vs_gen_alignment():
    gt_path = "data/figmaviews/ground_truth/id-19-7.json"
    gen_path = "data/figmaviews/generated/gpt4o/id-19-7-gpt4o.json"
    score = compute_alignment_score(gt_path, gen_path)
    assert all(k in score for k in ["gt_score", "gen_score", "difference"]), "All keys should be present"
    assert abs(score["gt_score"] - score["gen_score"] - score["difference"]) < 1e-3, "Difference calculation should be consistent"
    print("Test alignment GT vs GEN →", score)
    
def calculate_score_for_image(image_id, base_dir="data/figmaviews"):
    gt_json = f"{base_dir}/ground_truth/{image_id}.json"
    gen_json = f"{base_dir}/generated/gpt4o/{image_id}-gpt4o.json"
    
    if os.path.exists(gt_json) and os.path.exists(gen_json):
        score = compute_alignment_score(gt_json, gen_json)
        print(f"[{image_id}] Alignment Score → GT: {score['gt_score']} / GEN: {score['gen_score']} / Diff: {score['difference']}")
        pprint(score["gt_detail"]["col_alignment"])
        pprint(score["gt_detail"]["row_alignment"])
        pprint(score["gt_detail"]["local_col_alignment"])
        pprint(score["gt_detail"]["local_row_alignment"])

    else:
        score = compute_alignment_score(gt_json)
        print(f"[{image_id}] Alignment Score → GT: {score['gt_score']}")
        # pprint(score["gt_detail"]["col_alignment"])
        # pprint(score["gt_detail"]["row_alignment"])
        # pprint(score["gt_detail"]["local_col_alignment"])
        # pprint(score["gt_detail"]["local_row_alignment"])

        
def test_calculate_scores_for_all_images_in_directory(directory_path):
    for filename in os.listdir(directory_path):
        if filename.endswith(".png"):
            image_id = filename.replace(".png", "")
            calculate_score_for_image(image_id)

if __name__ == "__main__":
    # test_grid_alignment()
    # test_single_gt_alignment()
    # test_gt_vs_gen_alignment()
    directory_path = "/home/seooyxx/kixlab/samsung-cxi-mcp-server/tools/CanvasBench/data/figmaviews/figma_screen"
    test_calculate_scores_for_all_images_in_directory(directory_path)
