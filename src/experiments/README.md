## Running Experiments
Required environment variables:
```bash
export OPENAI_API_KEY="your_openai_key"
```

```
cd src
conda env create -f experiments/environment.yml
conda activate canvasbench-eval
```

### UI Replication Experiments

**Single Agent (Code):**
```bash
python -m experiments.run_replication_code_experiment \
  --config-name single-code-replication \
  --model gpt-4.1 \
  --variants image_only \
  --channel channel_1 \
  --agent-type code_replication \
  --auto
```

**Single Agent (Canvas):**
```bash
python -m experiments.run_replication_canvas_experiment \
  --config-name single-canvas-replication \
  --model gpt-4.1 \
  --variants image_only \
  --channel channel_1 \
  --agent-type single_replication \
  --auto
```

**Multi Agent (ReAct):**
```bash
python -m experiments.run_replication_canvas_experiment \
  --config-name multi-react-replication \
  --model gpt-4.1 \
  --variants image_only \
  --channel channel_1 \
  --agent-type react_replication \
  --auto
```

### UI Modification Experiments
* Task 1, 2, 3 are available.
* For descriptions of each task, please refer to the paper and the huggingface repository.

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