import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../common/websocket.js";
import { createErrorResponse } from "../common/utils.js";

export function registerComponentTools(server: McpServer) {
  // Get Local Components Tool
  server.tool(
    "get_local_components",
    "Get all local components from the Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_local_components");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "getting local components");
      }
    }
  );

  // Create Component Instance Tool
  server.tool(
    "create_component_instance",
    "Create an instance of a component in Figma",
    {
      componentKey: z.string().describe("Key of the component to instantiate"),
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
    },
    async ({ componentKey, x, y }) => {
      try {
        const result = await sendCommandToFigma("create_component_instance", {
          componentKey,
          x,
          y,
        });
        const typedResult = result as any;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(typedResult),
            },
          ],
        };
      } catch (error) {
        return createErrorResponse(error, "creating component instance");
      }
    }
  );
}
