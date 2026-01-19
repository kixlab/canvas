import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestParams, ToolItem, ToolResponseFormat } from "../types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { logger } from "../utils/helpers";

export class Tools {
  catalogue: Map<string, ToolItem>;
  client: Client;

  constructor(client: Client) {
    this.client = client;
    this.catalogue = new Map<string, ToolItem>();
  }

  async loadTools(): Promise<void> {
    if (!this.client) {
      throw new Error("Client or model not initialized");
    }

    const toolsResult = await this.client.listTools();

    if (!toolsResult.tools?.length) {
      throw new Error("No valid tools found in MCP server");
    }

    for (const tool of toolsResult.tools) {
      this.catalogue.set(tool.name, tool);
    }
  }

  async callTool(toolCall: CallToolRequestParams): Promise<CallToolResult> {
    try {
      if (!this.catalogue.has(toolCall.name)) {
        return this.createErrorResult(
          toolCall,
          `Tool '${toolCall.name}' not found`
        );
      }

      const result = (await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      })) as CallToolResult;

      return {
        id: toolCall.id,
        call_id: toolCall.call_id,
        name: toolCall.name,
        content: result.content,
        isError: result.isError || false,
        ...(result.structuredContent && {
          structuredContent: result.structuredContent,
        }),
      };
    } catch (error) {
      return this.createErrorResult(toolCall, String(error));
    }
  }

  createToolCall(
    toolName: string,
    id: string,
    args?: Record<string, unknown>,
    callId?: string
  ): CallToolRequestParams {
    return {
      id,
      call_id: callId ?? "",
      name: toolName,
      arguments: args ?? {},
    };
  }

  private createErrorResult(
    toolCall: CallToolRequestParams,
    message: string
  ): CallToolResult {
    return {
      id: toolCall.id,
      call_id: toolCall.call_id,
      content: [
        {
          type: ToolResponseFormat.TEXT,
          text: message,
        },
      ],
      isError: true,
    };
  }
}
