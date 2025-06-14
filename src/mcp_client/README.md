# MCP Client Server

This TypeScript/Express server replaces the Python FastAPI server and provides the same API endpoints for UI generation and modification tasks. It uses the Model Context Protocol (MCP) to communicate with Figma tools.

## Features

- **REST API Endpoints**: Compatible with the original FastAPI server
- **File Upload Support**: Handle image uploads for UI generation/modification
- **MCP Integration**: Communicate with Figma tools via MCP protocol
- **Multiple AI Models**: Support for OpenAI, Anthropic, and other providers
- **TypeScript**: Full type safety and modern JavaScript features
- **Graceful Shutdown**: Proper cleanup of resources

## Installation

```bash
npm install
```

## Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your API keys and configuration:
```
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
AGENT_TYPE=single
```

3. Ensure the MCP server is built:
```bash
cd ../mcp_server
npm run build
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### With CLI Arguments
```bash
npm run dev -- --agent_type=single
npm run dev -- --agent_type=multi
```

## API Endpoints

### Generation Endpoints
- `POST /generate/text` - Generate UI from text instructions
- `POST /generate/image` - Generate UI from image input
- `POST /generate/text-image` - Generate UI from text + image

### Modification Endpoints
- `POST /modify/without-oracle` - Modify UI without oracle information
- `POST /modify/with-oracle/perfect-hierachy` - Modify with hierarchy oracle
- `POST /modify/with-oracle/perfect-canvas` - Modify with canvas oracle

### Tool Endpoints
- `POST /tool/get_selection` - Get current Figma selection
- `POST /tool/create_root_frame` - Create a root frame
- `POST /tool/create_text_in_root_frame` - Add text to root frame
- `POST /tool/delete_node` - Delete a specific node
- `POST /tool/delete_multiple_nodes` - Delete multiple nodes
- `POST /tool/delete_all_top_level_nodes` - Clear all top-level nodes
- `POST /tool/get_channels` - Get available Figma channels
- `POST /tool/select_channel` - Switch to a specific channel

## Request/Response Format

### Text Generation
```bash
curl -X POST http://localhost:3000/generate/text \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a login form with email and password fields"}'
```

### Image Generation
```bash
curl -X POST http://localhost:3000/generate/image \
  -F "image=@screenshot.png" \
  -F "metadata=example_upload"
```

### Response Format
```json
{
  "response": "...",
  "json_response": {...},
  "step_count": 5
}
```

## Architecture

- **Express.js**: Web framework for handling HTTP requests
- **Multer**: Middleware for handling file uploads
- **MCP SDK**: Client for communicating with MCP servers
- **TypeScript**: Type safety and modern JavaScript features

## File Structure

```
src/mcp_client/
├── index.ts           # Main Express server
├── agent.ts           # MCP agent management
├── config.ts          # Configuration loading
├── types.ts           # TypeScript type definitions
├── utils.ts           # Utility functions
├── prompts.ts         # AI prompt templates
├── modelFactory.ts    # AI model abstraction
├── express-types.ts   # Express-specific types
├── package.json       # Dependencies and scripts
├── tsconfig.json      # TypeScript configuration
└── .env.example       # Environment template
```

## Migration from FastAPI

This server maintains API compatibility with the original Python FastAPI server:

- Same endpoint paths and request/response formats
- Identical functionality for all generation and modification tasks
- Compatible with existing client applications
- Same configuration system using YAML files

## Dependencies

- **express**: Web framework
- **multer**: File upload handling
- **@modelcontextprotocol/sdk**: MCP client
- **openai**: OpenAI API client
- **dotenv**: Environment variable loading
- **yaml**: YAML configuration parsing

## Development

### Type Checking
```bash
npx tsc --noEmit
```

### Building
```bash
npm run build
```

### Running
```bash
npm run dev
```

## Troubleshooting

1. **MCP Server Not Found**: Ensure the MCP server is built in `../mcp_server/dist/server.js`
2. **API Key Errors**: Check that your API keys are correctly set in `.env`
3. **Port Conflicts**: Change the PORT in `.env` if 3000 is already in use
4. **TypeScript Errors**: Run `npm run build` to check for compilation issues

## License

Same as the parent project.
