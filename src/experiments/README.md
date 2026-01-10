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

### UI Replication Experiments

**Single Agent (Code):**
```bash
python -m experiments.run_replication_code_experiment \
  --config-name single-code-replication \
  --model gpt-4.1 \
  --variants image_only \
  --channel channel_4 \
  --agent-type code_replication \
  --auto
```

**Single Agent (Canvas):**
```bash
python -m experiments.run_replication_canvas_experiment \
  --config-name single-canvas-replication \
  --model gpt-4.1 \
  --variants image_only \
  --channel channel_5 \
  --agent-type single_replication \
  --auto
```

**Multi Agent (ReAct):**
```bash
python -m experiments.run_replication_experiment \
  --config-name multi-react-replication \
  --model qwen-2.5-vl-7b \
  --variants image_only \
  --channel channel_3 \
  --auto
```

### UI Modification Experiments

**Single Agent (Canvas):**
```bash
python -m experiments.run_modification_experiment \
  --config-name single-canvas-modification \
  --model gemini-2.5-flash \
  --channel channel_1 \
  --task task-2 \
  --agent-type single_modification \
  --auto
```

**Multi Agent (ReAct):**
```bash
python -m experiments.run_modification_experiment \
  --config-name multi-react-modification \
  --model gemini-2.5-flash \
  --channel channel_1 \
  --task task-2 \
  --agent-type react_modification \
  --auto
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