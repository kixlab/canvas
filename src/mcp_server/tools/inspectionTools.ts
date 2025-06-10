import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, filterFigmaNode } from "../common/utils.js";

export function registerInspectionTools(server: McpServer) {
  // Document Info Tool
  server.tool(
    "get_document_info",
    "Get image of the current page in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_document_info");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting document info");
      }
    }
  );

  // Selection Tool
  server.tool(
    "get_selection",
    "Get information about the current selection in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_selection");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting selection");
      }
    }
  );

  // Read My Design Tool
  server.tool(
    "read_my_design",
    "Get detailed information about the current selection in Figma, including all node details",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("read_my_design", {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting node info");
      }
    }
  );

  // Node Info Tool
  server.tool(
    "get_node_info",
    "Get detailed information about a specific node in Figma",
    {
      nodeId: z
        .string()
        .describe("The ID of the node to get information about"),
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_node_info", { nodeId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(filterFigmaNode(result)),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting node info");
      }
    }
  );

  // Nodes Info Tool
  server.tool(
    "get_nodes_info",
    "Get detailed information about multiple nodes in Figma",
    {
      nodeIds: z
        .array(z.string())
        .describe("Array of node IDs to get information about"),
    },
    async ({ nodeIds }) => {
      try {
        const results = await Promise.all(
          nodeIds.map(async (nodeId) => {
            const result = await sendCommandToFigma("get_node_info", {
              nodeId,
            });
            return { nodeId, info: result };
          })
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                results.map((result) => filterFigmaNode(result.info))
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting nodes info");
      }
    }
  );

  // Scan Nodes by Types Tool
  server.tool(
    "scan_nodes_by_types",
    "Scan and collect nodes of specific types within a specified node",
    {
      nodeId: z.string().describe("The ID of the node to scan"),
      types: z
        .array(z.string())
        .describe(
          "Array of node types to scan for (e.g., ['COMPONENT', 'INSTANCE', 'FRAME'])"
        ),
    },
    async ({ nodeId, types }) => {
      try {
        const result = await sendCommandToFigma("scan_nodes_by_types", {
          nodeId,
          types,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "scanning nodes by types");
      }
    }
  );
}
