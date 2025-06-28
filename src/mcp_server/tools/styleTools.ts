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
        return createSuccessResponse({
          messages: [
            `Set fill color of node "${
              typedResult.name
            }" to RGBA(${r}, ${g}, ${b}, ${a || 1})`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "setting_fill_color",
        });
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
        return createSuccessResponse({
          messages: [
            `Set corner radius of node "${
              typedResult.name
            }" to ${radius}px with corners ${
              corners ? corners.join(", ") : "all"
            }`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "setting_corner_radius",
        });
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
        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "getting_styles",
        });
      }
    }
  );

  server.tool(
    "set_opacity",
    "Set the overall opacity of a node (0-1)",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      opacity: z.number().min(0).max(1).describe("Opacity value (0-1)"),
    },
    async ({ nodeId, opacity }) => {
      try {
        const result = await sendCommandToFigma("set_opacity", {
          nodeId,
          opacity,
        });
        return createSuccessResponse({
          messages: [`Set opacity of node "${result.name}" to ${opacity}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "setting_opacity" });
      }
    }
  );

  server.tool(
    "set_stroke",
    "Set stroke colour, weight and alignment of a node",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      r: z.number().min(0).max(1).describe("Red component (0-1)"),
      g: z.number().min(0).max(1).describe("Green component (0-1)"),
      b: z.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Alpha component (0-1), defaults to 1"),
      weight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight in pixels"),
      align: z
        .enum(["CENTER", "INSIDE", "OUTSIDE"])
        .optional()
        .describe("Stroke alignment: one of 'CENTER, INSIDE, OUTSIDE'"),
    },
    async ({ nodeId, r, g, b, a, weight, align }) => {
      try {
        const result = await sendCommandToFigma("set_stroke", {
          nodeId,
          color: { r, g, b, a: a ?? 1 },
          weight,
          align,
        });
        return createSuccessResponse({
          messages: [
            `Applied stroke to "${result.name}" – rgba(${r},${g},${b},${
              a ?? 1
            }), ${weight ?? "default"} px, ${align ?? "CENTER"}`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "setting_stroke" });
      }
    }
  );

  server.tool(
    "set_fill_gradient",
    "Apply a simple gradient fill",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      gradientStops: z
        .array(
          z.object({
            r: z.number().min(0).max(1).describe("Red component (0-1)"),
            g: z.number().min(0).max(1).describe("Green component (0-1)"),
            b: z.number().min(0).max(1).describe("Blue component (0-1)"),
            a: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Alpha component (0-1)"),
            position: z.number().min(0).max(1).describe("Stop position (0-1)"),
          })
        )
        .min(2)
        .describe("At least two gradient stops"),
      gradientType: z
        .enum([
          "GRADIENT_LINEAR",
          "GRADIENT_RADIAL",
          "GRADIENT_ANGULAR",
          "GRADIENT_DIAMOND",
        ])
        .optional()
        .describe(
          "Type of gradient: one of 'GRADIENT_LINEAR, GRADIENT_RADIAL, GRADIENT_ANGULAR, GRADIENT_DIAMOND'"
        ),
      angle: z
        .number()
        .min(0)
        .max(360)
        .optional()
        .describe(
          "Angle of the gradient (0-360 degrees). Only for linear gradients."
        ),
    },
    async ({ nodeId, gradientStops, gradientType, angle }) => {
      try {
        const result = await sendCommandToFigma("set_fill_gradient", {
          nodeId,
          gradientStops,
          gradientType: gradientType ?? "GRADIENT_LINEAR",
          angle,
        });
        return createSuccessResponse({
          messages: [
            `Added ${gradientType ?? "linear"} gradient to "${result.name}"`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "setting_fill_gradient" });
      }
    }
  );

  server.tool(
    "set_drop_shadow",
    "Add a drop-shadow effect",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      r: z.number().min(0).max(1).describe("Red component (0-1)"),
      g: z.number().min(0).max(1).describe("Green component (0-1)"),
      b: z.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
      offsetX: z.number().describe("Horizontal shadow offset in pixels"),
      offsetY: z.number().describe("Vertical shadow offset in pixels"),
      radius: z.number().min(0).describe("Blur radius in pixels"),
      spread: z
        .number()
        .min(0)
        .optional()
        .describe("Spread radius in pixels (optional)"),
    },
    async (params) => {
      try {
        const result = await sendCommandToFigma("set_drop_shadow", params);
        return createSuccessResponse({
          messages: [`Applied drop-shadow to "${result.name}"`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "setting_drop_shadow" });
      }
    }
  );

  server.tool(
    "set_inner_shadow",
    "Add an inner-shadow effect",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      r: z.number().min(0).max(1).describe("Red component (0-1)"),
      g: z.number().min(0).max(1).describe("Green component (0-1)"),
      b: z.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
      offsetX: z.number().describe("Horizontal shadow offset in pixels"),
      offsetY: z.number().describe("Vertical shadow offset in pixels"),
      radius: z.number().min(0).describe("Blur radius in pixels"),
      spread: z
        .number()
        .min(0)
        .optional()
        .describe("Spread radius in pixels (optional)"),
    },
    async (params) => {
      try {
        const result = await sendCommandToFigma("set_inner_shadow", params);
        return createSuccessResponse({
          messages: [`Applied inner-shadow to "${result.name}"`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "setting_inner_shadow" });
      }
    }
  );

  server.tool(
    "copy_style",
    "Copy one node’s visual style to another",
    {
      sourceNodeId: z
        .string()
        .describe("The ID of the node to copy style from"),
      targetNodeId: z.string().describe("The ID of the node to apply style to"),
      properties: z
        .array(
          z
            .enum(["fills", "strokes", "effects", "cornerRadius", "opacity"])
            .describe(
              "Style property to copy: one of 'fills', 'strokes', 'effects', 'cornerRadius', 'opacity'"
            )
        )
        .optional()
        .describe(
          "Optional array of style properties to copy; if omitted, all supported properties are copied"
        ),
    },
    async ({ sourceNodeId, targetNodeId, properties }) => {
      try {
        const result = await sendCommandToFigma("copy_style", {
          sourceNodeId,
          targetNodeId,
          properties,
        });
        return createSuccessResponse({
          messages: [
            `Copied style from ${result.sourceName} → ${result.targetName}`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "copying_style" });
      }
    }
  );
}
