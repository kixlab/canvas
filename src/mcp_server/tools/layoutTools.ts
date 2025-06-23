import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";

export function registerLayoutTools(server: McpServer) {
  // Set Padding Tool
  server.tool(
    "set_padding",
    "Set padding values for an auto-layout frame in Figma",
    {
      nodeId: z.string().describe("The ID of the frame to modify"),
      paddingTop: z.number().optional().describe("Top padding value"),
      paddingRight: z.number().optional().describe("Right padding value"),
      paddingBottom: z.number().optional().describe("Bottom padding value"),
      paddingLeft: z.number().optional().describe("Left padding value"),
    },
    async ({
      nodeId,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
    }) => {
      try {
        const result = await sendCommandToFigma("set_padding", {
          nodeId,
          paddingTop,
          paddingRight,
          paddingBottom,
          paddingLeft,
        });
        const typedResult = result as { name: string };

        // Create a message about which padding values were set
        const paddingMessages: string[] = [];
        if (paddingTop !== undefined)
          paddingMessages.push(`top: ${paddingTop}`);
        if (paddingRight !== undefined)
          paddingMessages.push(`right: ${paddingRight}`);
        if (paddingBottom !== undefined)
          paddingMessages.push(`bottom: ${paddingBottom}`);
        if (paddingLeft !== undefined)
          paddingMessages.push(`left: ${paddingLeft}`);

        const paddingText =
          paddingMessages.length > 0
            ? `padding (${paddingMessages.join(", ")})`
            : "padding";

        return createSuccessResponse({
          messages: [`Set ${paddingText} for frame "${typedResult.name}"`],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_padding",
        });
      }
    }
  );

  // Set Axis Align Tool
  server.tool(
    "set_axis_align",
    "Set primary and counter axis alignment for an auto-layout frame in Figma",
    {
      nodeId: z.string().describe("The ID of the frame to modify"),
      primaryAxisAlignItems: z
        .enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"])
        .optional()
        .describe(
          "Primary axis alignment (MIN/MAX = left/right in horizontal, top/bottom in vertical). Note: When set to SPACE_BETWEEN, itemSpacing will be ignored as children will be evenly spaced."
        ),
      counterAxisAlignItems: z
        .enum(["MIN", "MAX", "CENTER", "BASELINE"])
        .optional()
        .describe(
          "Counter axis alignment (MIN/MAX = top/bottom in horizontal, left/right in vertical)"
        ),
    },
    async ({ nodeId, primaryAxisAlignItems, counterAxisAlignItems }) => {
      try {
        const result = await sendCommandToFigma("set_axis_align", {
          nodeId,
          primaryAxisAlignItems,
          counterAxisAlignItems,
        });
        const typedResult = result as { name: string };

        // Create a message about which alignments were set
        const alignMessages: string[] = [];
        if (primaryAxisAlignItems !== undefined)
          alignMessages.push(`primary: ${primaryAxisAlignItems}`);
        if (counterAxisAlignItems !== undefined)
          alignMessages.push(`counter: ${counterAxisAlignItems}`);

        const alignText =
          alignMessages.length > 0
            ? `axis alignment (${alignMessages.join(", ")})`
            : "axis alignment";

        return createSuccessResponse({
          messages: [`Set ${alignText} for frame "${typedResult.name}"`],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_axis_align",
        });
      }
    }
  );

  // Set Layout Sizing Tool
  server.tool(
    "set_layout_sizing",
    "Set horizontal and vertical sizing modes for an auto-layout frame in Figma",
    {
      nodeId: z.string().describe("The ID of the frame to modify"),
      layoutSizingHorizontal: z
        .enum(["FIXED", "HUG", "FILL"])
        .optional()
        .describe(
          "Horizontal sizing mode (HUG for frames/text only, FILL for auto-layout children only)"
        ),
      layoutSizingVertical: z
        .enum(["FIXED", "HUG", "FILL"])
        .optional()
        .describe(
          "Vertical sizing mode (HUG for frames/text only, FILL for auto-layout children only)"
        ),
    },
    async ({ nodeId, layoutSizingHorizontal, layoutSizingVertical }) => {
      try {
        const result = await sendCommandToFigma("set_layout_sizing", {
          nodeId,
          layoutSizingHorizontal,
          layoutSizingVertical,
        });
        const typedResult = result as { name: string };

        // Create a message about which sizing modes were set
        const sizingMessages: string[] = [];
        if (layoutSizingHorizontal !== undefined)
          sizingMessages.push(`horizontal: ${layoutSizingHorizontal}`);
        if (layoutSizingVertical !== undefined)
          sizingMessages.push(`vertical: ${layoutSizingVertical}`);

        const sizingText =
          sizingMessages.length > 0
            ? `layout sizing (${sizingMessages.join(", ")})`
            : "layout sizing";

        return createSuccessResponse({
          messages: [`Set ${sizingText} for frame "${typedResult.name}"`],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_layout_sizing",
        });
      }
    }
  );

  // Set Item Spacing Tool
  server.tool(
    "set_item_spacing",
    "Set distance between children in an auto-layout frame",
    {
      nodeId: z.string().describe("The ID of the frame to modify"),
      itemSpacing: z
        .number()
        .describe(
          "Distance between children. Note: This value will be ignored if primaryAxisAlignItems is set to SPACE_BETWEEN."
        ),
    },
    async ({ nodeId, itemSpacing }) => {
      try {
        const result = await sendCommandToFigma("set_item_spacing", {
          nodeId,
          itemSpacing,
        });

        const typedResult = result as { name: string };

        return createSuccessResponse({
          messages: [
            `Set item spacing to ${itemSpacing} for frame "${typedResult.name}"`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_item_spacing",
        });
      }
    }
  );

  // Set Layout Mode Tool
  server.tool(
    "set_layout_mode",
    "Set the layout mode and wrap behavior of a frame in Figma",
    {
      nodeId: z.string().describe("The ID of the frame to modify"),
      layoutMode: z
        .enum(["NONE", "HORIZONTAL", "VERTICAL"])
        .describe("Layout mode for the frame"),
      layoutWrap: z
        .enum(["NO_WRAP", "WRAP"])
        .optional()
        .describe("Whether the auto-layout frame wraps its children"),
    },
    async ({ nodeId, layoutMode, layoutWrap }) => {
      try {
        const { result } = await sendCommandToFigma("set_layout_mode", {
          nodeId,
          layoutMode,
          layoutWrap: layoutWrap || "NO_WRAP",
        });
        const typedResult = result as { name: string };

        return createSuccessResponse({
          messages: [
            `Set layout mode of frame "${typedResult.name}" to ${layoutMode}${
              layoutWrap ? ` with ${layoutWrap}` : ""
            }`,
          ],
          dataItem: typedResult,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_layout_mode",
        });
      }
    }
  );
}
