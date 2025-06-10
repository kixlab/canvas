# Experiment Runner

This module provides a framework for running UI modification and generation experiments. It supports various experiment types, models, and configurations.

## Structure

- `base_runner.py`: Base classes and common utilities
- `run_modification_experiment.py`: UI modification experiments
- `run_generation_experiment.py`: UI generation experiments

## Prerequisites

1. Environment setup:
* (terminal 1) `bun socket` (Start the WebSocket server (Port 3055))
* (terminal 2) `uvicorn fastapi_server.app:app --port=<YOUR_PORT_NUM>`
* (Figma Client) Open the CanvasBench MCP Plugin in your Figma client, and ensure it connects to the correct WebSocket channel and server port.

2. Required environment variables:
```bash
export FIGMA_API_TOKEN="your_figma_token"
export OPENAI_API_KEY="your_openai_key"
```

## Running Experiments

### UI Generation Experiments

```bash
python -m experiments.run_generation_experiment \
  --config-name=single-generation \
  --model=gpt-4o \
  --variants=image_only \
  --channel=channel_2 \
  --batch-name=batch_1
```

### UI Modification Experiments

```bash
python -m experiments.run_modification_experiment \
  --config-name=single-modification \
  --model=gpt-4o \
  --variants=without_oracle \
  --channel=channel_2 \
  --task=task-1
```

### Sample Extraction (CLI Mode)

```bash
python -m experiments.run_sample_extraction  \
  --config-name=single-generation \
  --model=gpt-4o \
  --variants=image_only \
  --channel=channel_2 \
  --batch-name=batch_1
```


## Command Line Arguments

### Common Arguments

- `--model`: Model name (e.g., gpt-4, qwen)
- `--variants`: Comma-separated list of experiment variants
- `--channel`: Channel name from config.yaml
- `--config_name`: Configuration name (default: "base")
- `--multi_agent`: Enable multi-agent mode (supervisor-worker)
- `--guidance`: Guidance variants

### Modification-specific Arguments

- `--task`: Task identifier (e.g., task-1, task-2, task-3)

### Generation-specific Arguments

- `--batch_name`: Batch name to run (e.g., batch_1)
- `--batches_config_path`: Path to batches.yaml file

## Supported Variants

### Modification Variants

- `without_oracle`: Run without oracle guidance
- `perfect_hierarchy`: Run with perfect hierarchy oracle
- `perfect_canvas`: Run with perfect canvas oracle

### Generation Variants

- `image_only`: Generate UI from image only
- `text_level_1`: Generate UI with level 1 text description
- `text_level_2`: Generate UI with level 2 text description

## Configuration

### Config File Structure

```yaml
# config.yaml
benchmark_dir: "/path/to/benchmark"
results_dir: "/path/to/results"
channels:
  channel_1:
    api_base_url: "http://localhost:8000"
    figma_file_key: "your_figma_file_key"
  channel_2:
    api_base_url: "http://localhost:8001"
    figma_file_key: "your_figma_file_key"
```

### Batches File Structure

```yaml
# batches.yaml
batches:
  batch_1: "/path/to/batch_1.txt"
  batch_2: "/path/to/batch_2.txt"
```

## Output Structure

Results are saved in the following structure:
```
results_dir/
  ├── task-1/
  │   └── without_oracle/
  │       ├── experiment_log_2024-03-21-10-30-00.txt
  │       └── result_20240321_103000.json
  └── task-2/
      └── perfect_hierarchy/
          ├── experiment_log_2024-03-21-10-35-00.txt
          └── result_20240321_103500.json
```

## Error Handling

- Failed experiments are logged with detailed error messages
- Retry mechanism for API calls (3 attempts)
- Canvas cleanup between experiments

## Logging

- Timestamp-based log files
- Detailed error tracking
- Experiment progress monitoring