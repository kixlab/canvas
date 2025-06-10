import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerStyleTools(server: McpServer) {
  // Set Fill Color Tool
  server.tool(
    "set_fill_color",
    "Set the fill color of a node in Figma can be TextNode or FrameNode",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      r: z.number().min(0).max(1).describe("Red component (0-1)"),
      g: z.number().min(0).max(1).describe("Green component (0-1)"),
      b: z.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
    },
    async ({ nodeId, r, g, b, a }) => {
      try {
        const result = await sendCommandToFigma("set_fill_color", {
          nodeId,
          color: { r, g, b, a: a || 1 },
        });
        const typedResult = result as { name: string };
        return createSuccessResponse(
          `Set fill color of node "${
            typedResult.name
          }" to RGBA(${r}, ${g}, ${b}, ${a || 1})`
        );
      } catch (error) {
        return createErrorResponse(error, "setting fill color");
      }
    }
  );

  // Set Stroke Color Tool
  server.tool(
    "set_stroke_color",
    "Set the stroke color of a node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      r: z.number().min(0).max(1).describe("Red component (0-1)"),
      g: z.number().min(0).max(1).describe("Green component (0-1)"),
      b: z.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
      weight: z.number().positive().optional().describe("Stroke weight"),
    },
    async ({ nodeId, r, g, b, a, weight }) => {
      try {
        const result = await sendCommandToFigma("set_stroke_color", {
          nodeId,
          color: { r, g, b, a: a || 1 },
          weight: weight || 1,
        });
        const typedResult = result as { name: string };
        return createSuccessResponse(
          `Set stroke color of node "${
            typedResult.name
          }" to RGBA(${r}, ${g}, ${b}, ${a || 1}) with weight ${weight || 1}`
        );
      } catch (error) {
        return createErrorResponse(error, "setting stroke color");
      }
    }
  );

  // Set Corner Radius Tool
  server.tool(
    "set_corner_radius",
    "Set the corner radius of a node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      radius: z.number().min(0).describe("Corner radius value"),
      corners: z
        .array(z.boolean())
        .length(4)
        .optional()
        .describe(
          "Optional array of 4 booleans to specify which corners to round [topLeft, topRight, bottomRight, bottomLeft]"
        ),
    },
    async ({ nodeId, radius, corners }) => {
      try {
        const result = await sendCommandToFigma("set_corner_radius", {
          nodeId,
          radius,
          corners: corners || [true, true, true, true],
        });
        const typedResult = result as { name: string };
        return createSuccessResponse(
          `Set corner radius of node "${typedResult.name}" to ${radius}px`
        );
      } catch (error) {
        return createErrorResponse(error, "setting corner radius");
      }
    }
  );

  // Get Styles Tool
  server.tool(
    "get_styles",
    "Get all styles from the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_styles");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting styles");
      }
    }
  );
}
