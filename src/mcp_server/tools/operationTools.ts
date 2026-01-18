import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerOperationTools(server: McpServer) {
  server.tool(
    "move_node",
    "Move a node to a new position on the canvas, optionally changing its parent container",
    {
      nodeId: z.string().describe("Node ID to move"),
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION only) ID to append the element to"
        ),
    },
    async ({ nodeId, x, y, parentId }) => {
      try {
        const result = await sendCommandToFigma("move_node", {
          nodeId,
          x,
          y,
          parentId,
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
          context: "move_node",
        });
      }
    }
  );
  server.tool(
    "clone_node",
    "Create a duplicate copy of an existing node, optionally placing it in a different parent container or at specific coordinates",
    {
      nodeId: z.string().describe("Node ID to clone"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION only) ID to append the element to"
        ),
      x: z.number().optional().describe("X coordinate of the node (global)"),
      y: z.number().optional().describe("Y coordinate of the node (global)"),
    },
    async ({ nodeId, parentId, x, y }) => {
      try {
        const result = await sendCommandToFigma("clone_node", {
          nodeId,
          parentId,
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
  server.tool(
    "resize_node",
    "Change the dimensions (width and height) of a node while maintaining its position",
    {
      nodeId: z.string().describe("Node ID to resize"),
      width: z.number().min(1).describe("Width of the node"),
      height: z.number().min(1).describe("Height of the node"),
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
  server.tool(
    "delete_node",
    "Permanently remove one or more nodes from their parent node",
    {
      nodeIds: z.array(z.string()).describe("Node IDs to delete"),
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
    "group_nodes",
    "Combine multiple separate design elements into a single organizational GROUP container",
    {
      nodeIds: z
        .array(z.string())
        .min(2)
        .describe("IDs of the nodes to group (≥2 required)"),
      groupName: z
        .string()
        .optional()
        .describe("Semantic name for the new group"),
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
    "Break apart an existing GROUP container, releasing all contained elements back to individual objects",
    {
      groupId: z.string().describe("Group node ID to ungroup"),
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
    "Change the display name of any design element to improve organization and identification",
    {
      nodeId: z.string().describe("Node ID to rename"),
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
    "Apply rotation transformation to any design element around its center point",
    {
      nodeId: z.string().describe("Node ID to rotate"),
      angle: z
        .number()
        .min(0)
        .max(360)
        .describe("Absolute rotation angle in degrees (0 to 360)"),
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
    "Combine two or more vector shapes or geometric objects using mathematical boolean operations. Create complex shapes by merging (UNION), subtracting (SUBTRACT), finding intersections (INTERSECT), or creating cut-outs (EXCLUDE)",
    {
      nodeIds: z.array(z.string()).min(2).describe("Node IDs to combine (≥2)"),
      operation: z
        .enum(["UNION", "SUBTRACT", "INTERSECT", "EXCLUDE"])
        .describe("Boolean operation to apply"),
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

  server.tool(
    "reorder_node",
    "Change the stacking order (z-index) of a design element within its parent container's layer stack. Control which elements appear in front of or behind others",
    {
      nodeId: z.string().describe("Node ID to reorder"),
      direction: z
        .enum(["TOP", "BOTTOM", "FORWARD", "BACKWARD"])
        .describe(
          "Layer-stack movement direction: TOP (bring to front), BOTTOM (send to back), FORWARD (one layer up), BACKWARD (one layer down)"
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
}
