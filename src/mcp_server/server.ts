import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { logger, SERVER_CONFIG } from "./config.js";
import { connectToFigma } from "./common/websocket.js";

import { registerAnnotationTools } from "./tools/annotationTools.js";
import { registerComponentTools } from "./tools/componentTools.js";
import { registerConnectionTools } from "./tools/connectionTools.js";
import { registerCreationTools } from "./tools/creationTools.js";
import { registerInspectionTools } from "./tools/inspectionTools.js";
import { registerLayoutTools } from "./tools/layoutTools.js";
import { registerMiscellaneousTools } from "./tools/miscellaneousTools.js";
import { registerOperationTools } from "./tools/operationTools.js";
import { registerStyleTools } from "./tools/styleTools.js";
import { registerTextTools } from "./tools/textTools.js";
import { registerPrompts } from "./common/prompts.js";

const server = new McpServer({
  name: SERVER_CONFIG.name,
  version: SERVER_CONFIG.version,
});

registerAnnotationTools(server);
registerComponentTools(server);
registerConnectionTools(server);
registerInspectionTools(server);
registerCreationTools(server);
registerLayoutTools(server);
registerMiscellaneousTools(server);
registerOperationTools(server);
registerStyleTools(server);
registerTextTools(server);
registerPrompts(server);

async function main() {
  try {
    // Try to connect to Figma socket server
    connectToFigma();
  } catch (error) {
    logger.warn(
      `Could not connect to Figma initially: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    logger.warn("Will try to connect when the first command is sent");
  }

  // Start the MCP server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("FigmaMCP server running on stdio");
}

// Run the server
main().catch((error) => {
  logger.error(
    `Error starting FigmaMCP server: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});
