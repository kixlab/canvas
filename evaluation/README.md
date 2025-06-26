## Evaluation

### Metric Overview
- Visual Completeness
    - Canvas Fill Ratio
    - Pixel Fidelity (SSIM)
    - Semantic Match (BLIP Score)
- Structural Completeness
    - Element Count Ratio
    - Layout Overlap (IoU)
    - Alignment Match (Grid Alignment)
- Tool Metrics
    - Usage Stats
    - Efficiency Score
    - Accuracy (placeholder)

### Metric Details

#### Visual Completeness

- **Canvas Fill Ratio**
  - **Definition:** Measures how much of the GT (ground truth) canvas area is filled by the generated design.
  - **Implementation Summary:**
    - Parses bounding boxes from both GT and generated JSON files.
    - Calculates the minimum bounding rectangle (canvas) that covers all GT boxes.
    - Sums the area of all generated bounding boxes.
    - Computes the ratio: (total generated area) / (GT canvas area), clipped to 1.0.
    - Returns this ratio as the metric.
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

- **Alignment Match (Grid Alignment)**
  - **Definition:** Measures how well the generated objects are aligned (left/center/right, top/center/bottom) compared to GT.
  - **Implementation Summary:**
    - Extracts bounding boxes and computes their center positions.
    - Uses KMeans clustering to group objects into columns and rows (number of clusters is adaptive to object count).
    - For each cluster/group, calculates alignment errors for left/center/right (x-axis) and top/center/bottom (y-axis).
    - Normalizes errors by median object size and converts to a score (higher is better).
    - Aggregates scores across all clusters and groups for a global alignment score.
  - **Purpose:** Assesses visual order, grid structure, and alignment consistency in the layout.

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
  --out evaluation_results.json
```