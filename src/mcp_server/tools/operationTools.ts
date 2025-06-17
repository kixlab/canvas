import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerOperationTools(server: McpServer) {
  // Move Node Tool
  server.tool(
    "move_node",
    "Move a node to a new position in Figma",
    {
      nodeId: z.string().describe("The ID of the node to move"),
      x: z.number().describe("New X position"),
      y: z.number().describe("New Y position"),
    },
    async ({ nodeId, x, y }) => {
      try {
        const result = await sendCommandToFigma("move_node", { nodeId, x, y });
        const typedResult = result as { name: string };

        return createSuccessResponse({
          messages: [
            `Moved node "${typedResult.name}" to position (${x}, ${y})`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "moving_node",
        });
      }
    }
  );

  // Clone Node Tool
  server.tool(
    "clone_node",
    "Clone an existing node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to clone"),
      x: z.number().optional().describe("New X position for the clone"),
      y: z.number().optional().describe("New Y position for the clone"),
    },
    async ({ nodeId, x, y }) => {
      try {
        const result = await sendCommandToFigma("clone_node", { nodeId, x, y });
        const typedResult = result as { name: string; id: string };

        return createSuccessResponse({
          messages: [
            `Cloned node "${typedResult.name}" with new ID: ${typedResult.id}${
              x !== undefined && y !== undefined
                ? ` at position (${x}, ${y})`
                : ""
            }`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "cloning_node",
        });
      }
    }
  );

  // Resize Node Tool
  server.tool(
    "resize_node",
    "Resize a node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to resize"),
      width: z.number().positive().describe("New width"),
      height: z.number().positive().describe("New height"),
    },
    async ({ nodeId, width, height }) => {
      try {
        const result = await sendCommandToFigma("resize_node", {
          nodeId,
          width,
          height,
        });
        const typedResult = result as { name: string };
        return createSuccessResponse({
          messages: [
            `Resized node "${typedResult.name}" to width ${width} and height ${height}`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "resizing_node",
        });
      }
    }
  );

  // Delete Node Tool
  server.tool(
    "delete_node",
    "Delete a node from Figma",
    {
      nodeId: z.string().describe("The ID of the node to delete"),
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("delete_node", { nodeId });

        const typescriptResult = result as {
          id: string;
          name: string;
          type: string;
        };

        return createSuccessResponse({
          messages: [`Deleted node with ID: ${nodeId}`],
          dataItem: typescriptResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "deleting_node",
        });
      }
    }
  );

  // Delete Multiple Nodes Tool
  server.tool(
    "delete_multiple_nodes",
    "Delete multiple nodes from Figma at once",
    {
      nodeIds: z.array(z.string()).describe("Array of node IDs to delete"),
    },
    async ({ nodeIds }) => {
      try {
        const result = await sendCommandToFigma("delete_multiple_nodes", {
          nodeIds,
        });
        return createSuccessResponse({
          messages: [`Deleted nodes with IDs: ${nodeIds.join(", ")}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "deleting_multiple_nodes",
        });
      }
    }
  );
}
