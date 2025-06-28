import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { TextChangeResult } from "../types.js";

export function registerTextTools(server: McpServer) {
  // Set Multiple Text Contents Tool
  server.tool(
    "change_text_content",
    "Replace text content for text nodes",
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
            context: "change_text_content",
          });
        }

        const totalToProcess = changes.length;

        // Use the plugin's change_text_content function with chunking
        const result = await sendCommandToFigma("change_text_content", {
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
          context: "change_text_content",
        });
      }
    }
  );

  // Scan Text Nodes Tool
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
}
