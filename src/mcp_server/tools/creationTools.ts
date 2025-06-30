import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { logger } from "../config.js";

export function registerCreationTools(server: McpServer) {
  // Create Rectangle Tool
  server.tool(
    "create_rectangle",
    "Create a new rectangle in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().describe("Width of the rectangle"),
      height: z.number().describe("Height of the rectangle"),
      name: z.string().describe("Name for the rectangle"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID to append the rectangle to"
        ),
    },
    async ({ x, y, width, height, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_rectangle", {
          x,
          y,
          width,
          height,
          name: name || "Rectangle",
          parentId,
        });
        return createSuccessResponse({
          messages: [`Created rectangle "${JSON.stringify(result)}"`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "create_rectangle",
        });
      }
    }
  );

  // Create Frame Tool
  server.tool(
    "create_frame",
    "Create a new frame in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().describe("Width of the frame"),
      height: z.number().describe("Height of the frame"),
      name: z.string().describe("Name for the frame"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID to append the frame to"
        ),
      fillColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red component (0-1)"),
          g: z.number().min(0).max(1).describe("Green component (0-1)"),
          b: z.number().min(0).max(1).describe("Blue component (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha component (0-1)"),
        })
        .optional()
        .describe("Fill color in RGBA format"),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red component (0-1)"),
          g: z.number().min(0).max(1).describe("Green component (0-1)"),
          b: z.number().min(0).max(1).describe("Blue component (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha component (0-1)"),
        })
        .optional()
        .describe("Stroke color in RGBA format"),
      strokeWeight: z.number().positive().optional().describe("Stroke weight"),
      layoutMode: z
        .enum(["NONE", "HORIZONTAL", "VERTICAL"])
        .optional()
        .describe("Auto-layout mode for the frame"),
      layoutWrap: z
        .enum(["NO_WRAP", "WRAP"])
        .optional()
        .describe("Whether the auto-layout frame wraps its children"),
      paddingTop: z
        .number()
        .optional()
        .describe("Top padding for auto-layout frame"),
      paddingRight: z
        .number()
        .optional()
        .describe("Right padding for auto-layout frame"),
      paddingBottom: z
        .number()
        .optional()
        .describe("Bottom padding for auto-layout frame"),
      paddingLeft: z
        .number()
        .optional()
        .describe("Left padding for auto-layout frame"),
      primaryAxisAlignItems: z
        .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"])
        .optional()
        .describe(
          "Primary axis alignment for auto-layout frame. Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced."
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
          "Distance between children in auto-layout frame. Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN."
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
    "Create a new text element in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      text: z.string().describe("Text content"),
      name: z.string().describe("Semantic element name for the text node"),
      fontSize: z.number().optional().describe("Font size (default: 14)"),
      fontWeight: z
        .number()
        .optional()
        .describe("Font weight (e.g., 400 for Regular, 700 for Bold)"),
      fontColor: z
        .object({
          r: z.number().min(0).max(1).describe("Red component (0-1)"),
          g: z.number().min(0).max(1).describe("Green component (0-1)"),
          b: z.number().min(0).max(1).describe("Blue component (0-1)"),
          a: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Alpha component (0-1)"),
        })
        .optional()
        .describe("Font color in RGBA format"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID to append the text to"
        ),
    },
    async ({ x, y, text, fontSize, fontWeight, fontColor, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_text", {
          x,
          y,
          text,
          fontSize: fontSize || 14,
          fontWeight: fontWeight || 400,
          fontColor: fontColor || { r: 0, g: 0, b: 0, a: 1 },
          name: name || "Text",
          parentId,
        });
        const typedResult = result as { name: string; id: string };
        return createSuccessResponse({
          messages: [
            `Created text "${typedResult.name}" with ID: ${typedResult.id}`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "creating text",
        });
      }
    }
  );

  // create SVG tool
  server.tool(
    "create_graphic",
    "Create vector graphics (e.g. icon) using a SVG markup",
    {
      svg: z
        .string()
        .describe(
          "The raw SVG markup as a string. Must contain at least one <path> element with a 'd' attribute"
        ),
      name: z.string().describe("A name for the new vector layer"),
      x: z.number().describe("X position for the new vector layer"),
      y: z.number().describe("Y position for the new vector layer"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID to append the vector layer to"
        ),
    },
    async ({ svg, x, y, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_graphic", {
          svg,
          x,
          y,
          name: name || "SVG Vector",
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
    "Create a new ellipse in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().describe("Width of the ellipse"),
      height: z.number().describe("Height of the ellipse"),
      name: z.string().describe("A semantic element name for the ellipse"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID to append the ellipse to"
        ),
      fillColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Fill color (RGBA, 0-1)"),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Stroke color (RGBA, 0-1)"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight in px"),
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
          name: name || "Ellipse",
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
    "Create a new polygon in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().describe("Width of the polygon"),
      height: z.number().describe("Height of the polygon"),
      pointCount: z
        .number()
        .int()
        .min(3)
        .describe("Number of sides (integer ≥ 3)"),
      name: z.string().describe("A semantic element name for the polygon"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID"
        ),
      fillColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Fill color (RGBA 0-1)"),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Stroke color (RGBA 0-1)"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight (px)"),
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
          name: name || "Polygon",
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
    "Create a new star in Figma",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().describe("Width of the star"),
      height: z.number().describe("Height of the star"),
      name: z
        .string()
        .optional()
        .describe("A semantic element name for the star"),
      pointCount: z
        .number()
        .int()
        .min(3)
        .max(60)
        .describe("Number of star points (3–60)"),
      innerRadius: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Inner radius as % of diameter (0–100)"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Optional parent node (FRAME, GROUP, SECTION, or PAGE only) ID"
        ),
      fillColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Fill colour (RGBA 0–1)"),
      strokeColor: z
        .object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Stroke colour (RGBA 0–1)"),
      strokeWeight: z
        .number()
        .positive()
        .optional()
        .describe("Stroke weight (px)"),
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
    "Create a straight line between two points",
    {
      startX: z.number().describe("Start point – X"),
      startY: z.number().describe("Start point – Y"),
      endX: z.number().describe("End point – X"),
      endY: z.number().describe("End point – Y"),
      name: z.string().describe("Semantic name for the line"),
      parentId: z
        .string()
        .optional()
        .describe("Optional parent node (FRAME / GROUP / PAGE)"),
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
        .describe("Line-end cap style: NONE, ROUND, or SQUARE"),
      dashPattern: z
        .array(z.number().positive())
        .length(2)
        .optional()
        .describe("[dash, gap] in px. E.g., [4, 2] for a dashed line"),
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
    "Turn a node into a mask and group it with other nodes to apply the mask",
    {
      maskNodeId: z.string().describe("ID of the node to be used as mask"),
      contentNodeIds: z
        .array(z.string())
        .min(1)
        .describe("IDs of nodes to be masked by the mask node (M"),
      groupName: z.string().optional().describe("Name for the resulting group"),
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
