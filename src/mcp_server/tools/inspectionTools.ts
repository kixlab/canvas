import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { logger } from "../config.js";

export function registerInspectionTools(server: McpServer) {
  // Page Info Tool
  server.tool(
    "get_page_info",
    "Get the information of the current page in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_page_info");
        const responseMessage = `Found ${
          result.childrenCount
        } children nodes in the document. List of frame is ${result["frame"]
          .map((n: any) => `'${n.name}(ID: ${n.id})'`)
          .join(", ")}`;

        return createSuccessResponse({
          messages: [responseMessage],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_page_info",
        });
      }
    }
  );

  // Read My Design Tool
  server.tool(
    "get_selection_info",
    "Get detailed information about the current selection in Figma, including all node details",
    {},
    async () => {
      try {
        const result = (await sendCommandToFigma("get_selection_info", {})) as {
          nodeList: Array<{
            nodeId: string;
            nodeInfo: any;
          }>;
        };

        return createSuccessResponse({
          messages: [
            `Find ${
              result.nodeList.length
            } nodes in selection. Node IDs: ${result.nodeList
              .map((n) => `'${n.nodeId}'`)
              .join(", ")}`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_selection_info",
        });
      }
    }
  );

  // Nodes Info Tool
  server.tool(
    "get_node_info",
    "Get detailed information about the list of nodes in Figma",
    {
      nodeIds: z
        .array(z.string())
        .describe("Array of node IDs to get information about"),
    },
    async (input) => {
      const { nodeIds } = input;
      try {
        const result = (await sendCommandToFigma("get_node_info", {
          nodeIds,
        })) as {
          nodeList: Array<{
            nodeId: string;
            nodeInfo: any;
          }>;
        };

        return createSuccessResponse({
          messages: [
            `Got information for ${
              result.nodeList.length
            } nodes. Node IDs: ${result.nodeList
              .map((n) => `'${n.nodeId}'`)
              .join(", ")}`,
          ],
          dataItem: {
            results: result.nodeList,
          },
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_node_info",
        });
      }
    }
  );

  // Get Node Summary by Types Tool
  server.tool(
    "get_node_info_by_types",
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
        const result = (await sendCommandToFigma("get_node_info_by_types", {
          nodeId,
          types,
        })) as {
          success: boolean;
          message: string;
          count: number;
          matchingNodes: Array<{
            nodeId: string;
            nodeInfo: any;
          }>;
          searchedTypes: string[];
        };
        return createSuccessResponse({
          messages: [
            `Found ${
              result.count
            } matching nodes. Node IDs: ${result.matchingNodes
              .map((n) => `'${n.nodeId}'`)
              .join(", ")}`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_node_info_by_types",
        });
      }
    }
  );

  // Get Page Image Tool
  server.tool(
    "get_result_image",
    "Get the result image of the tool calling in the current Figma page",
    {
      pageId: z
        .string()
        .optional()
        .describe("Figma page ID (defaults to current page)"),
      scale: z
        .number()
        .positive()
        .optional()
        .describe("Export scale (default 1)"),
    },
    async ({ pageId, scale }) => {
      try {
        const result = await sendCommandToFigma("get_result_image", {
          pageId,
          scale: scale || 1,
        });

        const typed = result as { imageData: string; mimeType: string };

        return createSuccessResponse({
          messages: [`Exported page ${pageId || "current"} as image.`],
          images: [
            { data: typed.imageData, mimeType: typed.mimeType ?? "image/png" },
          ],
          dataItem: typed,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_result_image",
        });
      }
    }
  );
}
