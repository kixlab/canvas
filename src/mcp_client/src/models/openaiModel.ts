import { OpenAI } from "openai";
import * as OpenAIResponseType from "openai/resources/responses/responses";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import {
  ModelConfig,
  ModelProvider,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
  AgentRequestMessage,
  RoleType,
  MessageType,
} from "../types";
import { ModelInstance } from "./baseModel";

export class OpenAIModel implements ModelInstance {
  private client: OpenAI;
  public name: string;
  public provider: ModelProvider;
  public inputCost: number;
  public outputCost: number;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.name = config.name;
    this.provider = config.provider;
    this.inputCost = config.input_cost;
    this.outputCost = config.output_cost;
  }

  async generateResponse(
    input: OpenAIResponseType.ResponseInput,
    options: Partial<
      Omit<
        OpenAIResponseType.ResponseCreateParams,
        "messages" | "model" | "tools"
      >
    > = {}
  ): Promise<any> {
    const params: OpenAIResponseType.ResponseCreateParams = {
      model: this.name,
      input: input,
      temperature: options.temperature || 0.7,
      max_output_tokens: options.max_output_tokens || 4096,
      ...options,
      stream: false,
    };

    return await this.client.responses.create(params);
  }

  async generateResponseWithTool(
    input: OpenAIResponseType.ResponseInput,
    tools: OpenAIResponseType.Tool[],
    options?: Partial<
      Omit<OpenAIResponseType.ResponseCreateParams, "input" | "model" | "tools">
    >
  ): Promise<OpenAIResponseType.Responses.Response> {
    const params: OpenAIResponseType.ResponseCreateParams = {
      model: this.name,
      input: input,
      tools: tools,
      temperature: options?.temperature || 0.7,
      max_output_tokens: options?.max_output_tokens || 4096,
      ...options,
      stream: false,
    };

    return await this.client.responses.create(params);
  }

  formatRequest(
    messages: GenericMessage[]
  ): OpenAIResponseType.EasyInputMessage[] {
    if (!messages?.length) {
      throw new Error("No messages provided for formatting");
    }

    return messages.map((message) => {
      if (message.role !== "user" && message.role !== "system") {
        throw new Error(`Unsupported message role: ${message.role}`);
      }

      const content = message.content.map((item) => {
        if (item.type === ContentType.TEXT) {
          return {
            type: "input_text" as const,
            text: item.text || "",
          };
        } else if (item.type === ContentType.IMAGE) {
          return {
            type: "input_image" as const,
            image_url: (item as any).data,
            detail: "auto" as const,
          };
        }
        throw new Error(`Unsupported message item type: ${item.type}`);
      });

      return { role: message.role, content: content };
    });
  }

  formatCallToolRequest(
    messages: OpenAIResponseType.Responses.Response
  ): CallToolRequestParams[] {
    const requests = messages.output;
    if (!requests || !Array.isArray(requests)) return [];

    return requests
      .filter((item: any) => item.type === "function_call")
      .map((item: any) => ({
        id: item.id,
        call_id: item.call_id,
        name: item.name,
        arguments: (() => {
          try {
            return typeof item.arguments === "string"
              ? JSON.parse(item.arguments)
              : item.arguments || {};
          } catch {
            return {};
          }
        })(),
      }));
  }

  formatToolResponse(
    result: CallToolResult
  ): OpenAIResponseType.ResponseInputItem {
    if (!result.call_id) {
      throw new Error("Missing call_id in tool response");
    }

    return {
      type: "function_call_output",
      call_id: result.call_id as string,
      output: JSON.stringify({
        content: result.content,
        structuredContent: result.structuredContent || {},
      }),
    };
  }

  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OpenAIResponseType.Tool[] {
    return tools.map(
      (tool) =>
        ({
          type: "function",
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.inputSchema
            ? {
                ...tool.inputSchema,
                additionalProperties: false,
                required: tool.inputSchema.required || [],
              }
            : {
                type: "object",
                properties: {},
                required: [],
              },
          strict: false,
        } as OpenAIResponseType.Tool)
    );
  }

  createMessageContext(): OpenAIResponseType.ResponseInput {
    return [];
  }

  addToApiMessageContext(
    response: OpenAIResponseType.Responses.Response,
    context: OpenAIResponseType.ResponseOutputItem[]
  ): void {
    context.push(...response.output);
  }

  addToFormattedMessageContext(
    response: OpenAIResponseType.Responses.Response,
    context: GenericMessage[]
  ): void {
    const toolRequests = this.formatCallToolRequest(response);

    context.push({
      id: response.id,
      timestamp: response.created_at,
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [
        { type: ContentType.TEXT, text: (response as any).output_text },
      ],
      calls: toolRequests,
    } as AgentRequestMessage);
  }

  getCostFromResponse(response: OpenAIResponseType.Responses.Response): number {
    if (!response.usage) {
      throw new Error("Response does not contain usage information");
    }
    return (
      response.usage.input_tokens * this.inputCost +
      response.usage.output_tokens * this.outputCost
    );
  }
}
