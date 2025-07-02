from metric.layout.hungarian_iou import compute_layout_iou

def test_layout_iou():
    gid = "gid85-71"
    case = 3
    if case == 1:
        modality = "image_only"
    elif case == 2:
        modality = "image_text_level_1"
    else:
        modality = "image_text_level_2"
        
    gt_json = f"/home/seooyxx/kixlab/samsung-cxi-mcp-server/tools/CanvasBench/data/canvasbench/{gid}.json"
    gen_json = f"/home/seooyxx/kixlab/samsung-cxi-mcp-server/tools/CanvasBench/data/canvasbench/{gid}-gemini-{modality}.json"

    result = compute_layout_iou(gt_json, gen_json)
    print("Layout Matching Result:", result)

if __name__ == "__main__":
    test_layout_iou()
