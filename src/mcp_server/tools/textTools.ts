import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { TextChangeResult } from "../types.js";

export function registerTextTools(server: McpServer) {
  // Set Text Contents Tool
  server.tool(
    "set_text_content",
    "Modify the text content of one or multiple text nodes in Figma. Use this to update the actual text displayed in text layers.",
    {
      changes: z
        .array(
          z.object({
            nodeId: z.string().describe("Text node ID to modify the text"),
            text: z.string().describe("New text content"),
          })
        )
        .describe("Array of text nodes to apply changes to"),
    },
    async ({ changes }) => {
      try {
        if (!changes || changes.length === 0) {
          return createErrorResponse({
            error: new Error("No text changes provided"),
            context: "set_text_content",
          });
        }

        const totalToProcess = changes.length;

        // Use the plugin's set_text_content function with chunking
        const result = await sendCommandToFigma("set_text_content", {
          changes,
        });

        const typedResult = result as TextChangeResult;

        const success =
          typedResult.changesApplied && typedResult.changesApplied > 0;

        if (!success) {
          throw new Error(
            `No text changes were applied. Changes applied: ${
              typedResult.changesApplied || 0
            }, Changes failed: ${typedResult.changesFailed || 0}`
          );
        }

        const message = `Text changes: ${
          typedResult.changesApplied || 0
        }/${totalToProcess} applied, ${
          typedResult.changesFailed || 0
        } failed \n ${
          (typedResult.changesFailed || 0) > 0
            ? `. Errors: ${(typedResult.results || [])
                .filter((r) => !r.success)
                .map((r) => `${r.nodeId}(${r.error || "unknown"})`)
                .join(", ")}`
            : ""
        }`;

        return createSuccessResponse({
          messages: [message],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_text_content",
        });
      }
    }
  );

  // Get Text Node Info Tool
  server.tool(
    "get_text_node_info",
    "Retrieve comprehensive information about all text nodes within a specified node or frame.",
    {
      nodeId: z.string().describe("Node ID to scan for text nodes"),
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_text_node_info", {
          nodeId,
        });
        return createSuccessResponse({
          messages: [JSON.stringify(result)],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "get_text_node_info",
        });
      }
    }
  );

  server.tool(
    "set_text_properties",
    "Modify visual text properties such as font size, line height, letter spacing, and text alignment.",
    {
      nodeId: z.string().describe("Text node ID to modify"),
      fontSize: z.number().min(0).optional().describe("Font-size (px)"),
      lineHeight: z
        .number()
        .nonnegative()
        .optional()
        .describe("Text line height (px)"),
      letterSpacing: z.number().optional().describe("Text letter spacing (px)"),
      textAlignHorizontal: z
        .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
        .optional()
        .describe("Horizontal text alignment"),
      textAlignVertical: z
        .enum(["TOP", "CENTER", "BOTTOM"])
        .optional()
        .describe("Vertical text alignment"),
    },
    async ({ nodeId, ...props }) => {
      try {
        if (Object.keys(props).length === 0) {
          return createErrorResponse({
            error: new Error("No properties provided"),
            context: "set_text_properties",
          });
        }
        const result = await sendCommandToFigma("set_text_properties", {
          nodeId,
          ...props,
        });
        return createSuccessResponse({
          messages: [`Updated properties for node ${nodeId}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_text_properties",
        });
      }
    }
  );

  server.tool(
    "set_text_decoration",
    "Apply text styling decorations such as underlines, strikethrough effects, and text case transformations (uppercase, lowercase, title case, etc.).",
    {
      nodeId: z.string().describe("Text node ID to modify"),
      textDecoration: z
        .enum(["NONE", "UNDERLINE", "STRIKETHROUGH"])
        .optional()
        .describe("Text decoration style"),
      textCase: z
        .enum([
          "ORIGINAL",
          "UPPER",
          "LOWER",
          "TITLE",
          "SMALL_CAPS",
          "SMALL_CAPS_FORCED",
        ])
        .optional()
        .describe("Text casing style"),
    },
    async ({ nodeId, ...props }) => {
      try {
        if (Object.keys(props).length === 0) {
          return createErrorResponse({
            error: new Error("No decoration parameters provided"),
            context: "set_text_decoration",
          });
        }
        const result = await sendCommandToFigma("set_text_decoration", {
          nodeId,
          ...props,
        });
        return createSuccessResponse({
          messages: [`Updated decoration for node ${nodeId}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({
          error,
          context: "set_text_decoration",
        });
      }
    }
  );

  server.tool(
    "set_text_font",
    "Change the font family and style (weight/variant) of a text node.",
    {
      nodeId: z.string().describe("Text node ID to modify"),
      font: z
        .object({
          family: z.string().describe('Font family (e.g., "Inter")'),
          style: z.string().describe('Font style (e.g., "Bold")'),
        })
        .describe("Target font"),
    },
    async ({ nodeId, font }) => {
      try {
        const result = await sendCommandToFigma("set_text_font", {
          nodeId,
          font,
        });
        return createSuccessResponse({
          messages: [`Changed font on node ${nodeId}`],
          dataItem: result,
        });
      } catch (error) {
        return createErrorResponse({ error, context: "set_text_font" });
      }
    }
  );
}
