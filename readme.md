## Folder Structure

- `src/fastapi_server`: MCP client for communicating with the remote LLM API.
- `src/figma_plugin`: Figma plugin for executing commands.
- `src/mcp_server`: MCP server for listing up the tools for LLM agent.
- `src/socket_server`: Socket server for broadcasting messages between the plugin and the MCP server.

## Get Started

### Prerequisites
- Install Node.js (v18+ recommended)

### Quick Setup
```bash
# Build all services
chmod +x ./sh/build_service.sh
./sh/build_service.sh
```

### Manual Setup

**1. Socket Server**
```bash
cd src/socket_server
npm install && npm run build
```

**2. Figma Plugin**
```bash
cd src/figma_plugin
npm install && npm run build
```

**3. MCP Server**
```bash
cd src/mcp_server
npm install && npm run build
```

### Running Services

**1. Start Socket Server**
```bash
chmod +x ./sh/run_socket.sh
./sh/run_socket.sh
```
or
```
cd src/socket_server
npm run start
```

**2. Load Figma Plugin**
- Open Figma Desktop
- Go to: **Figma logo → Plugins → Development**
- Load manifest: `src/figma_plugin/dist/manifest.json`
- Click **Connect**

**3. Debug MCP Server (Optional)**
```bash
cd src/mcp_server
npx @modelcontextprotocol/inspector dist/server.js
```

**4. FastAPI Server (Optional)**
```bash
# Setup environment
echo "OPENAI_API_KEY=your_key_here" > .env

cd src/fastapi_server
pip install -r requirements.txt
python app.py
```

## MCP Tools

CanvasBench Tool Lists

### Inspection

- `get_document_info` - Get information about the current Figma document
- `get_selection` - Get information about the current selection
- `read_my_design` - Get detailed node information about the current selection without parameters
- `get_node_info` - Get detailed information about a specific node
- `get_nodes_info` - Get detailed information about multiple nodes by providing an array of node IDs
- `scan_nodes_by_types` - Scan for nodes with specific types (useful for finding annotation targets)

### Operation

- `move_node` - Move a node to a new position
- `resize_node` - Resize a node with new dimensions
- `delete_node` - Delete a node
- `delete_multiple_nodes` - Delete multiple nodes at once efficiently
- `clone_node` - Create a copy of an existing node with optional position offset

### Annotation

- `get_annotations` - Get all annotations in the current document or specific node
- `set_annotation` - Create or update an annotation with markdown support
- `set_multiple_annotations` - Batch create/update multiple annotations efficiently

### Creation

- `create_rectangle` - Create a new rectangle with position, size, and optional name
- `create_frame` - Create a new frame with position, size, and optional name
- `create_text` - Create a new text node with customizable font properties

### Text

- `scan_text_nodes` - Scan text nodes with intelligent chunking for large designs
- `set_text_content` - Set the text content of a single text node
- `set_multiple_text_contents` - Batch update multiple text nodes efficiently

### Style

- `set_fill_color` - Set the fill color of a node (RGBA)
- `set_stroke_color` - Set the stroke color and weight of a node
- `set_corner_radius` - Set the corner radius of a node with optional per-corner control
- `get_styles` - Get information about local styles

### Layout

- `set_padding` - Set padding (top, right, bottom, left) for auto-layout frames
- `set_axis_align` - Set primary and counter axis alignment for auto-layout frames
- `set_layout_sizing` - Set horizontal and vertical layout sizing (FIXED, HUG, FILL) for auto-layout frames
- `set_item_spacing` - Set spacing between items in auto-layout frames
- `set_layout_mode` - Set the layout mode (NONE, HORIZONTAL, VERTICAL) and wrap behavior for auto-layout frames

### Component

- `get_local_components` - Get information about local components
- `create_component_instance` - Create an instance of a component

### Miscellaneous

- `export_node_as_image` - Export a node as an image (PNG, JPG, SVG, or PDF) - limited support on image currently returning base64 as text

## Best Practices

When working with the Figma MCP:

1. Always join a channel before sending commands
2. Get document overview using `get_document_info` first
3. Check current selection with `get_selection` before modifications
4. Use appropriate creation tools based on needs:
   - `create_frame` for containers
   - `create_rectangle` for basic shapes
   - `create_text` for text elements
5. Verify changes using `get_node_info`
6. Use component instances when possible for consistency
7. Handle errors appropriately as all commands can throw exceptions
8. For large designs:
   - Use chunking parameters in `scan_text_nodes`
   - Monitor progress through WebSocket updates
   - Implement appropriate error handling
9. For text operations:
   - Use batch operations when possible
   - Consider structural relationships
   - Verify changes with targeted exports
10. For converting legacy annotations:
    - Scan text nodes to identify numbered markers and descriptions
    - Use `scan_nodes_by_types` to find UI elements that annotations refer to
    - Match markers with their target elements using path, name, or proximity
    - Categorize annotations appropriately with `get_annotations`
    - Create native annotations with `set_multiple_annotations` in batches
    - Verify all annotations are properly linked to their targets
    - Delete legacy annotation nodes after successful conversion

## License

MIT
