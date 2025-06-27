# MCP Server Structure

This document describes the modular structure of the MCP server for CanvasBench.

## File Structure

### Root Files

- **[`server.ts`](server.ts)** - Main MCP server entry point and orchestration
- **[`config.ts`](config.ts)** - Configuration, logging utilities, and constants
- **[`types.ts`](types.ts)** - All TypeScript interfaces and type definitions
- **`package.json`** - Node.js package configuration
- **`tsconfig.json`** - TypeScript configuration

### Common Utilities (`common/`)

- **[`websocket.ts`](common/websocket.ts)** - WebSocket connection management and communication
- **[`prompts.ts`](common/prompts.ts)** - MCP prompts for design guidance and strategies
- **[`utils.ts`](common/utils.ts)** - Utility functions (color conversion, node filtering, response helpers)

### Tool Modules (`tools/`)

- **[`connectionTools.ts`](tools/connectionTools.ts)** - Connection and channel management
  - `get_channels`, `select_channel`, `check_connection_status`

- **[`inspectionTools.ts`](tools/inspectionTools.ts)** - Document and selection operations
  - `get_document_info`, `get_selection`, `read_my_design`, `get_node_info`, `get_nodes_info`, `get_styles`, `scan_text_nodes`, `scan_nodes_by_types`

- **[`creationTools.ts`](tools/creationTools.ts)** - Element creation tools
  - `create_rectangle`, `create_frame`, `create_text`

- **[`styleTools.ts`](tools/styleTools.ts)** - Styling and appearance tools
  - `set_fill_color`, `set_stroke_color`, `set_corner_radius`

- **[`layoutTools.ts`](tools/layoutTools.ts)** - Layout and auto-layout operations
  - `set_layout_mode`, `set_padding`, `set_axis_align`, `set_layout_sizing`, `set_item_spacing`

- **[`textTools.ts`](tools/textTools.ts)** - Text manipulation tools
  - `set_text_content`, `set_multiple_text_contents`

- **[`operationTools.ts`](tools/operationTools.ts)** - Node operations
  - `move_node`, `clone_node`, `resize_node`, `delete_node`, `delete_multiple_nodes`

## Usage

Initialize by installing dependencies:

```bash
npm install
```

To build the MCP server:

```bash
npm run build
```

For debuging, run following comand:

```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

Alternatively, you can also call following command

```bash
npm run debug
```

## Adding New Tools

To add a new tool:

1. **Choose appropriate tool file** in `tools/` directory
2. **Add tool registration** following existing patterns
3. **Import and use** utilities from `common/` as needed
4. **Update types** in [`types.ts`](types.ts) if required

Example:

````typescript
// tools/newCategoryTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerNewCategoryTools(server: McpServer) {
  server.tool("new_tool", "Description", {}, async () => {
    // Implementation
  });
}