## Evaluation

### Setup

The evaluation pipeline **requires** the conda environment defined in `evaluation/environment.yml` (exported from the original research environment).

```bash
# create and activate the evaluation environment
conda env create -f evaluation/environment.yml
conda activate canvasbench-eval
```

### Metric Overview
- Visual Completeness
    - Canvas Fill Ratio
    - Pixel Fidelity (SSIM)
    - Semantic Match (BLIP Score)
    - Visual Saliency (AUC-Borji)
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

- **Visual Saliency (AUC-Borji)**
  - **Definition:** Measures similarity of human visual attention patterns between GT and generated images using saliency maps and the AUC-Borji metric.
  - **Implementation Summary:**
    - Leverages an attentive ConvLSTM‐based saliency model adapted from the [UEyes-CHI2023](https://github.com/YueJiang-nj/UEyes-CHI2023) repository (ported to PyTorch in `evaluation/visual_saliency/`).
    - Generates saliency maps for both GT and generated images.
    - Returns a score in the range \(0\,1\] (higher is better).
  - **Purpose:** Evaluates whether the generated layout attracts visual attention similarly to the GT, capturing perceptual saliency beyond pixel or structural similarity.

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

### Evaluation Workflow

The evaluation is typically a two-step process to ensure both speed and reproducibility, especially for computationally expensive metrics like the BLIP score.

#### Step 1: (Optional) Pre-compute BLIP Scores

The `semantic_match` metric relies on the BLIP model, which is slow and requires a GPU. To avoid this bottleneck during the main evaluation and ensure results are reproducible across different machines, you should pre-compute the scores once.

In a **GPU-enabled environment**, run the following command:
```bash
python -m evaluation.semantic.precompute_blip \
  --task <task_name> \
  --variant <variant_name>
```
*   This will find all ground-truth and generated images for the specified task/variant.
*   It will then generate captions for all images in batches (using FP16 for speed) and compute the similarity scores.
*   The results are saved to `precomputed_blip_scores.json` inside the corresponding output directory (e.g., `dataset/eval_outputs/<task>/<variant>/`).
*   This script is fully deterministic, meaning it will produce the same results every time it is run.

#### Step 2: Run the Main Evaluation Pipeline

Once BLIP scores are pre-computed, you can run the main evaluation pipeline. It will automatically detect and use the `precomputed_blip_scores.json` file.

```bash
# Example: Run evaluation for all metrics
python -m evaluation.eval_pipeline \
  --task <task_name> \
  --variant <variant_name>
```

If you wish to run the pipeline without the semantic match score (e.g., if you haven't pre-computed them), you can use the `--skip_blip` flag. The pipeline will then skip this metric.


### Evaluation Pipeline (`eval_pipeline.py`)

The `eval_pipeline.py` script is the primary tool for running the evaluation suite. It collects model generation results, computes all relevant metrics, and saves them in a structured JSON format.

#### Output Directory Structure

The script automatically organizes evaluation outputs into the following directory structure, based on the specified task and variant. This avoids manual file naming and keeps results organized.

```
<base_dir>/eval_outputs/
├── <task>/
    └── <variant>/
        ├── evaluation_results.json
        └── evaluation_results_with_snapshots.json
```
- `<base_dir>`: The root directory for the dataset (e.g., `dataset`).
- `<task>`: The type of generation task (e.g., `replication_gen`, `modification_gen`).
- `<variant>`: The specific variant of the task (e.g., `image_only`).
- `evaluation_results.json`: Contains metrics for the final generated output of each sample.
- `evaluation_results_with_snapshots.json`: Contains metrics for both the final output and all intermediate snapshots (generated when using `--eval_snapshots`).

#### Command-Line Arguments

Here are the primary arguments for controlling the evaluation pipeline.

| Argument | Description | Default |
| --- | --- | --- |
| `--base_dir` | The base dataset directory containing 'benchmarks' and 'results'. | `dataset` |
| `--task` | **(Required)** The task to evaluate (e.g., `replication_gen`). Determines the input directory for model results. | `None` |
| `--variant` | **(Required)** The task variant to evaluate (e.g., `image_only`). | `None` |
| `--model` | A model name to filter by (e.g., `gpt-4o`). If omitted, all models found will be evaluated. | `None` |
| `--ids` | A comma-separated list of GT sample IDs to evaluate (e.g., `gid6-27,gid34-35`). | `None` |
| `--vis` | If set, generates and saves visualization plots (bar/box charts) for each metric, grouped by model. | `False` |
| `--eval_snapshots` | If set, evaluates all intermediate generation snapshots in addition to the final result. | `False` |
| `--save_saliency_vis` | If set, saves the visual saliency map visualizations for debugging. | `False` |

**Caching and Resuming:**

The following flags help speed up evaluation by skipping computations for metrics that have already been calculated and saved in a previous run. The script will load the existing output file and only compute the missing values.

| Argument | Description |
| --- | --- |
| `--skip_blip` | Skips the BLIP semantic similarity metric. Useful for quick runs as this metric is computationally intensive. |
| `--skip_visual_saliency` | Skips the Visual Saliency metric, which is also computationally intensive. |
| `--skip_all` | Skips any sample for which a complete set of metrics already exists in the results file. This is the best way to resume a large, interrupted evaluation run. |


#### Usage Examples

**1. Evaluate all models for a specific task and variant:**

This command evaluates all models for the `replication_gen` task and `image_only` variant, and also generates visualization plots.

```bash
python -m evaluation.eval_pipeline \
  --task replication_gen \
  --variant image_only \
  --vis
```
*   **Input**: `dataset/results/replication_gen/image_only/`
*   **Output**: `dataset/eval_outputs/replication_gen/image_only/evaluation_results.json`
*   **Plots**: `dataset/eval_outputs/replication_gen/image_only/evaluation_results_vis/`


**2. Evaluate a single model on a single sample (and skip slow metrics):**

This is useful for quick debugging. It runs evaluation for `gpt-4o` on the `gid6-27` sample, skipping the two slowest metrics.

```bash
python -m evaluation.eval_pipeline \
  --task replication_gen \
  --variant image_only \
  --model gpt-4o \
  --ids gid6-27 \
  --skip_blip \
  --skip_visual_saliency
```
*   **Output**: `dataset/eval_outputs/replication_gen/image_only/evaluation_results.json` (will only contain this one entry if the file is new).


**3. Evaluate a task including all intermediate snapshots:**

This command evaluates both final results and all snapshots, saving them to a separate file. This is useful for analyzing the step-by-step generation process.

```bash
python -m evaluation.eval_pipeline \
    --task replication_gen \
    --variant image_only \
    --eval_snapshots \
    --vis
```
*   **Output**: `dataset/eval_outputs/replication_gen/image_only/evaluation_results_with_snapshots.json`


**4. Resuming an interrupted evaluation:**

If a long evaluation run was stopped, you can resume it using the `--skip_all` flag. The script will load existing results and only process samples that were not fully evaluated.

```bash
# This command will pick up where it left off.
python -m evaluation.eval_plane \
    --task replication_gen \
    --variant image_only \
    --skip_all
```