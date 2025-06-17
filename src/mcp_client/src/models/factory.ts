import { OpenAI } from "openai";
import {
  ModelConfig,
  ModelProvider,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
} from "../types";
import * as OpenAIResponseType from "openai/resources/responses/responses";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

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
  formatCallToolRequest(msg: any): CallToolRequestParams[];
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): OpenAIResponseType.Tool[];
  formatRequest(
    messages: GenericMessage[]
  ): OpenAIResponseType.EasyInputMessage[];
  formatToolResponse(res: CallToolResult): OpenAIResponseType.ResponseInputItem;
  createMessageContext(): OpenAIResponseType.ResponseInput;
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

  formatRequest(
    messages: GenericMessage[]
  ): OpenAIResponseType.EasyInputMessage[] {
    if (!messages || messages.length === 0) {
      throw new Error("No messages provided for formatting");
    }

    return messages.map((message) => {
      if (message.role !== "user" && message.role !== "system") {
        throw new Error(`Unsupported message role: ${message.role}`);
      }

      const content = message.content.map((item) => {
        if (item.type === ContentType.TEXT) {
          if (item.text.length === 0) {
            throw new Error("Text content is empty");
          }
          return {
            type: "input_text" as const,
            text: item.text || "",
          };
        } else if (item.type === ContentType.IMAGE) {
          if (item.data.length === 0) {
            throw new Error("Image URL content is empty");
          }
          return {
            type: "input_image" as const,
            image_url: item.data,
            detail: "auto" as const,
          };
        }
        throw new Error(`Unsupported message item type: ${item.type}`);
      });

      return { role: message.role, content: content };
    });
  }

  formatCallToolRequest(
    msg: OpenAIResponseType.ResponseOutputItem[]
  ): CallToolRequestParams[] {
    if (!msg || !Array.isArray(msg)) return [];
    return msg
      .filter((item: any) => item.type === "function_call")
      .map((item: any) => ({
        id: item.id,
        call_id: item.call_id, // Mandatory field only for OpenAI
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
    res: CallToolResult
  ): OpenAIResponseType.ResponseInputItem {
    if (!(res.call_id as string)) {
      throw new Error("Missing call_id in tool response");
    }

    const toolResponse = {
      content: res.content,
      structuredContent: res.structuredContent || {},
    };

    return {
      type: "function_call_output",
      call_id: (res.call_id as string)!, // Mandatory field only for OpenAI
      output: JSON.stringify(toolResponse),
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

  createMessageContext(): OpenAIResponseType.ResponseInput {
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
  formatMessageArray(
    messages: OpenAIResponseType.ResponseInput[]
  ): GenericMessage[] {
    throw new Error("Method not implemented.");
  }
  formatToolResponse(
    res: CallToolResult
  ): OpenAIResponseType.ResponseFunctionToolCallOutputItem {
    throw new Error("Method not implemented.");
  }
  createMessageContext(): OpenAIResponseType.ResponseInput {
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
  formatCallToolRequest(msg: any): CallToolRequestParams[] {
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
  formatRequest(
    messages: GenericMessage[]
  ): OpenAIResponseType.EasyInputMessage[] {
    console.warn("Anthropic model does not support formatRequest");
    if (!messages || messages.length === 0) {
      throw new Error("No messages provided for formatting");
    }

    return messages.map((message) => {
      if (message.role !== "user" && message.role !== "system") {
        throw new Error(`Unsupported message role: ${message.role}`);
      }

      const content = message.content.map((item) => {
        if (item.type === ContentType.TEXT) {
          if (item.text.length === 0) {
            throw new Error("Text content is empty");
          }
          return {
            type: "input_text" as const,
            text: item.text || "",
          };
        } else if (item.type === ContentType.IMAGE) {
          if (item.data.length === 0) {
            throw new Error("Image URL content is empty");
          }
          return {
            type: "input_image" as const,
            image_url: item.data,
            detail: "auto" as const,
          };
        }
        throw new Error(`Unsupported message item type: ${item.type}`);
      });

      return { role: message.role, content: content };
    });
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
