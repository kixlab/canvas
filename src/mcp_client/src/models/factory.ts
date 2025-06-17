import { OpenAI } from "openai";
import * as OpenAIResponseType from "openai/resources/responses/responses";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import * as AnthropicMessageType from "@anthropic-ai/sdk/resources/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import {
  ModelConfig,
  ModelProvider,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
} from "../types";

export interface ModelInstance {
  name: string;
  provider: ModelProvider;

  generateResponse(messages: any[], options?: any): Promise<any>;

  generateToolRequest(
    messages: any[],
    tools: any[],
    options?: Record<string, unknown>
  ): Promise<any>;

  /** unchanged helpers … */
  formatCallToolRequest(msg: any): CallToolRequestParams[];
  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): any[];
  formatRequest(messages: GenericMessage[]): any[];
  formatToolResponse(res: CallToolResult): any;
  createMessageContext(): any[];
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

  async generateToolRequest(
    input: OpenAIResponseType.ResponseInput,
    tools: OpenAIResponseType.Tool[],
    options?: Partial<
      Omit<OpenAIResponseType.ResponseCreateParams, "input" | "model" | "tools">
    >
  ): Promise<OpenAIResponseType.ResponseOutputItem[]> {
    const params: OpenAIResponseType.ResponseCreateParams = {
      model: this.name,
      input: input,
      tools: tools,
      temperature: options?.temperature || 0.7,
      max_output_tokens: options?.max_output_tokens || 4096,
      ...options,
      stream: false,
    };

    const response = await this.client.responses.create(params);
    return response.output;
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
    messages: OpenAIResponseType.ResponseOutputItem[]
  ): CallToolRequestParams[] {
    if (!messages || !Array.isArray(messages)) return [];
    return messages
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
    result: CallToolResult
  ): OpenAIResponseType.ResponseInputItem {
    if (!(result.call_id as string)) {
      throw new Error("Missing call_id in tool response");
    }

    const toolResponse = {
      content: result.content,
      structuredContent: result.structuredContent || {},
    };

    return {
      type: "function_call_output",
      call_id: (result.call_id as string)!, // Mandatory field only for OpenAI
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
  private client: AnthropicBedrock;
  public name: string;
  public provider: ModelProvider;

  constructor(config: ModelConfig) {
    this.client = new AnthropicBedrock({
      awsAccessKey: process.env.BEDROCK_ACESSS_KEY,
      awsSecretKey: process.env.BEDROCK_SECRET_KEY,
      awsRegion: "us-west-2",
    });
    this.name = config.name;
    this.provider = config.provider;
  }

  async generateResponse(
    messages: AnthropicMessageType.MessageParam[],
    options: Partial<AnthropicMessageType.MessageCreateParams> = {}
  ): Promise<AnthropicMessageType.Messages.Message> {
    const params: AnthropicMessageType.MessageCreateParams = {
      model: this.name,
      messages: messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      ...options,
      stream: false,
    };

    const response = await this.client.messages.create(params);
    return response;
  }

  async generateToolRequest(
    messages: AnthropicMessageType.MessageParam[],
    tools: AnthropicMessageType.Tool[],
    options: Partial<AnthropicMessageType.MessageCreateParams> = {}
  ): Promise<AnthropicMessageType.MessageParam[]> {
    const params: AnthropicMessageType.MessageCreateParams = {
      model: this.name,
      messages: messages,
      tools: tools,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      ...options,
      stream: false,
    };

    const response = await this.client.messages.create(params);
    // Remove keys execpt for role, content
    const filteredResponse = {
      role: response.role,
      content: response.content,
    };
    return [filteredResponse];
  }

  formatRequest(
    messages: GenericMessage[]
  ): AnthropicMessageType.MessageParam[] {
    if (!messages?.length) throw new Error("No messages provided");

    return messages.map((msg) => {
      const role =
        msg.role === "system" ? "user" : (msg.role as "user" | "assistant"); // Claude doesn't support system role directly
      const content = msg.content.map((item) => {
        switch (item.type) {
          case ContentType.TEXT:
            return { type: "text" as const, text: item.text };
          case ContentType.IMAGE:
            if (
              !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
                item.mimeType
              )
            ) {
              throw new Error(`Unsupported image type: ${item.mimeType}`);
            }
            return {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: item.mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: item.data,
              },
            };
          default:
            throw new Error(`Unsupported content type: ${item.type}`);
        }
      });
      return { role, content };
    });
  }

  createMessageContext(): AnthropicMessageType.MessageParam[] {
    return [];
  }

  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): AnthropicMessageType.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema ?? {
        type: "object",
        properties: {},
        required: [],
      },
    }));
  }

  formatCallToolRequest(
    messages: AnthropicMessageType.Message[]
  ): CallToolRequestParams[] {
    const [message] = messages;
    const messageContent = message["content"];
    if (!Array.isArray(messageContent)) return [];

    return messageContent
      .filter((c: any) => c.type === "tool_use")
      .map((c: any) => ({
        id: c.id,
        call_id: "", // OpenAI-only – keep placeholder
        name: c.name,
        arguments: c.input ?? {},
      }));
  }

  formatToolResponse(res: CallToolResult): AnthropicMessageType.MessageParam {
    const payload = {
      type: "tool_result" as const,
      tool_use_id: res.id,
      content: JSON.stringify(res.structuredContent ?? res.content ?? {}),
    } as AnthropicMessageType.ToolResultBlockParam;

    return { role: "user", content: [payload] };
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
