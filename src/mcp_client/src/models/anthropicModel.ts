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
  AgentRequestMessage,
  RoleType,
  MessageType,
} from "../types";
import { ModelInstance } from "./baseModel";

export class AnthropicModel implements ModelInstance {
  private client: AnthropicBedrock;
  public name: string;
  public provider: ModelProvider;
  public inputCost: number;
  public outputCost: number;

  constructor(config: ModelConfig) {
    this.client = new AnthropicBedrock({
      awsAccessKey: process.env.BEDROCK_ACCESS_KEY,
      awsSecretKey: process.env.BEDROCK_SECRET_KEY,
      awsRegion: "us-west-2",
    });
    this.name = config.name;
    this.provider = config.provider;
    this.inputCost = config.input_cost;
    this.outputCost = config.output_cost;
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

    return await this.client.messages.create(params);
  }

  async generateResponseWithTool(
    messages: AnthropicMessageType.MessageParam[],
    tools: AnthropicMessageType.Tool[],
    options: Partial<AnthropicMessageType.MessageCreateParams> = {}
  ): Promise<AnthropicMessageType.Messages.Message> {
    const params: AnthropicMessageType.MessageCreateParams = {
      model: this.name,
      messages: messages,
      tools: tools,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      ...options,
      stream: false,
    };

    return await this.client.messages.create(params);
  }

  formatRequest(
    messages: GenericMessage[]
  ): AnthropicMessageType.MessageParam[] {
    if (!messages?.length) throw new Error("No messages provided");

    return messages.map((msg) => {
      // Claude doesn't support system role directly, convert to user
      const role =
        msg.role === "system" ? "user" : (msg.role as "user" | "assistant");

      const content = msg.content.map((item) => {
        switch (item.type) {
          case ContentType.TEXT:
            return { type: "text" as const, text: item.text };
          case ContentType.IMAGE:
            const imageData = item as any;
            if (
              !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
                imageData.mimeType
              )
            ) {
              throw new Error(`Unsupported image type: ${imageData.mimeType}`);
            }
            return {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: imageData.mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: this.formatImageData(imageData.data),
              },
            };
          default:
            throw new Error(`Unsupported content type: ${item.type}`);
        }
      });

      return { role, content };
    });
  }

  formatCallToolRequest(
    message: AnthropicMessageType.Messages.Message
  ): CallToolRequestParams[] {
    const messageContent = message.content;
    if (!Array.isArray(messageContent)) return [];

    return messageContent
      .filter((c: any) => c.type === "tool_use")
      .map((c: any) => ({
        id: c.id,
        call_id: "", // Not used in Anthropic
        name: c.name,
        arguments: c.input ?? {},
      }));
  }

  formatToolResponse(
    result: CallToolResult
  ): AnthropicMessageType.MessageParam {
    return {
      role: "user",
      content: [
        {
          type: "tool_result" as const,
          tool_use_id: result.id,
          content: JSON.stringify(
            result.structuredContent ?? result.content ?? {}
          ),
        } as AnthropicMessageType.ToolResultBlockParam,
      ],
    };
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

  formatResponseToAgentRequestMessage(response: any): GenericMessage {
    if (!response || !response.content) {
      throw new Error("Invalid response format");
    }

    const textContent = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return {
      id: response.id,
      timestamp: Date.now(),
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: textContent }],
      calls: this.formatCallToolRequest(response),
    } as AgentRequestMessage;
  }

  formatResponseToIntermediateRequestMessage(
    response: AnthropicMessageType.Messages.Message
  ): GenericMessage {
    if (!response || !response.content) {
      throw new Error("Invalid response format");
    }
    const textContent = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return {
      id: response.id,
      timestamp: Date.now(),
      type: MessageType.INTERMEDIATE_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text: textContent }],
    } as GenericMessage;
  }

  createMessageContext(): AnthropicMessageType.MessageParam[] {
    return [];
  }

  addToApiMessageContext(
    response: AnthropicMessageType.Messages.Message,
    context: AnthropicMessageType.MessageParam[]
  ): void {
    context.push({
      role: response.role,
      content: response.content,
    });
  }

  addToFormattedMessageContext(
    response: AnthropicMessageType.Messages.Message,
    context: GenericMessage[]
  ): void {
    const textContent = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    context.push({
      id: response.id,
      timestamp: Date.now(),
      type: MessageType.AGENT_REQUEST,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: textContent }],
      calls: this.formatCallToolRequest(response),
    } as AgentRequestMessage);
  }

  getCostFromResponse(response: AnthropicMessageType.Messages.Message): number {
    return (
      response.usage.input_tokens * this.inputCost +
      response.usage.output_tokens * this.outputCost
    );
  }

  formatImageData(imageData: string, mimeType: string = "image/png"): string {
    // Anthropic expects base64 encoded image data without the prefix
    imageData = imageData.replace(/^data:image\/[^;]+;base64,/, "");
    return `${imageData}`;
  }
}
