import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { TextReplaceResult } from "../types.js";

export function registerTextTools(server: McpServer) {
  // Set Multiple Text Contents Tool
  server.tool(
    "set_multiple_text_contents",
    "Set text content for multiple text nodes in a parent node",
    {
      nodeId: z
        .string()
        .describe("The ID of the parent node containing the text nodes"),
      text: z
        .array(
          z.object({
            nodeId: z.string().describe("The ID of the text node to modify"),
            text: z.string().describe("New text content"),
          })
        )
        .describe("Array of text replacements to apply"),
    },
    async ({ nodeId, text }, extra) => {
      try {
        if (!text || text.length === 0) {
          return createSuccessResponse("No text provided");
        }

        // Initial response to indicate we're starting the process
        const initialStatus = {
          type: "text" as const,
          text: `Starting text replacement for ${text.length} nodes. This will be processed in batches of 5...`,
        };

        // Track overall progress
        let totalProcessed = 0;
        const totalToProcess = text.length;

        // Use the plugin's set_multiple_text_contents function with chunking
        const result = await sendCommandToFigma("set_multiple_text_contents", {
          nodeId,
          text,
        });

        const typedResult = result as TextReplaceResult;

        // Format the results for display
        const success =
          typedResult.replacementsApplied &&
          typedResult.replacementsApplied > 0;
        const progressText = `
        Text replacement completed:
        - ${
          typedResult.replacementsApplied || 0
        } of ${totalToProcess} successfully updated
        - ${typedResult.replacementsFailed || 0} failed
        - Processed in ${typedResult.completedInChunks || 1} batches
        `;

        // Detailed results
        const detailedResults = typedResult.results || [];
        const failedResults = detailedResults.filter((item) => !item.success);

        // Create the detailed part of the response
        let detailedResponse = "";
        if (failedResults.length > 0) {
          detailedResponse = `\n\nNodes that failed:\n${failedResults
            .map((item) => `- ${item.nodeId}: ${item.error || "Unknown error"}`)
            .join("\n")}`;
        }

        return {
          content: [
            initialStatus,
            {
              type: "text" as const,
              text: progressText + detailedResponse,
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "setting multiple text contents");
      }
    }
  );

  // Set Text Content Tool
  server.tool(
    "set_text_content",
    "Set the text content of an existing text node in Figma",
    {
      nodeId: z.string().describe("The ID of the text node to modify"),
      text: z.string().describe("New text content"),
    },
    async ({ nodeId, text }) => {
      try {
        const result = await sendCommandToFigma("set_text_content", {
          nodeId,
          text,
        });
        const typedResult = result as { name: string };
        return createSuccessResponse(
          `Updated text content of node "${typedResult.name}" to "${text}"`
        );
      } catch (error) {
        return createErrorResponse(error, "setting text content");
      }
    }
  );

  // Scan Text Nodes Tool
  server.tool(
    "scan_text_nodes",
    "Scan and collect all text nodes within a specified node",
    {
      nodeId: z.string().describe("The ID of the node to scan for text nodes"),
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("scan_text_nodes", { nodeId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "scanning text nodes");
      }
    }
  );
}
