import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerCreationTools(server: McpServer) {
  // Create Rectangle Tool
  server.tool(
    "create_rectangle",
    "Create a new rectangular shape node with common styling properties",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      name: z.string().describe("Semantic name for the node"),
      parentId: z
        .string()
        .optional()
        .describe("FRAME / GROUP / SECTION ID to append the node to"),

      fillColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Solid fill in RGBA (defaults to transparent)"),

      strokeColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Stroke color in RGBA"),

      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight in px (defaults 1)"),

      cornerRadius: z
        .number()
        .min(0)
        .optional()
        .describe("Uniform corner radius in px"),
    },
    async ({
      x,
      y,
      width,
      height,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
      cornerRadius,
    }) => {
      try {
        const result = await sendCommandToFigma("create_rectangle", {
          x,
          y,
          width,
          height,
          name,
          parentId,
          fillColor,
          strokeColor,
          strokeWeight,
          cornerRadius,
        });
        return createSuccessResponse({
          messages: [`Created rectangle «${result.name}» (${result.id}).`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "create_rectangle" });
      }
    }
  );

  // Create Frame Tool
  server.tool(
    "create_frame",
    "Create a new frame container with auto-layout capabilities, styling options, and layout properties",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      name: z.string().describe("Semantic name for the node"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
      fillColor: z
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
        .describe("Fill color in RGBA format"),
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
        .describe("Stroke color in RGBA format"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight in pixel value"),
      layoutMode: z
        .enum(["NONE", "HORIZONTAL", "VERTICAL"])
        .optional()
        .describe("Auto-layout mode for the frame"),
      layoutWrap: z
        .enum(["NO_WRAP", "WRAP"])
        .optional()
        .describe("Children wrapping configuration for auto-layout frame"),
      paddingTop: z
        .number()
        .optional()
        .describe("Top padding value for auto-layout frame"),
      paddingRight: z
        .number()
        .optional()
        .describe("Right padding value for auto-layout frame"),
      paddingBottom: z
        .number()
        .optional()
        .describe("Bottom padding value for auto-layout frame"),
      paddingLeft: z
        .number()
        .optional()
        .describe("Left padding value for auto-layout frame"),
      primaryAxisAlignItems: z
        .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"])
        .optional()
        .describe(
          "Primary axis alignment for auto-layout frame (Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced.)"
        ),
      counterAxisAlignItems: z
        .enum(["MIN", "MAX", "CENTER", "BASELINE"])
        .optional()
        .describe("Counter axis alignment for auto-layout frame"),
      layoutSizingHorizontal: z
        .enum(["FIXED", "HUG", "FILL"])
        .optional()
        .describe("Horizontal sizing mode for auto-layout frame"),
      layoutSizingVertical: z
        .enum(["FIXED", "HUG", "FILL"])
        .optional()
        .describe("Vertical sizing mode for auto-layout frame"),
      itemSpacing: z
        .number()
        .optional()
        .describe(
          "Distance between children in auto-layout frame (Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN.)"
        ),
    },
    async ({
      x,
      y,
      width,
      height,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
      layoutMode,
      layoutWrap,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
      primaryAxisAlignItems,
      counterAxisAlignItems,
      layoutSizingHorizontal,
      layoutSizingVertical,
      itemSpacing,
    }) => {
      try {
        const result = await sendCommandToFigma("create_frame", {
          x,
          y,
          width,
          height,
          name: name || "Frame",
          parentId,
          fillColor: fillColor || { r: 1, g: 1, b: 1, a: 1 },
          strokeColor: strokeColor,
          strokeWeight: strokeWeight,
          layoutMode,
          layoutWrap,
          paddingTop,
          paddingRight,
          paddingBottom,
          paddingLeft,
          primaryAxisAlignItems,
          counterAxisAlignItems,
          layoutSizingHorizontal,
          layoutSizingVertical,
          itemSpacing,
        });
        const typedResult = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [
            `Created frame "${typedResult.name}" with ID: ${typedResult.id}`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "create_frame",
        });
      }
    }
  );

  // Create Text Tool
  server.tool(
    "create_text",
    "Create a new text node with customizable content, typography, alignment and styling options",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      text: z.string().describe("Text content of the node"),
      name: z.string().describe("Semantic name for the node"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),

      fontSize: z.number().optional().describe("Text font size (default: 14)"),
      fontWeight: z
        .number()
        .min(100)
        .max(900)
        .optional()
        .describe("Text font weight in numeric value"),
      fontColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red Intensity (0-1)"),
          g: z.number().min(0).max(1).describe("Green Intensity (0-1)"),
          b: z.number().min(0).max(1).describe("Blue Intensity (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha Intensity (0-1)"),
        })
        .optional()
        .describe("Text color (RGBA)"),

      textAlignHorizontal: z
        .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
        .optional()
        .describe("Horizontal text alignment"),
      textAlignVertical: z
        .enum(["TOP", "CENTER", "BOTTOM"])
        .optional()
        .describe("Vertical text alignment"),
      parentId: z
        .string()
        .optional()
        .describe("FRAME | GROUP | SECTION ID to append the node to"),
    },
    async ({
      x,
      y,
      width,
      height,
      text,
      fontSize,
      fontWeight,
      fontColor,
      textAlignHorizontal = "LEFT",
      textAlignVertical = "TOP",
      name,
      parentId,
    }) => {
      try {
        const result = await sendCommandToFigma("create_text", {
          x,
          y,
          text,
          fontSize: fontSize ?? 14,
          fontWeight: fontWeight ?? 400,
          fontColor: fontColor ?? { r: 0, g: 0, b: 0, a: 1 },

          /** 🆕 pass alignment through */
          textAlignHorizontal,
          textAlignVertical,

          name,
          width,
          height,
          parentId,
        });

        const typedResult = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [
            `Created text "${typedResult.name}" with ID ${typedResult.id}`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "create_text" });
      }
    }
  );

  // create SVG tool
  server.tool(
    "create_graphic",
    "Create a new vector graphic node from SVG markup for icons and scalable illustrations",
    {
      svg: z.string().describe("The raw SVG markup as a string"),
      name: z.string().describe("A semantic name for the vector graphic node"),
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
    },
    async ({ svg, x, y, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_graphic", {
          svg,
          x,
          y,
          name,
          parentId,
        });
        const typedResult = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [
            `Created vector graphic "${typedResult.name}" with ID: ${typedResult.id}.`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "creating vector from svg",
        });
      }
    }
  );

  server.tool(
    "create_ellipse",
    "Create a new elliptical or circular shape node with customizable fill and stroke properties",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      name: z.string().describe("Semantic name for the node"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
      fillColor: z
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
        .describe("Fill color of the node in RGBA format"),
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
        .describe("Stroke color of the node in RGBA format"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight of the node in pixel value"),
    },
    async ({
      x,
      y,
      width,
      height,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
    }) => {
      try {
        const result = await sendCommandToFigma("create_ellipse", {
          x,
          y,
          width,
          height,
          name: name,
          parentId,
          fillColor,
          strokeColor,
          strokeWeight,
        });
        const typed = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [`Created ellipse "${typed.name}" with ID: ${typed.id}.`],
          dataItem: typed,
        });
      } catch (err) {
        return createErrorResponse({
          error: err,
          context: "creating ellipse",
        });
      }
    }
  );

  server.tool(
    "create_polygon",
    "Create a new polygon shape with configurable number of sides and styling",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      pointCount: z
        .number()
        .int()
        .min(3)
        .describe("Number of sides of the polygon (integer ≥ 3)"),
      name: z.string().describe("Semantic name for the node"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
      fillColor: z
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
        .describe("Fill color of the node in RGBA format"),
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
        .describe("Stroke color of the node in RGBA format"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight of the node in pixel value"),
    },
    async ({
      x,
      y,
      width,
      height,
      pointCount,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
    }) => {
      try {
        const result = await sendCommandToFigma("create_polygon", {
          x,
          y,
          width,
          height,
          pointCount,
          name: name,
          parentId,
          fillColor,
          strokeColor,
          strokeWeight,
        });
        const typed = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [`Created polygon "${typed.name}" with ID: ${typed.id}.`],
          dataItem: typed,
        });
      } catch (err) {
        return createErrorResponse({
          error: err,
          context: "creating polygon",
        });
      }
    }
  );

  server.tool(
    "create_star",
    "Create a new star shape with customizable points, inner radius, and styling properties",
    {
      x: z.number().describe("X coordinate of the node (global)"),
      y: z.number().describe("Y coordinate of the node (global)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      name: z.string().optional().describe("Semantic name for the node"),
      pointCount: z
        .number()
        .int()
        .min(3)
        .max(60)
        .describe("Number of star points"),
      innerRadius: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Inner radius as % of diameter"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
      fillColor: z
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
        .describe("Fill color of the node in RGBA format"),
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
        .describe("Stroke color of the node in RGBA format"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight of the node in pixel value"),
    },
    async ({
      x,
      y,
      width,
      height,
      pointCount,
      innerRadius,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
    }) => {
      try {
        const result = await sendCommandToFigma("create_star", {
          x,
          y,
          width,
          height,
          pointCount,
          innerRadius,
          name: name,
          parentId,
          fillColor,
          strokeColor,
          strokeWeight,
        });
        const typed = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [`Created star "${typed.name}" with ID: ${typed.id}.`],
          dataItem: typed,
        });
      } catch (err) {
        return createErrorResponse({
          error: err,
          context: "creating star",
        });
      }
    }
  );

  server.tool(
    "create_line",
    "Create a new line element between two points with customizable stroke styling and end caps",
    {
      startX: z.number().describe("Start point (X coordinate)"),
      startY: z.number().describe("Start point (Y coordinate)"),
      endX: z.number().describe("End point (X coordinate)"),
      endY: z.number().describe("End point (Y coordinate)"),
      name: z.string().describe("Semantic name for the node"),
      parentId: z
        .string()
        .optional()
        .describe(
          "A parent node (FRAME, GROUP, and SECTION type only) ID to append the node to"
        ),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional(),
      strokeWeight: z.number().positive().optional(),
      strokeCap: z
        .enum(["NONE", "ROUND", "SQUARE"])
        .optional()
        .describe("Line-end cap style (e.g., NONE, ROUND, or SQUARE)"),
      dashPattern: z
        .array(z.number().positive())
        .length(2)
        .optional()
        .describe("[dash, gap] in px (e.g., [4, 2] for a dashed line)"),
    },
    async (args) => {
      try {
        const result = await sendCommandToFigma("create_line", args);
        return createSuccessResponse({
          messages: [`Created line “${result.name}” (${result.id}).`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "create_line" });
      }
    }
  );

  server.tool(
    "create_mask",
    "Create a mask group by combining a mask node with content nodes to apply clipping effects",
    {
      maskNodeId: z.string().describe("Node ID to use as a mask"),
      contentNodeIds: z
        .array(z.string())
        .min(1)
        .describe("IDs of nodes masked by the mask node"),
      groupName: z
        .string()
        .optional()
        .describe("Semantic name for the mask group"),
    },
    async ({ maskNodeId, contentNodeIds, groupName }) => {
      try {
        const result = await sendCommandToFigma("create_mask", {
          maskNodeId,
          contentNodeIds,
          groupName,
        });
        return createSuccessResponse({
          messages: [
            `Created mask group “${result.name}” with mask ${maskNodeId} covering ${contentNodeIds.length} node(s).`,
          ],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "create_mask" });
      }
    }
  );
}
