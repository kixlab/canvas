import { randomUUID } from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ModelConfig,
  CallToolRequestParams,
  GenericMessage,
  ContentType,
  AgentRequestMessage,
  RoleType,
  MessageType,
  IntermediateRequestMessage,
} from "../types";
import { ModelInstance } from "./modelInstance";
import { logger } from "../utils/helpers";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  thinking?: string;
  images?: string[] | null;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolDefinition = FunctionTool;

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  think?: boolean;
  format?: "json" | Record<string, unknown>;
  options?: Record<string, unknown>;
  stream?: boolean;
  keep_alive?: string | number;
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: true;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaRESTModel extends ModelInstance {
  baseUrl: string;

  constructor(config: ModelConfig & { baseUrl: string }) {
    if (!config.baseUrl) {
      throw new Error("Ollama REST model requires a baseUrl in config");
    }
    super(config);
    this.baseUrl = config.baseUrl;
  }

  async chatRequest(body: ChatRequest): Promise<ChatResponse> {
    // Ollama REST API expects /api/chat payloads.
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as ChatResponse;
  }

  async generateResponse(
    input: ChatMessage[],
    opts: Partial<Omit<ChatRequest, "model" | "messages" | "stream">> = {}
  ): Promise<ChatResponse> {
    console.log("Ollama REST generateResponse", this.baseUrl);

    return await this.chatRequest({
      model: this.modelName,
      messages: input,
      stream: false,
      options: {
        temperature: this.temperature,
        num_ctx: 32000,
      },
      ...opts,
    });
  }

  async generateResponseWithTool(
    input: ChatMessage[],
    tools: ToolDefinition[],
    opts: Partial<Omit<ChatRequest, "model" | "messages" | "tools" | "stream">> = {}
  ): Promise<ChatResponse> {
    return await this.chatRequest({
      model: this.modelName,
      messages: input,
      tools,
      stream: false,
      options: {
        temperature: this.temperature,
        num_predict: this.maxTokens,
        ...(opts.options ?? {}),
      },
      ...opts,
    });
  }

  formatRequest(messages: GenericMessage[]): ChatMessage[] {
    if (!messages?.length) throw new Error("No messages provided");

    return messages.map((m) => {
      const role: MessageRole =
        m.role === RoleType.ASSISTANT
          ? "assistant"
          : m.role === RoleType.SYSTEM
          ? "system"
          : m.role === RoleType.TOOL
          ? "tool"
          : "user";

      const text: string[] = [];
      const images: string[] = [];

      m.content.forEach((part) => {
        if (part.type === ContentType.TEXT) text.push(part.text);
        else if (part.type === ContentType.IMAGE)
          images.push(this.stripDataUrl(part.data));
        else throw new Error(`Unsupported content type for Ollama: ${part.type}`);
      });

      const chatMsg: ChatMessage = { role, content: text.join("\n") };
      if (images.length) chatMsg.images = images;
      if (role === "tool" && (m as any).tool_name)
        chatMsg.tool_name = (m as any).tool_name;

      return chatMsg;
    });
  }

  formatCallToolRequest(resp: ChatResponse): CallToolRequestParams[] {
    const calls = resp.message.tool_calls ?? [];
    return calls.map((c) => {
      const id = randomUUID();
      return {
        id,
        call_id: id,
        name: c.function.name,
        arguments: c.function.arguments,
      };
    });
  }

  formatToolList(
    tools: Awaited<ReturnType<Client["listTools"]>>["tools"]
  ): ToolDefinition[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters:
          t.inputSchema && Object.keys(t.inputSchema).length
            ? (t.inputSchema as Record<string, unknown>)
            : { type: "object", properties: {}, required: [] },
      },
    }));
  }

  formatToolResponse(result: CallToolResult): ChatMessage {
    if (!result.name)
      logger.error({
        header: "Tool result missing name",
        body: JSON.stringify(result, null, 2),
      });

    return {
      role: "tool",
      tool_name: typeof result.name === "string" ? result.name : "unknown_tool",
      content:
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content ?? {}),
    };
  }

  formatImageData(b64: string): string {
    // Ollama expects raw base64 without data URL prefix.
    return this.stripDataUrl(b64);
  }

  formatResponseToIntermediateRequestMessage(
    resp: ChatResponse
  ): GenericMessage {
    return {
      id: randomUUID(),
      timestamp: new Date(resp.created_at).getTime(),
      type: MessageType.INTERMEDIATE_REQUEST,
      role: RoleType.USER,
      content: [{ type: ContentType.TEXT, text: resp.message.content }],
    } as IntermediateRequestMessage;
  }

  createMessageContext(): ChatMessage[] {
    return [];
  }

  addToApiMessageContext(resp: ChatResponse, ctx: ChatMessage[]): void {
    ctx.push(resp.message);
  }

  addToFormattedMessageContext(
    resp: ChatResponse,
    type: MessageType,
    ctx: GenericMessage[]
  ): void {
    const calls = this.formatCallToolRequest(resp);

    ctx.push({
      id: randomUUID(),
      timestamp: new Date(resp.created_at).getTime(),
      type: type,
      role: RoleType.ASSISTANT,
      content: [{ type: ContentType.TEXT, text: resp.message.content }],
      calls,
    } as AgentRequestMessage);
  }

  getCostFromResponse(_r: ChatResponse): number {
    return 0;
  }

  private stripDataUrl(data: string) {
    return data.replace(/^data:[^;]+;base64,/, "");
  }
}
