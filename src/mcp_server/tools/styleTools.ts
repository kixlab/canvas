import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerStyleTools(server: McpServer) {
  // Set Fill Color Tool
  server.tool(
    "set_fill_color",
    "Set the solid fill color of a node using RGBA values. This changes the background color of nodes",
    {
      nodeId: z.string().describe("Node IDs to modify"),
      r: z.number().min(0).max(1).describe("Red intensity (0-1)"),
      g: z.number().min(0).max(1).describe("Green intensity (0-1)"),
      b: z.number().min(0).max(1).describe("Blue intensity (0-1)"),
      a: z.number().min(0).max(1).optional().describe("Alpha intensity (0-1)"),
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
    "Set the corner radius of a node to create rounded corners. You can control which specific corners to round or apply.",
    {
      nodeId: z.string().describe("Node ID to modify"),
      radius: z.number().min(0).describe("Corner radius value"),
      topLeft: z.boolean().optional().describe("Round top-left corner"),
      topRight: z.boolean().optional().describe("Round top-right corner"),
      bottomRight: z.boolean().optional().describe("Round bottom-right corner"),
      bottomLeft: z.boolean().optional().describe("Round bottom-left corner"),
    },
    async ({ nodeId, radius, topLeft, topRight, bottomRight, bottomLeft }) => {
      try {
        const result = await sendCommandToFigma("set_corner_radius", {
          nodeId,
          radius,
          corners: [
            topLeft ?? true,
            topRight ?? true,
            bottomRight ?? true,
            bottomLeft ?? true,
          ],
        });
        const typedResult = result as { name: string };
        return createSuccessResponse({
          messages: [
            `Set corner radius of node "${
              typedResult.name
            }" to ${radius}px with corners ${[
              topLeft ?? true,
              topRight ?? true,
              bottomRight ?? true,
              bottomLeft ?? true,
            ].join(", ")}`,
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
    "etrieve all available text styles, color styles, and effect styles from the current Figma document.",
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
    "Adjust the overall transparency of a node. Opacity values range from 0 (fully transparent) to 1 (fully opaque).",
    {
      nodeId: z.string().describe("Node ID to modify"),
      opacity: z.number().min(0).max(1).describe("Opacity value"),
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
    "Add or modify the border/outline of a node. You can control the stroke color, thickness, and alignment.",
    {
      nodeId: z.string().describe("Node ID to modify"),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red intensity (0-1)"),
          g: z.number().min(0).max(1).describe("Green intensity (0-1)"),
          b: z.number().min(0).max(1).describe("Blue intensity (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha intensity (0-1)"),
        })
        .optional()
        .describe("Stroke color (RGBA)"),
      weight: z.number().positive().optional().describe("Stroke weight (px)"),
      align: z
        .enum(["CENTER", "INSIDE", "OUTSIDE"])
        .optional()
        .describe("Stroke alignment"),
    },
    async ({ nodeId, strokeColor, weight, align }) => {
      try {
        const color = strokeColor || { r: 0, g: 0, b: 0, a: 1 };
        const result = await sendCommandToFigma("set_stroke", {
          nodeId,
          color: { ...color, a: color.a ?? 1 },
          weight,
          align,
        });
        return createSuccessResponse({
          messages: [
            `Applied stroke to "${result.name}" – rgba(${color.r},${color.g},${
              color.b
            },${color.a ?? 1}), ${weight ?? "default"} px, ${
              align ?? "CENTER"
            }`,
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
    "Apply a gradient fill to a node instead of a solid color. Supports linear, radial, angular, and diamond gradients with customizable color stops and angles.",
    {
      nodeId: z.string().describe("Node ID to modify"),
      gradientStops: z
        .array(
          z.object({
            r: z.number().min(0).max(1).describe("Red intensity (0-1)"),
            g: z.number().min(0).max(1).describe("Green intensity (0-1)"),
            b: z.number().min(0).max(1).describe("Blue intensity (0-1)"),
            a: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Alpha intensity (0-1)"),
            position: z
              .number()
              .min(0)
              .max(1)
              .describe("Stop position of the gradient (0-1)"),
          })
        )
        .min(2)
        .describe("Array of gradient stops (≥2)"),
      gradientType: z
        .enum([
          "GRADIENT_LINEAR",
          "GRADIENT_RADIAL",
          "GRADIENT_ANGULAR",
          "GRADIENT_DIAMOND",
        ])
        .optional()
        .describe("Type of a gradient"),
      angle: z
        .number()
        .min(0)
        .max(360)
        .optional()
        .describe("Angle of the gradient (Note: Only for linear gradients.)"),
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
        return createErrorResponse({ error, context: "set_fill_gradient" });
      }
    }
  );

  server.tool(
    "set_drop_shadow",
    "Add a drop shadow effect to create depth and elevation. The shadow appears behind the node and can be customized with color, blur, offset, and spread.",
    {
      nodeId: z.string().describe("Node ID to modify"),
      shadowColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red intensity (0-1)"),
          g: z.number().min(0).max(1).describe("Green intensity (0-1)"),
          b: z.number().min(0).max(1).describe("Blue intensity (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha intensity (0-1)"),
        })
        .describe("Shadow color (RGBA)"),
      offsetX: z.number().describe("Horizontal shadow offset (px)"),
      offsetY: z.number().describe("Vertical shadow offset (px)"),
      radius: z.number().min(0).describe("Blur radius (px)"),
      spread: z.number().min(0).optional().describe("Spread radius (px)"),
    },
    async (params) => {
      try {
        const result = await sendCommandToFigma("set_drop_shadow", params);
        return createSuccessResponse({
          messages: [`Applied drop-shadow to "${result.name}"`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "set_drop_shadow" });
      }
    }
  );

  server.tool(
    "set_inner_shadow",
    "Add an inner shadow effect that creates a shadow inside the node boundaries. Useful for creating inset or recessed visual effects.",
    {
      nodeId: z.string().describe("The ID of the node to modify"),
      shadowColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red intensity (0-1)"),
          g: z.number().min(0).max(1).describe("Green intensity (0-1)"),
          b: z.number().min(0).max(1).describe("Blue intensity (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha intensity (0-1)"),
        })
        .describe("Shadow color (RGBA)"),
      offsetX: z.number().describe("Horizontal shadow offset in pixel value"),
      offsetY: z.number().describe("Vertical shadow offset in pixel value"),
      radius: z.number().min(0).describe("Blur radius in pixel value"),
      spread: z
        .number()
        .min(0)
        .optional()
        .describe("Spread radius in pixel value"),
    },
    async (params) => {
      try {
        const result = await sendCommandToFigma("set_inner_shadow", params);
        return createSuccessResponse({
          messages: [`Applied inner-shadow to "${result.name}"`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "set_inner_shadow" });
      }
    }
  );

  server.tool(
    "copy_style",
    "opy visual styling properties from one node to another.",
    {
      sourceNodeId: z.string().describe("Node ID to copy style from"),
      targetNodeId: z.string().describe("Node ID to apply style to"),
      properties: z
        .array(
          z
            .enum(["fills", "strokes", "effects", "cornerRadius", "opacity"])
            .describe("Style property to copy")
        )
        .optional()
        .describe(
          "An array of style properties to copy (Note: if omitted, all supported properties are copied)"
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

  server.tool(
    "set_blend_mode",
    "Change how a node blends with the layers beneath it.",
    {
      nodeId: z.string().describe("Node ID to change blend-mode"),
      blendMode: z
        .enum([
          "PASS_THROUGH",
          "NORMAL",
          "DARKEN",
          "MULTIPLY",
          "LINEAR_BURN",
          "COLOR_BURN",
          "LIGHTEN",
          "SCREEN",
          "LINEAR_DODGE",
          "COLOR_DODGE",
          "OVERLAY",
          "SOFT_LIGHT",
          "HARD_LIGHT",
          "DIFFERENCE",
          "EXCLUSION",
          "HUE",
          "SATURATION",
          "COLOR",
          "LUMINOSITY",
        ])
        .describe("Target blend-mode"),
    },
    async ({ nodeId, blendMode }) => {
      try {
        const result = await sendCommandToFigma("set_blend_mode", {
          nodeId,
          blendMode,
        });
        return createSuccessResponse({
          messages: [`Set blend-mode of "${result.name}" → ${blendMode}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "set_blend_mode" });
      }
    }
  );
}
