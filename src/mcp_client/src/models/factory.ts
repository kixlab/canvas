import { OpenAI } from "openai";
import {
  ModelConfig,
  ModelProvider,
  ToolCall,
  ChatMessage,
  ToolCallResult,
} from "../types";
import * as OpenAIResponseType from "openai/resources/responses/responses";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ModelInstance {
  name: string;
  provider: ModelProvider;
  generateResponse(messages: any[], options?: any): Promise<any>;
  generateToolResponse(
    messages: OpenAIResponseType.ResponseInput,
    tools: OpenAIResponseType.Tool[],
    options?: Partial<
      Omit<OpenAIResponseType.ResponseCreateParams, "input" | "model" | "tools">
    >
  ): Promise<OpenAIResponseType.Response>;
  formatToolCall(msg: any): ToolCall[];
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OpenAIResponseType.Tool[];
  formatRequest(message: ChatMessage): OpenAIResponseType.EasyInputMessage;
  formatToolResponse(res: ToolCallResult): OpenAIResponseType.ResponseInputItem;
  createLocalMessageArray(): OpenAIResponseType.ResponseInput;
}

export class OpenAIModel implements ModelInstance {
  private client: OpenAI;
  public name: string;
  public provider: ModelProvider;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.name = config.name;
    this.provider = config.provider;
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

    const response = await this.client.responses.create(params);
    return response;
  }

  async generateToolResponse(
    input: OpenAIResponseType.ResponseInput,
    tools: OpenAIResponseType.Tool[],
    options?: Partial<
      Omit<OpenAIResponseType.ResponseCreateParams, "input" | "model" | "tools">
    >
  ): Promise<OpenAIResponseType.Response> {
    const params: OpenAIResponseType.ResponseCreateParams = {
      model: this.name,
      input: input,
      tools: tools,
      temperature: options?.temperature || 0.7,
      max_output_tokens: options?.max_output_tokens || 4096,
      ...options,
      stream: false,
    };

    const response = this.client.responses.create(params);
    return response;
  }

  formatRequest(message: ChatMessage): OpenAIResponseType.EasyInputMessage {
    if (!message || !message.items || message.items.length === 0) {
      throw new Error("Invalid input message format");
    }

    if (message.role !== "user" && message.role !== "system") {
      throw new Error(`Unsupported message role: ${message.role}`);
    }

    const content = message.items.map((item) => {
      if (item.type === "text") {
        if (item.content.length === 0) {
          throw new Error("Text content is empty");
        }
        return {
          type: "input_text" as const,
          text: item.content || "",
        };
      } else if (item.type === "image_url") {
        if (item.content.length === 0) {
          throw new Error("Image URL content is empty");
        }
        return {
          type: "input_image" as const,
          image_url: item.content,
          detail: "auto" as const,
        };
      }
      throw new Error(`Unsupported message item type: ${item.type}`);
    });

    return { role: message.role, content: content };
  }

  formatToolCall(msg: OpenAIResponseType.ResponseOutputItem[]): ToolCall[] {
    if (!msg || !Array.isArray(msg)) return [];
    return msg
      .filter((item: any) => item.type === "function_call")
      .map((item: any) => ({
        id: item.id,
        call_id: item.call_id, // Mandatory field for OpenAI
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
    res: ToolCallResult
  ): OpenAIResponseType.ResponseInputItem {
    if (!res.call_id) {
      throw new Error("Missing call_id in tool response");
    }
    return {
      type: "function_call_output",
      call_id: res.call_id!, // Mandaotory field for OpenAI
      output: JSON.stringify(res.content),
    };
  }

  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OpenAIResponseType.Tool[] {
    return tools.map((tool) => {
      const toolSchema = {
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
      };
      return toolSchema as OpenAIResponseType.Tool;
    });
  }

  createLocalMessageArray(): OpenAIResponseType.ResponseInput {
    return [];
  }
}

export class AnthropicModel implements ModelInstance {
  public name: string;
  public provider: ModelProvider;

  constructor(config: ModelConfig) {
    this.name = config.name;
    this.provider = config.provider;
  }
  formatToolResponse(
    res: ToolCallResult
  ): OpenAIResponseType.ResponseFunctionToolCallOutputItem {
    throw new Error("Method not implemented.");
  }
  createLocalMessageArray(): OpenAIResponseType.ResponseInput {
    throw new Error("Method not implemented.");
  }
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OpenAIResponseType.Tool[] {
    throw new Error("Method not implemented.");
  }
  generateToolResponse(
    input: OpenAIResponseType.ResponseInput,
    tools: OpenAIResponseType.Tool[],
    options?: Partial<
      Omit<
        OpenAIResponseType.ResponseCreateParams,
        "messages" | "model" | "tools"
      >
    >
  ): Promise<OpenAIResponseType.Response> {
    throw new Error("Method not implemented.");
  }
  formatToolCall(msg: any): ToolCall[] {
    throw new Error("Method not implemented.");
  }

  async generateResponse(messages: any[], options: any = {}): Promise<any> {
    console.warn(
      "Anthropic model not fully implemented, using OpenAI fallback"
    );
    const openaiModel = new OpenAIModel({
      name: "gpt-4",
      provider: ModelProvider.OPENAI,
    });
    return openaiModel.generateResponse(messages, options);
  }
  formatRequest(message: ChatMessage): OpenAIResponseType.EasyInputMessage {
    console.warn("Anthropic model does not support formatRequest");
    return { role: "user", content: [] };
  }
}

export function getModel(config: ModelConfig): ModelInstance {
  switch (config.provider) {
    case ModelProvider.OPENAI:
      return new OpenAIModel(config);
    case ModelProvider.ANTHROPIC:
      return new AnthropicModel(config);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}
