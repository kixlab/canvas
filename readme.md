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

**3. Debug MCP Server**
```bash
cd src/mcp_server
npx @modelcontextprotocol/inspector dist/server.js
```

**4. FastAPI Server**
```bash
# Setup environment
echo "OPENAI_API_KEY=your_key_here" > .env

cd src
pip install -r fastapi_server/requirements.txt
uvicorn fastapi_server.app:app --port=8000
```

Instead of uvicorn:
```
python -m fastapi_server.app  # default port: 8000
```
can be possible.

## MCP Tools

CanvasBench Tool Lists

### Connection

- `get_channels` - Get available Figma channels for communication
- `select_channel` - Select a specific Figma channel for communication
- `check_connection_status` - Check the connection status with Figma

### Inspection

- `get_page_info` - Get the information of the current page in Figma
- `get_selection_info` - Get detailed information about the current selection in Figma, including all node details
- `get_node_info` - Get detailed information about multiple nodes
- `get_node_info_by_types` - Get detailed information about nodes with specific types
- `get_result_image` - Get image of the current figma page
- `get_page_structure` - Get complete elements structure of the current page.

### Creation

- `create_rectangle` - Create a new rectangle with position, size, and optional name
- `create_frame` - Create a new frame with position, size, and optional name
- `create_text` - Create a new text element with customizable font properties
- `create_graphic` - Create vector graphics (e.g. icon) using SVG markup
- `create_polygon` - Create a new polygon with specified number of sides
- `create_star` - Create a new star with customizable points and inner radius
- `create_line` - Create a straight line between two points
- `create_mask` - Turn a node into a mask and group it with other nodes to apply the mask

### Operation

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

### Text

- `set_text_content` - Set text content for text nodes
- `get_text_node_info` - Collect all text nodes within a specified node
- `set_text_properties` - Set common text properties (size, line-height, letter-spacing, align) on one text node
- `set_text_decoration` - Set underline/strikethrough/casing on one text node
- `set_text_font` - Set the font of one text node (family & style)

### Style

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

### Layout

- `set_padding` - Set padding values for an auto-layout frame
- `set_axis_align` - Set primary and counter axis alignment for auto-layout frames
- `set_layout_sizing` - Set horizontal and vertical layout sizing (FIXED, HUG, FILL) for auto-layout frames
- `set_item_spacing` - Set distance between children in an auto-layout frame
- `set_layout_mode` - Set the layout mode and wrap behavior of a frame

## Best Practices

When working with the Figma MCP:

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

## License

MIT
