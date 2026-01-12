## Evaluation

### Setup

The evaluation pipeline **requires** the conda environment defined in `evaluation/environment.yml` (exported from the original research environment).

```bash
# create and activate the evaluation environment
conda env create -f evaluation/environment.yml
conda activate canvasbench-eval
```

### Acknowledgement

We utilized [UEyes](https://github.com/YueJiang-nj/UEyes-CHI2023) repository for the visual-saliency-based metric.
You also need to download the pretrained weight from that repository.
```
    ├── model_weights
    │   ├── saliency_models
    │   │   └── UMSI++
    │   │       └── umsi++.hdf5
    │   └── scanpath_models
    │       ├── DeepGaze++
    │       │   └── centerbias_mit1003.npy
    │       └── PathGAN++
    │           ├── discriminator_PathGAN++.h5
    │           └── generator_PathGAN++.h5
```


### Metric Overview

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