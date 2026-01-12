<h1 align="center"> CANVAS: A Benchmark for Vision-Language Models on Tool-Based User Interface Design </h1>

<p align="center">
  <a href="https://arxiv.org/abs/2511.20737">
    <img src="https://img.shields.io/badge/arXiv%20paper-2511.20737-b31b1b.svg" alt="arXiv">
  </a>
  &nbsp;
  <a href="https://huggingface.co/datasets/seooyxx/canvas">
    <img src="https://img.shields.io/badge/huggingface-dataset?style=plastic&logo=huggingface&logoColor=FFD21E&label=canvas-dataset&color=FFD21E" alt="Hugging Face">
  </a>
</p>

<div align="center">
  <a href="https://jdaeheon.github.io/" target="_blank">Daeheon Jeong</a><sup>1</sup> &ensp; <b>&middot;</b> &ensp;
  <a href="https://seooyxx.com/" target="_blank">Seoyeon Byun</a><sup>2</sup> &ensp; <b>&middot;</b> &ensp;
  <a href="https://kihoon-son.github.io/" target="_blank">Kihoon Son</a><sup>1</sup> &ensp; <b>&middot;</b> &ensp;
  <a href="https://dhkim16.github.io/" target="_blank">Dae Hyun Kim</a><sup>3</sup>&ensp; <b>&middot;</b> &ensp;
  <a href="https://juhokim.com/" target="_blank">Juho Kim</a><sup>1</sup> &ensp;
  <br>
  <sup>1</sup> KAIST &emsp; <sup>2</sup>Korea University &emsp; <sup>3</sup>Yonsei University &emsp; <br>
  <sup>*</sup>Equal contribution &emsp; <br>
</div>
<h3 align="center"><a href="https://canvas.kixlab.org/">project page</a>&ensp; <b>&middot;</b> &ensp;<a href="http://arxiv.org/abs/2410.06940">arXiv</a>&ensp; <b>&middot;</b> &ensp;<a href="https://huggingface.co/datasets/seooyxx/canvas">dataset</a>&ensp;</h3>
<br>

<b>Summary</b>: This repository contains the experiment code accompanying the paper CANVAS: A Benchmark for Vision-Language Models on Tool-Based UI Design (AAAI 2026). CANVAS designed to evaluate a VLM's capability to generate a UI design with tool invocations in two tasks: Design Replication and Design Modification.


## Setup
### 1. Environment setup
We Tested in the following environment:
- OS: Windows 11 (WSL2) and MacOS
- Node.js: v18.20.8
- Python: 3.12.9
- Figma Desktop + Plugin loaded from `manifest.json` (For WSL2, you should copy the `dist` directory locally to Windows and imported it into Figma.)

**1. Socket Server**
```bash
# (terminal 1)
cd src/socket_server
npm install && npm run build
npm run dev
```

**2. Figma Plugin**
```bash
# (terminal 2)
cd src/figma_plugin
npm install && npm run build
```

**3. MCP Server**
```bash
# (terminal 3)
cd src/mcp_server
npm install && npm run build
```

**4. MCP Client**
```bash
# (terminal 4)
cd src/mcp_client
npm install
npm run dev -- --port=3001
```
* Your MCP client GUI available at localhost:3001
* You can select a channel to connect.

**5. Load Figma Plugin**
- Open Figma Desktop
- Go to: **Figma logo → Plugins → Development**
- Load manifest: `src/figma_plugin/dist/manifest.json`
- Click **Connect**
- Make sure to choose the same channel with your MCP Client.


**(Outdated) Debug MCP Server**
```bash
cd src/mcp_server
npx @modelcontextprotocol/inspector dist/server.js
```

