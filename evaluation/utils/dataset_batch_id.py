from pathlib import Path

root = Path("/home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset/benchmarks/generation_gt")
meta_files = sorted(root.glob("gid*-meta.json"))
print(f"num of meta: {len(meta_files)}") 

# 100개씩 나누기
batches = [meta_files[i:i + 100] for i in range(0, len(meta_files), 100)]
for i, batch in enumerate(batches):
    with open(f"batch_{i+1}.txt", "w") as f:
        for p in batch:
            base_id = p.stem.replace("-meta", "")
            f.write(base_id + "\n")