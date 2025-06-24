## Evaluation

### Metric Overview
- Visual Fidelity Metrics
    - Pixel-level Similarity (SSIM / PSNR)
    - Alignmemt Fidelity (Grid-Based Alignment Score)
- Consistency Metrics
    - Semantic Similarity (BLIP Score)
    - Structural Fidelity (Pseudo-Tree Edit Distance)
- Layout Matching Metric (Element-Level)
    - Hungarian Matching + IoU

### For single sample
```
cd src/evaluation
```
```
python eval_pipeline.py \
  --base_dir dataset_sample \
  --model gpt-4o \
  --variant image_only \
  --ids gid6-27 \
  --out gid6-27_eval.json
```

### For multiple sample (dir level)
```
cd src/evaluation
```
```
python eval_pipeline.py \
  --base_dir dataset_sample \
  --model gpt-4o \
  --variant image_only \
  --out eval_results.json
```

### For interpretability
```
cd src/evaluation
```

* You can check tree structure.
```
   python utils/tree_dump.py path/to/file.json
   python utils/tree_dump.py path/to/file.json --type_only
```
```
python utils/tree_dump.py /home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset_sample/benchmarks/generation_gt/gid6-27.json --type_only | head -n 20
python utils/tree_dump.py /home/seooyxx/kixlab/samsung-cxi-mcp-server/dataset_sample/results/generation_gen/gpt-4o/image_only/gid6-27-gpt-4o-image_only/gid6-27-gpt-4o-image_only-figma-hierarchy.json --type_only | head -n 20
```