### 2. Dataset
Currently, we provide the [CANVAS dataset](https://huggingface.co/datasets/seooyxx/canvas). If you use this dataset, please cite our [BibTex](#bibtex).

To follow the basic experiment, download this dataset and organize the locations as shown below:
```
canvas
├── dataset                  # HERE!
│   ├── benchmarks
│   │   ├── modification_gt
│   │   └── replication_gt
├── evaluation
└── src
    ├── config
    ├── config.py
    ├── environment.yml
    ├── experiments
    ├── figma_plugin
    ├── mcp_client
    ├── mcp_server
    └── socket_server
```

## Running Experiments
Required environment variables:
```bash
export OPENAI_API_KEY="your_openai_key"
```
Other APIs can be added in the same way. You can define them directly in the `.env` file.

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

**Arguments:**
- `--config-name`: Experiment configuration name (e.g., `single-code-replication`, `multi-react-replication`)
- `--model`: Model to use. Options: `gpt-4o`, `gpt-4.1`, `gpt-4o-mini`, `o3`, `claude-3-5-sonnet`, `gemini-2.5-flash`, `gemini-2.5-pro`.
- `--channel`: Channel name from config.yaml. Options: `channel_1` through `channel_7`. You need to change the api_base_url in `src/config/expr/{your_expr}.yaml` file.
- `--agent-type`: (optional) Agent type. Options: `code_replication`, `single_replication`, `react_replication`, `single_modification`, `react_modification`
- `--auto`: (optional) Run in non-interactive auto-save mode (skips user prompts)

- `--batch-name`: (optional) Batch name to run specific subset of samples (e.g., `batch_1`)
- `--batches-config-path`: (optional) Path to batches.yaml file

- `--variants`: (optional, replication_only) Comma-separated list of input variants. Options: `image_only`, `text_level_1`, `text_level_2`
- `--task`: (optional, modification only) Specific tasks to run (e.g., `task-1`, `task-2`). Runs all if not specified

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

## Figma MCP Tools

Based on [Talk-to-Figma](https://github.com/grab/cursor-talk-to-figma-mcp), CANVAS adopted an independent MCP client, disregarding the existing Cursor client or Langchain. We also added more tools to conduct experiments.

The full list of implemented tools is provided below.

<details>
<summary><strong>Implemented Tool List</strong></summary>

A complete list of tools supported in CanvasBench (Figma MCP):

- **Connection**
  - `get_channels` - Get available Figma channels for communication
  - `select_channel` - Select a specific Figma channel for communication
  - `check_connection_status` - Check the connection status with Figma

- **Inspection**
  - `get_page_info` - Get the information of the current page in Figma
  - `get_selection_info` - Get detailed information about the current selection in Figma, including all node details
  - `get_node_info` - Get detailed information about multiple nodes
  - `get_node_info_by_types` - Get detailed information about nodes with specific types
  - `get_result_image` - Get image of the current figma page
  - `get_page_structure` - Get complete elements structure of the current page.

- **Creation**
  - `create_rectangle` - Create a new rectangle with position, size, and optional name
  - `create_frame` - Create a new frame with position, size, and optional name
  - `create_text` - Create a new text element with customizable font properties
  - `create_graphic` - Create vector graphics (e.g. icon) using SVG markup
  - `create_polygon` - Create a new polygon with specified number of sides
  - `create_star` - Create a new star with customizable points and inner radius
  - `create_line` - Create a straight line between two points
  - `create_mask` - Turn a node into a mask and group it with other nodes to apply the mask

- **Operation**
  - `move_node` - Move a node to a new position
  - `clone_node` - Create a copy of an existing node with optional position offset
  - `resize_node` - Resize a node with new dimensions
  - `delete_node` - Delete nodes from Figma
  - `reorder_node` - Re-order a node within its parent's layer stack
  - `group_nodes` - Group multiple nodes into a single group
  - `ungroup_nodes` - Ungroup an existing GROUP node
  - `rename_node` - Rename a node
  - `rotate_node` - Rotate a node in Figma
  - `boolean_nodes` - Combine two or more shape/vector nodes with a boolean operation (UNION, SUBTRACT, INTERSECT, EXCLUDE)

- **Text**
  - `set_text_content` - Set text content for text nodes
  - `get_text_node_info` - Collect all text nodes within a specified node
  - `set_text_properties` - Set common text properties (size, line-height, letter-spacing, align) on one text node
  - `set_text_decoration` - Set underline/strikethrough/casing on one text node
  - `set_text_font` - Set the font of one text node (family & style)

- **Style**
  - `set_fill_color` - Set the fill color of a node (RGBA)
  - `set_corner_radius` - Set the corner radius of a node with optional per-corner control
  - `get_styles` - Get all styles from the current Figma document
  - `set_opacity` - Set the overall opacity of a node (0-1)
  - `set_stroke` - Set stroke color, weight and alignment of a node
  - `set_fill_gradient` - Apply a simple gradient fill
  - `set_drop_shadow` - Add a drop-shadow effect
  - `set_inner_shadow` - Add an inner-shadow effect
  - `copy_style` - Copy one node's visual style to another
  - `set_blend_mode` - Set the blend-mode of a node (e.g. MULTIPLY, SCREEN)

- **Layout**
  - `set_padding` - Set padding values for an auto-layout frame
  - `set_axis_align` - Set primary and counter axis alignment for auto-layout frames
  - `set_layout_sizing` - Set horizontal and vertical layout sizing (FIXED, HUG, FILL) for auto-layout frames
  - `set_item_spacing` - Set distance between children in an auto-layout frame
  - `set_layout_mode` - Set the layout mode and wrap behavior of a frame

</details>

<details>
<summary><strong>Best Practices</strong></summary>

When working with canvas Figma MCP:

1. **Connection Setup**:
   - Get available channels using `get_channels` first
   - Select a channel using `select_channel` before sending commands
   - Check connection status with `check_connection_status` if needed

2. **Design Inspection**:
   - Get page overview using `get_page_info` first
   - Check current selection with `get_selection_info` before modifications
   - Use `get_node_info` for detailed single node information
   - Use `get_nodes_info` for batch node information retrieval

3. **Node Creation**:
   - Use appropriate creation tools based on needs:
     - `create_frame` for containers
     - `create_rectangle` for basic shapes
     - `create_text` for text elements
     - `create_graphic` for SVG-based vector graphics
     - `create_polygon` and `create_star` for geometric shapes
     - `create_line` for connecting elements

4. **Node Operations**:
   - Use `move_node` for repositioning
   - Use `clone_node` for duplicating elements
   - Use `resize_node` for dimension changes
   - Use `group_nodes` and `ungroup_nodes` for organizing elements
   - Use `boolean_nodes` for combining shapes

5. **Text Handling**:
   - Use `get_text_node_info` to scan for text nodes
   - Use `set_text_content` for content updates
   - Use `set_text_properties` for styling (font size, alignment, etc.)
   - Use `set_text_decoration` for underline/strikethrough effects
   - Use `set_text_font` for font family changes

6. **Styling**:
   - Use `set_fill_color` for solid colors
   - Use `set_fill_gradient` for gradient effects
   - Use `set_stroke` for borders and outlines
   - Use `set_corner_radius` for rounded corners
   - Use `copy_style` to replicate styling across nodes
   - Use `set_opacity` and `set_blend_mode` for visual effects
   - Use `set_drop_shadow` and `set_inner_shadow` for depth

7. **Layout Management**:
   - Use `set_layout_mode` to enable auto-layout
   - Use `set_padding` for internal spacing
   - Use `set_axis_align` for alignment control
   - Use `set_item_spacing` for spacing between elements
   - Use `set_layout_sizing` for responsive behavior

8. **Error Handling and Validation**:
   - Verify changes using appropriate inspection tools
   - Handle errors appropriately as all commands can throw exceptions
   - Use `rename_node` for better organization and identification

9. **Performance Considerations**:
   - Use batch operations when available
   - Monitor WebSocket connection status
   - Implement appropriate error handling and retries

</details>

## Acknowledgement

This code is mainly built upon [Talk-to-Figma](https://github.com/grab/cursor-talk-to-figma-mcp) repository and [UEyes](https://github.com/YueJiang-nj/UEyes-CHI2023) repository for the visual-saliency-based metric.

## License

MIT

## BibTeX
If you use canvas repository or dataset, please cite:
```bibtex
@article{jeong2025canvas,
      title={CANVAS: A Benchmark for Vision-Language Models on Tool-Based User Interface Design}, 
      author={Daeheon Jeong and Seoyeon Byun and Kihoon Son and Dae Hyun Kim and Juho Kim},
      year={2025},
      eprint={2511.20737},
      archivePrefix={arXiv},
      primaryClass={cs.CV},
      url={https://arxiv.org/abs/2511.20737}, 
}
```
