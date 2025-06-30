import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { TextChangeResult } from "../types.js";

export function registerTextTools(server: McpServer) {
  // Set Text Contents Tool
  server.tool(
    "set_text_content",
    "Set text content for text nodes",
    {
      changes: z
        .array(
          z.object({
            nodeId: z.string().describe("The ID of the text node to modify"),
            text: z.string().describe("New text content"),
          })
        )
        .describe("Array of text changes to apply"),
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
    "Collect all text nodes within a specified node",
    {
      nodeId: z.string().describe("The ID of the node to scan for text nodes"),
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
    "Set common text properties (size, line-height, letter-spacing, align) on one text node",
    {
      nodeId: z.string().describe("ID of the text node to modify"),
      fontSize: z.number().positive().optional().describe("Font-size in px"),
      lineHeight: z
        .number()
        .nonnegative()
        .optional()
        .describe("Line-height in px (optional)"),
      letterSpacing: z
        .number()
        .optional()
        .describe("Letter-spacing in px (optional)"),
      textAlignHorizontal: z
        .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
        .optional()
        .describe(
          "Horizontal text-alignment (optional): LEFT / CENTER / RIGHT / JUSTIFIED"
        ),
      textAlignVertical: z
        .enum(["TOP", "CENTER", "BOTTOM"])
        .optional()
        .describe("Vertical text-alignment (optional): TOP / CENTER / BOTTOM"),
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
    "Set underline / strikethrough / casing on one text node",
    {
      nodeId: z.string().describe("ID of the text node to modify"),
      textDecoration: z
        .enum(["NONE", "UNDERLINE", "STRIKETHROUGH"])
        .optional()
        .describe(
          "Decoration style (optional): NONE / UNDERLINE / STRIKETHROUGH"
        ),
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
        .describe(
          "Text casing style (optional): ORIGINAL / UPPER / LOWER / TITLE / SMALL_CAPS / SMALL_CAPS_FORCED"
        ),
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
    "Set the font of one text node (family & style)",
    {
      nodeId: z.string().describe("ID of the text node to modify"),
      font: z
        .object({
          family: z.string().describe('Font family (e.g. "Inter")'),
          style: z.string().describe('Font style  (e.g. "Bold")'),
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
