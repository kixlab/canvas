import shutil
from pathlib import Path

# 경로 설정
base_path = Path("/home/seoyeon/samsung-cxi-mcp-server/dataset/results/replication_gen/image_only")

# 필수 파일 suffix들
required_suffixes = [
    "-canvas.png",
    "-history.json",
    "-json-structure.json",
    "-raw-response.json",
    "-responses.json"
]

# 삭제된 폴더 기록용
deleted_folders = []

# 폴더 순회
for folder in base_path.iterdir():
    if folder.is_dir():
        files = list(folder.glob("*"))
        matched_files = [f for f in files if any(f.name.endswith(suffix) for suffix in required_suffixes)]
        
        # 단 1개만 있는 경우 삭제
        if len(matched_files) == 1:
            shutil.rmtree(folder)
            deleted_folders.append(folder.name)

# 결과 출력
print(f"삭제된 폴더 수: {len(deleted_folders)}개")
print("삭제된 폴더 목록:")
for name in deleted_folders:
    print(f"- {name}")
