## Evaluation

### Metric Overview
- Visual Completeness
    - Canvas Fill Ratio
    - Pixel Fidelity (SSIM)
    - Semantic Match (BLIP Score)
- Structural Completeness
    - Element Count Ratio
    - Layout Overlap (IoU)
    - Alignment Match (Group Alignment)
- Tool Metrics
    - Usage Stats
    - Efficiency Score
    - Accuracy (placeholder)

### Metric Details

#### Visual Completeness

- **Canvas Fill Ratio**
  - **Definition:** Proportion of the generated canvas (root frame) occupied by foreground elements.
  - **Implementation Summary:**
    - Parses bounding boxes from the generated JSON only.
    - Detects the root frame (depth==1) or falls back to the largest box as the canvas.
    - Unions all visible non-canvas boxes that do not match the full canvas size.
    - Computes `(union area) / (canvas area)` and clips the value to 1.0.
    - Returns this value as the metric.
  - **Purpose:** Detects if the generated result is too small or leaves excessive empty space compared to GT.

- **Pixel Fidelity (SSIM)**
  - **Definition:** Measures pixel-level similarity between GT and generated images using SSIM (Structural Similarity Index).
  - **Implementation Summary:**
    - Loads both images and resizes them to the same shape if needed.
    - Converts images to numpy arrays and normalizes pixel values.
    - Computes SSIM using `skimage.metrics.structural_similarity`.
    - Returns the SSIM score (0~1, higher is better).
  - **Purpose:** Evaluates visual quality and structural similarity at the pixel level.

- **Semantic Match (BLIP Score)**
  - **Definition:** Measures semantic similarity between GT and generated images using BLIP (image captioning + text similarity).
  - **Implementation Summary:**
    - Uses BLIP to generate a caption for each image.
    - Encodes both captions using a sentence transformer model.
    - Computes cosine similarity between the two caption embeddings.
    - Returns this similarity as the BLIP score.
  - **Purpose:** Goes beyond visual similarity to assess whether the generated image conveys similar meaning/content as the GT.
  - **Note:** This metric can be skipped with the `--skip_blip` flag in `eval_pipeline.py`.

#### Structural Completeness

- **Element Count Ratio**
  - **Definition:** Compares the number of objects (bounding boxes) in the generated result to the GT.
  - **Implementation Summary:**
    - Parses bounding boxes from both GT and generated JSON files.
    - Computes the ratio: (number of generated boxes) / (number of GT boxes), clipped to 1.0.
    - Returns this ratio as the metric.
  - **Purpose:** Quantifies missing or over-generated objects in the result.

- **Layout Overlap (IoU)**
  - **Definition:** Measures how well the spatial layout of generated objects matches the GT using IoU and Hungarian matching.
  - **Implementation Summary:**
    - Extracts normalized bounding boxes from both GT and generated JSON files.
    - Builds a cost matrix using 1 - IoU for every GT/gen box pair.
    - Uses the Hungarian algorithm to find the optimal 1:1 matching between GT and generated boxes.
    - Calculates mean IoU, precision, recall, and number of matched/unmatched boxes.
    - Optionally saves visualizations and a detailed JSON report for interpretability.
  - **Purpose:** Evaluates structural similarity, object placement accuracy, and detects missing/extra objects.

- **Alignment Match (Group Alignment)**
  - **Definition:** Measures how well the generated objects are aligned (left/center/right, top/center/bottom) compared to GT using a tolerance-based grouping approach.
  - **Implementation Summary:**
    - Extracts bounding boxes and computes their positions.
    - Groups objects based on their alignment (left, center, right for x-axis; top, center, bottom for y-axis) using a small tolerance to account for minor deviations.
    - For each alignment group, calculates the bounding box and checks alignment type consistency between GT and generated groups.
    - Uses Hungarian matching to find the optimal alignment between GT and generated groups.
    - Calculates precision, recall, and F1 score for alignment consistency.
    - Optionally saves visualizations and a detailed JSON report for interpretability.
  - **Purpose:** Assesses visual order, grid structure, and alignment consistency in the layout using a more flexible grouping method.

#### Tool Metrics

- **Usage Stats**
  - **Definition:** Reports statistics on tool usage during the generation process (number of steps, tool calls, unique tools).
  - **Implementation Summary:**
    - Looks for a `*-json-response.json` file in the generated result folder.
    - Parses the file to extract step count, tool call count, and unique tool names.
    - Handles multiple possible JSON formats for robustness.
    - Returns these statistics as a dictionary.
  - **Purpose:** Analyzes process complexity, tool diversity, and repeated tool usage.

- **Efficiency Score**
  - **Definition:** Heuristically measures the efficiency of tool usage (fewer steps/calls/tools = higher score).
  - **Implementation Summary:**
    - Uses the stats from Usage Stats (step count, call count, unique tool count).
    - Computes a penalty as the sum of these three values.
    - Calculates efficiency as `1 / (penalty + 1)` (higher is better, capped at 1.0).
    - Returns this value as the metric.
  - **Purpose:** Rewards concise, efficient generation processes.

- **Accuracy (placeholder)**
  - **Definition:** Placeholder for tool usage accuracy metric (not yet implemented).
  - **Implementation Summary:**
    - Always returns None.
    - Intended for future use: will compare actual tool call sequences to GT-expected sequences.
  - **Purpose:** Will eventually measure correctness of tool selection and usage order.

---

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
  --out gid6-27_eval.json \
  --skip_blip
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
  --out evaluation_results.json \
  --skip_blip
```