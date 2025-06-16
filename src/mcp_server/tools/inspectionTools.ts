import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import {
  createErrorResponse,
  createSuccessResponse,
  filterFigmaNode,
} from "../common/utils.js";

export function registerInspectionTools(server: McpServer) {
  // Document Info Tool
  server.tool(
    "get_document_info",
    "Get image of the current page in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_document_info");

        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "getting document info",
        });
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
        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "getting selection",
        });
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
        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "read_my_design",
        });
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
        return createSuccessResponse({
          messages: [JSON.stringify(filterFigmaNode(result))],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_node_info",
        });
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
        return createSuccessResponse({
          messages: [
            JSON.stringify(
              results.map((result) => filterFigmaNode(result.info))
            ),
          ],
          dataItem: {
            results: results.map((result) => filterFigmaNode(result.info)),
          },
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_nodes_info",
        });
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
        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "scan_nodes_by_types",
        });
      }
    }
  );
}
