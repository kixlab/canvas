import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse, createSuccessResponse } from "../common/utils.js";
import { AnnotationResult, SetMultipleAnnotationsParams } from "../types.js";

export function registerAnnotationTools(server: McpServer) {
  // Get Annotations Tool
  server.tool(
    "get_annotations",
    "Get all annotations in the current document or specific node",
    {
      nodeId: z
        .string()
        .optional()
        .describe("Optional node ID to get annotations for specific node"),
      includeCategories: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to include category information"),
    },
    async ({ nodeId, includeCategories }) => {
      try {
        const result = await sendCommandToFigma("get_annotations", {
          nodeId,
          includeCategories,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting annotations");
      }
    }
  );

  // Set Annotation Tool
  server.tool(
    "set_annotation",
    "Create or update an annotation",
    {
      nodeId: z.string().describe("The ID of the node to annotate"),
      annotationId: z
        .string()
        .optional()
        .describe(
          "The ID of the annotation to update (if updating existing annotation)"
        ),
      labelMarkdown: z
        .string()
        .describe("The annotation text in markdown format"),
      categoryId: z
        .string()
        .optional()
        .describe("The ID of the annotation category"),
      properties: z
        .array(
          z.object({
            type: z.string(),
          })
        )
        .optional()
        .describe("Additional properties for the annotation"),
    },
    async ({ nodeId, annotationId, labelMarkdown, categoryId, properties }) => {
      try {
        const result = await sendCommandToFigma("set_annotation", {
          nodeId,
          annotationId,
          labelMarkdown,
          categoryId,
          properties,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "setting annotation");
      }
    }
  );

  // Set Multiple Annotations Tool
  server.tool(
    "set_multiple_annotations",
    "Set multiple annotations parallelly in a node",
    {
      nodeId: z
        .string()
        .describe("The ID of the node containing the elements to annotate"),
      annotations: z
        .array(
          z.object({
            nodeId: z.string().describe("The ID of the node to annotate"),
            labelMarkdown: z
              .string()
              .describe("The annotation text in markdown format"),
            categoryId: z
              .string()
              .optional()
              .describe("The ID of the annotation category"),
            annotationId: z
              .string()
              .optional()
              .describe(
                "The ID of the annotation to update (if updating existing annotation)"
              ),
            properties: z
              .array(
                z.object({
                  type: z.string(),
                })
              )
              .optional()
              .describe("Additional properties for the annotation"),
          })
        )
        .describe("Array of annotations to apply"),
    },
    async ({ nodeId, annotations }, extra) => {
      try {
        if (!annotations || annotations.length === 0) {
          return createSuccessResponse("No annotations provided");
        }

        // Initial response to indicate we're starting the process
        const initialStatus = {
          type: "text" as const,
          text: `Starting annotation process for ${annotations.length} nodes. This will be processed in batches of 5...`,
        };

        // Track overall progress
        let totalProcessed = 0;
        const totalToProcess = annotations.length;

        // Use the plugin's set_multiple_annotations function with chunking
        const result = await sendCommandToFigma("set_multiple_annotations", {
          nodeId,
          annotations,
        });

        const typedResult = result as AnnotationResult;

        // Format the results for display
        const success =
          typedResult.annotationsApplied && typedResult.annotationsApplied > 0;
        const progressText = `
        Annotation process completed:
        - ${
          typedResult.annotationsApplied || 0
        } of ${totalToProcess} successfully applied
        - ${typedResult.annotationsFailed || 0} failed
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
        return createErrorResponse(error, "setting multiple annotations");
      }
    }
  );
}
