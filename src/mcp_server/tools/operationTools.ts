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
      newParentId: z
        .string()
        .optional()
        .describe("The ID of the new parent node if needed (optional)"),
    },
    async ({ nodeId, x, y, newParentId }) => {
      try {
        const result = await sendCommandToFigma("move_node", {
          nodeId,
          x,
          y,
          newParentId,
        });
        const typedResult = result as {
          name: string;
          id: string;
          parentId: string | null;
          oldX: number;
          oldY: number;
          newX: number;
          newY: number;
        };

        return createSuccessResponse({
          messages: [
            `Moved node "${typedResult.id}" to position (${typedResult.newX}, ${
              typedResult.newY
            }) from (${typedResult.oldX}, ${typedResult.oldY}) in parent "${
              typedResult.parentId || "none"
            }."`,
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
      newParentId: z
        .string()
        .optional()
        .describe(
          "The ID of the new parent node to place the clone (optional)"
        ),
      x: z.number().optional().describe("New X position for the clone"),
      y: z.number().optional().describe("New Y position for the clone"),
    },
    async ({ nodeId, newParentId, x, y }) => {
      try {
        const result = await sendCommandToFigma("clone_node", {
          nodeId,
          newParentId,
          x,
          y,
        });
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

  // Delete Multiple Nodes Tool
  server.tool(
    "delete_node",
    "Delete nodes from Figma",
    {
      nodeIds: z.array(z.string()).describe("Array of node IDs to delete"),
    },
    async ({ nodeIds }) => {
      try {
        const result = await sendCommandToFigma("delete_node", {
          nodeIds,
        });
        return createSuccessResponse({
          messages: [`Deleted nodes with IDs: ${nodeIds.join(", ")}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "delete_node",
        });
      }
    }
  );

  server.tool(
    "reorder_node",
    "Re-order a node within its parent’s layer stack",
    {
      nodeId: z.string().describe("ID of the node to reorder"),
      direction: z
        .enum(["TOP", "BOTTOM", "FORWARD", "BACKWARD"])
        .describe(
          "Layer-stack move: " +
            "TOP (bring to front), BOTTOM (send to back), " +
            "FORWARD (one layer up), BACKWARD (one layer down)"
        ),
    },
    async ({ nodeId, direction }) => {
      try {
        const result = await sendCommandToFigma("reorder_node", {
          nodeId,
          direction,
        });
        const typed = result as {
          id: string;
          name: string;
          parentId: string;
          oldIndex: number;
          newIndex: number;
        };
        return createSuccessResponse({
          messages: [
            `Moved “${typed.name}” from index ${typed.oldIndex} to ${typed.newIndex} in parent ${typed.parentId}.`,
          ],
          dataItem: typed,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "reorder_node" });
      }
    }
  );

  server.tool(
    "group_nodes",
    "Group multiple nodes into a single group",
    {
      nodeIds: z
        .array(z.string())
        .min(2)
        .describe("IDs of the nodes to group (≥2 required)"),
      groupName: z
        .string()
        .optional()
        .describe("Name to give the new group (optional)"),
    },
    async ({ nodeIds, groupName }) => {
      try {
        const result = await sendCommandToFigma("group_nodes", {
          nodeIds,
          groupName,
        });
        return createSuccessResponse({
          messages: [
            `Created group “${result.name}” containing ${nodeIds.length} node(s).`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "group_nodes" });
      }
    }
  );

  server.tool(
    "ungroup_nodes",
    "Ungroup an existing GROUP node",
    {
      groupId: z.string().describe("ID of the group node to ungroup"),
    },
    async ({ groupId }) => {
      try {
        const result = await sendCommandToFigma("ungroup_nodes", { groupId });
        return createSuccessResponse({
          messages: [
            `Ungrouped “${groupId}” into ${result.releasedIds.length} child node(s).`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "ungroup_nodes" });
      }
    }
  );

  server.tool(
    "rename_node",
    "Rename a node",
    {
      nodeId: z.string().describe("ID of the node to rename"),
      newName: z.string().describe("New name for the node"),
    },
    async ({ nodeId, newName }) => {
      try {
        const result = await sendCommandToFigma("rename_node", {
          nodeId,
          newName,
        });
        return createSuccessResponse({
          messages: [`Renamed “${result.oldName}” → “${result.newName}”.`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "rename_node" });
      }
    }
  );

  server.tool(
    "rotate_node",
    "Rotate a node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to rotate"),
      angle: z.number().describe("Absolute rotation angle in degrees"),
    },
    async ({ nodeId, angle }) => {
      try {
        const result = await sendCommandToFigma("rotate_node", {
          nodeId,
          angle,
        });

        const typed = result as {
          id: string;
          name: string;
          oldAngle: number;
          newAngle: number;
          newX: number;
          newY: number;
        };

        return createSuccessResponse({
          messages: [
            `Rotated “${typed.name}(id:${typed.id})” from ${typed.oldAngle}° to ${typed.newAngle}°. New position: (${typed.newX}, ${typed.newY}).`,
          ],
          dataItem: typed,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "rotate_node" });
      }
    }
  );

  server.tool(
    "boolean_nodes",
    "Combine two or more shape / vector nodes with a boolean operation (UNION, SUBTRACT, INTERSECT, EXCLUDE)",
    {
      nodeIds: z
        .array(z.string())
        .min(2)
        .describe("IDs of the nodes to combine (≥2)"),
      operation: z
        .enum(["UNION", "SUBTRACT", "INTERSECT", "EXCLUDE"])
        .describe(
          "Boolean operation to apply: UNION, SUBTRACT, INTERSECT, EXCLUDE"
        ),
    },
    async ({ nodeIds, operation }) => {
      try {
        const result = await sendCommandToFigma("boolean_nodes", {
          nodeIds,
          operation,
        });

        const typed = result as {
          id: string;
          name: string;
          operation: string;
          parentId: string;
          containedIds: string[];
        };

        return createSuccessResponse({
          messages: [
            `Combined ${typed.containedIds.length} node(s) into a ${typed.operation} layer “${typed.name}” (id:${typed.id}).`,
          ],
          dataItem: typed,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "boolean_nodes" });
      }
    }
  );
}
