import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerInspectionTools(server: McpServer) {
  // Page Info Tool
  server.tool(
    "get_page_info",
    "Get brief information about the current Figma page, including first-level nodes and their details (e.g., names, IDs)",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_page_info");
        const responseMessage = `The page contains ${result.childrenCount} first-level children nodes.`;

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
    "Get detailed information about all currently selected nodes in the Figma canvas, including their properties and attributes",
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
    "Retrieve information (e.g., names, IDs, types, and absolute positions) in a structured format for a specific list of nodes by their IDs",
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

        let description = `Retrieved information for ${result.nodeList.length} nodes`;
        if (result.nodeList.length > 0) {
          result.nodeList.forEach((node, index) => {
            let pos = "unknown";
            if (node.nodeInfo.position) {
              pos = `(${Math.round(node.nodeInfo.position.x)}, ${Math.round(
                node.nodeInfo.position.y
              )})`;
            }
            description += `\nNode Name "${node.nodeInfo.name}" Node ID "${node.nodeId}" Node Type "${node.nodeInfo.type}" Node Position "${pos}"`;
          });
        }

        return createSuccessResponse({
          messages: [description],
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

  // Get Node Summary by Types Tool
  server.tool(
    "get_node_info_by_types",
    "Get information about all nodes with specific types (e.g., FRAME, COMPONENT, TEXT) within a given parent node",
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
    "Export and retrieve a visual image of the current design",
    {
      pageId: z
        .string()
        .optional()
        .describe("Page ID (defaults to current page)"),
      scale: z
        .number()
        .min(0.1)
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

  // Page layer-tree inspection Tool
  server.tool(
    "get_page_structure",
    "Get a hierarchical tree structure of all elements (nodes) on the current page, including their information (e.g., names, IDs, types, and absolute positions) in a structured format",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_page_structure");

        const toLines = (nodes: any[], indent = ""): string =>
          nodes
            .map((n) => {
              const pos = `(${Math.round(n.position.x)}, ${Math.round(
                n.position.y
              )})`;
              const line = `${indent} Node Name "${n.name}", Node Id "${n.id}", Node Type "${n.type}", and Node Position "${pos}"`;
              return n.children && n.children.length
                ? line + "\n" + toLines(n.children, indent + "- ")
                : line;
            })
            .join("\n");

        const treeString = toLines(result.structureTree);
        const description = "The structure of the current page\n" + treeString;

        return createSuccessResponse({
          messages: [description],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "get_page_structure" });
      }
    }
  );

  server.tool(
    "export_json",
    "[ONLY FOR DEBUGGING] Get the complete Figma page as structured JSON, including every page and all nested nodes",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("export_json");

        return createSuccessResponse({
          messages: [
            `Fetched document with ${result.document.children.length} top-level elements`,
          ],
          dataItem: result, // the full document JSON
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "export_json",
        });
      }
    }
  );

  server.tool(
    "import_json",
    "[ONLY FOR DEBUGGING] Render an entire Figma document from a JSON string into the current page",
    {
      jsonString: z
        .string()
        .describe("The raw REST-v1 document JSON string to import and render"),
    },
    async ({ jsonString }) => {
      try {
        const result = await sendCommandToFigma("import_json", {
          jsonString,
        });

        return createSuccessResponse({
          messages: [
            `Successfully imported document – new root node id "${result.rootFrameId}".`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "import_json",
        });
      }
    }
  );
}
