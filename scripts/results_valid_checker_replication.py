import os
import argparse
from pathlib import Path
from collections import defaultdict
from PIL import Image
import numpy as np

# CLI 옵션 처리
parser = argparse.ArgumentParser(description="Check experiment result folders.")
parser.add_argument("--white_canvas", action="store_true", help="Enable white canvas image filtering.")
args = parser.parse_args()

# 경로 설정
base_path = Path("/home/seoyeon/samsung-cxi-mcp-server/dataset/results/replication_gen/image_only")

# 요구되는 파일들
required_suffixes = [
    "-canvas.png",
    "-history.json",
    "-json-structure.json",
    "-raw-response.json",
    "-responses.json"
]

# 통계용 변수
complete_case_count = 0
incomplete_case_count = 0
white_canvas_case_count = 0

incomplete_folders = []
white_canvas_folders = []

model_count = defaultdict(int)
white_model_count = defaultdict(int)

# 흰색 이미지 판별 함수
def is_image_almost_white(image_path, threshold=252, white_ratio_threshold=0.999):
    try:
        img = Image.open(image_path).convert("RGB")
        img_np = np.array(img)
        white_pixels = np.all(img_np > threshold, axis=-1)
        white_ratio = white_pixels.sum() / white_pixels.size
        return white_ratio > white_ratio_threshold
    except Exception as e:
        print(f"Error checking image: {image_path}, {e}")
        return False

# 폴더 순회
for folder in base_path.iterdir():
    if folder.is_dir():
        files = list(folder.glob("*"))
        matched_files = [f for f in files if any(f.name.endswith(suffix) for suffix in required_suffixes)]

        # 모델 이름 추출
        parts = folder.name.split("-")
        if len(parts) >= 5 and parts[-1] == "image_only":
            model_name = "-".join(parts[2:-1])  # e.g., "gemini-2.5-flash"
        else:
            model_name = "unknown"

        # White canvas 체크 여부
        has_white_canvas = False
        if args.white_canvas and (folder / f"{folder.name}-canvas.png").exists():
            has_white_canvas = is_image_almost_white(folder / f"{folder.name}-canvas.png")

        if len(matched_files) == 5 and not has_white_canvas:
            complete_case_count += 1
            model_count[model_name] += 1

        elif len(matched_files) == 5 and has_white_canvas:
            white_canvas_case_count += 1
            white_canvas_folders.append(str(folder.resolve()))
            print(f"{str(folder.resolve())}/{folder.name}-canvas.png")
            white_model_count[model_name] += 1

        elif len(matched_files) == 1:
            incomplete_case_count += 1
            incomplete_folders.append(folder.name)

# 결과 출력
print(f"✅ 5개 파일이 모두 있고 정상인 경우: {complete_case_count}개")
for model, count in sorted(model_count.items()):
    print(f"  - {model}: {count}개")

print(f"\n⚠️ 1개 파일만 있는 경우: {incomplete_case_count}개")

# white canvas 출력은 옵션일 때만
if args.white_canvas:
    print(f"\n⚠️ 흰색 canvas 이미지만 있는 경우: {white_canvas_case_count}개")
    for model, count in sorted(white_model_count.items()):
        print(f"  - {model}: {count}개")

    # 흰색 캔버스 폴더 저장
    output_white_canvas_txt = base_path / "white_canvas_folders.txt"
    with open(output_white_canvas_txt, "w") as f:
        for path in white_canvas_folders:
            f.write(path + "\n")
    print(f"📄 흰색 canvas 폴더 목록 저장: {output_white_canvas_txt}")

# 불완전한 폴더 저장
output_incomplete_txt = base_path / "incomplete_folders.txt"
with open(output_incomplete_txt, "w") as f:
    for name in incomplete_folders:
        f.write(name + "\n")
print(f"📄 불완전한 폴더 목록 저장: {output_incomplete_txt}")
